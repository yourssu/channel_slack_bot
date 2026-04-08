import type { Env } from "./env";
import { handleSlackEvents } from "./handlers/slackEvents";
import { handleGmailWebhook } from "./handlers/gmailWebhook";
import { handleEmailView } from "./handlers/emailView";
import { registerGmailWatch } from "./gmail";
import { runHealthCheck } from "./handlers/healthCheck";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === "POST" && pathname === "/slack/events") {
      return handleSlackEvents(request, env, ctx);
    }

    if (request.method === "POST" && pathname === "/gmail/webhook") {
      return handleGmailWebhook(request, env, ctx);
    }

    if (request.method === "GET" && pathname.startsWith("/view/")) {
      return handleEmailView(request, env);
    }

    return new Response("Not Found", { status: 404 });
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === "0 0 * * *") {
      ctx.waitUntil(runHealthCheck(env));
    }
    ctx.waitUntil(registerGmailWatch(env));
  },
};
