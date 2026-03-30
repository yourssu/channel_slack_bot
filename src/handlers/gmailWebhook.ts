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
  // historyId - 1 을 시작점으로 사용해 해당 변경 직전부터 조회
  const startHistoryId = String(Number(notification.historyId) - 1);
  const messageIds = await getNewMessageIds(startHistoryId, env);

  for (const messageId of messageIds) {
    const { subject, from } = await getEmailMessage(messageId, env);
    await postSlackMessage(
      `📧 새 이메일이 도착했습니다\n*보낸 사람:* ${from}\n*제목:* ${subject}`,
      env.EMAIL_CHANNEL_ID,
      env
    );
  }
}

export async function handleGmailWebhook(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const body = await request.json<PubSubMessage>();

  // Pub/Sub 메시지 data는 base64 인코딩된 JSON
  const decoded = atob(body.message.data);
  const notification: GmailNotification = JSON.parse(decoded);

  ctx.waitUntil(processNewEmails(notification, env));

  return new Response("OK", { status: 200 });
}
