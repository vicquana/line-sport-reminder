import { describe, expect, it } from "vitest";
import { parseCommand, parsePostback } from "../src/commands";

describe("parseCommand", () => {
  it("接受常用的完成文字", () => {
    expect(parseCommand(" OK ")).toBe("done");
    expect(parseCommand("完成")).toBe("done");
    expect(parseCommand("done")).toBe("done");
  });

  it("不回應一般群組聊天", () => {
    expect(parseCommand("今天午餐吃什麼？")).toBe("unknown");
  });
});

describe("parsePostback", () => {
  it("解析完成與跳過按鈕", () => {
    expect(parsePostback("action=done&round_id=round-1")).toEqual({
      action: "done",
      roundId: "round-1",
    });
    expect(parsePostback("action=skip&round_id=round-2")).toEqual({
      action: "skip",
      roundId: "round-2",
    });
  });

  it("拒絕未知 postback", () => {
    expect(parsePostback("action=delete&round_id=round-1")).toBeNull();
    expect(parsePostback("action=done")).toBeNull();
  });
});
