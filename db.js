const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const file = process.env.DB_PATH || path.join(__dirname, 'data', 'app.db');
fs.mkdirSync(path.dirname(file), { recursive: true });

const db = new Database(file);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  google_id TEXT UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('freelancer','client','admin')),
  phone TEXT DEFAULT '',
  free_used INTEGER NOT NULL DEFAULT 0,
  credits INTEGER NOT NULL DEFAULT 0,
  premium INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT UNIQUE,
  headline TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  skills TEXT DEFAULT '',
  category TEXT DEFAULT '',
  rate TEXT DEFAULT '',
  location TEXT DEFAULT '',
  company TEXT DEFAULT '',
  website TEXT DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT DEFAULT '',
  skills TEXT DEFAULT '',
  budget TEXT DEFAULT '',
  location TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requirement_id INTEGER REFERENCES requirements(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  paid_with TEXT NOT NULL DEFAULT 'free',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (from_user, to_user)
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  amount INTEGER NOT NULL,
  credits INTEGER NOT NULL DEFAULT 0,
  order_id TEXT UNIQUE,
  payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_req_status ON requirements(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_to ON contacts(to_user);
CREATE INDEX IF NOT EXISTS idx_contacts_from ON contacts(from_user);
`);

module.exports = db;
