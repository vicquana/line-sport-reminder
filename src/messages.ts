import type { FlexMessage, LineMessage, TextV2Message } from "./types";

export const CARD_PRIMARY_COLOR = "#15803D";

export const HELP_TEXT = [
  "🏃 活動提醒 Bot 指令",
  "參加：加入活動名單",
  "退出：離開活動名單",
  "OK／完成：完成目前回合",
  "跳過：記錄本輪跳過",
  "狀態：查看目前完成情況",
  "",
  "管理者指令：開始提醒、暫停提醒、立即提醒",
].join("\n");

export function buildRoundMessages(roundId: string, closesAtLabel: string): LineMessage[] {
  const announce: TextV2Message = {
    type: "textV2",
    text: "{everyone} 活動時間！站起來動一動吧 💪",
    substitution: {
      everyone: {
        type: "mention",
        mentionee: { type: "all" },
      },
    },
  };

  const card: FlexMessage = {
    type: "flex",
    altText: `活動時間：完成 10 下深蹲並喝水，${closesAtLabel} 前回覆`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: CARD_PRIMARY_COLOR,
        paddingAll: "20px",
        contents: [
          {
            type: "text",
            text: "45 分鐘活動提醒",
            color: "#FFFFFF",
            weight: "bold",
            size: "xl",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "20px",
        contents: [
          { type: "text", text: "🏋️ 做 10 下深蹲", weight: "bold", size: "lg" },
          { type: "text", text: "💧 喝一杯水", size: "lg" },
          {
            type: "text",
            text: `${closesAtLabel} 前完成；下一輪會在約 45 分鐘後提醒。`,
            color: "#6B7280",
            size: "sm",
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "md",
        paddingAll: "16px",
        contents: [
          {
            type: "button",
            style: "primary",
            color: CARD_PRIMARY_COLOR,
            height: "sm",
            action: {
              type: "postback",
              label: "✅ 完成",
              data: `action=done&round_id=${encodeURIComponent(roundId)}`,
              displayText: "✅ 完成",
            },
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            action: {
              type: "postback",
              label: "⏭ 本輪跳過",
              data: `action=skip&round_id=${encodeURIComponent(roundId)}`,
              displayText: "⏭ 本輪跳過",
            },
          },
        ],
      },
    },
  };

  return [announce, card];
}
