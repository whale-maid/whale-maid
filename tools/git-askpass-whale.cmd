@echo off
rem git-askpass-whale.cmd -- GIT_ASKPASS helper. Prints only the vault password (via Node). ASCII only.
rem Set WHALE_VAULT_SITE to pick another site (default: github).
set "_site=github"
if defined WHALE_VAULT_SITE set "_site=%WHALE_VAULT_SITE%"
node "%~dp0vault-get.mjs" %_site%
