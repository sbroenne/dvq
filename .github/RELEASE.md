<!-- 
  DVQ RELEASE & PACKAGING — CI/CD SETUP
  
  This file documents the CI/CD gates, packaging checks, and validation infrastructure
  wired into the dvq release pipeline. It's the living reference for:
  - What checks must pass before PR merge and before publish
  - How the npm package is shaped and validated
  
  Related documents:
  - .github/workflows/ci.yml (automated checks on push/PR)
  - .github/workflows/release.yml (pre-publish verification)
  - .npmignore (sensitive dirs excluded from tarball)
-->

# dvq Release Pipeline — CI/CD Infrastructure

## Overview

This document describes the CI/CD, repository security, and packaging infrastructure for the `dvq` TypeScript/npm package. The pipeline enforces validation gates to ensure code quality and safe packaging:

1. **PR Merge Validation:** Packaging validation + linting + build safety + no hardcoded secrets
2. **Dependency & Code Security:** Dependabot + dependency review + CodeQL scanning
3. **Pre-Publish Validation:** Full tarball inspection + metadata validation

---

## GitHub Security Baseline

### In-Repo Controls

The repository now carries the baseline files expected for a public npm package:

- `.github/dependabot.yml` — weekly npm and GitHub Actions update PRs
- `.github/workflows/dependency-review.yml` — blocks pull requests introducing high-severity vulnerable dependencies
- `.github/workflows/codeql.yml` — runs GitHub CodeQL analysis for JavaScript/TypeScript on pushes, PRs, and a weekly schedule
- `SECURITY.md` — public security policy and maintainer checklist

### Manual GitHub/npm Settings

These controls cannot be fully enabled from repository files alone and must be turned on in the GitHub or npm UI before public launch:

1. **GitHub Advanced Security** features available for the repository
2. **Secret scanning** and **push protection**
3. **Private vulnerability reporting**
4. **Dependabot alerts** and **dependency graph**
5. **Branch protection** on `main` with required checks
6. npm **trusted publishing** for GitHub Actions

---

## PR Merge: Packaging & Build Safety

### Purpose
Validate committed code for packaging hygiene, build safety, and release readiness before merge to main.

### CI Workflow: `.github/workflows/ci.yml`

Runs on every push to `main`/`develop` and all pull requests.

#### Job: `packaging-check`
Runs on every push and pull request.

**Checks:**
1. No hardcoded `DEFAULT_DATAVERSE_URL` in src/ (required env var design)
2. `npm pack --dry-run` does not include `.squad/`, `.copilot/`, or build artifacts
3. Tarball structure is minimal and safe

#### Job: `test`
Runs full test suite across Node 20, 22, 24 LTS versions.

---

## Dependency & Code Security

### Dependabot

Dependabot opens weekly update PRs for:

- npm dependencies
- GitHub Actions workflow dependencies

Updates are grouped to keep review noise manageable and make release hygiene routine.

### Dependency Review Workflow: `.github/workflows/dependency-review.yml`

Runs on pull requests to `main`.

**Checks:**
1. Compares dependency manifest changes in the PR
2. Fails the PR when a newly introduced dependency has a known vulnerability at **high** severity or above

### CodeQL Workflow: `.github/workflows/codeql.yml`

Runs on pushes to `main`, pull requests targeting `main`, and weekly on a schedule.

**Checks:**
1. Static analysis for JavaScript/TypeScript security issues
2. Uploads code scanning results into GitHub Security

---

## Pre-Publish Verification (Release Workflow)

### Purpose
Validate npm package metadata and tarball contents before publishing to npm registry.

### CI Workflow: `.github/workflows/release.yml`

Triggers on `v*` tags (e.g., `v1.0.0`, `v1.0.0-rc.1`).

#### Job: `verify`

**Pre-publish steps:**

1. **Full test suite** — ensure all tests pass on release version
2. **Build** — compile TypeScript to `dist/` (required for npm distribution)
3. **Create tarball** — `npm pack`
4. **File verification** — ensure `package.json`, `LICENSE`, and `README.md` are present
5. **Sensitive directory check** — confirm `.squad/` and `.copilot/` are excluded
6. **Repository metadata** — verify `package.json` references `@sbroenne/dvq` in name and `sbroenne/dvq` git URL

**Expected outcomes:**
- ✅ All checks pass → proceed to `publish` job
- ❌ Any check fails → halt, do not publish

#### Job: `publish`
Uses npm automation token (from GitHub Actions secrets) to publish to npm registry and emits npm provenance.

**Permissions:**
- `id-token: write` — enables OIDC-based npm authentication (preferred over static tokens)
- `contents: read` — read repo content for versioning

**Post-publish verification:**
- Waits 5s for registry sync
- Verifies published version is visible on npm

#### Job: `release-notes`
Creates a GitHub Release with auto-generated release notes from commits since last tag.

---

## Packaging Metadata

### `.npmignore`
Explicit exclude list for `npm pack`. Contains:

**Excluded:**
- Source TypeScript files (`src/`)
- Test files (`*.test.ts`, `*.test.js`, `__tests__/`, `coverage/`)
- Team infrastructure (`.squad/`, `.copilot/`, `.github/`)
- Development config (`tsconfig.json`, `eslint.config.js`, `vitest.config.ts`)
- Environment files (`.env`, `node_modules/`)

**Included (via `package.json` `files` field):**
- Compiled JavaScript (`dist/`)
- `package.json`, `README.md`, `LICENSE`
- Excludes test artifacts and source maps from dist/

### `package.json`
**Critical fields for release:**

```json
{
  "name": "@sbroenne/dvq",
  "version": "0.1.0",
  "description": "CLI for querying Dataverse OData endpoints with Azure CLI credentials",
  "type": "module",
  "exports": {
    ".": "./dist/lib.js"
  },
  "bin": {
    "dvq": "dist/cli.js"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/sbroenne/dvq.git"
  },
  "files": [
    "dist",
    "!dist/**/*.test.*",
    "!dist/**/*.map",
    "README.md",
    "LICENSE"
  ],
  "engines": {
    "node": ">=20"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

**Why `files` field matters:**
- Explicit `files` array overrides `.npmignore`
- Ensures only compiled `dist/` (not raw source) ships
- Excludes test artifacts and source maps
- Acts as secondary safety gate

---

## Environment Variables & Configuration

### Required at Runtime
- `DATAVERSE_URL` — must be set by user (no default in code)
  - Example: `https://yourorg.crm.dynamics.com`
  - If unset → CLI exits with clear error message

### In CI/Release
- `NPM_TOKEN` — GitHub Actions secret for npm authentication (if using static token)
  - Current workflow also emits `npm publish --provenance`
  - Preferred future state: npm trusted publishing via `id-token: write` permission (no long-lived token needed)

---

## Acceptance Criteria — Release Readiness

The release pipeline is production-ready when:

- [ ] All GitHub Actions workflows pass
- [ ] Dependabot, dependency review, and CodeQL are active
- [ ] No default DATAVERSE_URL hardcoded in source
- [ ] `npm pack --dry-run` shows no `.squad/`, `.copilot/`, or unexpected artifacts
- [ ] All tests passing across Node 20, 22, 24
- [ ] README presents project clearly without internal context
- [ ] License and package metadata present and correct

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| **Unexpected files leak into npm** | Explicit `files` allowlist + Gate 2 tarball verification + code review before PR merge |
| **Tarball accidentally includes `.squad/`** | Explicit `.npmignore` + Gate 2 `npm pack` verification |
| **Broken env var requirement causes UX issues** | Clear error message when `DATAVERSE_URL` missing; documented in README |
| **npm publish hangs or fails silently** | Gate 2 post-publish verification checks npm registry visibility |
| **Known-vulnerable dependency lands in PR** | Dependabot + dependency review on pull requests |
| **Static security issue ships unnoticed** | CodeQL scans pushes, PRs, and weekly scheduled analysis |
| **Tests fail on different Node versions** | Test matrix across Node 20, 22, 24 in CI |

---

## Running Checks Locally

Before pushing, run these checks in your local repo:

```bash
# 1. Build (required for distribution)
npm run build

# 2. Run tests
npm test

# 3. Run linter
npm run lint

# 4. Dry-run npm pack
npm pack --dry-run | head -20

# 5. Verify tarball structure
npm pack --pack-destination /tmp/ && tar -tzf /tmp/sbroenne-dvq-*.tgz | head -20
```

If any check fails, fix before pushing.

---

## Deployment & Release Process

### For maintainers:

1. **Merge Phase 1 scaffold PR** (all gates pass)
2. **Create a release branch** (optional): `release/v1.0.0`
3. **Update version** in `package.json` and commit
4. **Tag**: `git tag v1.0.0 && git push origin v1.0.0`
5. **GitHub Actions** runs `release.yml` automatically:
    - Builds TypeScript → `dist/`
    - Runs full test suite
    - Packs and verifies tarball
    - Publishes to npm with provenance
    - Creates GitHub Release with notes
6. **Verify npm page** at https://www.npmjs.com/package/@sbroenne/dvq

### Manual publish (if needed):
```bash
npm login  # Requires npm account
npm publish
```

---

## Next Phases (Post-Phase 1)

- **Phase 2:** Add release notes automation (CHANGELOG.md generation from commits)
- **Phase 3:** Expand security checks further (for example npm audit policy or additional supply-chain verification)
- **Phase 4:** Add performance benchmarking CI
- **Phase 5:** Add docs site deployment (if needed)

---

## Questions?

See `.squad/decisions.md` for full decision context, or reach out to Dallas (Release & Packaging).
