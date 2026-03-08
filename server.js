import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import worker from './worker.js';
import { createD1Database } from './d1-sqlite.js';

const DEFAULT_PORT = 3000;
const DEFAULT_DB_PATH = './data/exa-pool.sqlite';
const DEFAULT_VALIDATION_CONCURRENCY = 10;
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function parseEnvFile(envPath = '.env') {
  const absolutePath = resolve(envPath);

  if (!existsSync(absolutePath)) {
    return {};
  }

  const content = readFileSync(absolutePath, 'utf8');
  const values = {};

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function withEnvDefaults(fileEnv) {
  for (const [key, value] of Object.entries(fileEnv)) {
    if (process.env[key] == null) {
      process.env[key] = value;
    }
  }
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function resolveConfig(overrides = {}) {
  const fileEnv = parseEnvFile(overrides.envFile);
  withEnvDefaults(fileEnv);

  const adminKey = overrides.ADMIN_KEY ?? process.env.ADMIN_KEY;
  if (!adminKey) {
    throw new Error('ADMIN_KEY is required. Please set it in .env or the environment.');
  }

  const port = parsePositiveInteger(overrides.PORT ?? process.env.PORT, DEFAULT_PORT);
  const validationConcurrency = parsePositiveInteger(
    overrides.VALIDATION_CONCURRENCY ?? process.env.VALIDATION_CONCURRENCY,
    DEFAULT_VALIDATION_CONCURRENCY,
  );

  return {
    adminKey,
    dbPath: overrides.DB_PATH ?? process.env.DB_PATH ?? DEFAULT_DB_PATH,
    port,
    validationConcurrency,
  };
}

function createExecutionContext() {
  const tasks = [];

  return {
    waitUntil(promise) {
      tasks.push(Promise.resolve(promise));
    },
    passThroughOnException() {},
    async flush() {
      if (tasks.length === 0) {
        return;
      }
      await Promise.allSettled(tasks);
    },
  };
}

function createHeaders(headersObject) {
  const headers = new Headers();

  for (const [name, value] of Object.entries(headersObject)) {
    if (value == null || HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
      continue;
    }

    headers.set(name, value);
  }

  return headers;
}

async function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return undefined;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return undefined;
  }

  return Buffer.concat(chunks);
}

async function sendNodeResponse(nodeResponse, response, requestMethod) {
  nodeResponse.statusCode = response.status;

  for (const [name, value] of response.headers.entries()) {
    if (HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      continue;
    }
    nodeResponse.setHeader(name, value);
  }

  if (requestMethod === 'HEAD') {
    nodeResponse.end();
    return;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  nodeResponse.setHeader('content-length', String(buffer.length));
  nodeResponse.end(buffer);
}

async function handleRequest(req, res, env) {
  try {
    const body = await readBody(req);
    const headers = createHeaders(req.headers);
    const host = req.headers.host ?? `127.0.0.1:${env.PORT}`;
    const url = new URL(req.url ?? '/', `http://${host}`);
    const request = new Request(url, {
      method: req.method,
      headers,
      body,
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);

    await sendNodeResponse(res, response, req.method ?? 'GET');
    await ctx.flush();
  } catch (error) {
    console.error('Local server error:', error);

    const message = JSON.stringify({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });

    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.setHeader('access-control-allow-origin', '*');
    res.end(message);
  }
}

export function createApp(options = {}) {
  const config = resolveConfig(options);
  const db = options.db ?? createD1Database(config.dbPath);
  const env = {
    ADMIN_KEY: config.adminKey,
    DB: db,
    PORT: String(config.port),
    VALIDATION_CONCURRENCY: String(config.validationConcurrency),
  };

  const server = http.createServer((req, res) => {
    void handleRequest(req, res, env);
  });

  return {
    config,
    db,
    env,
    server,
    async close() {
      await new Promise((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error) {
            rejectClose(error);
            return;
          }
          resolveClose();
        });
      });
      db.close();
    },
  };
}

export async function startServer(options = {}) {
  const app = createApp(options);

  await new Promise((resolveStart, rejectStart) => {
    app.server.once('error', rejectStart);
    app.server.listen(app.config.port, '0.0.0.0', () => {
      app.server.off('error', rejectStart);
      resolveStart();
    });
  });

  return app;
}

async function main() {
  const app = await startServer();
  console.log(`Exa Pool listening on http://0.0.0.0:${app.config.port}`);
  console.log(`SQLite database: ${resolve(app.config.dbPath)}`);

  const shutdown = async (signal) => {
    console.log(`Received ${signal}, shutting down...`);
    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      console.error('Shutdown failed:', error);
      process.exit(1);
    }
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMainModule) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

