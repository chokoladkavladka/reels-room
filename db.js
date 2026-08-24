// db.js — единая SQLite база через встроенный в Node модуль node:sqlite.
// Не требует нативной компиляции при установке (в отличие от better-sqlite3),
// поэтому надёжно собирается на бесплатных хостингах вроде Render.
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.sqlite');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  pin TEXT NOT NULL,
  avatar_seed TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  shortcode TEXT,
  cover_url TEXT,
  caption TEXT,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  posted_at TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'ok',
  source TEXT NOT NULL DEFAULT 'demo'
);

CREATE INDEX IF NOT EXISTS idx_reels_user ON reels(user_id);
`);

module.exports = db;
