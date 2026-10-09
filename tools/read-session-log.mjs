// Summarize event stream of a dsh session log: count by type, show sequence of types.
import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'

const file = process.argv[2]
const raw = readFileSync(file)
const positions = []
for (let i = 0; i < raw.length - 3; i++) {
  if (raw[i] === 0x28 && raw[i + 1] === 0xB5 && raw[i + 2] === 0x2F && raw[i + 3] === 0xFD) positions.push(i)
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
const counts = {}
const seqTypes = []
for (const l of lines.slice(1)) {
  try { const o = JSON.parse(l); counts[o.type] = (counts[o.type] ?? 0) + 1; seqTypes.push(o.type) } catch {}
}
console.log('total events:', lines.length - 1)
console.log('type counts:', JSON.stringify(counts, null, 0))
console.log('event type sequence (first 40):', seqTypes.slice(0, 40).join(' -> '))
