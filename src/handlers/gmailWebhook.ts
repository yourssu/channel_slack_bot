import type { Env } from "../env";
import { getNewMessageIds, getEmailMessage, getEmailAttachment } from "../gmail";
import { postSlackMessage, uploadImageToSlack } from "../slack";

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

  // 메시지 처리 전에 historyId 업데이트 (에러 발생해도 중복 처리 방지)
  await env.GMAIL_KV.put("lastHistoryId", String(notification.historyId));

  for (const messageId of messageIds) {
    const { subject, from, to, date, cc, rawHtml, images } = await getEmailMessage(messageId, env);

    // 메일 전문 보기 링크 생성
    let viewLink = "";
    if (rawHtml) {
      const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
      const token = Array.from(tokenBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
      await env.GMAIL_KV.put(`email:${token}`, rawHtml, { expirationTtl: 86400 });
      const viewUrl = `https://channel-slack-bot.yourssu-com4234.workers.dev/view/${token}`;
      viewLink = `\n:incoming_envelope: <${viewUrl}|메일 전문 보기> (24시간 동안 열람 가능)`;
    }

    // 메인 메시지
    const summary = [
      `*📧 새 이메일이 도착했습니다*`,
      `*제목:* ${subject}`,
      `*보낸 사람:* ${from}`,
      `*날짜:* ${date}`,
      `*받는 사람:* ${to}`,
      cc ? `*참조:* ${cc}` : null,
    ]
      .filter(Boolean)
      .join("\n") + viewLink;

    const threadTs = await postSlackMessage(summary, env.EMAIL_CHANNEL_ID, env);

    // 스레드: 이미지 첨부파일
    for (const image of images) {
      try {
        const data = await getEmailAttachment(messageId, image.attachmentId, env);
        await uploadImageToSlack(image.filename, image.mimeType, data, env.EMAIL_CHANNEL_ID, threadTs, env);
      } catch (e) {
        console.error(`Image upload failed: ${image.filename}`, e);
      }
    }
  }
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
