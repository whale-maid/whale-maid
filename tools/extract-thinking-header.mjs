// extract-thinking-header.mjs — 系统提示词提取器（会话日志 → system/message 正文）
//
// 用法: node tools\extract-thinking-header.mjs <session.v3.jsonl.zstd> [关键词...]
//   省略关键词时默认检索 "We need" / "Reasoning discipline" / "MANDATORY"。
//
// 事实（2026-09-13 实测，别再踩回头路）: 会话日志里
//   - `system/message` 事件 = 完整系统提示词正文（role: system）；
//   - `request/header` 事件只有 config / adapterDefaults / tools，**不含提示词正文**。
// 所以「某段 prompt section 有没有被注入」只能读 system/message（旧版本此脚本查 request/header，永远为 false）。
//
// 例（thinking-pattern 撤下后应为 hits: (none)）:
//   node tools\extract-thinking-header.mjs "<...>\session.v3.jsonl.zstd" "We need"
//
// 派生验证法（不必给宿主加插件）: 让 dsh 起一个「只回 OK」的子代理 —— 子会话在**同一宿主进程**里
// 重新装配系统提示词并落盘，读它的 system/message 即可判定配置改动是否已在运行进程生效。
import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'

const log = process.argv[2]
if (log === undefined) {
  console.error('用法: node tools\\extract-thinking-header.mjs <session.v3.jsonl.zstd> [关键词...]')
  process.exit(2)
}
const needles = process.argv.length > 3
  ? process.argv.slice(3)
  : ['We need', 'Reasoning discipline', 'MANDATORY']

const raw = readFileSync(log)
const positions = []
for (let i = 0; i < raw.length - 3; i++) {
  if (raw[i] === 0x28 && raw[i + 1] === 0xB5 && raw[i + 2] === 0x2F && raw[i + 3] === 0xFD) positions.push(i)
}
const decoder = new TextDecoder()
const events = []
for (let i = 0; i < positions.length; i++) {
  const start = positions[i]
  const end = i + 1 < positions.length ? positions[i + 1] : raw.length
  try {
    const plain = decoder.decode(zstdDecompressSync(raw.subarray(start, end)))
    for (const line of plain.split('\n')) {
      if (line.trim().length === 0) continue
      try {
        events.push(JSON.parse(line))
      } catch {}
    }
  } catch {}
}

const headers = events.filter(e => e.type === 'request/header')
const messages = events.filter(e => e.type === 'system/message')
console.log(`events total: ${events.length} | system/message: ${messages.length} | request/header: ${headers.length}`)
console.log(`needles: ${needles.map(n => JSON.stringify(n)).join(', ')}`)
for (const e of messages) {
  const text = JSON.stringify(e.data.message)
  const hits = needles.filter(n => text.includes(n))
  console.log(`--- system/message seq ${e.seq} | turn ${e.data.turn} step ${e.data.step} | chars ${text.length}`
    + ` | hits: ${hits.length === 0 ? '(none)' : hits.map(n => JSON.stringify(n)).join(', ')}`)
  for (const n of hits) {
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const found = text.match(new RegExp(`.{0,60}${escaped}.{0,100}`, 'g'))
    if (found) for (const frag of found.slice(0, 3)) console.log(`    FRAG: ${frag.replace(/\\n/g, ' ').slice(0, 200)}`)
  }
}
if (messages.length === 0) console.log('(无 system/message 事件——日志可能尚未落盘到第一个 step)')
