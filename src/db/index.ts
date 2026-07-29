import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is required. Use a Postgres connection string (local compose or hosted).',
    );
  }

  const isLocal =
    /@(localhost|127\.0\.0\.1|db)(:|\/)/.test(url) ||
    process.env.DATABASE_SSL === 'false';

  return postgres(url, {
    // Railway (and most hosted Postgres) need TLS; local Docker does not.
    ssl: isLocal ? false : 'require',
  });
}

const client = createClient();
export const db = drizzle(client, { schema });
