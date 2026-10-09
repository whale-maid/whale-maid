#!/usr/bin/env node
// Probe one GitHub API endpoint with a token taken from the local vault.
// Prints ONLY: HTTP status, the token's scopes (if reported), and a small field whitelist.
// The token itself is never printed. ASCII-only output.
// Usage: node gh-api-probe.mjs <vaultKey> <apiPath>     e.g.  github-classic /user
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const key = process.argv[2] || 'github';
const apiPath = process.argv[3] || '/user';
const vault = path.join(os.homedir(), '.dsh', 'secrets', 'sites.json');

let token;
try { token = JSON.parse(fs.readFileSync(vault, 'utf8'))[key]?.password; } catch { /* silent */ }
if (!token) { console.error('no token in vault for key:', key); process.exit(2); }

const res = await fetch('https://api.github.com' + apiPath, {
  headers: {
    Authorization: 'Bearer ' + token,
    'User-Agent': 'whale-maid-probe',
    Accept: 'application/vnd.github+json',
  },
});

const text = await res.text();
let j = {};
try { j = JSON.parse(text); } catch { j = {}; }

const keep = ['login', 'name', 'id', 'created_at', 'message', 'documentation_url', 'full_name', 'private'];
const out = {};
for (const k of keep) if (j[k] !== undefined) out[k] = j[k];
if (Array.isArray(j)) out.returned = j.length;

console.log('status :', res.status);
console.log('scopes :', res.headers.get('x-oauth-scopes') || '(not reported)');
console.log('fields :', JSON.stringify(out));
