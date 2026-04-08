import type { Env } from "./env";

async function getAccessToken(env: Env): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`Google OAuth error: ${res.status}`, errBody);
    throw new Error(`Google OAuth error: ${res.status}`);
  }

  const data = await res.json<{ access_token: string }>();
  return data.access_token;
}

// Gmail watch 등록/갱신 (Cron에서 호출)
export async function registerGmailWatch(env: Env): Promise<void> {
  const token = await getAccessToken(env);

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${env.GMAIL_USER_ID}/watch`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        topicName: env.PUBSUB_TOPIC_NAME,
        labelIds: ["INBOX"],
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gmail watch error: ${res.status} ${await res.text()}`);
  }
}

interface GmailMessage {
  subject: string;
  from: string;
  to: string;
  date: string;
  cc: string;
  body: string;
  rawHtml: string;
  attachments: { filename: string; mimeType: string; attachmentId: string }[];
}

interface MimePart {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: MimePart[];
}

function base64ToText(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB

function extractBodyAndAttachments(payload: MimePart): {
  body: string;
  rawHtml: string;
  attachments: { filename: string; mimeType: string; attachmentId: string }[];
} {
  let plainText = "";
  let htmlText = "";
  let rawHtml = "";
  const attachments: { filename: string; mimeType: string; attachmentId: string }[] = [];

  function traverse(part: MimePart) {
    const mime = part.mimeType ?? "";

    if (mime === "text/plain" && part.body?.data && !plainText) {
      plainText = base64ToText(part.body.data);
    } else if (mime === "text/html" && part.body?.data && !htmlText) {
      const html = base64ToText(part.body.data);
      if (!rawHtml) rawHtml = html;
      htmlText = html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<\/div>/gi, "\n")
        .replace(/<\/tr>/gi, "\n")
        .replace(/<\/li>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/\[image:[^\]]*\]/g, "")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join("\n")
        .trim();
    } else if (part.filename && part.body?.attachmentId) {
      const size = part.body.size ?? 0;
      if (size <= MAX_ATTACHMENT_SIZE) {
        attachments.push({
          filename: part.filename,
          mimeType: mime || "application/octet-stream",
          attachmentId: part.body.attachmentId,
        });
      }
    }

    if (part.parts) part.parts.forEach(traverse);
  }

  traverse(payload);

  // HTML 버전 우선, 없으면 plain text 사용
  const body = (htmlText || plainText)
    .replace(/\[image:[^\]]*\]/g, "")
    .trim()
    .slice(0, 3000);

  return { body, rawHtml, attachments };
}

// messageId로 메일 상세 정보 조회 (전체 본문 + 이미지 첨부)
export async function getEmailMessage(
  messageId: string,
  env: Env
): Promise<GmailMessage> {
  const token = await getAccessToken(env);

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${env.GMAIL_USER_ID}/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) throw new Error(`Gmail message error: ${res.status}`);

  const data = await res.json<{
    payload: MimePart & { headers: { name: string; value: string }[] };
  }>();

  const headers = data.payload.headers;
  const subject = headers.find((h) => h.name === "Subject")?.value ?? "(제목 없음)";
  const from    = headers.find((h) => h.name === "From")?.value    ?? "(발신자 없음)";
  const to      = headers.find((h) => h.name === "To")?.value      ?? "(수신자 없음)";
  const date    = headers.find((h) => h.name === "Date")?.value    ?? "(날짜 없음)";
  const cc      = headers.find((h) => h.name === "Cc")?.value      ?? "";

  const { body, rawHtml, attachments } = extractBodyAndAttachments(data.payload);

  return { subject, from, to, date, cc, body, rawHtml, attachments };
}

// 이미지 첨부파일 바이너리 조회
export async function getEmailAttachment(
  messageId: string,
  attachmentId: string,
  env: Env
): Promise<Uint8Array> {
  const token = await getAccessToken(env);

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${env.GMAIL_USER_ID}/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) throw new Error(`Gmail attachment error: ${res.status}`);

  const data = await res.json<{ data: string }>();
  const base64 = data.data.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

// OAuth 및 Gmail API 정상 여부 확인
export async function checkGmailHealth(env: Env): Promise<void> {
  const token = await getAccessToken(env);
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${env.GMAIL_USER_ID}/profile`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gmail API error: ${res.status} ${errText}`);
  }
}

// historyId 이후 INBOX에 추가된 messageId 목록 조회
export async function getNewMessageIds(
  startHistoryId: string,
  env: Env
): Promise<string[]> {
  const token = await getAccessToken(env);

  const url = new URL(
    `https://gmail.googleapis.com/gmail/v1/users/${env.GMAIL_USER_ID}/history`
  );
  url.searchParams.set("startHistoryId", startHistoryId);
  url.searchParams.set("labelId", "INBOX");
  url.searchParams.append("historyTypes", "messageAdded");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Gmail history error: ${res.status}`, errText);
    throw new Error(`Gmail history error: ${res.status}`);
  }

  const data = await res.json<{
    history?: { messagesAdded?: { message: { id: string } }[] }[];
  }>();

  console.log("Gmail history response:", JSON.stringify(data));

  if (!data.history) return [];

  return data.history.flatMap(
    (h) => h.messagesAdded?.map((m) => m.message.id) ?? []
  );
}
