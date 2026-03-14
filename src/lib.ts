import * as fs from 'node:fs';
import { AzureCliCredential } from '@azure/identity';

export const REQUIRED_DATAVERSE_URL_ERROR =
  'DATAVERSE_URL environment variable is required.';
export const AZ_LOGIN_GUIDANCE = 'Failed to get token. Run:\n  az login';
export const API_PATH = '/api/data/v9.2/';
export const DEFAULT_API_PATH = API_PATH;
export const MAX_PAGES = 40;

export interface ResolveDataverseUrlOptions {
  env?: NodeJS.ProcessEnv;
  url?: string | undefined;
}

export interface TokenCredentialLike {
  getToken(scope: string): Promise<{ token: string } | null>;
}

interface ODataResponse {
  value?: unknown[];
  '@odata.nextLink'?: string;
  error?: {
    message?: string;
  };
  [key: string]: unknown;
}

function normalizeOptionalValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function trimTrailingSlashes(value: string): string {
  let end = value.length;

  while (end > 0 && value[end - 1] === '/') {
    end -= 1;
  }

  return value.slice(0, end);
}

function trimLeadingSlashes(value: string): string {
  let start = 0;

  while (start < value.length && value[start] === '/') {
    start += 1;
  }

  return value.slice(start);
}

function normalizeBaseUrl(value: string): string {
  return trimTrailingSlashes(value);
}

export function resolveDataverseUrl(
  options: ResolveDataverseUrlOptions = {},
): string {
  const explicitUrl = normalizeOptionalValue(options.url);
  if (explicitUrl) {
    return normalizeBaseUrl(explicitUrl);
  }

  const envUrl = normalizeOptionalValue(options.env?.DATAVERSE_URL);
  if (envUrl) {
    return normalizeBaseUrl(envUrl);
  }

  throw new Error(REQUIRED_DATAVERSE_URL_ERROR);
}

export function getDataverseUrl(
  baseUrl?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return resolveDataverseUrl({ env, url: baseUrl });
}

export function getDataverseScope(
  baseUrl?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return `${getDataverseUrl(baseUrl, env)}/.default`;
}

export function buildUrl(
  odataPath: string,
  baseUrl?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const queryPath = trimLeadingSlashes(odataPath);
  return `${getDataverseUrl(baseUrl, env)}${API_PATH}${queryPath}`;
}

export function buildHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
    Accept: 'application/json',
    Prefer:
      'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
  };
}

export async function getToken(
  options: {
    baseUrl?: string;
    credential?: TokenCredentialLike;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<string> {
  const credential = options.credential ?? new AzureCliCredential();

  try {
    const response = await credential.getToken(
      getDataverseScope(options.baseUrl, options.env),
    );

    if (!response?.token) {
      throw new Error('Missing token response');
    }

    return response.token;
  } catch {
    throw new Error(AZ_LOGIN_GUIDANCE);
  }
}

export class ODataError extends Error {
  constructor(
    public statusCode: number,
    detail: string,
  ) {
    super(`HTTP ${statusCode}: ${detail}`);
    this.name = 'ODataError';
  }
}

export async function fetchOData(
  url: string,
  token: string,
): Promise<ODataResponse> {
  const response = await fetch(url, { headers: buildHeaders(token) });

  if (!response.ok) {
    let detail: string;
    try {
      const body = await response.json();
      detail = body?.error?.message ?? JSON.stringify(body);
    } catch {
      detail = response.statusText;
    }

    throw new ODataError(response.status, detail);
  }

  return response.json();
}

export async function queryAll(
  odataPath: string,
  token: string,
  baseUrl?: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<unknown[]> {
  let url = buildUrl(odataPath, baseUrl, env);
  const results: unknown[] = [];
  let hasNextPage = false;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await fetchOData(url, token);
    if (data.value) {
      results.push(...data.value);
    } else {
      return [data];
    }

    const nextLink = data['@odata.nextLink'];
    hasNextPage = Boolean(nextLink);
    if (!nextLink) {
      break;
    }

    url = nextLink;
  }

  if (hasNextPage) {
    throw new Error(
      `Query exceeded pagination safety cap (${MAX_PAGES} pages). Narrow the filter or increase MAX_PAGES.`,
    );
  }

  return results;
}

export function readQueryFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8').trim();
}

export function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data.trim()));
    process.stdin.on('error', reject);
  });
}
