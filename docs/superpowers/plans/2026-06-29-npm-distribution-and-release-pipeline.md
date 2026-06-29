# npm Distribution + Release Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `fifa-public-api-mcp` installable with one command (`npx -y fifa-public-api-mcp`) by publishing it to the public npm registry, built and published automatically by GitHub Actions on a GitHub Release.

**Architecture:** Additive packaging changes to `package.json` (registry metadata, public+provenance publish config, a `prepack` build safety net), two GitHub Actions workflows (always-on CI for push/PR; a Release-triggered publish that guards the tag/version match and publishes via OIDC trusted publishing with no stored secret), and a documentation refresh. No source code in `src/` changes.

**Tech Stack:** Node 18+ (built-in `fetch`), TypeScript, npm, GitHub Actions, npm Trusted Publishing (OIDC).

## Global Constraints

- Node floor is **18** (relies on built-in `fetch`); CI matrix is **18 and 22**.
- Package name is exactly **`fifa-public-api-mcp`** (unscoped, public).
- License is **MIT** (© 2026 Chris Pickford).
- Publish auth is **OIDC trusted publishing** — never add a `NODE_AUTH_TOKEN`/`NPM_TOKEN` secret or `--no-gpg-sign`.
- Publish is triggered only by a **GitHub Release `published`** event; CI runs on push/PR.
- The publish workflow must **hard-fail** if the release tag (`vX.Y.Z`) does not equal `package.json` `version`.
- Public access + provenance come from `publishConfig` so CI and manual publishes behave identically.
- The live `npm run smoke` test is **never** added to CI (depends on FIFA uptime/network).
- Do not change the existing `bin`, `files`, `type`, or `engines` fields — they are already correct.
- Never use the em-dash character in any file content; use commas, semicolons, colons, or parentheses.
- Commits are SSH-signed; signing is already configured and working in this repo.

---

### Task 1: package.json registry metadata + packaging hardening

**Files:**
- Modify: `D:\scratch\fifa-public-api-mcp\package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: a publish-ready manifest. Later tasks rely on these exact script names existing: `build`, `test`, `prepack`. The published name is `fifa-public-api-mcp` and `publishConfig` sets `access: public` + `provenance: true`.

- [ ] **Step 1: Replace `package.json` with the metadata-complete version**

Write the file to exactly this content (additions: `keywords`, `homepage`, `repository`, `bugs`, `author`, `license`, `publishConfig`, and a `prepack` script; everything else unchanged):

```json
{
  "name": "fifa-public-api-mcp",
  "version": "0.1.0",
  "description": "MCP server exposing the public FIFA data API (api.fifa.com/api/v3) as read-only tools",
  "keywords": [
    "mcp",
    "model-context-protocol",
    "fifa",
    "football",
    "soccer"
  ],
  "homepage": "https://github.com/chrispickford/fifa-public-api-mcp#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/chrispickford/fifa-public-api-mcp.git"
  },
  "bugs": {
    "url": "https://github.com/chrispickford/fifa-public-api-mcp/issues"
  },
  "author": "Chris Pickford",
  "license": "MIT",
  "type": "module",
  "bin": {
    "fifa-public-api-mcp": "build/index.js"
  },
  "files": [
    "build"
  ],
  "engines": {
    "node": ">=18"
  },
  "publishConfig": {
    "access": "public",
    "provenance": true
  },
  "scripts": {
    "build": "tsc && node -e \"import('node:fs').then(fs=>fs.chmodSync('build/index.js',0o755))\"",
    "start": "node build/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "smoke": "tsx scripts/smoke.ts",
    "prepack": "npm run build"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.19.43",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Verify the manifest is valid and parseable**

Run: `node -p "JSON.stringify({name:require('./package.json').name, prepack:require('./package.json').scripts.prepack, pub:require('./package.json').publishConfig})"`
Expected output (exactly):
```
{"name":"fifa-public-api-mcp","prepack":"npm run build","pub":{"access":"public","provenance":true}}
```

- [ ] **Step 3: Verify the tarball contents are correct (the real test)**

Run: `npm pack --dry-run`
Expected: the listed `Tarball Contents` include `package.json`, `LICENSE`, `README.md`, and files under `build/` (e.g. `build/index.js`), and include **nothing** from `src/`, `test/`, `scripts/`, or `node_modules/`. The `prepack` script runs `npm run build` first, so `build/` is present even if it was deleted beforehand. (Note: `npm pack` writes a `.tgz`; delete it afterward with `rm fifa-public-api-mcp-0.1.0.tgz` if created.)

- [ ] **Step 4: Verify build and tests still pass**

Run: `npm run build && npm test`
Expected: build succeeds; vitest reports all tests passing (28 tests at time of writing), exit code 0.

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "build: add npm registry metadata and packaging hardening" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: CI workflow (test on push/PR)

**Files:**
- Create: `D:\scratch\fifa-public-api-mcp\.github\workflows\ci.yml`

**Interfaces:**
- Consumes: the `build` and `test` npm scripts from Task 1.
- Produces: a green-on-push/PR signal. No artifact; does not publish.

- [ ] **Step 1: Create the CI workflow file**

Write `.github/workflows/ci.yml` with exactly this content:

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node-version: ['18', '22']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm test
```

- [ ] **Step 2: Verify the YAML is well-formed**

Run: `node -e "const f=require('fs').readFileSync('.github/workflows/ci.yml','utf8'); if(!/on:/.test(f)||!/node-version: \['18', '22'\]/.test(f)) throw new Error('ci.yml content check failed'); console.log('ci.yml OK')"`
Expected output: `ci.yml OK`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add build + test workflow on push and PR" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Publish workflow (release-triggered, OIDC, version-guarded)

**Files:**
- Create: `D:\scratch\fifa-public-api-mcp\.github\workflows\publish.yml`

**Interfaces:**
- Consumes: the `build` and `test` npm scripts from Task 1, and the `publishConfig` (access/provenance) from Task 1.
- Produces: a published npm package on each GitHub Release. Relies on `GITHUB_REF_NAME` being the release tag (`vX.Y.Z`).

- [ ] **Step 1: Create the publish workflow file**

Write `.github/workflows/publish.yml` with exactly this content:

```yaml
name: Publish

on:
  release:
    types: [published]

permissions:
  contents: read
  id-token: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          registry-url: 'https://registry.npmjs.org'
      - name: Upgrade npm for trusted publishing
        run: npm install -g npm@latest
      - name: Verify release tag matches package.json version
        run: |
          TAG="${GITHUB_REF_NAME#v}"
          PKG="$(node -p "require('./package.json').version")"
          echo "release tag: $TAG / package.json: $PKG"
          if [ "$TAG" != "$PKG" ]; then
            echo "::error::Release tag ($TAG) does not match package.json version ($PKG). Bump package.json or fix the tag."
            exit 1
          fi
      - run: npm ci
      - run: npm run build
      - run: npm test
      - run: npm publish
```

- [ ] **Step 2: Verify the YAML is well-formed and has no stored-token references**

Run: `node -e "const f=require('fs').readFileSync('.github/workflows/publish.yml','utf8'); if(!/id-token: write/.test(f)) throw new Error('missing OIDC permission'); if(/NPM_TOKEN|NODE_AUTH_TOKEN/.test(f)) throw new Error('must not use a stored npm token'); if(!/types: \[published\]/.test(f)) throw new Error('wrong trigger'); console.log('publish.yml OK')"`
Expected output: `publish.yml OK`

- [ ] **Step 3: Verify the version-guard logic locally (it must reject a mismatch and accept a match)**

Run:
```bash
PKG="$(node -p "require('./package.json').version")"
for TAGREF in "v$PKG" "v9.9.9"; do TAG="${TAGREF#v}"; [ "$TAG" = "$PKG" ] && echo "$TAGREF -> MATCH" || echo "$TAGREF -> REJECT"; done
```
Expected output:
```
v0.1.0 -> MATCH
v9.9.9 -> REJECT
```
(The first line tracks the current `package.json` version, so `v0.1.0` matches today.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/publish.yml
git commit -m "ci: add release-triggered npm publish via OIDC trusted publishing" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Documentation (README install rewrite + maintainer release runbook)

**Files:**
- Modify: `D:\scratch\fifa-public-api-mcp\README.md` (the "Install & build" and "Add to a client" sections)
- Create: `D:\scratch\fifa-public-api-mcp\RELEASING.md`

**Interfaces:**
- Consumes: the published package behavior from Tasks 1-3.
- Produces: user-facing install instructions and a maintainer runbook. No code.

- [ ] **Step 1: Rewrite the README install + client sections**

In `README.md`, replace the two sections that currently read:

```markdown
## Install & build

```bash
npm install
npm run build      # compiles TS to build/index.js (with shebang + executable bit)
```

## Add to a client

Claude Code:

```bash
claude mcp add fifa -- node /absolute/path/to/build/index.js
```

For Claude Desktop, add an entry to `mcpServers` in the config pointing `command: "node"` at the
absolute path of `build/index.js`.
```

with this content:

```markdown
## Install (no clone, no build)

The server is published to npm and runs via `npx`, so there is nothing to clone or compile.

Claude Code:

```bash
claude mcp add fifa -- npx -y fifa-public-api-mcp
```

Claude Desktop: add this to `mcpServers` in your config:

```json
{
  "mcpServers": {
    "fifa": {
      "command": "npx",
      "args": ["-y", "fifa-public-api-mcp"]
    }
  }
}
```

`npx` downloads and caches the package on first use; later runs are offline-fast. Requires Node 18+
on the PATH.

## Develop from source

```bash
git clone https://github.com/chrispickford/fifa-public-api-mcp.git
cd fifa-public-api-mcp
npm install
npm run build      # compiles TS to build/index.js (with shebang + executable bit)
```

Then point a client at the local build with an absolute path, e.g.
`claude mcp add fifa-dev -- node /absolute/path/to/build/index.js`.
```

- [ ] **Step 2: Verify the README no longer leads with the clone/build path and the npx one-liner is present**

Run: `node -e "const f=require('fs').readFileSync('README.md','utf8'); if(!/npx -y fifa-public-api-mcp/.test(f)) throw new Error('missing npx one-liner'); if(!/## Develop from source/.test(f)) throw new Error('missing develop section'); console.log('README OK')"`
Expected output: `README OK`

- [ ] **Step 3: Create the maintainer release runbook**

Write `RELEASING.md` with exactly this content:

```markdown
# Releasing

This package publishes to npm automatically when a GitHub Release is published. Authentication uses
npm Trusted Publishing (OIDC): there is no npm token stored anywhere.

## One-time setup (done once, by a maintainer)

1. Create an npm account at npmjs.com, verify the email, and enable 2FA (npm requires 2FA to
   publish).
2. Bootstrap the package name with a single manual publish from a local checkout, which creates and
   claims the name `fifa-public-api-mcp`:
   ```bash
   npm whoami        # confirm you are logged in; run `npm login` if not
   npm publish       # publishConfig already sets public access + provenance
   ```
3. On npmjs.com, open the package, then Settings, then Trusted Publisher. Link:
   - Repository: `chrispickford/fifa-public-api-mcp`
   - Workflow filename: `publish.yml`

After this, every release is automated and no manual `npm publish` is needed again.

## Cutting a release (every time)

1. Bump `version` in `package.json` (e.g. `0.1.0` to `0.2.0`) and commit it.
2. On GitHub, draft a new Release with a tag that matches the new version, prefixed with `v`
   (e.g. `v0.2.0`), and publish it.
3. The `publish.yml` workflow runs: it verifies the tag matches `package.json`, builds, tests, and
   publishes to npm with a provenance attestation.

If the tag and `package.json` version disagree, the workflow fails before publishing. Fix whichever
is wrong and re-run, or delete and recreate the release with the correct tag.

## Verifying a release

- The npm page for `fifa-public-api-mcp` shows the new version with a provenance badge.
- `npx -y fifa-public-api-mcp` launches the server (it waits on stdio; Ctrl+C to exit).
```

- [ ] **Step 4: Verify the runbook exists and names the trusted-publishing flow**

Run: `node -e "const f=require('fs').readFileSync('RELEASING.md','utf8'); if(!/Trusted Publisher/.test(f)||!/publish\.yml/.test(f)) throw new Error('RELEASING.md content check failed'); console.log('RELEASING.md OK')"`
Expected output: `RELEASING.md OK`

- [ ] **Step 5: Commit**

```bash
git add README.md RELEASING.md
git commit -m "docs: lead with npx install and add release runbook" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Post-implementation (manual, out of band)

These are not code tasks; they are the maintainer actions from `RELEASING.md` that cannot be done in-repo:

1. npm account + 2FA, one bootstrap `npm publish` to claim the name.
2. Configure the npm Trusted Publisher to link `chrispickford/fifa-public-api-mcp` + `publish.yml`.
3. Cut the first automated release (bump version, publish a `vX.Y.Z` GitHub Release) and confirm the npm provenance badge and `npx -y fifa-public-api-mcp` both work.
