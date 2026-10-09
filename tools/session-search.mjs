// 临时工具：批量解压 dsh 会话日志（zstd 多帧）并按关键词检索，只读。
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

const root = process.argv[2]
const kws = process.argv.slice(3)
if (!root || kws.length === 0) {
  console.error('usage: node session-search.mjs <sessions-root> <kw...>')
  process.exit(2)
}

const MAGIC = [0x28, 0xb5, 0x2f, 0xfd]
const decoder = new TextDecoder()
let hits = 0

for (const dir of readdirSync(root)) {
  const full = join(root, dir)
  let files
  try {
    files = readdirSync(full)
  } catch {
    continue
  }
  for (const f of files) {
    if (!f.endsWith('.zstd')) continue
    const raw = readFileSync(join(full, f))
    const positions = []
    for (let i = 0; i + 3 < raw.length; i++) {
      if (raw[i] === MAGIC[0] && raw[i + 1] === MAGIC[1] && raw[i + 2] === MAGIC[2] && raw[i + 3] === MAGIC[3]) positions.push(i)
    }
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
    lines.forEach((l, idx) => {
      const hit = kws.filter((k) => l.includes(k))
      if (hit.length === 0) return
      hits++
      console.log(`--- ${dir} / ${f} / line ${idx} / [${hit.join(',')}]`)
      console.log(l.length > 600 ? l.slice(0, 600) + '…' : l)
    })
  }
}
console.log(`### total hits: ${hits}`)
