#!/usr/bin/env node
/**
 * Download a file from a URL, following redirects. Works where the other
 * channels cannot:
 *   - mcp__browser__dl times out on large payloads (>= ~11 MB);
 *   - curl fails inside the dsh sandbox with schannel SEC_E_NO_CREDENTIALS.
 * This uses Node's own fetch (OpenSSL + NODE_EXTRA_CA_CERTS, which already
 * trusts the S302 root CA), so GitHub release assets come through.
 *
 * Usage: node gh-download.mjs <url> <out-path>
 */

import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const [url, out] = process.argv.slice(2);
if (!url || !out) {
  console.error('usage: node gh-download.mjs <url> <out-path>');
  process.exit(2);
}

const t0 = Date.now();
const res = await fetch(url, { redirect: 'follow' });
if (!res.ok) {
  console.error(`HTTP ${res.status} ${res.statusText}  ${url}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(out), { recursive: true });

const total = Number(res.headers.get('content-length') || 0);
const src = Readable.fromWeb(res.body);
let got = 0;
src.on('data', (chunk) => {
  got += chunk.length;
  if (total) {
    const pct = ((got / total) * 100).toFixed(1);
    process.stderr.write(`\r  ${(got / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB  ${pct}%   `);
  }
});

await pipeline(src, fs.createWriteStream(out));
process.stderr.write('\r');

const secs = (Date.now() - t0) / 1000;
console.log(`OK  ${out}`);
console.log(`    ${got} bytes in ${secs.toFixed(1)}s  (${(got / 1048576 / Math.max(secs, 0.001)).toFixed(2)} MB/s)`);
if (total && got !== total) {
  console.error(`WARN: expected ${total} bytes, got ${got}`);
  process.exit(1);
}
