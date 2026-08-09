export type GroupSource = {
  type: "group";
  groupId: string;
  userId?: string;
};

export type UserSource = {
  type: "user";
  userId: string;
};

export type RoomSource = {
  type: "room";
  roomId: string;
  userId?: string;
};

export type LineSource = GroupSource | UserSource | RoomSource;

type BaseEvent = {
  type: string;
  timestamp: number;
  source: LineSource;
  webhookEventId: string;
  replyToken?: string;
};

export type LineEvent = BaseEvent & {
  message?: {
    id: string;
    type: string;
    text?: string;
  };
  postback?: {
    data: string;
  };
  joined?: {
    members: LineSource[];
  };
  left?: {
    members: LineSource[];
  };
};

export type WebhookPayload = {
  destination: string;
  events: LineEvent[];
};

export type TextMessage = {
  type: "text";
  text: string;
};

export type TextV2Message = {
  type: "textV2";
  text: string;
  substitution: Record<
    string,
    {
      type: "mention";
      mentionee: { type: "user"; userId: string } | { type: "all" };
    }
  >;
};

export type FlexMessage = {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
};

export type LineMessage = TextMessage | TextV2Message | FlexMessage;

export type GroupRow = {
  group_id: string;
  enabled: number;
  admin_user_id: string | null;
  timezone: string;
  active_start: string;
  active_end: string;
  interval_minutes: number;
  reminder_interval_minutes: number;
  max_reminders: number;
  next_run_at: number | null;
  created_at: number;
  updated_at: number;
};

export type ParticipantRow = {
  group_id: string;
  user_id: string;
  display_name: string;
  active: number;
  joined_at: number;
  updated_at: number;
};

export type RoundRow = {
  round_id: string;
  group_id: string;
  started_at: number;
  closes_at: number;
  reminder_stage: number;
  status: "open" | "closed";
  created_at: number;
};

export type LineProfile = {
  displayName: string;
  userId: string;
  pictureUrl?: string;
};
