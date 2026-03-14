import * as fs from 'node:fs';
import { AzureCliCredential } from '@azure/identity';

export const REQUIRED_DATAVERSE_URL_ERROR =
  'DATAVERSE_URL environment variable is required.';
export const AZ_LOGIN_GUIDANCE = 'Failed to get token. Run:\n  az login';
export const API_PATH = '/api/data/v9.2/';
export const DEFAULT_API_PATH = API_PATH;
export const MAX_PAGES = 40;

export type TraceLogger = (message: string) => void;

export interface RequestOptions {
  includeFormattedValues?: boolean;
  headers?: Record<string, string>;
  logger?: TraceLogger;
}

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

function formatDiagnosticBlock(label: string, value: string): string {
  return `${label}: ${value}`;
}

function trace(logger: TraceLogger | undefined, message: string): void {
  logger?.(message);
}

function sanitizeHeadersForLogging(
  headers: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      name.toLowerCase() === 'authorization' ? '<redacted>' : value,
    ]),
  );
}

export function getODataErrorHint(
  statusCode: number,
  detail: string,
): string | undefined {
  if (statusCode === 400) {
    if (detail.includes('Both header name and value should be specified.')) {
      return 'Dataverse rejected a request header. Retry with formatted values disabled to isolate the default Prefer header, and review any custom headers.';
    }

    return 'Check the OData path, entity set names, filter syntax, and any request headers. For CLI debugging, retry with --no-formatted-values to isolate header-related issues.';
  }

  if (statusCode === 401 || statusCode === 403) {
    return 'Run az login again and verify that the selected account has access to this Dataverse environment.';
  }

  if (statusCode === 404) {
    return 'Verify the entity set name, record ID, and OData path.';
  }

  if (statusCode === 429) {
    return 'The environment is throttling requests. Retry after a delay or narrow the query.';
  }

  return undefined;
}

export function formatODataErrorMessage(
  statusCode: number,
  detail: string,
  options: {
    requestUrl?: string;
    hint?: string;
  } = {},
): string {
  const lines = [`HTTP ${statusCode}: ${detail}`];

  if (options.requestUrl) {
    lines.push(formatDiagnosticBlock('URL', options.requestUrl));
  }

  const hint = options.hint ?? getODataErrorHint(statusCode, detail);
  if (hint) {
    lines.push(formatDiagnosticBlock('Hint', hint));
  }

  return lines.join('\n');
}

export function formatAuthFailureMessage(baseUrl: string): string {
  return [AZ_LOGIN_GUIDANCE, formatDiagnosticBlock('Target', baseUrl)].join('\n');
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

export function buildHeaders(
  token: string,
  options: RequestOptions = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
    Accept: 'application/json',
  };

  if (options.includeFormattedValues !== false) {
    headers.Prefer =
      'odata.include-annotations="OData.Community.Display.V1.FormattedValue"';
  }

  return {
    ...headers,
    ...options.headers,
  };
}

export async function getToken(
  options: {
    baseUrl?: string;
    credential?: TokenCredentialLike;
    env?: NodeJS.ProcessEnv;
    logger?: TraceLogger;
  } = {},
): Promise<string> {
  const baseUrl = getDataverseUrl(options.baseUrl, options.env);
  const credential = options.credential ?? new AzureCliCredential();
  const scope = getDataverseScope(baseUrl);

  trace(options.logger, `Auth target: ${baseUrl}`);
  trace(options.logger, `Auth scope: ${scope}`);

  try {
    const response = await credential.getToken(scope);

    if (!response?.token) {
      throw new Error('Missing token response');
    }

    trace(options.logger, 'Token acquired successfully');
    return response.token;
  } catch {
    trace(options.logger, 'Token acquisition failed');
    throw new Error(formatAuthFailureMessage(baseUrl));
  }
}

export class ODataError extends Error {
  public detail: string;
  public hint?: string;
  public requestUrl?: string;

  constructor(
    public statusCode: number,
    detail: string,
    options: {
      hint?: string;
      requestUrl?: string;
    } = {},
  ) {
    super(formatODataErrorMessage(statusCode, detail, options));
    this.name = 'ODataError';
    this.detail = detail;
    this.hint = options.hint ?? getODataErrorHint(statusCode, detail);
    this.requestUrl = options.requestUrl;
  }
}

export async function fetchOData(
  url: string,
  token: string,
  options: RequestOptions = {},
): Promise<ODataResponse> {
  const headers = buildHeaders(token, options);
  trace(options.logger, `GET ${url}`);
  trace(
    options.logger,
    `Headers ${JSON.stringify(sanitizeHeadersForLogging(headers))}`,
  );

  const response = await fetch(url, { headers });
  trace(options.logger, `Response ${response.status} ${response.statusText}`);

  if (!response.ok) {
    let detail: string;
    try {
      const body = await response.json();
      detail = body?.error?.message ?? JSON.stringify(body);
    } catch {
      detail = response.statusText;
    }

    trace(options.logger, `Error detail ${detail}`);

    throw new ODataError(response.status, detail, {
      hint: getODataErrorHint(response.status, detail),
      requestUrl: url,
    });
  }

  const data = await response.json();
  trace(options.logger, 'Response body parsed successfully');
  return data;
}

export async function queryAll(
  odataPath: string,
  token: string,
  baseUrl?: string,
  env: NodeJS.ProcessEnv = process.env,
  options: RequestOptions = {},
): Promise<unknown[]> {
  let url = buildUrl(odataPath, baseUrl, env);
  const results: unknown[] = [];
  let hasNextPage = false;

  trace(options.logger, `Starting paged query for ${odataPath}`);

  for (let page = 0; page < MAX_PAGES; page += 1) {
    trace(options.logger, `Fetching page ${page + 1}`);
    const data = await fetchOData(url, token, options);
    if (data.value) {
      results.push(...data.value);
      trace(options.logger, `Collected ${results.length} rows total`);
    } else {
      trace(options.logger, 'Received a non-collection response; returning wrapped result');
      return [data];
    }

    const nextLink = data['@odata.nextLink'];
    hasNextPage = Boolean(nextLink);
    if (!nextLink) {
      trace(options.logger, `Pagination complete after ${page + 1} page(s)`);
      break;
    }

    trace(options.logger, 'Following @odata.nextLink');
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
