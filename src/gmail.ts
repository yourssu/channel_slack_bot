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
}

// messageId로 메일 제목/발신자 조회
export async function getEmailMessage(
  messageId: string,
  env: Env
): Promise<GmailMessage> {
  const token = await getAccessToken(env);

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${env.GMAIL_USER_ID}/messages/${messageId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    throw new Error(`Gmail message error: ${res.status}`);
  }

  const data = await res.json<{ payload: { headers: { name: string; value: string }[] } }>();
  const headers = data.payload.headers;

  const subject = headers.find((h) => h.name === "Subject")?.value ?? "(제목 없음)";
  const from = headers.find((h) => h.name === "From")?.value ?? "(발신자 없음)";

  return { subject, from };
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
  url.searchParams.set("historyTypes", "messageAdded");
  url.searchParams.set("labelId", "INBOX");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Gmail history error: ${res.status}`);
  }

  const data = await res.json<{
    history?: { messagesAdded?: { message: { id: string } }[] }[];
  }>();

  if (!data.history) return [];

  return data.history.flatMap(
    (h) => h.messagesAdded?.map((m) => m.message.id) ?? []
  );
}
