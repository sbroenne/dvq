#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Command } from 'commander';
import {
  MAX_PAGES,
  buildUrl,
  fetchOData,
  getDataverseUrl,
  getToken,
  queryAll,
  readQueryFile,
  readStdin,
} from './lib.js';

const require = createRequire(import.meta.url);
const { version: VERSION } = require('../package.json') as { version: string };

type CliOptions = {
  all?: boolean;
  file?: string;
  url?: string;
  whoami?: boolean;
};

const HELP_AFTER = `
Environment:
  DATAVERSE_URL   Base URL for your Dataverse org (required unless --url is provided)

Prerequisites:
  az login

Examples:
  dvq --url https://yourorg.crm.dynamics.com --whoami
  dvq --file query.odata --all
  DATAVERSE_URL=https://yourorg.crm.dynamics.com dvq "accounts?\\$top=5"
  echo "accounts?\\$top=5" | dvq --url https://yourorg.crm.dynamics.com
`;

export function createProgram(version = VERSION): Command {
  const program = new Command()
    .name('dvq')
    .description(
      'Query a Dataverse environment via OData using Azure CLI credentials',
    )
    .version(version)
    .option('-f, --file <path>', 'read an OData query path from a file')
    .option('-a, --all', `follow @odata.nextLink pages (max ${MAX_PAGES})`)
    .option('-u, --url <url>', 'use this Dataverse base URL for the request')
    .option('--whoami', 'print the WhoAmI response to verify auth')
    .argument(
      '[query]',
      'inline OData query path (everything after /api/data/v9.2/)',
    )
    .addHelpText('after', HELP_AFTER);

  program.action(async (inlineQuery: string | undefined, opts: CliOptions) => {
    let query = '';
    if (opts.file) {
      query = readQueryFile(opts.file);
    } else if (inlineQuery) {
      query = inlineQuery;
    } else if (!opts.whoami && !process.stdin.isTTY) {
      query = await readStdin();
    }

    if (!opts.whoami && !query) {
      program.help();
    }

    const baseUrl = getDataverseUrl(opts.url);
    const token = await getToken({ baseUrl });

    if (opts.whoami) {
      const data = await fetchOData(buildUrl('WhoAmI', baseUrl), token);
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    if (opts.all) {
      const results = await queryAll(query, token, baseUrl);
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    const data = await fetchOData(buildUrl(query, baseUrl), token);
    console.log(JSON.stringify(data, null, 2));
  });

  return program;
}

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
  await createProgram().parseAsync(argv, { from: 'user' });
}

const isEntrypoint = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1]
  : false;

if (isEntrypoint) {
  runCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
