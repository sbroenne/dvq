# dvq

`dvq` is a small CLI and Node.js library for querying Dataverse OData endpoints with Azure CLI credentials.

## What exists today

- CLI for running OData paths against `/api/data/v9.2/`
- Azure authentication via `az login`
- Pretty-printed JSON output
- Library helpers for URL building, token acquisition, single requests, and paginated requests

## Install

```bash
npm install @sbroenne/dvq
```

Run without installing:

```bash
npx @sbroenne/dvq --help
```

## Requirements

- Node.js 20 or later
- Azure CLI (`az`)
- Access to a Dataverse environment

Authenticate once before using the CLI or library:

```bash
az login
```

For development and release validation, `npm test` runs the unit suite and `npm run test:integration` runs the live Dataverse checks when `.env.integration` is configured.

## Configuration

Set the base environment URL:

```bash
export DATAVERSE_URL="https://yourorg.crm.dynamics.com"
```

You can also pass `--url` on the CLI instead of setting `DATAVERSE_URL`.

## CLI quick start

The query is an OData path relative to `/api/data/v9.2/`.

```bash
dvq "accounts?$top=5"
```

With an explicit URL:

```bash
dvq --url "https://yourorg.crm.dynamics.com" "accounts?$select=name&$top=5"
```

From a file:

```bash
dvq --file query.odata
```

From stdin:

```bash
echo "accounts?$top=5" | dvq --url "https://yourorg.crm.dynamics.com"
```

Verify auth and connectivity:

```bash
dvq --whoami
```

Follow `@odata.nextLink` pages automatically:

```bash
dvq --all "accounts?$select=name"
```

## CLI usage

```bash
dvq [options] [query]
```

| Option | Argument | Description |
| --- | --- | --- |
| `[query]` | OData path | Inline query path after `/api/data/v9.2/` |
| `-f, --file` | `<path>` | Read the OData path from a file |
| `-a, --all` | — | Follow `@odata.nextLink` pages up to the built-in safety cap |
| `-u, --url` | `<url>` | Use this Dataverse base URL instead of `DATAVERSE_URL` |
| `--whoami` | — | Call `WhoAmI` and print the response |
| `--version` | — | Print the package version |
| `--help` | — | Show help text |

Notes:

- If neither `[query]` nor `--file` is given, `dvq` reads stdin when input is piped.
- Without `--all`, the CLI prints the first JSON response object exactly as returned by Dataverse.
- With `--all`, the CLI prints a JSON array aggregated across pages.

## Library API

The package currently exports low-level helpers from `src/lib.ts`, not a single high-level `query()` function.

### Common request flow

```ts
import { buildUrl, fetchOData, getToken } from '@sbroenne/dvq';

const baseUrl = 'https://yourorg.crm.dynamics.com';
const token = await getToken({ baseUrl });
const url = buildUrl('accounts?$top=5', baseUrl);
const data = await fetchOData(url, token);

console.log(data);
```

### Fetch all pages

```ts
import { getToken, queryAll } from '@sbroenne/dvq';

const baseUrl = 'https://yourorg.crm.dynamics.com';
const token = await getToken({ baseUrl });
const rows = await queryAll('accounts?$select=name', token, baseUrl);

console.log(rows);
```

### Main exports

| Export | Purpose |
| --- | --- |
| `resolveDataverseUrl`, `getDataverseUrl` | Resolve the Dataverse base URL from an explicit value or `DATAVERSE_URL` |
| `getDataverseScope` | Build the `/.default` scope for Azure auth |
| `buildUrl` | Build a full Dataverse Web API URL from an OData path |
| `buildHeaders` | Create request headers for Dataverse JSON calls |
| `getToken` | Acquire an access token using `AzureCliCredential` |
| `fetchOData` | Execute one HTTP request and parse the JSON response |
| `queryAll` | Follow paginated `@odata.nextLink` responses and return one array |
| `readQueryFile`, `readStdin` | CLI-oriented input helpers |
| `ODataError` | Error type for non-2xx HTTP responses |
| `API_PATH`, `DEFAULT_API_PATH`, `MAX_PAGES` | Public constants used by the helpers |

## Errors and behavior

Missing configuration:

```text
DATAVERSE_URL environment variable is required.
```

Authentication failure:

```text
Failed to get token. Run:
  az login
```

`queryAll()` stops after `MAX_PAGES` pages and throws if the safety cap is exceeded.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Security

Please do not report suspected vulnerabilities in public issues. See [SECURITY.md](./SECURITY.md) for the current reporting path and maintainer security checklist.

## License

MIT © 2026 sbroenne
