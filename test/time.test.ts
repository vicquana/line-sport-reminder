import { describe, expect, it } from "vitest";
import { isInsideActiveWindow, timeToMinutes } from "../src/time";

describe("timeToMinutes", () => {
  it("轉換 HH:mm", () => {
    expect(timeToMinutes("09:30")).toBe(570);
  });

  it("拒絕不合法時間", () => {
    expect(() => timeToMinutes("25:00")).toThrow();
  });
});

describe("isInsideActiveWindow", () => {
  it("支援一般日間時段", () => {
    const taipei10am = new Date("2026-08-08T02:00:00.000Z");
    expect(isInsideActiveWindow(taipei10am, "Asia/Taipei", "09:00", "18:00")).toBe(true);
    expect(isInsideActiveWindow(taipei10am, "Asia/Taipei", "11:00", "18:00")).toBe(false);
  });

  it("支援跨午夜時段", () => {
    const taipei1am = new Date("2026-08-07T17:00:00.000Z");
    expect(isInsideActiveWindow(taipei1am, "Asia/Taipei", "22:00", "06:00")).toBe(true);
  });
});
