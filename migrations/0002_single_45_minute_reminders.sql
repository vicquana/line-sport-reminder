-- The product now sends one main reminder every 45 minutes and no follow-up mentions.
UPDATE groups
SET interval_minutes = 45,
    reminder_interval_minutes = 45,
    max_reminders = 0;

-- Keep only the newest open round before adding the database-level invariant.
UPDATE rounds
SET status = 'closed'
WHERE rounds.status = 'open'
  AND EXISTS (
    SELECT 1
    FROM rounds AS newer
    WHERE newer.group_id = rounds.group_id
      AND newer.status = 'open'
      AND (
        newer.started_at > rounds.started_at
        OR (newer.started_at = rounds.started_at AND newer.round_id > rounds.round_id)
      )
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_rounds_one_open_per_group
  ON rounds(group_id)
  WHERE status = 'open';
