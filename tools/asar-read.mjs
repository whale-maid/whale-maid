#!/usr/bin/env node
/**
 * 不用 Electron 读 DSH Desktop 的 `app.asar`（列目录 / 取文件）。
 *
 * 为什么需要它：本机 dsh 的装机代码都在
 * `C:\Users\<you>\AppData\Local\Programs\DSH Desktop\resources\app.asar` 里，
 * 而 **Node 的 fs 不认 asar**（只有 Electron 的 fs 认）。原先只能按 tools\AGENTS.md 第十节
 * 的办法用 `ELECTRON_RUN_AS_NODE=1` 跑 `DSH Desktop.exe` 绕；
 * 本脚本直接按 asar 格式解析（Chromium Pickle 头 + JSON 目录 + 拼接的数据区），
 * 普通 `node` 就能读出任意内部文件——诊断「装机行为」时比翻 app.asar.unpacked 全得多。
 *
 * 用法：
 *   node tools\asar-read.mjs list [<子串过滤>]                 # 列内部文件（可选过滤）
 *   node tools\asar-read.mjs cat <内部路径>                    # 打到 stdout
 *   node tools\asar-read.mjs extract <内部路径> <输出文件>       # 写到工作区文件
 *   node tools\asar-read.mjs --asar <别的.asar> list ...        # 换归档（默认 DSH Desktop）
 *
 * 例：node tools\asar-read.mjs list lib/main.js
 *     node tools\asar-read.mjs extract lib/main.js _tmp\asar\main.js
 *
 * 只读，不写归档内部。内部路径用 `/`（如 `lib/main.js`、`node_modules/x/package.json`）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DEFAULT_ASAR = join(
  process.env.LOCALAPPDATA ?? '',
  'Programs',
  'DSH Desktop',
  'resources',
  'app.asar',
)

const argv = process.argv.slice(2)
const asarIndex = argv.indexOf('--asar')
const asarPath = asarIndex === -1 ? DEFAULT_ASAR : argv[asarIndex + 1]
const rest = asarIndex === -1 ? argv : argv.filter((_, index) => index !== asarIndex && index !== asarIndex + 1)
const [command, ...operands] = rest

/** 递归展开 asar 目录树。 @returns {{ path: string, size: number, offset: number }[]} */
function listEntries(header) {
  const out = []
  const walk = (node, prefix) => {
    for (const [name, value] of Object.entries(node.files ?? {})) {
      const path = prefix === '' ? name : `${prefix}/${name}`
      if (value.files !== undefined) walk(value, path)
      else out.push({ path, size: value.size ?? 0, offset: value.offset })
    }
  }
  walk(header, '')
  return out
}

/** 读归档头：偏移 12 是目录 JSON 的长度，正文从 16 + 该长度之后开始。 */
function readArchive(path) {
  const buffer = readFileSync(path)
  const headerSize = buffer.readUInt32LE(12)
  const header = JSON.parse(buffer.subarray(16, 16 + headerSize).toString('utf8'))
  return { buffer, dataStart: 16 + headerSize, entries: listEntries(header) }
}

if (command === undefined) {
  console.error('用法：node tools\\asar-read.mjs list [过滤] | cat <内部路径> | extract <内部路径> <输出文件>')
  process.exit(2)
}

const { buffer, dataStart, entries } = readArchive(asarPath)

if (command === 'list') {
  const filter = operands[0]
  const hits = filter === undefined ? entries : entries.filter((entry) => entry.path.includes(filter))
  for (const entry of hits) console.log(`${String(entry.size).padStart(9)}  ${entry.path}`)
  console.log(`\n${hits.length} / ${entries.length} 个文件（归档 ${buffer.byteLength} 字节）`)
  process.exit(0)
}

if (command === 'cat' || command === 'extract') {
  const innerPath = operands[0]
  if (innerPath === undefined) {
    console.error(`${command} 需要内部路径`)
    process.exit(2)
  }
  const hit = entries.find((entry) => entry.path === innerPath)
  if (hit === undefined) {
    console.error(`归档内没有 ${innerPath}`)
    process.exit(1)
  }
  const content = buffer.subarray(dataStart + Number(hit.offset), dataStart + Number(hit.offset) + hit.size)
  if (command === 'cat') {
    process.stdout.write(content)
  } else {
    const outFile = operands[1]
    if (outFile === undefined) {
      console.error('extract 需要输出文件路径')
      process.exit(2)
    }
    writeFileSync(outFile, content)
    console.log(`${innerPath} → ${outFile}（${hit.size} 字节）`)
  }
  process.exit(0)
}

console.error(`未知子命令：${command}`)
process.exit(2)
