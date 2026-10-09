#!/usr/bin/env node
/**
 * Resilient chunked downloader (HTTP Range).
 *
 * Why chunks instead of N big streams: through the local S302 TLS interceptor
 * long/large transfers get killed mid-flight — `TypeError: terminated`,
 * `SocketError: other side closed`, code UND_ERR_SOCKET (observed at ~14 MB
 * into a range request). The transfer rate itself is fine; the connections
 * just do not survive. So: many SMALL chunks, each retried independently.
 * Losing a connection then costs one 4 MiB chunk, not the whole file.
 *
 * Each chunk is written straight at its offset with fs.writeSync(fd, ...).
 * No WriteStream is used, so the classic `flags:'w'` truncation hazard does
 * not apply. Partial-Content (206) is required; 200 means the Range was
 * dropped and we refuse to write.
 *
 * Usage: node gh-download-parallel.mjs <url> <out-path> [chunkMiB=4] [workers=6]
 */

import fs from 'node:fs';
import path from 'node:path';

const [url, out, chunkArg, workerArg] = process.argv.slice(2);
if (!url || !out) {
  console.error('usage: node gh-download-chunked.mjs <url> <out-path> [chunkMiB=4] [workers=6]');
  process.exit(2);
}

const CHUNK = Math.max(1, Number(chunkArg) || 4) * 1024 * 1024;
const WORKERS = Math.max(1, Math.min(16, Number(workerArg) || 6));
const MAX_ATTEMPTS = 6;

// The local S302 interceptor answers 502 to requests carrying the default
// `node` User-Agent, so always send a normal browser UA.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// HEAD is unreliable through the interceptor. Instead ask for a single byte and
// read the total out of Content-Range (`bytes 0-0/<total>`).
async function probeTotal() {
  const res = await fetch(url, {
    headers: { Range: 'bytes=0-0', 'User-Agent': UA },
    redirect: 'follow',
  });
  if (res.status !== 206) {
    throw new Error(`probe returned HTTP ${res.status} (expected 206)`);
  }
  const cr = res.headers.get('content-range') || '';
  const n = Number(cr.split('/').pop());
  await res.arrayBuffer();
  if (!n) throw new Error(`cannot parse total from Content-Range: "${cr}"`);
  return n;
}

let total;
try {
  total = await probeTotal();
} catch (e) {
  console.error(`probe failed: ${e.message}`);
  process.exit(1);
}

const chunks = [];
for (let s = 0; s < total; s += CHUNK) {
  chunks.push({ start: s, end: Math.min(s + CHUNK - 1, total - 1) });
}

console.log(
  `size=${(total / 1048576).toFixed(1)} MiB  ` +
  `chunks=${chunks.length} x ${(CHUNK / 1048576).toFixed(1)} MiB  workers=${WORKERS}`,
);

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.alloc(0));
fs.truncateSync(out, total);
const fd = fs.openSync(out, 'r+');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
let doneBytes = 0;
let doneChunks = 0;
let failedChunks = 0;
let retries = 0;

async function getChunk(c, index) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Range: `bytes=${c.start}-${c.end}`, 'User-Agent': UA },
        redirect: 'follow',
      });
      if (res.status !== 206) {
        throw new Error(`HTTP ${res.status} (expected 206)`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const want = c.end - c.start + 1;
      if (buf.length !== want) {
        throw new Error(`short body ${buf.length}/${want}`);
      }
      fs.writeSync(fd, buf, 0, buf.length, c.start);
      return buf.length;
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_ATTEMPTS) {
        retries++;
        await sleep(400 * attempt);
      }
    }
  }
  throw new Error(`chunk ${index}: ${lastErr.message}`);
}

let next = 0;
async function worker() {
  for (;;) {
    const i = next++;
    if (i >= chunks.length) return;
    const c = chunks[i];
    try {
      const n = await getChunk(c, i);
      doneBytes += n;
      doneChunks++;
      process.stderr.write(
        `\r  ${(doneBytes / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MiB  ` +
        `${((doneBytes / total) * 100).toFixed(1)}%   chunks ${doneChunks}/${chunks.length}   retries ${retries}   `,
      );
    } catch (e) {
      failedChunks++;
      console.error(`\n${e.message}`);
    }
  }
}

await Promise.all(Array.from({ length: WORKERS }, worker));
fs.closeSync(fd);
process.stderr.write('\r');

const secs = (Date.now() - t0) / 1000;
const size = fs.statSync(out).size;
console.log(`OK  ${out}`);
console.log(
  `    ${size} bytes in ${secs.toFixed(1)}s  (${(size / 1048576 / Math.max(secs, 0.001)).toFixed(2)} MB/s)  ` +
  `failedChunks=${failedChunks}  retries=${retries}`,
);
if (failedChunks > 0 || size !== total) {
  console.error('INCOMPLETE — re-run to repair, or verify the checksum');
  process.exit(1);
}
