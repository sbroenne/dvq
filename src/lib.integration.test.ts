import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';
import { buildUrl, getToken, fetchOData, queryAll } from './lib.js';

const ENV_FILE = path.resolve(process.cwd(), '.env.integration');

function loadIntegrationEnv(): void {
  if (!fs.existsSync(ENV_FILE)) {
    return;
  }

  const content = fs.readFileSync(ENV_FILE, 'utf8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').trim();
      process.env[key.trim()] = value;
    }
  });
}

function shouldSkipIntegrationTests(): boolean {
  loadIntegrationEnv();

  const enabled = process.env.RUN_INTEGRATION_TESTS === 'true';
  const hasUrl = Boolean(process.env.DATAVERSE_URL);

  return !enabled || !hasUrl;
}

const skipMessage = `
Integration tests are disabled. To enable them:
1. Copy .env.integration.example to .env.integration
2. Set DATAVERSE_URL=https://yourorg.crm.dynamics.com
3. Set RUN_INTEGRATION_TESTS=true
4. Run 'az login' if you haven't already
5. Run 'npm run test:integration'
`.trim();

describe.skipIf(shouldSkipIntegrationTests())(
  'integration: live Dataverse',
  () => {
    let token: string;
    let baseUrl: string;

    beforeAll(async () => {
      loadIntegrationEnv();
      baseUrl = process.env.DATAVERSE_URL!;
      token = await getToken({ baseUrl });
    }, 15000);

    it('authenticates and calls WhoAmI', async () => {
      const url = buildUrl('WhoAmI', baseUrl);
      const data = await fetchOData(url, token);

      expect(data).toBeDefined();
      expect(data.UserId).toBeDefined();
      expect(data.BusinessUnitId).toBeDefined();
      expect(data.OrganizationId).toBeDefined();
    }, 10000);

    it('queries systemusers with $top=1', async () => {
      const url = buildUrl('systemusers?$top=1', baseUrl);
      const data = await fetchOData(url, token);

      expect(data).toBeDefined();
      expect(Array.isArray(data.value)).toBe(true);
      if (data.value) {
        expect(data.value.length).toBeGreaterThanOrEqual(0);
      }
    }, 10000);

    it('uses queryAll to fetch paginated accounts', async () => {
      const results = await queryAll(
        'accounts?$select=name,accountid&$top=5',
        token,
        baseUrl,
      );

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBeGreaterThanOrEqual(0);

      if (results.length > 0) {
        const first = results[0] as { accountid?: string; name?: string };
        expect(first.accountid).toBeDefined();
      }
    }, 15000);
  },
);

describe.skipIf(!shouldSkipIntegrationTests())(
  'integration tests skipped message',
  () => {
    it('explains how to enable integration tests', () => {
      console.log(`\n${skipMessage}\n`);
      expect(true).toBe(true);
    });
  },
);
