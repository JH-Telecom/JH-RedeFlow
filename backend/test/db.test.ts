import assert from 'node:assert/strict';
import test from 'node:test';
import { checkDatabaseConnection, isDatabaseConfigured } from '../src/db.js';

test('database helper reports unconfigured state when DATABASE_URL is absent', async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  assert.equal(isDatabaseConfigured(), false);
  const result = await checkDatabaseConnection();
  assert.equal(result.configured, false);
  assert.equal(result.connected, false);

  if (previous) process.env.DATABASE_URL = previous;
});
