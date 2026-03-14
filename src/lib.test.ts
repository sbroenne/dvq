import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_PATH,
  AZ_LOGIN_GUIDANCE,
  MAX_PAGES,
  ODataError,
  REQUIRED_DATAVERSE_URL_ERROR,
  buildHeaders,
  buildUrl,
  fetchOData,
  getDataverseScope,
  getDataverseUrl,
  getToken,
  queryAll,
  readQueryFile,
  resolveDataverseUrl,
} from './lib.js';

describe('constants', () => {
  it('API_PATH is OData v9.2', () => {
    expect(API_PATH).toBe('/api/data/v9.2/');
  });

  it('MAX_PAGES is 40', () => {
    expect(MAX_PAGES).toBe(40);
  });
});

describe('resolveDataverseUrl', () => {
  it('uses an explicit URL when provided', () => {
    expect(
      resolveDataverseUrl({ url: 'https://contoso.crm.dynamics.com' }),
    ).toBe('https://contoso.crm.dynamics.com');
  });

  it('trims surrounding whitespace from an explicit URL', () => {
    expect(
      resolveDataverseUrl({ url: '  https://contoso.crm.dynamics.com  ' }),
    ).toBe('https://contoso.crm.dynamics.com');
  });

  it('removes a trailing slash from an explicit URL', () => {
    expect(
      resolveDataverseUrl({ url: 'https://contoso.crm.dynamics.com/' }),
    ).toBe('https://contoso.crm.dynamics.com');
  });

  it('falls back to DATAVERSE_URL from the environment', () => {
    expect(
      resolveDataverseUrl({
        env: { DATAVERSE_URL: 'https://fabrikam.crm.dynamics.com' },
      }),
    ).toBe('https://fabrikam.crm.dynamics.com');
  });

  it('throws when neither an explicit URL nor DATAVERSE_URL is available', () => {
    expect(() => resolveDataverseUrl({ env: {} })).toThrow(
      REQUIRED_DATAVERSE_URL_ERROR,
    );
  });
});

describe('getDataverseUrl', () => {
  const originalEnv = process.env.DATAVERSE_URL;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.DATAVERSE_URL;
      return;
    }

    process.env.DATAVERSE_URL = originalEnv;
  });

  it('throws when DATAVERSE_URL is not set', () => {
    delete process.env.DATAVERSE_URL;
    expect(() => getDataverseUrl()).toThrow(REQUIRED_DATAVERSE_URL_ERROR);
  });

  it('returns env override when DATAVERSE_URL is set', () => {
    process.env.DATAVERSE_URL = 'https://custom.crm.dynamics.com';
    expect(getDataverseUrl()).toBe('https://custom.crm.dynamics.com');
  });

  it('prefers an explicit URL over DATAVERSE_URL', () => {
    process.env.DATAVERSE_URL = 'https://env.crm.dynamics.com';
    expect(getDataverseUrl('https://option.crm.dynamics.com')).toBe(
      'https://option.crm.dynamics.com',
    );
  });
});

describe('getDataverseScope', () => {
  it('appends /.default to a given base URL', () => {
    expect(getDataverseScope('https://example.crm.dynamics.com')).toBe(
      'https://example.crm.dynamics.com/.default',
    );
  });
});

describe('buildUrl', () => {
  it('builds a full URL from an OData path', () => {
    const url = buildUrl('accounts?$top=5', 'https://custom.crm.dynamics.com');
    expect(url).toBe(
      'https://custom.crm.dynamics.com/api/data/v9.2/accounts?$top=5',
    );
  });

  it('drops any leading slash from the OData path', () => {
    const url = buildUrl('/WhoAmI', 'https://custom.crm.dynamics.com/');
    expect(url).toBe('https://custom.crm.dynamics.com/api/data/v9.2/WhoAmI');
  });

  it('handles an empty OData path', () => {
    const url = buildUrl('', 'https://custom.crm.dynamics.com');
    expect(url).toBe('https://custom.crm.dynamics.com/api/data/v9.2/');
  });
});

describe('buildHeaders', () => {
  it('includes the Authorization bearer token', () => {
    const headers = buildHeaders('test-token-123');
    expect(headers.Authorization).toBe('Bearer test-token-123');
  });

  it('sets OData version headers', () => {
    const headers = buildHeaders('tok');
    expect(headers['OData-MaxVersion']).toBe('4.0');
    expect(headers['OData-Version']).toBe('4.0');
  });

  it('requests JSON with formatted value annotations', () => {
    const headers = buildHeaders('tok');
    expect(headers.Accept).toBe('application/json');
    expect(headers.Prefer).toContain(
      'OData.Community.Display.V1.FormattedValue',
    );
  });
});

describe('getToken', () => {
  it('requests a token for the Dataverse scope', async () => {
    const credential = {
      getToken: vi.fn().mockResolvedValue({ token: 'abc123' }),
    };

    await expect(
      getToken({
        baseUrl: 'https://example.crm.dynamics.com',
        credential,
      }),
    ).resolves.toBe('abc123');
    expect(credential.getToken).toHaveBeenCalledWith(
      'https://example.crm.dynamics.com/.default',
    );
  });

  it('throws generic az login guidance when auth fails', async () => {
    const credential = {
      getToken: vi.fn().mockRejectedValue(new Error('login required')),
    };

    await expect(
      getToken({
        baseUrl: 'https://example.crm.dynamics.com',
        credential,
      }),
    ).rejects.toThrow(AZ_LOGIN_GUIDANCE);
  });
});

describe('ODataError', () => {
  it('stores the status code and formats the message', () => {
    const error = new ODataError(404, 'Entity not found');
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('HTTP 404: Entity not found');
    expect(error.name).toBe('ODataError');
  });

  it('is an instance of Error', () => {
    const error = new ODataError(500, 'Server error');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('fetchOData', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed JSON on success', async () => {
    const mockData = { value: [{ name: 'Contoso' }] };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockData), { status: 200 }),
    );

    const result = await fetchOData(
      'https://example.com/api/data/v9.2/accounts',
      'tok',
    );
    expect(result).toEqual(mockData);
  });

  it('throws ODataError with the body message on failure', async () => {
    const errorBody = { error: { message: 'Resource not found' } };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(errorBody), {
        status: 404,
        statusText: 'Not Found',
      }),
    );

    await expect(
      fetchOData('https://example.com/api/data/v9.2/bad', 'tok'),
    ).rejects.toThrow(ODataError);
  });

  it('throws ODataError with the status text when the body is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('not json', {
        status: 500,
        statusText: 'Internal Server Error',
      }),
    );

    await expect(
      fetchOData('https://example.com/api/data/v9.2/fail', 'tok'),
    ).rejects.toThrow('HTTP 500');
  });

  it('sends the expected headers', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));

    await fetchOData('https://example.com/test', 'my-token');

    const callHeaders = fetchSpy.mock.calls[0]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(callHeaders.Authorization).toBe('Bearer my-token');
    expect(callHeaders['OData-Version']).toBe('4.0');
  });
});

describe('queryAll', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns all records from a single page', async () => {
    const mockData = { value: [{ id: 1 }, { id: 2 }] };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockData), { status: 200 }),
    );

    const results = await queryAll(
      'accounts?$top=5',
      'tok',
      'https://example.crm.dynamics.com',
    );
    expect(results).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('follows @odata.nextLink for multi-page results', async () => {
    const page1 = {
      value: [{ id: 1 }],
      '@odata.nextLink':
        'https://example.com/api/data/v9.2/accounts?$skiptoken=2',
    };
    const page2 = { value: [{ id: 2 }] };

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify(page1), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(page2), { status: 200 }),
      );

    const results = await queryAll(
      'accounts',
      'tok',
      'https://example.crm.dynamics.com',
    );
    expect(results).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('returns a single-entity response wrapped in an array', async () => {
    const singleEntity = { UserId: 'abc-123', BusinessUnitId: 'xyz-456' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(singleEntity), { status: 200 }),
    );

    const results = await queryAll(
      'WhoAmI',
      'tok',
      'https://example.crm.dynamics.com',
    );
    expect(results).toEqual([singleEntity]);
  });

  it('throws when pagination exceeds MAX_PAGES', async () => {
    const page = {
      value: [{ id: 1 }],
      '@odata.nextLink':
        'https://example.com/api/data/v9.2/accounts?$skiptoken=next',
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    for (let index = 0; index < MAX_PAGES; index += 1) {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(page), { status: 200 }),
      );
    }

    await expect(
      queryAll('accounts', 'tok', 'https://example.crm.dynamics.com'),
    ).rejects.toThrow(
      `Query exceeded pagination safety cap (${MAX_PAGES} pages). Narrow the filter or increase MAX_PAGES.`,
    );
  });
});

describe('readQueryFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvq-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads and trims a query from a .odata file', () => {
    const filePath = path.join(tmpDir, 'query.odata');
    fs.writeFileSync(filePath, '  accounts?$top=5\n  ');

    const result = readQueryFile(filePath);
    expect(result).toBe('accounts?$top=5');
  });

  it('handles a full multi-line query by trimming the content', () => {
    const filePath = path.join(tmpDir, 'multi.odata');
    fs.writeFileSync(
      filePath,
      'accounts?$select=name&$filter=statecode eq 0\n',
    );

    const result = readQueryFile(filePath);
    expect(result).toBe('accounts?$select=name&$filter=statecode eq 0');
  });

  it('throws on a missing file', () => {
    expect(() => readQueryFile('/nonexistent/file.odata')).toThrow();
  });
});
