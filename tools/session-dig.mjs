// 临时工具：解压单个 dsh 会话日志，提取含关键词的文本片段（只读）。
import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'

const file = process.argv[2]
const kws = process.argv.slice(3)
if (!file || kws.length === 0) {
  console.error('usage: node session-dig.mjs <session.jsonl.zstd> <kw...>')
  process.exit(2)
}

const MAGIC = [0x28, 0xb5, 0x2f, 0xfd]
const raw = readFileSync(file)
const positions = []
for (let i = 0; i + 3 < raw.length; i++) {
  if (raw[i] === MAGIC[0] && raw[i + 1] === MAGIC[1] && raw[i + 2] === MAGIC[2] && raw[i + 3] === MAGIC[3]) positions.push(i)
}
const decoder = new TextDecoder()
const lines = []
for (let i = 0; i < positions.length; i++) {
  const start = positions[i]
  const end = i + 1 < positions.length ? positions[i + 1] : raw.length
  try {
    for (const l of decoder.decode(zstdDecompressSync(raw.subarray(start, end))).split('\n')) {
      if (l.trim().length > 0) lines.push(l)
    }
  } catch {
    /* torn frame */
  }
}

const strings = (v, path, out) => {
  if (typeof v === 'string') {
    out.push([path, v])
    return
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => strings(x, `${path}[${i}]`, out))
    return
  }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) strings(x, path ? `${path}.${k}` : k, out)
  }
}

lines.forEach((l, idx) => {
  let o
  try {
    o = JSON.parse(l)
  } catch {
    return
  }
  const out = []
  strings(o, '', out)
  for (const [path, s] of out) {
    if (!kws.some((k) => s.includes(k))) continue
    if (/^[0-9a-f]{64}$/.test(s)) continue
    const snippet = s.replace(/\s+/g, ' ').slice(0, 700)
    console.log(`[line ${idx}] type=${o.type ?? '?'} path=${path}\n  ${snippet}\n`)
  }
})
