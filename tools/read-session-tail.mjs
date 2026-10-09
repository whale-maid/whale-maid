// Print the tail of a dsh session log (zstd-framed JSONL), one compact line per event.
// Usage: node tools/read-session-tail.mjs <session.jsonl.zstd> [count=15] [chars=400]
import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'

const file = process.argv[2]
const count = Number(process.argv[3] ?? 15)
const chars = Number(process.argv[4] ?? 400)
if (file === undefined) {
  console.error('usage: node tools/read-session-tail.mjs <session.jsonl.zstd> [count] [chars]')
  process.exit(2)
}

const raw = readFileSync(file)
const positions = []
for (let i = 0; i + 3 < raw.length; i++) {
  if (raw[i] === 0x28 && raw[i + 1] === 0xb5 && raw[i + 2] === 0x2f && raw[i + 3] === 0xfd) positions.push(i)
}
const decoder = new TextDecoder()
const lines = []
for (let i = 0; i < positions.length; i++) {
  const start = positions[i]
  const end = i + 1 < positions.length ? positions[i + 1] : raw.length
  try {
    const plain = zstdDecompressSync(raw.subarray(start, end))
    for (const l of decoder.decode(plain).split('\n')) if (l.trim().length > 0) lines.push(l)
  } catch { /* torn frame */ }
}

const events = []
for (const l of lines.slice(1)) {
  try { events.push(JSON.parse(l)) } catch { /* partial line */ }
}

const clip = (s) => (s.length > chars ? `${s.slice(0, chars)}…` : s)
for (const e of events.slice(-count)) {
  const payload = { ...e }
  delete payload.type
  console.log(`--- ${e.type} @ ${e.ts ?? e.timestamp ?? '?'}`)
  console.log(clip(JSON.stringify(payload)))
}
console.log(`[total events: ${events.length}]`)
