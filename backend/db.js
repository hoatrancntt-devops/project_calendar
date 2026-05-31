const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'calendar.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id            TEXT PRIMARY KEY,
    company_name  TEXT NOT NULL,
    tenant_id     TEXT DEFAULT '',
    client_id     TEXT DEFAULT '',
    client_secret TEXT DEFAULT '',
    sync_mailboxes TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS events (
    id             TEXT NOT NULL,
    company_id     TEXT NOT NULL,
    mailbox        TEXT DEFAULT '',
    title          TEXT DEFAULT '',
    date           TEXT DEFAULT '',
    time           TEXT DEFAULT '',
    type           TEXT DEFAULT 'offline',
    location       TEXT DEFAULT '',
    room           TEXT DEFAULT '',
    attendees      TEXT DEFAULT '',
    attendee_count INTEGER DEFAULT 0,
    organizer      TEXT DEFAULT '',
    organizer_name TEXT DEFAULT '',
    status         TEXT DEFAULT 'confirmed',
    synced_at      TEXT DEFAULT '',
    PRIMARY KEY (id, company_id)
  );

  CREATE TABLE IF NOT EXISTS smtp_config (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    host       TEXT DEFAULT '',
    port       INTEGER DEFAULT 587,
    secure     INTEGER DEFAULT 0,
    auth_user  TEXT DEFAULT '',
    password   TEXT DEFAULT '',
    from_name  TEXT DEFAULT '',
    from_email TEXT DEFAULT ''
  );

  INSERT OR IGNORE INTO smtp_config (id) VALUES (1);

  -- Global app settings stored as a JSON blob (single row)
  CREATE TABLE IF NOT EXISTS app_settings (
    id    INTEGER PRIMARY KEY CHECK (id = 1),
    data  TEXT DEFAULT '{}'
  );

  INSERT OR IGNORE INTO app_settings (id) VALUES (1);

  -- App users (credentials + permissions)
  CREATE TABLE IF NOT EXISTS app_users (
    id                  TEXT PRIMARY KEY,
    email               TEXT NOT NULL,
    name                TEXT DEFAULT '',
    password            TEXT DEFAULT '',
    allowed_company_ids TEXT DEFAULT '[]',
    allowed_mailboxes   TEXT DEFAULT '{}'
  );
`);

// Graceful migrations
try { db.exec("ALTER TABLE companies ADD COLUMN expiry_alert_emails TEXT DEFAULT '[]'"); } catch {}
try { db.exec("ALTER TABLE companies ADD COLUMN api_expiration_date TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE companies ADD COLUMN color TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE companies ADD COLUMN logo TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE companies ADD COLUMN notify_emails TEXT DEFAULT '[]'"); } catch {}
try { db.exec("ALTER TABLE events ADD COLUMN notified INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE events ADD COLUMN mailbox TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE events ADD COLUMN organizer_name TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE events ADD COLUMN attendee_count INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE events ADD COLUMN room TEXT DEFAULT ''"); } catch {}

module.exports = db;
