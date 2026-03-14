import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { createProgram } from './cli.js';
import { REQUIRED_DATAVERSE_URL_ERROR } from './lib.js';

const exec = promisify(execFile);
const cli = resolve(process.cwd(), 'dist', 'cli.js');
const require = createRequire(import.meta.url);
const { version: PACKAGE_VERSION } = require('../package.json') as {
  version: string;
  files: string[];
};

describe('createProgram', () => {
  it('includes the scoped binary name and url option in help', () => {
    const help = createProgram(PACKAGE_VERSION).helpInformation();
    expect(help).toContain('dvq');
    expect(help).toContain('--url <url>');
  });

  it('excludes squad and copilot directories from published files', () => {
    const { files } = require('../package.json') as { files: string[] };
    expect(files).not.toContain('.squad');
    expect(files).not.toContain('.copilot');
  });
});

describe('compiled CLI entrypoint', () => {
  it('prints help from dist/cli.js', async () => {
    const { stdout } = await exec('node', [cli, '--help']);
    expect(stdout).toContain('dvq');
    expect(stdout).toContain('--url');
    expect(stdout).toContain('DATAVERSE_URL');
  });

  it('prints version from dist/cli.js', async () => {
    const { stdout } = await exec('node', [cli, '--version']);
    expect(stdout.trim()).toBe(PACKAGE_VERSION);
  });

  it('prints version through the bin shim', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'dvq-pack-test-'));
    try {
      const { stdout: tarball } = await exec('npm', ['pack', '--quiet'], {
        cwd: process.cwd(),
      });
      const tarballName = tarball.trim().split('\n').pop();
      if (!tarballName) {
        throw new Error('npm pack did not return a tarball name');
      }

      await exec('npm', ['init', '-y'], { cwd: tempDir });
      await exec('npm', ['install', '--silent', resolve(process.cwd(), tarballName)], {
        cwd: tempDir,
      });

      const bin = resolve(tempDir, 'node_modules', '.bin', 'dvq');
      const { stdout } = await exec(bin, ['--version']);
      expect(stdout.trim()).toBe(PACKAGE_VERSION);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }, 15000);

  it('exits with the required DATAVERSE_URL error from dist/cli.js', async () => {
    await expect(exec('node', [cli, 'query'])).rejects.toMatchObject({
      stderr: `${REQUIRED_DATAVERSE_URL_ERROR}\n`,
    });
  });
});
