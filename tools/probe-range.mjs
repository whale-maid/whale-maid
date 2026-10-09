#!/usr/bin/env node
/**
 * Probe whether a URL honors HTTP Range requests, including across redirects.
 * Matters because parallel downloaders depend on 206 Partial Content; if a
 * redirect or a proxy strips the Range header, the server returns the WHOLE
 * file instead, and a naive parallel writer will corrupt the output.
 *
 * Usage: node tools/probe-range.mjs <url>
 */

const url = process.argv[2];
if (!url) {
  console.error('usage: node probe-range.mjs <url>');
  process.exit(2);
}

console.log(`URL: ${url}`);
console.log('');

// 1) HEAD — what does the server advertise?
try {
  const head = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  console.log('HEAD  status         :', head.status);
  console.log('HEAD  content-length :', head.headers.get('content-length'));
  console.log('HEAD  accept-ranges  :', head.headers.get('accept-ranges'));
} catch (e) {
  console.log('HEAD  failed         :', e.message);
}
console.log('');

// 2) GET with Range — is the range actually honored?
const res = await fetch(url, { headers: { Range: 'bytes=0-1023' }, redirect: 'follow' });
console.log('RANGE status         :', res.status);
console.log('RANGE content-range  :', res.headers.get('content-range'));
console.log('RANGE content-length :', res.headers.get('content-length'));

const body = await res.arrayBuffer();
console.log('RANGE actual bytes   :', body.byteLength);
console.log('');
console.log(
  res.status === 206
    ? '=> OK: Range honored (206 Partial Content)'
    : '=> BROKEN: Range ignored — server returned the full body. ' +
      'A parallel writer WILL corrupt the file.',
);
process.exit(res.status === 206 ? 0 : 1);
