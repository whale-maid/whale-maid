#!/usr/bin/env node
// vault-get.mjs -- print ONLY the password of a site in the local credential vault.
// Exits 1 with no output on any failure. Used by tools/git-askpass-whale.cmd (GIT_ASKPASS).
// Usage: node vault-get.mjs [site]        (default site: github)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const site = process.argv[2] || 'github';
const vault = path.join(os.homedir(), '.dsh', 'secrets', 'sites.json');
try {
  const j = JSON.parse(fs.readFileSync(vault, 'utf8'));
  const s = j[site];
  if (s && typeof s.password === 'string' && s.password) {
    process.stdout.write(s.password);
    process.exit(0);
  }
} catch { /* silent by design: never echo file content */ }
process.exit(1);
