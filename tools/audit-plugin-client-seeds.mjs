#!/usr/bin/env node
/**
 * 审计「每个已装插件的浏览器侧 bundle 到底 require 了哪些平台模块」是否都在装机的模块表里
 * （零依赖、只读；不改任何文件）。
 *
 * 为什么需要它：`dsh-client-modules` 的懒 CJS 模块表只认三种名字——平台种子
 * （react 系 + 装机自带的 `@deepseek-ai/*` 包）、已注册的插件包、已物化的模块。
 * 插件 bundle 里 `require("@deepseek-ai/<装机没有的东西>")` 会抛
 * `client-modules: require("…") missed the module table`；**宿主不隔离 loader entry 工厂**
 * （见 `dsh-dream-skin\lib\client.js` 顶部注释引的 upstream issue #41/#43），一个抛异常的工厂
 * 聚合成 `entries did not activate`，整个 web 壳白屏 → DSH Desktop 恢复启动失败 → 落安全模式。
 * 2026-09-17 的 `dsh-liquid-glass@0.1.0` 正是这样打死的：它写死了旧代种子
 * `@deepseek-ai/dsh-client-runtime/client`，而装机 0.1.5-rc.1 的模块表已拆成
 * `@deepseek-ai/dsh-client-store`（现成反例与修法见 recon 快照）。
 *
 * 用法：
 *   node tools\audit-plugin-client-seeds.mjs [profile 名或 profile 目录]
 *   node tools\audit-plugin-client-seeds.mjs --asar <别的 app.asar> [profile]      # 装机 ≤2.0.9
 *   node tools\audit-plugin-client-seeds.mjs --app <别的 resources\app 目录> [profile]  # 装机 ≥2.0.10
 *
 * 扫描范围：**只扫声明了 `dsh.client` 的包**（= 真正会被装进 boot graph 的浏览器 bundle），
 * 且只看包内 `client*.js`；第三方依赖与 node 侧文件不计入，避免噪声。
 *
 * 判据：spec 去掉子路径后的包名落在以下任一集合即算「模块表内」——
 *   ① 装机 app.asar 的 node_modules 顶层包（平台种子来源）；
 *   ② react 系壳实例（react / react-dom / react/jsx-runtime / react-dom/client）；
 *   ③ profile 里已装的包（可能是另一条 boot graph 行）。
 * 命中 ① ② ③ 之外一律报 MISSING（= 白屏风险）；`dsh.client.inject` 里的名字单独列为提示
 * （宿主对不存在的 inject 边是容忍的，只有 bundle 里真 require 才致命）。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/** 壳以实例形式注入的 React 系名字（不来自 app.asar 的包）。 */
const SHELL_SEEDS = new Set([
  'react', 'react-dom', 'react/jsx-runtime', 'react-dom/client', 'react-dom/server',
])

const DEFAULT_RESOURCES = join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DSH Desktop', 'resources')
const DEFAULT_ASAR = join(DEFAULT_RESOURCES, 'app.asar')
const DEFAULT_APP_DIR = join(DEFAULT_RESOURCES, 'app')

const argv = process.argv.slice(2)
const asarIndex = argv.indexOf('--asar')
const appIndex = argv.indexOf('--app')
const explicitSource = asarIndex !== -1
  ? { kind: 'asar', path: argv[asarIndex + 1] }
  : appIndex !== -1 ? { kind: 'dir', path: argv[appIndex + 1] } : undefined
// 装机 2.0.10 起取消 asar（上游 release notes），资源改为普通目录：两种布局都认。
const seedSource = explicitSource ?? (existsSync(DEFAULT_ASAR)
  ? { kind: 'asar', path: DEFAULT_ASAR }
  : { kind: 'dir', path: DEFAULT_APP_DIR })
const consumed = new Set([asarIndex, asarIndex + 1, appIndex, appIndex + 1].filter(index => index >= 0))
const rest = argv.filter((_, index) => !consumed.has(index))
const profileArg = rest[0]

// DSH Desktop 的安全模式会把 DSH_HOME 指到 safe-mode\dsh-home（那里只有最小 profile），
// 所以在安全模式会话里跑本脚本必须回落到真实 home，否则永远扫不到已装插件。
const HOMES = [...new Set([process.env.DSH_HOME, join(process.env.USERPROFILE ?? '', '.dsh')]
  .filter(home => home !== undefined && home !== ''))]

/** 解析目标 profile 目录：显式路径优先，否则按 home 顺序找第一个有 package.json 的。 */
function resolveProfileDir(arg) {
  if (arg !== undefined && /[\\/]/.test(arg)) return arg
  const name = arg ?? 'web'
  for (const home of HOMES) {
    const dir = join(home, 'profiles', name)
    try {
      if (statSync(join(dir, 'package.json')).isFile()) return dir
    } catch { /* 该 home 下没有这个 profile，试下一个 */ }
  }
  console.error(`profile 不可读：试过 ${HOMES.map(home => join(home, 'profiles', name)).join('、')}`)
  process.exit(1)
}

const profileDir = resolveProfileDir(profileArg)

/** 递归展开 asar 目录树。 */
function listAsarEntries(path) {
  const buffer = readFileSync(path)
  const headerSize = buffer.readUInt32LE(12)
  const header = JSON.parse(buffer.subarray(16, 16 + headerSize).toString('utf8'))
  const out = []
  const walk = (node, prefix) => {
    for (const [name, value] of Object.entries(node.files ?? {})) {
      const entry = prefix === '' ? name : `${prefix}/${name}`
      if (value.files !== undefined) walk(value, entry)
      else out.push(entry)
    }
  }
  walk(header, '')
  return out
}

/** 装机 node_modules 顶层包名集合（平台种子来源）。 */
function shippedPackages(entries) {
  const names = new Set()
  for (const entry of entries) {
    const match = /^node_modules\/((?:@[^/]+\/)?[^/]+)\/package\.json$/.exec(entry)
    if (match !== null) names.add(match[1])
  }
  return names
}

/** 一个目录下的已装包（含 @scope 一层）。 */
function installedPackageNames(nodeModulesDir) {
  const names = new Set()
  let dirents
  try {
    dirents = readdirSync(nodeModulesDir, { withFileTypes: true })
  } catch {
    return names
  }
  for (const dirent of dirents) {
    if (dirent.name.startsWith('.')) continue
    if (!dirent.isDirectory() && !dirent.isSymbolicLink()) continue
    if (!dirent.name.startsWith('@')) { names.add(dirent.name); continue }
    try {
      for (const child of readdirSync(join(nodeModulesDir, dirent.name))) names.add(`${dirent.name}/${child}`)
    } catch { /* 空 scope 目录，跳过 */ }
  }
  return names
}

const profileNodeModules = join(profileDir, 'node_modules')

/** 声明了 dsh.client 的已装包（真正进 boot graph 的浏览器面）。 */
function clientPlugins(manifest) {
  const names = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...(manifest.dsh?.profile?.bundles ?? []),
  ])
  const out = []
  for (const name of names) {
    const dir = join(profileNodeModules, ...name.split('/'))
    let pkg
    try {
      pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    } catch {
      continue
    }
    if (pkg.dsh?.client === undefined) continue
    out.push({ name, dir, manifest: pkg })
  }
  return out
}

/** 包内的浏览器 bundle 文件：`client*.js`（递归，跳过 node_modules）。 */
function clientBundles(dir, acc = [], depth = 0) {
  if (depth > 3) return acc
  let dirents
  try {
    dirents = readdirSync(dir, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const dirent of dirents) {
    if (dirent.name === 'node_modules' || dirent.name.startsWith('.')) continue
    const full = join(dir, dirent.name)
    if (dirent.isDirectory()) { clientBundles(full, acc, depth + 1); continue }
    if (/^client.*\.(js|mjs|cjs)$/.test(dirent.name)) acc.push(full)
  }
  return acc
}

// 只看模块表上的裸 require(...)；`xxx.require("util")` 是别的函数的属性调用（如 UMD 兜底），不算。
const REQUIRE_RE = /(?<![.\w$])require\(\s*["']([^"']+)["']\s*\)/g
/** bundle 里的 require spec（去重，保留出现次数与所在文件）。 */
function requiredSpecs(files) {
  const hits = new Map()
  for (const file of files) {
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    REQUIRE_RE.lastIndex = 0
    let match
    while ((match = REQUIRE_RE.exec(text)) !== null) {
      const spec = match[1]
      if (spec.startsWith('.') || spec.startsWith('node:') || spec.startsWith('data:')) continue
      // 模板占位（如错误信息里的 require('${spec}')）不是真 spec。
      if (spec.includes('${')) continue
      const row = hits.get(spec) ?? { count: 0, files: new Set() }
      row.count += 1
      row.files.add(relative(profileDir, file))
      hits.set(spec, row)
    }
  }
  return hits
}

/** spec 的包名（scoped 取两段）。 */
function packageOf(spec) {
  const parts = spec.split('/')
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

const shipped = seedSource.kind === 'asar'
  ? shippedPackages(listAsarEntries(seedSource.path))
  : installedPackageNames(join(seedSource.path, 'node_modules'))
const installed = installedPackageNames(profileNodeModules)
const manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
const plugins = clientPlugins(manifest)

console.log(`profile: ${profileDir}`)
console.log(`种子源:  ${seedSource.path}（${seedSource.kind === 'asar' ? 'asar' : '目录'}；装机包 ${shipped.size} 个；profile 已装 ${installed.size} 个）`)
console.log(`带 dsh.client 的插件: ${plugins.length} 个\n`)

let risky = 0
for (const plugin of plugins) {
  const files = clientBundles(plugin.dir)
  const missing = []
  for (const [spec, row] of requiredSpecs(files)) {
    const name = packageOf(spec)
    if (SHELL_SEEDS.has(name) || shipped.has(name) || installed.has(name)) continue
    missing.push({ spec, ...row })
  }
  const inject = plugin.manifest.dsh.client.inject ?? []
  const floatInject = inject.filter(name => !shipped.has(name) && !installed.has(name))
  if (missing.length > 0) risky += 1
  console.log(`${missing.length === 0 ? 'ok  ' : 'MISS'} ${plugin.name} v${plugin.manifest.version}`)
  for (const item of missing) {
    console.log(`       ✗ require("${item.spec}") ×${item.count} — 模块表没有（会白屏）`)
    console.log(`         在 ${[...item.files].join(', ')}`)
  }
  if (floatInject.length > 0) {
    console.log(`       · dsh.client.inject 里装机没有的名字（宿主容忍，仅提示）：${floatInject.join(', ')}`)
  }
}

console.log(`\n带浏览器面的插件 ${plugins.length} 个；白屏风险 ${risky} 个。`)
process.exit(risky > 0 ? 1 : 0)
