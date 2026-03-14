# Security Policy

`dvq` is intended to ship as a public npm package, so repository security and package integrity are part of normal maintenance work.

## Reporting a Vulnerability

- **Do not open a public issue for suspected vulnerabilities.**
- Prefer **GitHub Private Vulnerability Reporting** or a GitHub security advisory when the repository setting is enabled.
- If private reporting is not yet enabled, contact the maintainer privately through GitHub before sharing details publicly.

Please include:

- affected version or commit
- impact and attack scenario
- reproduction steps or proof of concept
- any suggested mitigation

## Supported Versions

Security fixes are expected to land on the latest published release and the `main` branch before `1.0.0`.

## Repository Security Baseline

The repository is expected to keep these controls in place:

- Dependabot for npm dependencies and GitHub Actions updates
- dependency review on pull requests
- CodeQL code scanning for JavaScript/TypeScript
- npm publish provenance from GitHub Actions releases

## Maintainer Checklist

Some controls must be enabled in GitHub or npm settings and cannot be enforced by files alone:

1. Enable **GitHub Advanced Security** features available to the repository.
2. Enable **secret scanning** and **push protection**.
3. Enable **private vulnerability reporting**.
4. Confirm **Dependabot alerts** and the **dependency graph** are on.
5. Protect `main` with required status checks before the first public push.
6. Configure npm **trusted publishing** for this repository when ready to replace token-based publication.
