import { describe, expect, it, vi } from "vitest";
import { LineClient } from "../src/line";
import { Repository } from "../src/repository";
import { buildStartConfirmation, ROUND_INTERVAL_MINUTES } from "../src/service";
import { BotService } from "../src/service";
import type { GroupRow, LineEvent, ParticipantRow } from "../src/types";

const group: GroupRow = {
  group_id: "C123",
  enabled: 1,
  admin_user_id: "U123",
  timezone: "Asia/Taipei",
  active_start: "09:00",
  active_end: "18:00",
  interval_minutes: 45,
  reminder_interval_minutes: 45,
  max_reminders: 0,
  next_run_at: null,
  created_at: 0,
  updated_at: 0,
};

describe("固定提醒設定", () => {
  it("只使用 45 分鐘主提醒間隔", () => {
    expect(ROUND_INTERVAL_MINUTES).toBe(45);
  });

  it("提醒時段內說明下一次排程檢查會送出", () => {
    const taipeiTenAm = Date.parse("2026-08-13T02:00:00Z");
    expect(buildStartConfirmation(group, taipeiTenAm)).toContain("最多約 5 分鐘");
  });

  it("提醒時段外不承諾五分鐘內送出", () => {
    const taipeiEightAm = Date.parse("2026-08-13T00:00:00Z");
    const message = buildStartConfirmation(group, taipeiEightAm);
    expect(message).toContain("目前不在台灣時間 09:00–18:00");
    expect(message).toContain("進入時段後約 5 分鐘內");
  });
});

describe("BotService 修正情境", () => {
  it("管理者離群時停用參加者並釋放管理權", async () => {
    const deactivateParticipants = vi.fn().mockResolvedValue(undefined);
    const releaseAdminIfLeft = vi.fn().mockResolvedValue(true);
    const repository = {
      rememberWebhookEvent: vi.fn().mockResolvedValue(true),
      ensureGroup: vi.fn().mockResolvedValue(undefined),
      deactivateParticipants,
      releaseAdminIfLeft,
    } as unknown as Repository;
    const service = new BotService(repository, {} as LineClient, {
      timezone: "Asia/Taipei",
      activeStart: "09:00",
      activeEnd: "18:00",
    });
    const event: LineEvent = {
      type: "memberLeft",
      timestamp: 0,
      webhookEventId: "event-1",
      source: { type: "group", groupId: "C123" },
      left: { members: [{ type: "user", userId: "U123" }] },
    };

    await service.handleEvent(event);

    expect(deactivateParticipants).toHaveBeenCalledWith("C123", ["U123"], expect.any(Number));
    expect(releaseAdminIfLeft).toHaveBeenCalledWith("C123", ["U123"], expect.any(Number));
  });

  it("排程暫停時拒絕立即提醒", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const repository = {
      rememberWebhookEvent: vi.fn().mockResolvedValue(true),
      ensureGroup: vi.fn().mockResolvedValue(undefined),
      getGroup: vi.fn().mockResolvedValue({ ...group, enabled: 0 }),
    } as unknown as Repository;
    const service = new BotService(repository, { reply } as unknown as LineClient, {
      timezone: "Asia/Taipei",
      activeStart: "09:00",
      activeEnd: "18:00",
    });
    const event: LineEvent = {
      type: "message",
      timestamp: 0,
      webhookEventId: "event-2",
      replyToken: "reply-2",
      source: { type: "group", groupId: "C123", userId: "U123" },
      message: { id: "message-2", type: "text", text: "立即提醒" },
    };

    await service.handleEvent(event);

    expect(reply).toHaveBeenCalledWith("reply-2", [
      expect.objectContaining({ text: expect.stringContaining("請先輸入「開始提醒」") }),
    ]);
  });

  it("主提醒最終送出失敗時改為五分鐘後再試", async () => {
    const now = Date.parse("2026-08-13T02:00:00Z");
    const participant: ParticipantRow = {
      group_id: "C123",
      user_id: "U123",
      display_name: "測試成員",
      active: 1,
      joined_at: now,
      updated_at: now,
    };
    const rescheduleClaimedNextRound = vi.fn().mockResolvedValue(undefined);
    const repository = {
      closeInactiveOrExpiredRounds: vi.fn().mockResolvedValue(undefined),
      listDueGroups: vi.fn().mockResolvedValue([{ ...group, next_run_at: now }]),
      claimNextRound: vi.fn().mockResolvedValue(true),
      closeExpiredRoundsForGroup: vi.fn().mockResolvedValue(undefined),
      getLatestOpenRound: vi.fn().mockResolvedValue(null),
      listActiveParticipants: vi.fn().mockResolvedValue([participant]),
      createRound: vi.fn().mockResolvedValue(true),
      closeRound: vi.fn().mockResolvedValue(undefined),
      rescheduleClaimedNextRound,
    } as unknown as Repository;
    const line = {
      push: vi.fn().mockRejectedValue(new Error("LINE unavailable")),
    } as unknown as LineClient;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const service = new BotService(repository, line, {
      timezone: "Asia/Taipei",
      activeStart: "09:00",
      activeEnd: "18:00",
    });

    await service.runScheduler(now);

    expect(rescheduleClaimedNextRound).toHaveBeenCalledWith(
      "C123",
      now + 45 * 60 * 1000,
      now + 5 * 60 * 1000,
      now,
    );
  });
});
