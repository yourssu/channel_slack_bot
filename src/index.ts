import type { Env } from "./env";
import { handleSlackEvents } from "./handlers/slackEvents";
import { handleGmailWebhook } from "./handlers/gmailWebhook";
import { registerGmailWatch } from "./gmail";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === "POST" && pathname === "/slack/events") {
      return handleSlackEvents(request, env, ctx);
    }

    if (request.method === "POST" && pathname === "/gmail/webhook") {
      return handleGmailWebhook(request, env, ctx);
    }

    return new Response("Not Found", { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(registerGmailWatch(env));
  },
};
