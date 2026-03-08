import { existsSync, rmSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

import { startServer } from './server.js';

const TEST_DB_PATH = './data/test-smoke.sqlite';

async function main() {
  if (existsSync(TEST_DB_PATH)) {
    rmSync(TEST_DB_PATH, { force: true });
  }

  const app = await startServer({
    ADMIN_KEY: 'test-admin-key',
    PORT: 3012,
    DB_PATH: TEST_DB_PATH,
    VALIDATION_CONCURRENCY: 4,
  });

  try {
    await delay(100);

    const rootResponse = await fetch('http://127.0.0.1:3012/');
    const rootText = await rootResponse.text();

    const loginResponse = await fetch('http://127.0.0.1:3012/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminKey: 'test-admin-key' }),
    });
    const loginJson = await loginResponse.json();

    const statsResponse = await fetch('http://127.0.0.1:3012/api/admin/stats', {
      headers: { Authorization: `Bearer ${loginJson.token}` },
    });
    const statsJson = await statsResponse.json();

    const addAllowedKeyResponse = await fetch('http://127.0.0.1:3012/api/admin/allowed-keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${loginJson.token}`,
      },
      body: JSON.stringify({ key: 'allowed-key-12345', name: 'smoke-test' }),
    });
    const addAllowedKeyJson = await addAllowedKeyResponse.json();

    const allowedKeysResponse = await fetch('http://127.0.0.1:3012/api/admin/allowed-keys', {
      headers: { Authorization: `Bearer ${loginJson.token}` },
    });
    const allowedKeysJson = await allowedKeysResponse.json();

    const unauthorizedSearchResponse = await fetch('http://127.0.0.1:3012/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    });
    const unauthorizedSearchJson = await unauthorizedSearchResponse.json();

    console.log(JSON.stringify({
      rootStatus: rootResponse.status,
      rootHasHtml: rootText.includes('<!DOCTYPE html>'),
      loginStatus: loginResponse.status,
      hasToken: typeof loginJson.token === 'string' && loginJson.token.length > 0,
      statsStatus: statsResponse.status,
      statsJson,
      addAllowedKeyStatus: addAllowedKeyResponse.status,
      addAllowedKeyJson,
      allowedKeysStatus: allowedKeysResponse.status,
      allowedKeysCount: Array.isArray(allowedKeysJson.allowedKeys) ? allowedKeysJson.allowedKeys.length : -1,
      unauthorizedSearchStatus: unauthorizedSearchResponse.status,
      unauthorizedSearchJson,
    }, null, 2));
  } finally {
    await app.close();

    if (existsSync(TEST_DB_PATH)) {
      rmSync(TEST_DB_PATH, { force: true });
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
