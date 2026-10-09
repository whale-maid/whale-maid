#!/usr/bin/env node
/**
 * docs-find.mjs —— 跨层文档检索（一条命令）
 *
 * 为什么有它：文档散在四层（L0 注入 / L1 入口 / L2 正文 / L3 长记忆），
 * 而"没被指路的文档 = 对 agent 不存在"。这个脚本是那条"一条命令可达"的路。
 * 设计口径见 `docs\discussions\2026-10-07-docs-system-layers-and-retrieval.md`。
 *
 * 用法（在工作区根跑）：
 *   node tools\docs-find.mjs <词> [<词2> ...]      # 全部词都命中才列出（默认按 L0→L3 分组）
 *   node tools\docs-find.mjs <词> --layer L2      # 只看某一层：L0 / L1 / L2 / L3 / B（B＝鲸板的页）
 *   node tools\docs-find.mjs <词> --project models  # 限定项目
 *   node tools\docs-find.mjs --files              # 不给词 = 列出四层全景（各层有哪些文件）
 *   node tools\docs-find.mjs <词> --count         # 只报每层命中数
 *   node tools\docs-find.mjs <词> --json          # 机器可读
 *   node tools\docs-find.mjs <词> --follow        # 跟入 junction（默认不跟，避免扫进工作区外的巨树）
 *
 * 层的定义：
 *   L0 常驻注入  AGENTS.md（任意层级的）
 *   L1 入口      README.md
 *   L2 按需正文  任一项目下的 docs\ 与 notes\（含工作区级 `docs\`：跨项目讨论与日志）
 *   L3 长记忆    ~/.dsh/memory\*（facts 真源）与 tools\recon\*（历史快照）
 *   B  鲸板      dsh-whale-board\board\board.json —— **每一页当成"一个文件"**（节点文本可搜）✓
 *
 * 零依赖。默认只读，不改任何东西。
 */
import { readdirSync, readFileSync, statSync, lstatSync, existsSync } from 'node:fs'
import { join, relative, sep, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MEMORY = join(homedir(), '.dsh', 'memory')

const SKIP_DIRS = new Set(['.git', '.trash', '_archive', 'node_modules', 'out', '.cache', 'dist', 'build'])
const MAX_BYTES = 2 * 1024 * 1024

const argv = process.argv.slice(2)
const flags = new Set(argv.filter((a) => a.startsWith('--')))
const terms = argv.filter((a) => !a.startsWith('--'))
const opt = (name, dflt) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt
}
const wantLayer = (opt('--layer', '') || '').toUpperCase()
const wantProject = opt('--project', '')
const limit = Number(opt('--limit', '40')) || 40
const follow = flags.has('--follow')
const asJson = flags.has('--json')
const onlyCount = flags.has('--count')
const filesOnly = flags.has('--files') || terms.length === 0

/** 递归收集文件；默认不跟 symlink/junction。 */
function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isSymbolicLink()) {
      if (!follow) continue
    } else if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      walk(p, out)
      continue
    }
    if (e.isFile() && e.name.toLowerCase().endsWith('.md')) out.push(p)
  }
  return out
}

/** 判定一个文件的层。 */
function layerOf(abs) {
  const rel = relative(ROOT, abs)
  if (rel.startsWith('..')) {
    return abs.startsWith(MEMORY) ? 'L3' : null
  }
  const parts = rel.split(sep)
  const name = parts[parts.length - 1]
  if (name === 'AGENTS.md') return 'L0'
  if (name === 'README.md') return 'L1'
  if (parts.includes('notes') || parts.includes('docs') || parts.includes('discussions')) return 'L2'
  if (parts[0] === 'tools' && parts[1] === 'recon') return 'L3'
  return null
}

/** 项目名 = 相对根的第一段（根上的文件归 "(工作区根)"）。 */
function projectOf(abs) {
  const rel = relative(ROOT, abs)
  if (rel.startsWith('..')) return '(记忆真源 ~/.dsh/memory)'
  const parts = rel.split(sep)
  if (parts[0] === 'docs') return '(工作区 docs)'      //: 工作区级跨项目文档（讨论 / 日志；2026-10-09 立）
  if (parts[0] === 'tools' && parts[1] === 'docs') return '(tools docs)'
  return parts.length > 1 ? parts[0] : '(工作区根)'
}

const files = []
for (const abs of walk(ROOT)) {
  files.push({ abs, layer: layerOf(abs), project: projectOf(abs) })
}
// L3 记忆真源
if (existsSync(MEMORY)) {
  for (const e of readdirSync(MEMORY, { withFileTypes: true })) {
    if (!e.isFile()) continue
    if (!/\.(jsonl|md)$/i.test(e.name)) continue
    const abs = join(MEMORY, e.name)
    files.push({ abs, layer: 'L3', project: '(记忆真源 ~/.dsh/memory)' })
  }
}

// B · 鲸板：把 board.json 的**每一页**当成一个可检索的"文件"
//   （2026-10-08 加。理由：鲸板不在 md 体系里 —— 不接上，它就等于"没被指路 ⇒ 对 agent 不存在"）
//   头卡约定：每页第一张卡写「用途 / 什么时候读我」⇒ 搜"什么时候读我"就能把全部页的用途捞出来 ✓
const BOARD = join(ROOT, 'dsh-whale-board', 'board', 'board.json')
if (existsSync(BOARD)) {
  try {
    const b = JSON.parse(readFileSync(BOARD, 'utf8'))
    const pageNames = b.pages || {}
    const byPage = new Map()
    for (const n of b.nodes || []) {
      const k = n.page || '(默认页)'
      if (!byPage.has(k)) byPage.set(k, [])
      byPage.get(k).push(n)
    }
    for (const [k, list] of byPage) {
      //: 页级说明（真源顶层 `pageDesc`）排在**第 1 行** ⇒ 搜"什么时候读我"就能把每页的用途捞出来 ✓
      const desc = (b.pageDesc && b.pageDesc[k]) ? `[本页说明] ${b.pageDesc[k]}` : ''
      const virtual = [desc, ...list.map((n) => `[${n.id}] ${String(n.text || '').split(/\r?\n/).join(' ⏎ ')}`)]
        .filter(Boolean)
        .join('\n')
      files.push({
        abs: BOARD, virtual, layer: 'B', project: '(鲸板)',
        label: `dsh-whale-board/board/board.json → 页「${pageNames[k] || k}」(${k} · ${list.length} 节点)`,
      })
    }
  } catch { /* 真源读不动就跳过，别让检索挂掉 */ }
}

const candidates = files.filter((f) => f.layer)
const scoped = candidates.filter(
  (f) => (!wantLayer || f.layer === wantLayer) && (!wantProject || f.project === wantProject),
)

const hits = []
for (const f of scoped) {
  let text
  if (f.virtual != null) {
    text = f.virtual                                  // 鲸板：整页文本是现成的，不用读盘
  } else {
    let size = 0
    try {
      size = statSync(f.abs).size
    } catch {
      continue
    }
    if (size > MAX_BYTES) continue
    try {
      text = readFileSync(f.abs, 'utf8')
    } catch {
      continue
    }
  }
  if (!filesOnly) {
    const lower = text.toLowerCase()
    if (!terms.every((t) => lower.includes(t.toLowerCase()))) continue
  }
  const lines = text.split(/\r?\n/)
  const matched = []
  if (terms.length) {
    lines.forEach((line, i) => {
      const low = line.toLowerCase()
      if (terms.some((t) => low.includes(t.toLowerCase()))) {
        matched.push({ n: i + 1, text: line.trim().slice(0, 200) })
      }
    })
  }
  hits.push({ ...f, rel: f.label || relative(ROOT, f.abs).replace(/\\/g, '/'), lines: lines.length, matched })
}

const LAYER_TITLE = { L0: 'L0 常驻注入（AGENTS.md）', L1: 'L1 入口（README.md）', L2: 'L2 按需正文', L3: 'L3 长记忆', B: 'B 鲸板（board.json 的页）' }

if (asJson) {
  console.log(
    JSON.stringify(
      {
        root: ROOT,
        terms,
        total: hits.length,
        hits: hits.map((h) => ({ layer: h.layer, project: h.project, path: h.rel, lines: h.lines, matched: h.matched })),
      },
      null,
      2,
    ),
  )
  process.exit(0)
}

console.log(`docs-find · ${ROOT}`)
console.log(filesOnly ? '模式：列出四层全景（不给词即为全景）' : `查询：${terms.join(' + ')}（全部命中）`)
console.log('')

for (const L of ['L0', 'L1', 'L2', 'L3', 'B']) {
  if (wantLayer && wantLayer !== L) continue
  const bucket = hits.filter((h) => h.layer === L)
  if (!bucket.length) continue
  console.log(`── ${LAYER_TITLE[L]} · ${bucket.length} 个文件${onlyCount ? '' : ''}`)
  if (onlyCount) {
    console.log('')
    continue
  }
  for (const h of bucket.slice(0, limit)) {
    console.log(`  ${h.rel}  (${h.project}, ${h.lines} 行)`)
    for (const m of h.matched.slice(0, 4)) console.log(`    ${m.n}: ${m.text}`)
    if (h.matched.length > 4) console.log(`    …另 ${h.matched.length - 4} 处`)
  }
  if (bucket.length > limit) console.log(`  …另 ${bucket.length - limit} 个文件（--limit 调整）`)
  console.log('')
}

const total = hits.length
console.log(`合计 ${total} 个文件 / ${hits.reduce((a, h) => a + h.matched.length, 0)} 处命中`)
if (!total && !filesOnly) {
  console.log('没命中。试着：换更短的词根 · 去掉 --layer/--project 限定 · 用 --files 看四层全景')
}
