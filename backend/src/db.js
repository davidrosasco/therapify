const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbFile =
  process.env.DATABASE_FILE ||
  path.join(__dirname, '..', 'data', 'therapify.db');

const dataDir = path.dirname(dbFile);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbFile);

function migrate() {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      default_institution_id INTEGER,
      clinical_history TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS institutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      commission_percent REAL NOT NULL DEFAULT 0,
      is_default_particular INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      position INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, position),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      patient_id INTEGER NOT NULL,
      institution_id INTEGER,
      rate_id INTEGER NOT NULL,
      date_time DATETIME NOT NULL,
      mode TEXT NOT NULL, -- 'PARTICULAR' | 'INSTITUTION'
      is_paid INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY (institution_id) REFERENCES institutions(id),
      FOREIGN KEY (rate_id) REFERENCES rates(id)
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

function ensureDefaultDataForUser(userId) {
  const existingParticular = db
    .prepare(
      'SELECT id FROM institutions WHERE user_id = ? AND is_default_particular = 1'
    )
    .get(userId);

  if (!existingParticular) {
    db.prepare(
      `INSERT INTO institutions (user_id, name, commission_percent, is_default_particular)
       VALUES (?, ?, ?, 1)`
    ).run(userId, 'Particular (0%)', 0);
  }

  const existingRates = db
    .prepare('SELECT COUNT(*) as count FROM rates WHERE user_id = ?')
    .get(userId);

  if (existingRates.count === 0) {
    const insertRate = db.prepare(
      'INSERT INTO rates (user_id, name, amount, position) VALUES (?, ?, ?, ?)'
    );
    insertRate.run(userId, 'Tarifa 1', 0, 1);
    insertRate.run(userId, 'Tarifa 2', 0, 2);
    insertRate.run(userId, 'Tarifa 3', 0, 3);
  }
}

migrate();

module.exports = {
  db,
  ensureDefaultDataForUser,
};

