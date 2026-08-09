import { LineClient, verifyLineSignature } from "./line";
import { Repository } from "./repository";
import { BotService } from "./service";
import type { WebhookPayload } from "./types";

type LineSecrets = {
  LINE_CHANNEL_SECRET: string;
  LINE_CHANNEL_ACCESS_TOKEN: string;
};

type AppEnv = Env & LineSecrets;

function createService(env: AppEnv): BotService {
  return new BotService(new Repository(env.DB), new LineClient(env.LINE_CHANNEL_ACCESS_TOKEN), {
    timezone: env.DEFAULT_TIMEZONE,
    activeStart: env.DEFAULT_ACTIVE_START,
    activeEnd: env.DEFAULT_ACTIVE_END,
  });
}

function isWebhookPayload(value: unknown): value is WebhookPayload {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { destination?: unknown; events?: unknown };
  return typeof candidate.destination === "string" && Array.isArray(candidate.events);
}

async function handleWebhook(request: Request, env: AppEnv): Promise<Response> {
  const signature = request.headers.get("x-line-signature");
  if (!signature) {
    return Response.json({ error: "Missing LINE signature" }, { status: 401 });
  }

  const rawBody = await request.text();
  const isAuthentic = await verifyLineSignature(rawBody, signature, env.LINE_CHANNEL_SECRET);
  if (!isAuthentic) {
    return Response.json({ error: "Invalid LINE signature" }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isWebhookPayload(parsed)) {
    return Response.json({ error: "Invalid webhook payload" }, { status: 400 });
  }

  const service = createService(env);
  for (const event of parsed.events) {
    await service.handleEvent(event);
  }

  return Response.json({ ok: true });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
        return Response.json({ status: "ok", service: "line-sport-reminder" });
      }

      if (request.method === "POST" && url.pathname === "/webhook") {
        return await handleWebhook(request, env);
      }

      return Response.json({ error: "Not found" }, { status: 404 });
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "request_failed",
          method: request.method,
          path: url.pathname,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  },

  async scheduled(controller, env): Promise<void> {
    const scheduledAt = controller.scheduledTime || Date.now();
    console.log(JSON.stringify({ event: "scheduler_started", scheduledAt }));
    await createService(env).runScheduler(scheduledAt);
  },
} satisfies ExportedHandler<AppEnv>;
