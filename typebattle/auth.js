/**
 * TypeBattle user registration, login, and session management.
 */

const crypto = require('crypto');
const db = require('./db');
const students = require('./students');

const SESSION_TTL_DAYS = 30;
const guestSessions = new Map();

function createGuestSession(user) {
  const token = generateToken();
  guestSessions.set(token, user);
  return token;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function sanitizeUsername(value) {
  return String(value || '').trim().toLowerCase().slice(0, 50);
}

function sanitizeDisplayName(value) {
  return String(value || '').trim().slice(0, 50);
}

function studentIdToUsername(studentId) {
  return sanitizeUsername(String(studentId || '').replace(/\s+/g, ''));
}

async function registerUser({ username, password, displayName, studentId }) {
  const u = sanitizeUsername(username);
  const display = sanitizeDisplayName(displayName) || u;
  if (!u || u.length < 3) {
    return { ok: false, error: 'Username must be at least 3 characters' };
  }
  if (!password || password.length < 4) {
    return { ok: false, error: 'Password must be at least 4 characters' };
  }
  const passwordHash = hashPassword(password);
  const student = studentId ? String(studentId).trim().slice(0, 32) || null : null;
  try {
    const result = await db.query(
      `INSERT INTO typebattle_users (username, password_hash, display_name, student_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, display_name, student_id, created_at`,
      [u, passwordHash, display, student]
    );
    const user = result.rows[0];
    const session = await createSession(user.id);
    return { ok: true, user: publicUser(user), token: session.token, isNew: true };
  } catch (err) {
    if (err.code === '23505') {
      return { ok: false, error: 'Username already taken' };
    }
    throw err;
  }
}

async function loginUser({ username, password }) {
  const u = sanitizeUsername(username);
  const result = await db.query(
    `SELECT id, username, password_hash, display_name, student_id, created_at
     FROM typebattle_users WHERE username = $1`,
    [u]
  );
  if (!result.rows.length) {
    return { ok: false, error: 'Invalid username or password' };
  }
  const row = result.rows[0];
  if (!verifyPassword(password, row.password_hash)) {
    return { ok: false, error: 'Invalid username or password' };
  }
  const session = await createSession(row.id);
  return { ok: true, user: publicUser(row), token: session.token };
}

async function profileLogin({ studentId, password, newPassword }) {
  const profile = students.getProfile(studentId);
  if (!profile) {
    return { ok: false, error: 'Student profile not found' };
  }

  const username = studentIdToUsername(profile.student_id);
  const displayName = sanitizeDisplayName(profile.name) || username;

  if (!db.isEnabled()) {
    const suppliedPassword = String(password || '').trim();
    if (suppliedPassword !== 'nimet') {
      return { ok: false, error: 'Invalid username or password' };
    }
    const user = {
      id: null,
      username,
      display_name: displayName,
      student_id: profile.student_id,
      created_at: new Date().toISOString(),
    };
    const token = createGuestSession(user);
    return { ok: true, user, token, profile };
  }

  const existing = await db.query(
    `SELECT id, username, password_hash, display_name, student_id, created_at
     FROM typebattle_users WHERE student_id = $1 OR username = $2`,
    [profile.student_id, username]
  );

  if (!existing.rows.length) {
    const initialPassword = (newPassword && String(newPassword).trim()) || (password && String(password).trim());
    if (!initialPassword || initialPassword.length < 4) {
      return { ok: false, error: 'First login requires a new password (min 4 characters)', needs_password: true };
    }
    const created = await registerUser({
      username,
      password: initialPassword,
      displayName,
      studentId: profile.student_id,
    });
    if (!created.ok) return created;
    return { ...created, profile };
  }

  const row = existing.rows[0];
  if (!verifyPassword(password || '', row.password_hash)) {
    return { ok: false, error: 'Incorrect password' };
  }
  const session = await createSession(row.id);
  return { ok: true, user: publicUser(row), token: session.token, profile };
}

async function changePassword(userId, { oldPassword, newPassword }) {
  if (!newPassword || newPassword.length < 4) {
    return { ok: false, error: 'New password must be at least 4 characters' };
  }
  const result = await db.query(
    'SELECT password_hash FROM typebattle_users WHERE id = $1',
    [userId]
  );
  if (!result.rows.length) return { ok: false, error: 'User not found' };
  if (!verifyPassword(oldPassword, result.rows[0].password_hash)) {
    return { ok: false, error: 'Current password is incorrect' };
  }
  await db.query(
    'UPDATE typebattle_users SET password_hash = $1 WHERE id = $2',
    [hashPassword(newPassword), userId]
  );
  return { ok: true };
}

async function searchProfilesWithAccounts(query) {
  const profiles = students.searchProfiles(query);
  if (!profiles.length || !db.isEnabled()) return profiles;

  const ids = profiles.map((p) => p.student_id);
  const result = await db.query(
    'SELECT student_id FROM typebattle_users WHERE student_id = ANY($1)',
    [ids]
  );
  const hasAccount = new Set(result.rows.map((r) => r.student_id));
  return profiles.map((p) => ({ ...p, has_account: hasAccount.has(p.student_id) }));
}

async function createSession(userId) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.query(
    `INSERT INTO typebattle_sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt.toISOString()]
  );
  return { token, expiresAt };
}

async function getUserByToken(token) {
  if (!token) return null;
  if (!db.isEnabled()) {
    return guestSessions.get(token) || null;
  }
  const tokenHash = hashToken(token);
  const result = await db.query(
    `SELECT u.id, u.username, u.display_name, u.student_id, u.created_at
     FROM typebattle_sessions s
     JOIN typebattle_users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [tokenHash]
  );
  if (!result.rows.length) return null;
  return publicUser(result.rows[0]);
}

async function logoutUser(token) {
  if (!token) return;
  if (!db.isEnabled()) {
    guestSessions.delete(token);
    return;
  }
  const tokenHash = hashToken(token);
  await db.query('DELETE FROM typebattle_sessions WHERE token_hash = $1', [tokenHash]);
}

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    student_id: row.student_id || null,
    created_at: row.created_at,
  };
}

function formatQuote(row) {
  if (!row) return null;
  return {
    id: row.id,
    text: row.text,
    author: row.author || null,
    lang: row.lang,
    added_by: row.added_by || null,
    creator_name: row.creator_name || row.author || null,
    created_at: row.created_at,
  };
}

async function getQuotes(lang = 'en', limit = 50) {
  const result = await db.query(
    `SELECT q.id, q.text, q.author, q.lang, q.added_by, q.created_at,
            u.display_name AS creator_name
     FROM typebattle_quotes q
     LEFT JOIN typebattle_users u ON u.id = q.added_by
     WHERE q.lang = $1
     ORDER BY q.id ASC
     LIMIT $2`,
    [lang, limit]
  );
  return result.rows.map(formatQuote);
}

async function getQuoteById(id) {
  const quoteId = Number(id);
  if (!quoteId || quoteId < 1) return null;
  const result = await db.query(
    `SELECT q.id, q.text, q.author, q.lang, q.added_by, q.created_at,
            u.display_name AS creator_name
     FROM typebattle_quotes q
     LEFT JOIN typebattle_users u ON u.id = q.added_by
     WHERE q.id = $1`,
    [quoteId]
  );
  return formatQuote(result.rows[0]);
}

async function searchQuotes({ id, lang, limit = 20 }) {
  if (id) {
    const quote = await getQuoteById(id);
    return quote ? [quote] : [];
  }
  return getQuotes(lang || 'en', limit);
}

async function addQuote(userId, { text, lang }) {
  const quoteText = String(text || '').trim();
  if (!quoteText || quoteText.length < 10) {
    return { ok: false, error: 'Quote must be at least 10 characters' };
  }
  if (quoteText.length > 500) {
    return { ok: false, error: 'Quote must be under 500 characters' };
  }
  if (!userId) {
    return { ok: false, error: 'Login required to add quotes' };
  }

  const userResult = await db.query(
    'SELECT display_name FROM typebattle_users WHERE id = $1',
    [userId]
  );
  const quoteAuthor = userResult.rows[0]?.display_name || 'Anonymous';
  const quoteLang = String(lang || 'en').slice(0, 8);

  const result = await db.query(
    `INSERT INTO typebattle_quotes (text, author, lang, added_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, text, author, lang, added_by, created_at`,
    [quoteText, quoteAuthor, quoteLang, userId]
  );
  const quote = formatQuote({ ...result.rows[0], creator_name: quoteAuthor });
  return { ok: true, quote };
}

const QUOTE_LENGTH_RANGES = {
  short: [10, 99],
  medium: [100, 249],
  long: [250, 500],
};

async function getQuoteText(quoteId, lang = 'en', quoteLength = 'medium') {
  if (quoteId) {
    const quote = await getQuoteById(quoteId);
    return quote?.text || null;
  }
  return getQuoteByLength(lang, quoteLength);
}

async function getQuoteByLength(lang = 'en', length = 'medium') {
  if (!db.isEnabled()) return null;
  const range = QUOTE_LENGTH_RANGES[length] || QUOTE_LENGTH_RANGES.medium;
  const result = await db.query(
    `SELECT text FROM typebattle_quotes
     WHERE lang = $1 AND char_length(text) BETWEEN $2 AND $3
     ORDER BY RANDOM()
     LIMIT 1`,
    [lang, range[0], range[1]]
  );
  if (result.rows[0]?.text) return result.rows[0].text;
  return getRandomQuote(lang);
}

async function getRandomQuote(lang = 'en') {
  const result = await db.query(
    `SELECT text FROM typebattle_quotes
     WHERE lang = $1
     ORDER BY RANDOM()
     LIMIT 1`,
    [lang]
  );
  return result.rows[0]?.text || null;
}

async function saveMatchResults(room) {
  if (!db.isEnabled() || !room || room.dbSaved) return;
  room.dbSaved = true;

  console.log('auth.saveMatchResults called for room', room.id, 'players', room.players.length);

  const startedAt = room.startTime ? new Date(room.startTime).toISOString() : null;
  const matchResult = await db.query(
    `INSERT INTO typebattle_matches (room_id, word_lang, started_at, player_count)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [room.id, room.wordLang || 'en', startedAt, room.players.length]
  );
  const matchId = matchResult.rows[0].id;

  for (const pid of room.players) {
    const client = room._clientsSnapshot?.[pid];
    if (!client) continue;
    await db.query(
      `INSERT INTO typebattle_results
         (match_id, user_id, guest_name, wpm, accuracy, placement, finish_time_sec)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        matchId,
        client.userId || null,
        client.userId ? null : (client.name || 'Anonymous'),
        Math.round(client.wpm || 0),
        Math.round(client.accuracy || 100),
        client.place || null,
        (client.finishTime != null) ? Math.round(client.finishTime) : null,
      ]
    );
  }
}

async function getLeaderboard(limit = 20) {
  const result = await db.query(
    `SELECT
       COALESCE(u.display_name, r.guest_name, 'Anonymous') AS name,
       u.username,
       MAX(r.wpm) AS best_wpm,
       ROUND(AVG(r.accuracy)) AS avg_accuracy,
       COUNT(r.id) AS races
     FROM typebattle_results r
     LEFT JOIN typebattle_users u ON u.id = r.user_id
     GROUP BY u.id, u.display_name, u.username, r.guest_name
     ORDER BY best_wpm DESC, races DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

async function getUserStats(userId) {
  if (!db.isEnabled()) {
    return {
      races: 0,
      best_wpm: 0,
      avg_wpm: 0,
      avg_accuracy: 0,
    };
  }
  const result = await db.query(
    `SELECT
       COUNT(*) AS races,
       MAX(wpm) AS best_wpm,
       ROUND(AVG(wpm)) AS avg_wpm,
       ROUND(AVG(accuracy)) AS avg_accuracy
     FROM typebattle_results
     WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0];
}

module.exports = {
  registerUser,
  loginUser,
  profileLogin,
  changePassword,
  searchProfilesWithAccounts,
  getUserByToken,
  logoutUser,
  saveMatchResults,
  getLeaderboard,
  getUserStats,
  getQuotes,
  getQuoteById,
  searchQuotes,
  addQuote,
  getQuoteText,
  getRandomQuote,
};
