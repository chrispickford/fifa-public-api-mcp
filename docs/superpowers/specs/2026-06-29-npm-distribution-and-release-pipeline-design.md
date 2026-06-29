# Design: npm distribution + GitHub Actions release pipeline

**Date:** 2026-06-29
**Status:** Approved (design phase)
**Topic:** Package `fifa-public-api-mcp` for distribution so it installs into an MCP client with a
single command, built and published automatically by GitHub Actions.

## Goal

Replace the current install path (clone the repo, `npm install`, `npm run build`, register an
absolute path to `build/index.js`) with a published npm package whose entire user-facing install is
one line:

```bash
claude mcp add fifa -- npx -y fifa-public-api-mcp
```

Releases are built, tested, and published to the public npm registry automatically when a GitHub
Release is published, authenticated via **OIDC trusted publishing** (no long-lived secrets) and
stamped with a provenance attestation.

## Decisions (locked during brainstorming)

| Question | Decision |
|---|---|
| Distribution channel | Public npm registry, run via `npx` |
| Package name | `fifa-public-api-mcp` (unscoped) |
| Publish auth | npm Trusted Publishing (OIDC); no stored npm token |
| Release trigger | GitHub Release `published` event; separate always-on CI for push/PR |
| Version/tag drift | Hard-fail the publish if the release tag != `package.json` version |
| License | MIT (matches `LICENSE`, © 2026 Chris Pickford) |
| CI Node versions | 18 (floor, for built-in `fetch`) and 22 (current LTS) |

## Why npm + npx

`npx -y fifa-public-api-mcp` downloads the package (and its two deps,
`@modelcontextprotocol/sdk` and `zod`) on first use, caches it, and runs the `bin` executable
(`build/index.js`) over stdio. This is functionally identical to today's
`node /abs/path/build/index.js`, but the user never clones, builds, or manages a path, and it works
the same on macOS / Windows / Linux. It is the de-facto standard distribution method for MCP
servers. The package is already ~90% installable: `bin`, `files`, `engines`, and `type` are already
set correctly; this work adds registry metadata, packaging safety nets, and the CI/publish
automation around it.

## Components

### 1. `package.json` metadata + packaging hardening

Additive only: no changes to the existing `bin`, `files`, `type`, or `engines` fields, which are
already correct.

- **Registry metadata** (so the npm page is complete and trustworthy):
  - `repository`: `{ "type": "git", "url": "git+https://github.com/chrispickford/fifa-public-api-mcp.git" }`
  - `homepage`: `https://github.com/chrispickford/fifa-public-api-mcp#readme`
  - `bugs`: `https://github.com/chrispickford/fifa-public-api-mcp/issues`
  - `author`: `Chris Pickford`
  - `license`: `MIT`
  - `keywords`: `["mcp", "model-context-protocol", "fifa", "football", "soccer"]`
- **`publishConfig`**: `{ "access": "public", "provenance": true }`: makes public access and
  provenance the default for *any* publish (CI or manual), so the behavior can't drift between them.
- **`prepack` script**: `"prepack": "npm run build"`: guarantees `build/` is freshly compiled
  whenever a tarball is created, so a stray manual `npm publish` cannot ship stale output. CI also
  builds explicitly (belt and suspenders).

### 2. CI workflow: `.github/workflows/ci.yml`

- **Triggers:** `push` and `pull_request`.
- **Strategy:** matrix over Node `18` and `22`.
- **Steps:** checkout → `actions/setup-node` (with npm cache) → `npm ci` → `npm run build` →
  `npm test`.
- The unit tests are network-free and CI-safe by design (see project `CLAUDE.md`). The live
  `npm run smoke` test is **not** run in CI (it depends on FIFA uptime and real network).

### 3. Publish workflow: `.github/workflows/publish.yml`

- **Trigger:** `release` with `types: [published]`.
- **Permissions:** `id-token: write` (required for OIDC) and `contents: read`.
- **Steps:**
  1. Checkout (at the release tag).
  2. `actions/setup-node` with `registry-url: https://registry.npmjs.org`, Node 22.
  3. `npm install -g npm@latest`: trusted publishing requires npm ≥ 11.5, newer than the version
     bundled on GitHub-hosted runners.
  4. **Version guard:** derive the version from the release tag (`v0.2.0` → `0.2.0`) and compare to
     `node -p "require('./package.json').version"`. If they differ, fail immediately with a clear
     message, before any build or publish.
  5. `npm ci` → `npm run build` → `npm test` (re-verify on the exact released commit).
  6. `npm publish`. Public access and `--provenance` come from `publishConfig`; no `NODE_AUTH_TOKEN`
     is set; OIDC handles authentication and records the provenance attestation.

### 4. README update

- Promote the `npx` one-liner to the **primary** install instruction.
- Document the Claude Desktop equivalent JSON snippet:
  `command: "npx"`, `args: ["-y", "fifa-public-api-mcp"]`.
- Move the existing clone/`npm install`/`npm run build` steps into a **"Develop from source"**
  section (still accurate, just no longer the headline path).
- Optional: an npm-version shield badge linking to the package.

## One-time manual setup (runbook; performed by the maintainer, not automated)

These steps are done once, by hand, and are intentionally outside the workflows:

1. Create an npm account at npmjs.com, verify the email, and **enable 2FA** (npm requires 2FA to
   publish).
2. **Bootstrap the package name:** run a single manual `npm publish` from a local checkout to create
   and claim `fifa-public-api-mcp` at its current version. npm's trusted-publishing configuration is
   set per-package and is most reliably configured *after* the package exists, so this first publish
   establishes it. (This is the one unavoidable manual step; every release thereafter is automated.)
3. On npmjs.com → the package → **Settings → Trusted Publisher**: link the GitHub repository
   `chrispickford/fifa-public-api-mcp` and the workflow file `publish.yml`.
4. Thereafter, to cut a release: bump `version` in `package.json`, commit, then draft and publish a
   GitHub Release whose tag is the matching `vX.Y.Z`. The publish workflow validates, builds, tests,
   and publishes.

## Error handling / failure modes

- **Tag/version mismatch:** caught by the version guard (step 4) before publishing; nothing is
  pushed to npm.
- **Tests fail on the release commit:** the publish job stops at `npm test`; no publish occurs.
- **OIDC not yet configured / trusted publisher missing:** `npm publish` fails with an auth error;
  fix is to complete the one-time runbook. No partial/insecure fallback to a token is added.
- **Stale build:** prevented by `prepack` (local) and the explicit build step (CI).

## Testing / verification

- CI green on push/PR across the Node matrix proves the package builds and unit tests pass.
- A `npm pack --dry-run` (run locally during implementation) confirms the tarball contains only
  `build/` plus the standard metadata files, and nothing from `src/`, `test/`, or `node_modules/`.
- The first real GitHub Release exercises the publish workflow end to end; success is the package
  appearing on npm with a provenance badge and `npx -y fifa-public-api-mcp` launching the server.

## Out of scope (YAGNI)

- Docker image distribution.
- Claude Desktop `.mcpb` / DXT one-click bundle.
- Automated changelog generation.
- `semantic-release` / automated version bumping; version bumps stay manual for predictability.
- Publishing the live smoke test into CI.

Each of these is easy to add later if a need appears; none is required for the one-line-install goal.
