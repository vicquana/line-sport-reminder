import type { GroupRow, ParticipantRow, RoundRow } from "./types";

export type GroupDefaults = {
  timezone: string;
  activeStart: string;
  activeEnd: string;
};

export type RoundStatus = {
  total: number;
  completed: number;
  skipped: number;
  pending: number;
};

export class Repository {
  constructor(private readonly db: D1Database) {}

  async rememberWebhookEvent(webhookEventId: string, now: number): Promise<boolean> {
    const result = await this.db
      .prepare(
        "INSERT OR IGNORE INTO webhook_events (webhook_event_id, received_at) VALUES (?1, ?2)",
      )
      .bind(webhookEventId, now)
      .run();
    return (result.meta.changes ?? 0) === 1;
  }

  async forgetWebhookEvent(webhookEventId: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM webhook_events WHERE webhook_event_id = ?1")
      .bind(webhookEventId)
      .run();
  }

  async ensureGroup(groupId: string, defaults: GroupDefaults, now: number): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO groups (
          group_id, timezone, active_start, active_end, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
        ON CONFLICT(group_id) DO UPDATE SET updated_at = excluded.updated_at`,
      )
      .bind(groupId, defaults.timezone, defaults.activeStart, defaults.activeEnd, now)
      .run();
  }

  async getGroup(groupId: string): Promise<GroupRow | null> {
    return this.db
      .prepare("SELECT * FROM groups WHERE group_id = ?1")
      .bind(groupId)
      .first<GroupRow>();
  }

  async listDueGroups(now: number): Promise<GroupRow[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM groups
         WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?1
         ORDER BY next_run_at ASC`,
      )
      .bind(now)
      .all<GroupRow>();
    return result.results;
  }

  async claimNextRound(group: GroupRow, nextRunAt: number, now: number): Promise<boolean> {
    if (group.next_run_at === null) return false;

    const result = await this.db
      .prepare(
        `UPDATE groups
         SET next_run_at = ?1, updated_at = ?2
         WHERE group_id = ?3 AND enabled = 1 AND next_run_at = ?4`,
      )
      .bind(nextRunAt, now, group.group_id, group.next_run_at)
      .run();
    return (result.meta.changes ?? 0) === 1;
  }

  async enableGroup(groupId: string, userId: string, now: number): Promise<"enabled" | "forbidden"> {
    const result = await this.db
      .prepare(
        `UPDATE groups
         SET admin_user_id = COALESCE(admin_user_id, ?1), enabled = 1,
             next_run_at = ?2, updated_at = ?2
         WHERE group_id = ?3 AND (admin_user_id IS NULL OR admin_user_id = ?1)`,
      )
      .bind(userId, now, groupId)
      .run();
    return (result.meta.changes ?? 0) === 1 ? "enabled" : "forbidden";
  }

  async pauseGroup(groupId: string, userId: string, now: number): Promise<"paused" | "forbidden"> {
    const result = await this.db
      .prepare(
        `UPDATE groups
         SET enabled = 0, next_run_at = NULL, updated_at = ?1
         WHERE group_id = ?2 AND admin_user_id = ?3`,
      )
      .bind(now, groupId, userId)
      .run();
    if ((result.meta.changes ?? 0) !== 1) return "forbidden";
    await this.db
      .prepare("UPDATE rounds SET status = 'closed' WHERE group_id = ?1 AND status = 'open'")
      .bind(groupId)
      .run();
    return "paused";
  }

  async disableGroup(groupId: string, now: number): Promise<void> {
    await this.db.batch([
      this.db
        .prepare(
          "UPDATE groups SET enabled = 0, next_run_at = NULL, updated_at = ?1 WHERE group_id = ?2",
        )
        .bind(now, groupId),
      this.db
        .prepare("UPDATE rounds SET status = 'closed' WHERE group_id = ?1 AND status = 'open'")
        .bind(groupId),
    ]);
  }

  async upsertParticipant(
    groupId: string,
    userId: string,
    displayName: string,
    now: number,
  ): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO participants (
          group_id, user_id, display_name, active, joined_at, updated_at
        ) VALUES (?1, ?2, ?3, 1, ?4, ?4)
        ON CONFLICT(group_id, user_id) DO UPDATE SET
          display_name = excluded.display_name,
          active = 1,
          updated_at = excluded.updated_at`,
      )
      .bind(groupId, userId, displayName, now)
      .run();
  }

  async deactivateParticipant(groupId: string, userId: string, now: number): Promise<void> {
    await this.db
      .prepare(
        `UPDATE participants SET active = 0, updated_at = ?1
         WHERE group_id = ?2 AND user_id = ?3`,
      )
      .bind(now, groupId, userId)
      .run();
  }

  async deactivateParticipants(groupId: string, userIds: string[], now: number): Promise<void> {
    if (userIds.length === 0) return;
    const statements = userIds.map((userId) =>
      this.db
        .prepare(
          `UPDATE participants SET active = 0, updated_at = ?1
           WHERE group_id = ?2 AND user_id = ?3`,
        )
        .bind(now, groupId, userId),
    );
    await this.db.batch(statements);
  }

  async listActiveParticipants(groupId: string): Promise<ParticipantRow[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM participants
         WHERE group_id = ?1 AND active = 1
         ORDER BY joined_at ASC`,
      )
      .bind(groupId)
      .all<ParticipantRow>();
    return result.results;
  }

  async listPendingParticipants(roundId: string, groupId: string): Promise<ParticipantRow[]> {
    const result = await this.db
      .prepare(
        `SELECT p.* FROM participants p
         LEFT JOIN responses r ON r.round_id = ?1 AND r.user_id = p.user_id
         WHERE p.group_id = ?2 AND p.active = 1 AND r.user_id IS NULL
         ORDER BY p.joined_at ASC`,
      )
      .bind(roundId, groupId)
      .all<ParticipantRow>();
    return result.results;
  }

  async createRound(round: RoundRow): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO rounds (
          round_id, group_id, started_at, closes_at, reminder_stage, status, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      )
      .bind(
        round.round_id,
        round.group_id,
        round.started_at,
        round.closes_at,
        round.reminder_stage,
        round.status,
        round.created_at,
      )
      .run();
  }

  async getRound(roundId: string, groupId: string): Promise<RoundRow | null> {
    return this.db
      .prepare("SELECT * FROM rounds WHERE round_id = ?1 AND group_id = ?2")
      .bind(roundId, groupId)
      .first<RoundRow>();
  }

  async getLatestOpenRound(groupId: string, now: number): Promise<RoundRow | null> {
    return this.db
      .prepare(
        `SELECT * FROM rounds
         WHERE group_id = ?1 AND status = 'open' AND closes_at > ?2
         ORDER BY started_at DESC LIMIT 1`,
      )
      .bind(groupId, now)
      .first<RoundRow>();
  }

  async listOpenRounds(): Promise<RoundRow[]> {
    const result = await this.db
      .prepare("SELECT * FROM rounds WHERE status = 'open' ORDER BY started_at ASC")
      .all<RoundRow>();
    return result.results;
  }

  async claimReminder(roundId: string, previousStage: number, nextStage: number): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE rounds SET reminder_stage = ?1
         WHERE round_id = ?2 AND status = 'open' AND reminder_stage = ?3`,
      )
      .bind(nextStage, roundId, previousStage)
      .run();
    return (result.meta.changes ?? 0) === 1;
  }

  async closeRound(roundId: string): Promise<void> {
    await this.db
      .prepare("UPDATE rounds SET status = 'closed' WHERE round_id = ?1")
      .bind(roundId)
      .run();
  }

  async recordResponse(
    roundId: string,
    groupId: string,
    userId: string,
    status: "completed" | "skipped",
    now: number,
  ): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO responses (round_id, group_id, user_id, status, responded_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(round_id, user_id) DO UPDATE SET
           status = CASE
             WHEN responses.status = 'completed' THEN 'completed'
             ELSE excluded.status
           END,
           responded_at = excluded.responded_at`,
      )
      .bind(roundId, groupId, userId, status, now)
      .run();
  }

  async getRoundStatus(roundId: string, groupId: string): Promise<RoundStatus> {
    const row = await this.db
      .prepare(
        `SELECT
           COUNT(DISTINCT p.user_id) AS total,
           COUNT(DISTINCT CASE WHEN r.status = 'completed' THEN p.user_id END) AS completed,
           COUNT(DISTINCT CASE WHEN r.status = 'skipped' THEN p.user_id END) AS skipped
         FROM participants p
         LEFT JOIN responses r ON r.round_id = ?1 AND r.user_id = p.user_id
         WHERE p.group_id = ?2 AND p.active = 1`,
      )
      .bind(roundId, groupId)
      .first<{ total: number; completed: number; skipped: number }>();

    const total = Number(row?.total ?? 0);
    const completed = Number(row?.completed ?? 0);
    const skipped = Number(row?.skipped ?? 0);
    return { total, completed, skipped, pending: Math.max(0, total - completed - skipped) };
  }
}
