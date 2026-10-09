#!/usr/bin/env node
/**
 * 冒烟：把客户端插件 bundle 放进「模拟模块表」里物化一次，验证它的工厂**不会抛**
 * （`dsh-client-modules` 不隔离 loader entry 工厂：一个抛异常的工厂聚合成
 * `entries did not activate`，整个 web 壳白屏 → 安全模式）。
 *
 * 默认模拟**本机这代**模块表：`@deepseek-ai/dsh-client-store` 在、旧名
 * `@deepseek-ai/dsh-client-runtime*` 不在（装机 0.1.5-rc.1 的实测事实，也正是
 * 2026-09-17 `dsh-liquid-glass@0.1.0` 白屏的现场）。`--degrade` 再把两个 store 种子
 * 一起拿掉，验证「全缺也必须是 no-op 而不是抛」。
 *
 * 用法：
 *   node tools\smoke-plugin-client-seed.mjs [bundle 路径] [--degrade]
 *   默认 bundle = %USERPROFILE%\.dsh\profiles\web\node_modules\dsh-liquid-glass\lib\client.js
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const degrade = args.includes('--degrade')
const bundleArg = args.find(arg => !arg.startsWith('--'))
const bundle = bundleArg ?? join(process.env.USERPROFILE ?? '', '.dsh', 'profiles', 'web',
  'node_modules', 'dsh-liquid-glass', 'lib', 'client.js')

/** 模块表桩：平台种子（react 系 + 装机包）。未列出的名字按模块表口径抛错。 */
function makeModuleTable({ degrade }) {
  const seeds = new Map([
    ['react', {
      createElement: () => null, Fragment: Symbol('Fragment'), useState: () => [undefined, () => { }],
      useEffect: () => { }, useMemo: (fn) => fn(), useRef: () => ({ current: null }),
      useCallback: (fn) => fn, useSyncExternalStore: () => undefined,
    }],
    ['react/jsx-runtime', { jsx: () => null, jsxs: () => null, Fragment: Symbol('Fragment') }],
  ])
  if (!degrade) seeds.set('@deepseek-ai/dsh-client-store', { defineStore: decl => ({ spec: decl, create: () => ({}) }) })
  return (spec) => {
    if (seeds.has(spec)) return seeds.get(spec)
    throw new Error(`client-modules: require("${spec}") missed the module table — not a platform seed word, `
      + 'not a materialized module, and no registered package factory')
  }
}

let captured
globalThis.window = { __ModuleLoader__: { load: definition => { captured = definition } } }
const warnings = []
const realWarn = console.warn
console.warn = (...values) => { warnings.push(values.join(' ')) }

const source = readFileSync(bundle, 'utf8')
await import(`${pathToFileURL(bundle).href}?v=${Date.now()}`)
console.warn = realWarn

if (captured === undefined) {
  console.error(`✗ ${bundle} 没有调用 window.__ModuleLoader__.load({id, factory})`)
  process.exit(1)
}

let exported
try {
  exported = captured.factory(makeModuleTable({ degrade }))
} catch (error) {
  console.error(`✗ ${captured.id} 的工厂抛了 —— 这一发就是整壳白屏：${error.message}`)
  process.exit(1)
}

const ok = typeof exported.apply === 'function' && Array.isArray(exported.inject)
console.log(`${ok ? '✓' : '✗'} ${captured.id} 工厂物化成功（${degrade ? '两个 store 种子都缺' : '本机这代：只有 dsh-client-store'}）`)
console.log(`   exports.apply=${typeof exported.apply} exports.inject=${JSON.stringify(exported.inject)}`)
if (warnings.length > 0) console.log(`   降级告警：${warnings.join(' | ')}`)
process.exit(ok ? 0 : 1)
