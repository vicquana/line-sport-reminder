import { describe, expect, it } from "vitest";
import { buildPendingMentionMessage, buildRoundMessages } from "../src/messages";

describe("buildRoundMessages", () => {
  it("建立 @All 與兩按鈕 Flex Message", () => {
    const messages = buildRoundMessages("round-1", "10:15");
    expect(messages).toHaveLength(2);
    expect(messages[0]?.type).toBe("textV2");
    expect(messages[1]?.type).toBe("flex");
    expect(JSON.stringify(messages[1])).toContain("action=done");
    expect(JSON.stringify(messages[1])).toContain("action=skip");
  });
});

describe("buildPendingMentionMessage", () => {
  it("建立指定成員 mention", () => {
    const message = buildPendingMentionMessage(["U1", "U2"], 1);
    expect(message.text).toContain("{member0}");
    expect(message.substitution.member1?.mentionee).toEqual({ type: "user", userId: "U2" });
  });

  it("限制 LINE 單則訊息最多 20 個 mention", () => {
    const userIds = Array.from({ length: 21 }, (_, index) => `U${index}`);
    expect(() => buildPendingMentionMessage(userIds, 1)).toThrow();
  });
});
