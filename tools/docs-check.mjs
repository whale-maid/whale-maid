#!/usr/bin/env node
/**
 * docs-check.mjs —— 工作区项目文档巡检
 *
 * 口径（2026-09-25 主人定）：项目文档**按需，不强制成体系**——
 *   非临时性项目**起码要留说明性文档**（`README.md` 与 `AGENTS.md` 至少其一，建议都有）；
 *   `docs/architecture.md` 只在需要写现状结构的项目里才有，**不强制**；
 *   有 `docs/architecture.md` 时检查其状态头（> 状态: current | draft | deprecated）。
 *
 * 用法：
 *   node tools\docs-check.mjs              只提示，始终退出 0
 *   node tools\docs-check.mjs --strict     任一项目 README 与 AGENTS 都缺 → 退出 1
 *   node tools\docs-check.mjs --json       输出 JSON（便于其它脚本消费）
 *
 * 排除规则：名称以 . 或 _ 开头的目录（.trash、_archive、_ws-template 等）不按项目校验。
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const EXCLUDE = /^[._]/
const STATUS_RE = /状态:\s*(current|draft|deprecated)/

/** 读取文件头部若干行，判断是否声明了文档状态。 */
function readStatus(file) {
  if (!existsSync(file)) return null
  const head = readFileSync(file, 'utf8').split('\n').slice(0, 8).join('\n')
  return STATUS_RE.test(head) ? STATUS_RE.exec(head)[1] : 'missing'
}

/** 采集单个项目的文档现状。 */
function inspect(name) {
  const dir = join(ROOT, name)
  const arch = join(dir, 'docs', 'architecture.md')
  const readme = existsSync(join(dir, 'README.md'))
  const agents = existsSync(join(dir, 'AGENTS.md'))
  return {
    name,
    readme,
    agents,
    documented: readme || agents,
    arch: existsSync(arch),
    status: readStatus(arch),
  }
}

const args = process.argv.slice(2)
const strict = args.includes('--strict')
const asJson = args.includes('--json')

const rows = readdirSync(ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !EXCLUDE.test(entry.name))
  .map((entry) => inspect(entry.name))
  .sort((a, b) => a.name.localeCompare(b.name))

if (asJson) {
  console.log(JSON.stringify({ root: ROOT, projects: rows }, null, 2))
} else {
  const mark = (ok) => (ok ? 'OK' : '-')
  const statusMark = (status) =>
    status === null ? '-' : status === 'missing' ? 'NO-HEADER' : status
  const width = Math.max(7, ...rows.map((r) => r.name.length))

  console.log(`docs 巡检 · ${ROOT}`)
  console.log(`口径：README/AGENTS 至少其一（说明性文档）；docs/architecture.md 按需，非必需`)
  console.log(
    `${'项目'.padEnd(width)}  README  AGENTS  docs/arch  状态头`,
  )
  console.log('-'.repeat(width + 36))
  for (const r of rows) {
    console.log(
      `${r.name.padEnd(width)}  ${mark(r.readme).padEnd(6)}  ${mark(r.agents).padEnd(6)}  ` +
        `${mark(r.arch).padEnd(9)}  ${statusMark(r.status)}`,
    )
  }

  const documented = rows.filter((r) => r.documented).length
  const withArch = rows.filter((r) => r.arch).length
  const withHeader = rows.filter((r) => r.status && r.status !== 'missing').length
  console.log('-'.repeat(width + 36))
  console.log(
    `汇总：${rows.length} 个项目，${documented} 个有说明性文档，` +
      `${withArch} 个另有 docs/architecture.md（其中 ${withHeader} 个已声明状态头）。`,
  )
  const missingDoc = rows.filter((r) => !r.documented).map((r) => r.name)
  if (missingDoc.length > 0) {
    console.log(`⚠ 缺说明性文档（README/AGENTS 均无）：${missingDoc.join('、')}`)
  }
  const noHeader = rows.filter((r) => r.arch && r.status === 'missing').map((r) => r.name)
  if (noHeader.length > 0) {
    console.log(`⚠ 有 architecture.md 但缺状态头：${noHeader.join('、')}`)
  }
}

if (strict && rows.some((r) => !r.documented)) process.exit(1)
