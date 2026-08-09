export type Command =
  | "join"
  | "leave"
  | "done"
  | "skip"
  | "start"
  | "pause"
  | "status"
  | "remind-now"
  | "help"
  | "unknown";

export function parseCommand(text: string): Command {
  const normalized = text.trim().toLocaleLowerCase();

  if (["參加", "加入", "join"].includes(normalized)) return "join";
  if (["退出", "離開", "leave"].includes(normalized)) return "leave";
  if (["ok", "完成", "done"].includes(normalized)) return "done";
  if (["跳過", "skip"].includes(normalized)) return "skip";
  if (["開始提醒", "開始"].includes(normalized)) return "start";
  if (["暫停提醒", "暫停"].includes(normalized)) return "pause";
  if (["狀態", "status"].includes(normalized)) return "status";
  if (["立即提醒", "現在提醒"].includes(normalized)) return "remind-now";
  if (["說明", "help", "指令"].includes(normalized)) return "help";

  return "unknown";
}

export function parsePostback(data: string): { action: "done" | "skip"; roundId: string } | null {
  const params = new URLSearchParams(data);
  const action = params.get("action");
  const roundId = params.get("round_id");

  if ((action !== "done" && action !== "skip") || !roundId) {
    return null;
  }

  return { action, roundId };
}
