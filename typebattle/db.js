/**
 * PostgreSQL connection pool for TypeBattle.
 */

const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  pool = new Pool({ connectionString: url });
  pool.on('error', (err) => {
    console.error('PostgreSQL pool error:', err.message);
  });
  return pool;
}

async function query(text, params) {
  const p = getPool();
  if (!p) throw new Error('DATABASE_URL is not configured');
  return p.query(text, params);
}

async function initDb() {
  const p = getPool();
  if (!p) {
    console.warn('⚠️  DATABASE_URL not set — accounts and leaderboards disabled (guest mode only)');
    return false;
  }
  try {
    await p.query('SELECT 1');
    await ensureSchema();
    console.log('✅ PostgreSQL connected');
    return true;
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', err.message);
    return false;
  }
}

async function ensureSchema() {
  // Users
  await query(`
    CREATE TABLE IF NOT EXISTS typebattle_users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash TEXT,
      display_name VARCHAR(100),
      student_id VARCHAR(64),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Sessions
  await query(`
    CREATE TABLE IF NOT EXISTS typebattle_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES typebattle_users(id) ON DELETE CASCADE,
      token_hash VARCHAR(128) NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);

  // Matches and results
  await query(`
    CREATE TABLE IF NOT EXISTS typebattle_matches (
      id SERIAL PRIMARY KEY,
      room_id VARCHAR(64),
      word_lang VARCHAR(8),
      started_at TIMESTAMPTZ,
      player_count INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS typebattle_results (
      id SERIAL PRIMARY KEY,
      match_id INTEGER REFERENCES typebattle_matches(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES typebattle_users(id),
      guest_name VARCHAR(100),
      wpm INTEGER,
      accuracy INTEGER,
      placement INTEGER,
      finish_time_sec INTEGER
    )
  `);

  // Quotes
  await query(`
    CREATE TABLE IF NOT EXISTS typebattle_quotes (
      id SERIAL PRIMARY KEY,
      text TEXT NOT NULL,
      author VARCHAR(100),
      lang VARCHAR(8) NOT NULL DEFAULT 'en',
      added_by INTEGER REFERENCES typebattle_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_typebattle_quotes_lang ON typebattle_quotes (lang)`);
}

module.exports = { getPool, query, initDb, ensureSchema, isEnabled: () => !!process.env.DATABASE_URL };
