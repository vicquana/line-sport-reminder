import type { LineMessage, LineProfile } from "./types";

const LINE_API_BASE = "https://api.line.me";
const PUSH_RETRY_DELAYS_MS = [0, 250] as const;

class LineApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "LineApiError";
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
}

export async function verifyLineSignature(
  rawBody: string,
  signature: string,
  channelSecret: string,
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(channelSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return crypto.subtle.verify("HMAC", key, decodeBase64(signature), encoder.encode(rawBody));
  } catch {
    return false;
  }
}

export class LineClient {
  constructor(private readonly channelAccessToken: string) {}

  async push(to: string, messages: LineMessage[], retryKey = crypto.randomUUID()): Promise<void> {
    if (messages.length === 0 || messages.length > 5) {
      throw new Error("LINE push requires 1 to 5 message objects");
    }

    const request = {
      method: "POST",
      body: JSON.stringify({ to, messages }),
      headers: { "X-Line-Retry-Key": retryKey },
    } satisfies RequestInit;

    for (let attempt = 0; ; attempt += 1) {
      try {
        await this.request("/v2/bot/message/push", request, new Set([409]));
        return;
      } catch (error) {
        const retryable = !(error instanceof LineApiError) || error.status >= 500;
        const delay = PUSH_RETRY_DELAYS_MS[attempt];
        if (!retryable || delay === undefined) throw error;

        console.warn(
          JSON.stringify({
            event: "line_push_retry",
            attempt: attempt + 2,
            retryKey,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        if (delay > 0) await wait(delay);
      }
    }
  }

  async reply(replyToken: string, messages: LineMessage[]): Promise<void> {
    if (messages.length === 0 || messages.length > 5) {
      throw new Error("LINE reply requires 1 to 5 message objects");
    }

    await this.request("/v2/bot/message/reply", {
      method: "POST",
      body: JSON.stringify({ replyToken, messages }),
    });
  }

  async getGroupMemberProfile(groupId: string, userId: string): Promise<LineProfile | null> {
    const response = await fetch(
      `${LINE_API_BASE}/v2/bot/group/${encodeURIComponent(groupId)}/member/${encodeURIComponent(userId)}`,
      { headers: this.headers() },
    );
    if (!response.ok) return null;
    const value: unknown = await response.json();
    if (typeof value !== "object" || value === null) return null;
    const candidate = value as { displayName?: unknown; userId?: unknown; pictureUrl?: unknown };
    if (typeof candidate.displayName !== "string" || typeof candidate.userId !== "string") {
      return null;
    }
    return {
      displayName: candidate.displayName,
      userId: candidate.userId,
      ...(typeof candidate.pictureUrl === "string" ? { pictureUrl: candidate.pictureUrl } : {}),
    };
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.channelAccessToken}`,
      "Content-Type": "application/json",
    };
  }

  private async request(
    path: string,
    init: RequestInit,
    acceptedStatuses: ReadonlySet<number> = new Set(),
  ): Promise<void> {
    const response = await fetch(`${LINE_API_BASE}${path}`, {
      ...init,
      headers: { ...this.headers(), ...init.headers },
    });

    if (!response.ok && !acceptedStatuses.has(response.status)) {
      throw new LineApiError(`LINE API ${path} failed with HTTP ${response.status}`, response.status);
    }
  }
}
