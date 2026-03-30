import type { Env } from "../env";
import { getNewMessageIds, getEmailMessage } from "../gmail";
import { postSlackMessage } from "../slack";

interface PubSubMessage {
  message: {
    data: string;
    messageId: string;
  };
}

interface GmailNotification {
  emailAddress: string;
  historyId: string;
}

async function processNewEmails(notification: GmailNotification, env: Env): Promise<void> {
  const lastHistoryId = await env.GMAIL_KV.get("lastHistoryId");
  const startHistoryId = lastHistoryId ?? String(Number(notification.historyId) - 1);

  console.log(`startHistoryId: ${startHistoryId}, notificationHistoryId: ${notification.historyId}`);

  const messageIds = await getNewMessageIds(startHistoryId, env);
  console.log(`messageIds: ${JSON.stringify(messageIds)}`);

  for (const messageId of messageIds) {
    const { subject, from, to, date, cc, snippet } = await getEmailMessage(messageId, env);
    const lines = [
      `📧 새 이메일이 도착했습니다`,
      `*제목:* ${subject}`,
      `*보낸 사람:* ${from}`,
      `*받는 사람:* ${to}`,
      cc ? `*참조:* ${cc}` : null,
      `*날짜:* ${date}`,
      snippet ? `*미리보기:* ${snippet}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    await postSlackMessage(lines, env.EMAIL_CHANNEL_ID, env);
  }

  await env.GMAIL_KV.put("lastHistoryId", String(notification.historyId));
}

export async function handleGmailWebhook(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    const rawBody = await request.text();

    let body: PubSubMessage;
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      return new Response("OK", { status: 200 });
    }

    if (!body.message?.data) {
      return new Response("OK", { status: 200 });
    }

    let notification: GmailNotification;
    try {
      const decoded = atob(body.message.data);
      notification = JSON.parse(decoded);
    } catch (e) {
      return new Response("OK", { status: 200 });
    }

    console.log("Gmail notification:", JSON.stringify(notification));
    ctx.waitUntil(processNewEmails(notification, env));

    return new Response("OK", { status: 200 });
  } catch (e) {
    return new Response("OK", { status: 200 });
  }
}
