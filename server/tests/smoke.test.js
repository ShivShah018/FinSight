const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const app = require('../app');

let server;
let BASE_URL = process.env.SMOKE_BASE_URL;

before(async () => {
  if (!BASE_URL) {
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    const port = server.address().port;
    BASE_URL = `http://localhost:${port}`;
  }
});

after(async () => {
  if (server) {
    await new Promise(resolve => server.close(resolve));
  }
});

function fetchUrl(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), raw: data });
        } catch {
          resolve({ status: res.statusCode, data: null, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

describe('Deployment Smoke Test Suite', () => {
  test('1. Health check returns 200 and healthy status without exposing secrets', async () => {
    const res = await fetchUrl('/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data?.status, 'healthy');
    assert.ok(res.data?.version, 'Version should be present');
    // Ensure no secret keys or database connection strings are exposed in response
    assert.strictEqual(res.raw.includes('password'), false);
    assert.strictEqual(res.raw.includes('secret'), false);
    assert.strictEqual(res.raw.includes('token'), false);
  });

  test('2. Public currency rates endpoint responds with active conversion rates', async () => {
    const res = await fetchUrl('/currency/rates');
    assert.strictEqual(res.status, 200);
    assert.ok(res.data?.rates || res.data?.base, 'Currency rates or base should be present');
  });

  test('3. Protected endpoint rejects unauthenticated requests with 401', async () => {
    const res = await fetchUrl('/categories');
    assert.strictEqual(res.status, 401);
  });

  test('4. Auth login rejects missing credentials with 400 validation error', async () => {
    const res = await fetchUrl('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.strictEqual(res.status, 400);
  });

  test('5. Non-existent route returns 404 with structured JSON', async () => {
    const res = await fetchUrl('/api/non-existent-smoke-path');
    assert.strictEqual(res.status, 404);
    assert.ok(res.data?.detail, 'Should return structured error detail');
  });

  test('6. Database schema file (schema_railway.sql) does not contain hardcoded USE statements', () => {
    const fs = require('fs');
    const path = require('path');
    const schemaContent = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema_railway.sql'), 'utf8');
    const hasUseStmt = /^\s*USE\s+/im.test(schemaContent);
    const hasCreateDb = /^\s*CREATE\s+DATABASE\s+/im.test(schemaContent);
    assert.strictEqual(hasUseStmt, false, 'schema_railway.sql must not contain hardcoded USE statements so it targets the connection database');
    assert.strictEqual(hasCreateDb, false, 'schema_railway.sql must not contain hardcoded CREATE DATABASE statements');
    assert.ok(schemaContent.includes('CREATE TABLE IF NOT EXISTS users'), 'users table must be defined');
    assert.ok(schemaContent.includes('CREATE TABLE IF NOT EXISTS agent_proposals'), 'agent_proposals table must be defined');
  });
});
