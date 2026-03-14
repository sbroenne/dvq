# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

## [0.1.5] - 2026-03-14

### Added
- Request controls for disabling formatted-value annotations and adding custom headers
- Verbose tracing for auth, requests, and pagination with sanitized header logging

### Changed
- Improved HTTP and authentication diagnostics with request URLs and targeted troubleshooting hints
- Hardened Windows CLI packaging and bin-shim tests
- Rolled forward from the failed `0.1.4` publish attempt after fixing a CI-only lint issue in `src/lib.test.ts`

## [1.0.0] - TBD

### Added
- Initial release of dvq as a standalone Dataverse Query tool
- Support for querying Dataverse environments via Azure CLI authentication
- CLI interface for executing queries and retrieving results
- TypeScript types and ES modules support
- Comprehensive test suite
- npm package distribution

### Changed
- Positioned as the initial standalone release

---

## Versioning & Release Process

See `.github/RELEASE.md` for detailed information about:
- CI/CD gates and safety checks
- Publishing to npm
- Release tagging procedures
