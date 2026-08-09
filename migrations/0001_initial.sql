PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS groups (
  group_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  admin_user_id TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
  active_start TEXT NOT NULL DEFAULT '09:00',
  active_end TEXT NOT NULL DEFAULT '18:00',
  interval_minutes INTEGER NOT NULL DEFAULT 45 CHECK (interval_minutes BETWEEN 15 AND 240),
  reminder_interval_minutes INTEGER NOT NULL DEFAULT 5 CHECK (reminder_interval_minutes BETWEEN 1 AND 60),
  max_reminders INTEGER NOT NULL DEFAULT 2 CHECK (max_reminders BETWEEN 0 AND 5),
  next_run_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS participants (
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  joined_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id),
  FOREIGN KEY (group_id) REFERENCES groups(group_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rounds (
  round_id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  closes_at INTEGER NOT NULL,
  reminder_stage INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (group_id) REFERENCES groups(group_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS responses (
  round_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('completed', 'skipped')),
  responded_at INTEGER NOT NULL,
  PRIMARY KEY (round_id, user_id),
  FOREIGN KEY (round_id) REFERENCES rounds(round_id) ON DELETE CASCADE,
  FOREIGN KEY (group_id, user_id) REFERENCES participants(group_id, user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS webhook_events (
  webhook_event_id TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_groups_due
  ON groups(enabled, next_run_at);

CREATE INDEX IF NOT EXISTS idx_rounds_open
  ON rounds(status, started_at);

CREATE INDEX IF NOT EXISTS idx_participants_active
  ON participants(group_id, active);

CREATE INDEX IF NOT EXISTS idx_responses_group_round
  ON responses(group_id, round_id, status);
