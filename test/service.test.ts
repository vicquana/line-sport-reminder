import { describe, expect, it } from "vitest";
import { buildStartConfirmation, ROUND_INTERVAL_MINUTES } from "../src/service";
import type { GroupRow } from "../src/types";

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
