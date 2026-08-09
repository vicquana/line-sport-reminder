import type { FlexMessage, LineMessage, TextV2Message } from "./types";

export const HELP_TEXT = [
  "🏃 活動提醒 Bot 指令",
  "參加：加入每輪提醒名單",
  "退出：離開提醒名單",
  "OK／完成：完成目前回合",
  "跳過：本輪不再提醒，下輪恢復",
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
        backgroundColor: "#16A34A",
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
            text: `${closesAtLabel} 前完成；尚未回覆者會收到兩次提醒。`,
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
            color: "#16A34A",
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

export function buildPendingMentionMessage(userIds: string[], stage: number): TextV2Message {
  if (userIds.length === 0 || userIds.length > 20) {
    throw new Error("A reminder message requires 1 to 20 user IDs");
  }

  const substitution: TextV2Message["substitution"] = {};
  const mentions = userIds.map((userId, index) => {
    const key = `member${index}`;
    substitution[key] = {
      type: "mention",
      mentionee: { type: "user", userId },
    };
    return `{${key}}`;
  });

  const suffix = stage >= 2 ? "這是本輪最後提醒，做 10 下就完成囉！" : "還差你們囉，站起來做 10 下吧！";
  return {
    type: "textV2",
    text: `${mentions.join(" ")} ${suffix}`,
    substitution,
  };
}
