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
   npm publish --provenance=false  # provenance requires CI/OIDC; automated releases (via publish.yml) generate it
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
