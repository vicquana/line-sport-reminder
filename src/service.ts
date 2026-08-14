import { parseCommand, parsePostback } from "./commands";
import { LineClient } from "./line";
import { buildRoundMessages, HELP_TEXT } from "./messages";
import { Repository, type GroupDefaults } from "./repository";
import { formatTimeInTimezone, isInsideActiveWindow } from "./time";
import type { GroupRow, GroupSource, LineEvent, RoundRow, TextMessage } from "./types";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
export const ROUND_INTERVAL_MINUTES = 45;
const ROUND_INTERVAL_MS = ROUND_INTERVAL_MINUTES * 60 * 1000;

function textMessage(text: string): TextMessage {
  return { type: "text", text };
}

function isGroupSource(source: LineEvent["source"]): source is GroupSource {
  return source.type === "group";
}

export function buildStartConfirmation(group: GroupRow, now: number): string {
  const insideActiveWindow = isInsideActiveWindow(
    new Date(now),
    group.timezone,
    group.active_start,
    group.active_end,
  );
  if (insideActiveWindow) {
    return "▶️ 提醒已啟用。你是本群管理者；第一輪會在下一次排程檢查時送出（最多約 5 分鐘）。";
  }

  const timezoneLabel = group.timezone === "Asia/Taipei" ? "台灣時間" : group.timezone;
  return `▶️ 提醒已啟用。你是本群管理者；目前不在${timezoneLabel} ${group.active_start}–${group.active_end} 的提醒時段，進入時段後約 5 分鐘內開始第一輪。`;
}

export class BotService {
  constructor(
    private readonly repository: Repository,
    private readonly line: LineClient,
    private readonly defaults: GroupDefaults,
  ) {}

  async handleEvent(event: LineEvent): Promise<void> {
    const now = Date.now();
    const claimed = await this.repository.rememberWebhookEvent(event.webhookEventId, now);
    if (!claimed) return;

    try {
      if (!isGroupSource(event.source)) return;

      const { groupId } = event.source;
      await this.repository.ensureGroup(groupId, this.defaults, now);

      switch (event.type) {
        case "join":
          await this.replyText(
            event.replyToken,
            "👋 活動提醒 Bot 已加入！\n\n請輸入「參加」加入提醒名單。第一位輸入「開始提醒」的人會成為本群管理者。\n\n" +
              HELP_TEXT,
          );
          break;
        case "leave":
          await this.repository.disableGroup(groupId, now);
          break;
        case "memberJoined":
          await this.replyText(event.replyToken, "歡迎加入！想收到活動提醒，請輸入「參加」。");
          break;
        case "memberLeft": {
          const userIds =
            event.left?.members
              .filter((member): member is { type: "user"; userId: string } => member.type === "user")
              .map((member) => member.userId) ?? [];
          await this.repository.deactivateParticipants(groupId, userIds, now);
          await this.repository.releaseAdminIfLeft(groupId, userIds, now);
          break;
        }
        case "message":
          await this.handleMessage(event, groupId, now);
          break;
        case "postback":
          await this.handlePostback(event, groupId, now);
          break;
        default:
          break;
      }
    } catch (error) {
      await this.repository.forgetWebhookEvent(event.webhookEventId);
      throw error;
    }
  }

  async runScheduler(now: number): Promise<void> {
    await this.repository.closeInactiveOrExpiredRounds(now);
    const dueGroups = await this.repository.listDueGroups(now);

    for (const group of dueGroups) {
      let claimedNextRunAt: number | null = null;
      try {
        const insideActiveWindow = isInsideActiveWindow(
          new Date(now),
          group.timezone,
          group.active_start,
          group.active_end,
        );
        const nextRunAt = insideActiveWindow
          ? now + ROUND_INTERVAL_MS
          : now + FIVE_MINUTES_MS;
        const claimed = await this.repository.claimNextRound(group, nextRunAt, now);
        if (!claimed) continue;
        claimedNextRunAt = nextRunAt;

        if (insideActiveWindow) {
          await this.createRound(group, now);
        }
      } catch (error) {
        if (claimedNextRunAt !== null) {
          await this.repository.rescheduleClaimedNextRound(
            group.group_id,
            claimedNextRunAt,
            now + FIVE_MINUTES_MS,
            now,
          );
        }
        console.error(
          JSON.stringify({
            event: "scheduled_group_failed",
            groupId: group.group_id,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }
  }

  private async handleMessage(event: LineEvent, groupId: string, now: number): Promise<void> {
    if (event.message?.type !== "text" || !event.message.text || !event.source.userId) return;

    const userId = event.source.userId;
    const command = parseCommand(event.message.text);

    switch (command) {
      case "join":
        await this.registerParticipant(groupId, userId, now);
        await this.replyText(event.replyToken, "✅ 已加入提醒名單！下一輪開始時會一起提醒你。");
        break;
      case "leave":
        await this.repository.deactivateParticipant(groupId, userId, now);
        await this.replyText(event.replyToken, "已退出提醒名單。之後輸入「參加」即可重新加入。");
        break;
      case "done":
      case "skip":
        await this.registerParticipant(groupId, userId, now);
        await this.recordCurrentResponse(
          event,
          groupId,
          userId,
          command === "done" ? "completed" : "skipped",
          now,
        );
        break;
      case "start": {
        await this.registerParticipant(groupId, userId, now);
        const result = await this.repository.enableGroup(groupId, userId, now);
        const group = result === "enabled" ? await this.repository.getGroup(groupId) : null;
        await this.replyText(
          event.replyToken,
          result === "enabled" && group
            ? buildStartConfirmation(group, now)
            : "只有本群提醒管理者可以開始排程。",
        );
        break;
      }
      case "pause": {
        const result = await this.repository.pauseGroup(groupId, userId, now);
        await this.replyText(
          event.replyToken,
          result === "paused" ? "⏸️ 已暫停後續提醒。" : "只有本群提醒管理者可以暫停排程。",
        );
        break;
      }
      case "status":
        await this.sendStatus(event.replyToken, groupId, now);
        break;
      case "remind-now":
        await this.handleRemindNow(event, groupId, userId, now);
        break;
      case "help":
        await this.replyText(event.replyToken, HELP_TEXT);
        break;
      case "unknown":
        break;
    }
  }

  private async handlePostback(event: LineEvent, groupId: string, now: number): Promise<void> {
    if (!event.source.userId || !event.postback) return;
    const parsed = parsePostback(event.postback.data);
    if (!parsed) return;

    const userId = event.source.userId;
    await this.registerParticipant(groupId, userId, now);
    await this.recordResponse(
      event.replyToken,
      parsed.roundId,
      groupId,
      userId,
      parsed.action === "done" ? "completed" : "skipped",
      now,
    );
  }

  private async registerParticipant(groupId: string, userId: string, now: number): Promise<void> {
    const profile = await this.line.getGroupMemberProfile(groupId, userId);
    const fallbackName = `成員 ${userId.slice(-6)}`;
    await this.repository.upsertParticipant(groupId, userId, profile?.displayName ?? fallbackName, now);
  }

  private async recordCurrentResponse(
    event: LineEvent,
    groupId: string,
    userId: string,
    status: "completed" | "skipped",
    now: number,
  ): Promise<void> {
    const round = await this.repository.getLatestOpenRound(groupId, now);
    if (!round) {
      await this.replyText(event.replyToken, "目前沒有進行中的活動回合。");
      return;
    }
    await this.recordResponse(event.replyToken, round.round_id, groupId, userId, status, now);
  }

  private async recordResponse(
    replyToken: string | undefined,
    roundId: string,
    groupId: string,
    userId: string,
    status: "completed" | "skipped",
    now: number,
  ): Promise<void> {
    const round = await this.repository.getRound(roundId, groupId);
    if (!round || round.status !== "open" || round.closes_at <= now) {
      await this.replyText(replyToken, "這一輪已經結束，請等待下一輪提醒。");
      return;
    }

    await this.repository.recordResponse(roundId, groupId, userId, status, now);
    const summary = await this.repository.getRoundStatus(roundId, groupId);
    const message =
      status === "completed"
        ? `✅ 已記錄完成！本輪 ${summary.completed}/${summary.total} 人完成。`
        : "⏭ 已跳過本輪；下一個 45 分鐘回合仍會正常提醒。";
    await this.replyText(replyToken, message);
  }

  private async handleRemindNow(
    event: LineEvent,
    groupId: string,
    userId: string,
    now: number,
  ): Promise<void> {
    const group = await this.repository.getGroup(groupId);
    if (!group || group.admin_user_id !== userId) {
      await this.replyText(event.replyToken, "只有本群提醒管理者可以立即發起活動。");
      return;
    }

    if (!group.enabled) {
      await this.replyText(event.replyToken, "排程目前已暫停；請先輸入「開始提醒」，再使用立即提醒。");
      return;
    }

    const currentRound = await this.repository.getLatestOpenRound(groupId, now);
    if (currentRound) {
      await this.replyText(event.replyToken, "目前已有進行中的活動回合。");
      return;
    }

    const created = await this.createRound(group, now);
    if (created === "no-participants") {
      await this.replyText(event.replyToken, "目前還沒有參加者，請先請成員輸入「參加」。");
    } else if (created === "already-open") {
      await this.replyText(event.replyToken, "目前已有進行中的活動回合。");
    }
  }

  private async createRound(
    group: GroupRow,
    now: number,
  ): Promise<"created" | "already-open" | "no-participants"> {
    await this.repository.closeExpiredRoundsForGroup(group.group_id, now);
    const existingRound = await this.repository.getLatestOpenRound(group.group_id, now);
    if (existingRound) return "already-open";

    const participants = await this.repository.listActiveParticipants(group.group_id);
    if (participants.length === 0) return "no-participants";

    const roundId = crypto.randomUUID();
    const closesAt = now + ROUND_INTERVAL_MS;
    const round: RoundRow = {
      round_id: roundId,
      group_id: group.group_id,
      started_at: now,
      closes_at: closesAt,
      reminder_stage: 0,
      status: "open",
      created_at: now,
    };

    const inserted = await this.repository.createRound(round);
    if (!inserted) return "already-open";
    try {
      const closesAtLabel = formatTimeInTimezone(closesAt, group.timezone);
      await this.line.push(group.group_id, buildRoundMessages(roundId, closesAtLabel), roundId);
      return "created";
    } catch (error) {
      await this.repository.closeRound(roundId);
      throw error;
    }
  }

  private async sendStatus(replyToken: string | undefined, groupId: string, now: number): Promise<void> {
    const group = await this.repository.getGroup(groupId);
    const participants = await this.repository.listActiveParticipants(groupId);
    const round = await this.repository.getLatestOpenRound(groupId, now);

    if (!round) {
      await this.replyText(
        replyToken,
        `目前沒有進行中的回合。\n參加者：${participants.length} 人\n排程：${group?.enabled ? "執行中" : "已暫停"}`,
      );
      return;
    }

    const status = await this.repository.getRoundStatus(round.round_id, groupId);
    await this.replyText(
      replyToken,
      `📊 本輪狀態\n完成：${status.completed}\n跳過：${status.skipped}\n尚未回覆：${status.pending}\n參加者：${status.total}`,
    );
  }

  private async replyText(replyToken: string | undefined, text: string): Promise<void> {
    if (!replyToken) return;
    await this.line.reply(replyToken, [textMessage(text)]);
  }
}
