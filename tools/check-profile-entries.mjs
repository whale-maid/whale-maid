#!/usr/bin/env node
/**
 * 检查一个 dsh profile 里「同一个包被两条 loader entry 挂载」的冲突。
 *
 * 背景：Cordis loader entry 的 `name` 是模块名（可为子路径导出，如 `pkg/tui-themes`）。
 * Host 的客户端模块注册表（`@deepseek-ai/dsh-client-modules` 的 `reconcilePackage`）
 * 按**包名**建表，同一个包被两条**启用**的 entry 声明时会直接抛错：
 *   `client-modules: package <pkg> resolves from multiple active Loader sources: ...; remove one entry`
 * 后果：该包的浏览器 bundle 不发给前端 → 插件的客户端半边（主题/侧栏等）装不上；
 * 2026-09-17 实测，dsh-catppuccin@0.2.3 就因此让 web profile 掉进安全模式。
 *
 * 做法：读 profile 内每个已装包的 `cordis.patch.yml`，抽出 `insert` 行声明的 entry
 * （id + name）；再读 profile 自己的 `cordis.patch.yml` 里 `disabled: true` 的行，
 * 把这些 id 对应的 entry 划掉；剩下同包 ≥2 条的即为冲突。
 * 纯正则解析、零依赖（脚本本身不 require 任何包），只读不写。
 *
 * 用法：
 *   node tools\check-profile-entries.mjs [profile 名 | profile 目录]   # 默认 web
 *   node tools\check-profile-entries.mjs web --json
 *
 * 退出码：0 = 无冲突；1 = 发现冲突或 profile 读不到。
 * 修法：在 profile 的 `cordis.patch.yml` 末尾按**真实 entry id** 加一行
 *   `- id: <entry-id>` + `  disabled: true`
 * （按**包名**写 id 无效，loader 只回一句 `patch: entry <id> not found`，
 * 2026-09-17 那次就是这么白忙的）；或者直接 `dsh plugin remove <包名>` 卸掉。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const DEFAULT_PROFILE = 'web'

/** @param {string} text @returns {string} 去掉整行注释后的文本（`#` 开头）。 */
function stripCommentLines(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
}

/** 去掉 YAML 标量两侧的引号。 @param {string} value @returns {string} */
function unquote(value) {
  const trimmed = value.trim()
  const quoted = /^(['"])(.*)\1$/.exec(trimmed)
  return quoted === null ? trimmed : quoted[2]
}

/**
 * 抽出 patch 文件里的 entry 行。
 * @param {string} text - patch 文件正文。
 * @returns {{ id: string, name?: string, disabled?: string }[]} `disabled` 为 `true` 或表达式原文。
 */
function parsePatch(text) {
  const entries = []
  let current
  for (const line of stripCommentLines(text).split(/\r?\n/)) {
    const id = /^\s*-\s*id:\s*(\S+)\s*$/.exec(line)
    if (id !== null) {
      if (current !== undefined) entries.push(current)
      current = { id: unquote(id[1]) }
      continue
    }
    if (current === undefined) continue
    const name = /^\s*name:\s*(.+?)\s*$/.exec(line)
    if (name !== null && current.name === undefined) current.name = unquote(name[1])
    const disabled = /^\s*disabled:\s*(.+?)\s*$/.exec(line)
    if (disabled !== null && current.disabled === undefined) current.disabled = unquote(disabled[1])
  }
  if (current !== undefined) entries.push(current)
  return entries
}

/** 取模块名所属的包名（`@scope/pkg/sub` → `@scope/pkg`，`pkg/sub` → `pkg`）。 */
function packageOf(specifier) {
  if (!specifier.startsWith('@')) return specifier.split('/')[0]
  return specifier.split('/').slice(0, 2).join('/')
}

/** 列出一个 node_modules 下的全部包目录名（含 scope 展开）。 */
function listInstalledPackages(nodeModules) {
  const names = []
  for (const entry of readdirSync(nodeModules, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '.bin' || entry.name === '.pnpm') continue
    if (!entry.name.startsWith('@')) {
      names.push(entry.name)
      continue
    }
    for (const scoped of readdirSync(join(nodeModules, entry.name), { withFileTypes: true })) {
      if (scoped.isDirectory()) names.push(`${entry.name}/${scoped.name}`)
    }
  }
  return names
}

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const target = args.find((arg) => !arg.startsWith('--')) ?? DEFAULT_PROFILE
// DSH Desktop 的安全模式会把 DSH_HOME 指到 safe-mode\dsh-home（那里只有最小 profile），
// 所以在安全模式会话里跑本脚本必须回落到真实 home，否则永远找不到 web profile。
const homes = [...new Set([process.env.DSH_HOME, join(homedir(), '.dsh')].filter((home) => home !== undefined))]
const candidates = /[\\/]/.test(target) ? [resolve(target)] : homes.map((home) => join(home, 'profiles', target))
const profileDir = candidates.find((dir) => existsSync(join(dir, 'package.json')))
if (profileDir === undefined) {
  console.error(`profile 不可读：试过 ${candidates.join('、')}`)
  console.error('提示：安全模式会话里 DSH_HOME 指向 safe-mode\\dsh-home，请显式传路径，如')
  console.error('  node tools\\check-profile-entries.mjs "%USERPROFILE%\\.dsh\\profiles\\web"')
  process.exit(1)
}
const manifestPath = join(profileDir, 'package.json')

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const bundles = manifest.dsh?.profile?.bundles ?? []
const profilePatchPath = join(profileDir, 'cordis.patch.yml')
const profileRows = existsSync(profilePatchPath) ? parsePatch(readFileSync(profilePatchPath, 'utf8')) : []
const profileDisabled = new Set(profileRows.filter((row) => row.name === undefined && row.disabled === 'true').map((row) => row.id))

const nodeModules = join(profileDir, 'node_modules')
const claims = new Map()
const notes = []
for (const installed of listInstalledPackages(nodeModules)) {
  const patchPath = join(nodeModules, installed, 'cordis.patch.yml')
  if (!existsSync(patchPath)) continue
  const loaded = bundles.includes(installed)
  for (const entry of parsePatch(readFileSync(patchPath, 'utf8'))) {
    if (entry.name === undefined) continue
    const disabledByProfile = profileDisabled.has(entry.id)
    const disabledHere = entry.disabled !== undefined
    const enabled = !disabledByProfile && !disabledHere
    if (entry.disabled !== undefined && entry.disabled !== 'true') {
      notes.push(`${installed} entry "${entry.id}" 的 disabled 是表达式（${entry.disabled}），按启用计入`)
    }
    const pkg = packageOf(entry.name)
    const list = claims.get(pkg) ?? []
    list.push({ bundle: installed, id: entry.id, name: entry.name, loaded, enabled, disabledByProfile, disabledHere })
    claims.set(pkg, list)
  }
}

const conflicts = [...claims.entries()].filter(([, list]) => {
  const enabledLoaded = list.filter((claim) => claim.enabled && claim.loaded)
  return enabledLoaded.length > 1
})

if (asJson) {
  console.log(JSON.stringify({ profile: profileDir, bundles, conflicts: Object.fromEntries(conflicts) }, null, 2))
  process.exit(conflicts.length === 0 ? 0 : 1)
}

console.log(`profile: ${profileDir}`)
console.log(`已挂载 bundle: ${bundles.length} 个；profile patch 禁用 entry: ${[...profileDisabled].join(', ') || '（无）'}`)
if (notes.length > 0) for (const note of notes) console.log(`  注：${note}`)

if (conflicts.length === 0) {
  console.log('\n无「同包多入口」冲突。')
  process.exit(0)
}

console.log('\n发现冲突（同一个包被多条启用的 loader entry 声明）：')
for (const [pkg, list] of conflicts) {
  console.log(`  ${pkg}`)
  for (const claim of list) {
    const state = claim.enabled && claim.loaded ? '启用' : claim.disabledByProfile ? '被 profile 禁用' : claim.disabledHere ? '被自身禁用' : '未挂载'
    console.log(`    - [${state}] ${claim.bundle} → entry "${claim.id}" (${claim.name})`)
  }
}
console.log('\nHost 侧报错签名（logs\\host\\dsh-<日期>.error.log）：')
console.log(`  client-modules: package <pkg> resolves from multiple active Loader sources`)
console.log('修法：profile 的 cordis.patch.yml 加 `- id: <真实 entry id>` + `disabled: true`，或 `dsh plugin remove <包名>`。')
process.exit(1)
