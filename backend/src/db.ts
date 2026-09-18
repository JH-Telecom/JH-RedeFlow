import { Client } from 'pg';

let client: Client | null = null;
let databaseConnected = false;

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export async function checkDatabaseConnection() {
  if (!isDatabaseConfigured()) {
    return { configured: false, connected: false, error: 'DATABASE_URL nao configurada.' };
  }

  if (!client) {
    client = new Client({ connectionString: process.env.DATABASE_URL });
  }

  try {
    await client.connect();
    databaseConnected = true;
    const result = await client.query('SELECT 1 as ok');
    return { configured: true, connected: Boolean(result.rowCount && result.rowCount > 0), error: undefined };
  } catch (error) {
    databaseConnected = false;
    return { configured: true, connected: false, error: error instanceof Error ? error.message : 'Erro desconhecido ao conectar ao PostgreSQL.' };
  }
}

export async function getDatabaseClient() {
  if (!isDatabaseConfigured()) {
    throw new Error('DATABASE_URL nao configurada.');
  }

  if (!client) {
    client = new Client({ connectionString: process.env.DATABASE_URL });
  }

  if (!databaseConnected) {
    await client.connect();
    databaseConnected = true;
  }

  return client;
}
