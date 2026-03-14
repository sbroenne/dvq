# Contributing to dvq

Thank you for your interest in contributing! We're happy to receive feedback, bug reports, feature requests, and pull requests.

## How to Contribute

### Report a Bug

1. Check [existing issues](https://github.com/sbroenne/dvq/issues) to avoid duplicates
2. Create a [new issue](https://github.com/sbroenne/dvq/issues/new) with:
   - A clear title and description
   - Steps to reproduce
   - Expected vs. actual behavior
   - Your environment (Node version, OS, dvq version)

### Report a Security Issue

- Do **not** open a public GitHub issue for vulnerabilities or credential exposure.
- Follow [SECURITY.md](./SECURITY.md) and use GitHub private vulnerability reporting when it is enabled for the repository.
- If private reporting is not yet available, contact the maintainer privately through GitHub first.

### Suggest a Feature

1. Open a [new issue](https://github.com/sbroenne/dvq/issues/new) with label `enhancement`
2. Describe the use case and expected behavior
3. Explain why this feature would be useful

### Submit a Pull Request

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Add or update tests if applicable
5. Ensure tests pass: `npm test`
6. Run linter: `npm run lint`
7. Commit with a clear message: `git commit -am "feat: add my feature"`
8. Push to your fork and open a pull request
9. Link any related issues in the PR description

Dependabot, dependency review, and CodeQL are part of the repository baseline, so dependency and workflow changes should expect extra GitHub checks on pull requests.

## Development Setup

```bash
git clone https://github.com/sbroenne/dvq.git
cd dvq
npm install
npm run build
npm test
```

Use Node.js 20 or later for local development.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm test` | Run the unit test suite |
| `npm run test:integration` | Run live Dataverse integration tests when `.env.integration` is configured |
| `npm run lint` | Check code style (ESLint) |
| `npm run lint:fix` | Auto-fix code style issues |
| `npm run format:check` | Check formatting without rewriting files |
| `npm run format` | Format code (Prettier) |

## Code Style

This project uses **ESLint** and **Prettier** for code consistency.

- Format your code before committing: `npm run format`
- The linter runs in CI and will fail the build if issues are found

## Testing

- Tests are in `src/**/*.test.ts`
- Run tests: `npm test`
- All pull requests must have passing tests
- Add tests for new features and bug fixes

## Areas We Need Help

- **Documentation** — Improve examples, clarify unclear sections
- **Tests** — Expand test coverage, add edge cases
- **Features** — Implement well-scoped enhancements (check issues first)
- **Bugs** — Fix confirmed bugs with tests

## Community Standards

- Be respectful and constructive
- Focus on the work, not the person
- Help others learn
- Ask questions if something is unclear

## Questions?

Open an issue on GitHub or check the [README](./README.md) for usage examples.
