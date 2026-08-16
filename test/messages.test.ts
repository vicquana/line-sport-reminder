import { describe, expect, it } from "vitest";
import { buildRoundMessages, CARD_PRIMARY_COLOR } from "../src/messages";

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );

  if (!channels || channels.length !== 3) throw new Error(`Invalid hex color: ${hex}`);
  const [red = 0, green = 0, blue = 0] = channels;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe("buildRoundMessages", () => {
  it("建立 @All 與兩按鈕 Flex Message", () => {
    const messages = buildRoundMessages("round-1", "10:15");
    const cardJson = JSON.stringify(messages[1]);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.type).toBe("textV2");
    expect(messages[1]?.type).toBe("flex");
    expect(cardJson).toContain("action=done");
    expect(cardJson).toContain("action=skip");
    expect(cardJson).toContain(CARD_PRIMARY_COLOR);
    expect(cardJson).not.toContain("兩次提醒");
  });

  it("主要綠色與白色文字符合 WCAG AA 對比", () => {
    expect(contrastRatio(CARD_PRIMARY_COLOR, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });
});
