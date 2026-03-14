import { exec as execShell, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { createProgram, parseHeaders } from './cli.js';
import { REQUIRED_DATAVERSE_URL_ERROR } from './lib.js';

const exec = promisify(execFile);
const execWithShell = promisify(execShell);
const cli = resolve(process.cwd(), 'dist', 'cli.js');
const packagedBinName = process.platform === 'win32' ? 'dvq.cmd' : 'dvq';
const npmExecPath = process.env.npm_execpath;
const require = createRequire(import.meta.url);
const { version: PACKAGE_VERSION } = require('../package.json') as {
  version: string;
  files: string[];
};

function execNpm(args: string[], cwd: string): ReturnType<typeof exec> {
  if (npmExecPath) {
    return exec(process.execPath, [npmExecPath, ...args], { cwd });
  }

  const fallbackExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return exec(fallbackExecutable, args, { cwd });
}

function execPackagedBin(binPath: string, args: string[]): ReturnType<typeof exec> {
  if (process.platform === 'win32') {
    const command = `"${binPath}" ${args.join(' ')}`;
    return execWithShell(command);
  }

  return exec(binPath, args);
}

function toText(value: string | Buffer): string {
  return typeof value === 'string' ? value : value.toString('utf8');
}

describe('createProgram', () => {
  it('includes the scoped binary name and url option in help', () => {
    const help = createProgram(PACKAGE_VERSION).helpInformation();
    expect(help).toContain('dvq');
    expect(help).toContain('--url <url>');
    expect(help).toContain('--verbose');
    expect(help).toContain('--no-formatted-values');
    expect(help).toContain('--header <name:value>');
  });

  it('excludes squad and copilot directories from published files', () => {
    const { files } = require('../package.json') as { files: string[] };
    expect(files).not.toContain('.squad');
    expect(files).not.toContain('.copilot');
  });
});

describe('parseHeaders', () => {
  it('parses repeated header arguments into an object', () => {
    expect(
      parseHeaders([
        'ConsistencyLevel: eventual',
        'Prefer: odata.include-annotations="*"',
      ]),
    ).toEqual({
      ConsistencyLevel: 'eventual',
      Prefer: 'odata.include-annotations="*"',
    });
  });

  it('rejects malformed header input', () => {
    expect(() => parseHeaders(['BrokenHeader'])).toThrow(
      'Invalid header. Use the form "Name: Value".',
    );
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
      const { stdout: tarball } = await execNpm(['pack', '--quiet'], process.cwd());
      const tarballName = toText(tarball).trim().split('\n').pop();
      if (!tarballName) {
        throw new Error('npm pack did not return a tarball name');
      }

      await execNpm(['init', '-y'], tempDir);
      await execNpm(
        ['install', '--silent', resolve(process.cwd(), tarballName)],
        tempDir,
      );

      const bin = resolve(tempDir, 'node_modules', '.bin', packagedBinName);
      const { stdout } = await execPackagedBin(bin, ['--version']);
      expect(toText(stdout).trim()).toBe(PACKAGE_VERSION);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }, 60000);

  it('exits with the required DATAVERSE_URL error from dist/cli.js', async () => {
    await expect(exec('node', [cli, 'query'])).rejects.toMatchObject({
      stderr: `${REQUIRED_DATAVERSE_URL_ERROR}\n`,
    });
  }, 10000);
});
