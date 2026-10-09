#!/usr/bin/env node
// Create a public GitHub repository using a token from the local vault.
// Prints only the HTTP status and the repo full name. Never prints the token.
// Usage: node gh-create-repo.mjs <vaultKey> <name> [description]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [key, name, desc] = process.argv.slice(2);
if (!key || !name) {
  console.error('usage: node gh-create-repo.mjs <vaultKey> <name> [description]');
  process.exit(2);
}

const vault = path.join(os.homedir(), '.dsh', 'secrets', 'sites.json');
let token;
try { token = JSON.parse(fs.readFileSync(vault, 'utf8'))[key]?.password; } catch { /* silent */ }
if (!token) { console.error('no token in vault for key:', key); process.exit(2); }

const res = await fetch('https://api.github.com/user/repos', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + token,
    'User-Agent': 'whale-maid',
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name,
    description: desc || '',
    private: false,
    has_issues: false,
    has_wiki: false,
    has_projects: false,
    auto_init: false,
  }),
});

const j = await res.json().catch(() => ({}));
console.log('status:', res.status);
console.log('repo  :', j.full_name || j.message || '(no message)');
if (j.html_url) console.log('url   :', j.html_url);
process.exit(res.ok ? 0 : 1);
