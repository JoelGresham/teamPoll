const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure db directory exists
const dbDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(path.join(dbDir, 'polls.db'));

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS poll_sessions (
      session_id TEXT PRIMARY KEY,
      admin_password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'active', 'completed')),
      current_question_index INTEGER DEFAULT -1,
      poll_name TEXT,
      is_rerun INTEGER DEFAULT 0,
      original_poll_id TEXT
    );

    CREATE TABLE IF NOT EXISTS questions (
      question_id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      question_index INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      question_type TEXT NOT NULL CHECK(question_type IN ('multiple_choice', 'yes_no', 'rating', 'text')),
      options TEXT, -- JSON array for multiple choice
      scale_min INTEGER,
      scale_max INTEGER,
      FOREIGN KEY (session_id) REFERENCES poll_sessions(session_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS responses (
      response_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      question_id INTEGER NOT NULL,
      answer TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES poll_sessions(session_id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES questions(question_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_responses_session ON responses(session_id);
    CREATE INDEX IF NOT EXISTS idx_responses_question ON responses(question_id);
    CREATE INDEX IF NOT EXISTS idx_questions_session ON questions(session_id);
  `);

  // Migration: Add poll_name and is_rerun columns if they don't exist
  try {
    db.prepare('ALTER TABLE poll_sessions ADD COLUMN poll_name TEXT').run();
    console.log('Added poll_name column to poll_sessions table');
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.prepare('ALTER TABLE poll_sessions ADD COLUMN is_rerun INTEGER DEFAULT 0').run();
    console.log('Added is_rerun column to poll_sessions table');
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.prepare('ALTER TABLE poll_sessions ADD COLUMN original_poll_id TEXT').run();
    console.log('Added original_poll_id column to poll_sessions table');
  } catch (e) {
    // Column already exists, ignore
  }

  // Auto-delete old polls (older than 30 days)
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  db.prepare('DELETE FROM poll_sessions WHERE created_at < ? AND status = ?')
    .run(thirtyDaysAgo, 'completed');
}

initDatabase();

module.exports = db;
