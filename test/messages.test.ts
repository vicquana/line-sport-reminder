import { describe, expect, it } from "vitest";
import { buildRoundMessages } from "../src/messages";

describe("buildRoundMessages", () => {
  it("建立 @All 與兩按鈕 Flex Message", () => {
    const messages = buildRoundMessages("round-1", "10:15");
    expect(messages).toHaveLength(2);
    expect(messages[0]?.type).toBe("textV2");
    expect(messages[1]?.type).toBe("flex");
    expect(JSON.stringify(messages[1])).toContain("action=done");
    expect(JSON.stringify(messages[1])).toContain("action=skip");
    expect(JSON.stringify(messages[1])).not.toContain("兩次提醒");
  });
});
