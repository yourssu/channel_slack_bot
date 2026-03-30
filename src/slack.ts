import type { Env } from "./env";

export async function verifySlackSignature(
  request: Request,
  rawBody: string,
  env: Env
): Promise<boolean> {
  const timestamp = request.headers.get("x-slack-request-timestamp");
  const signature = request.headers.get("x-slack-signature");

  if (!timestamp || !signature) return false;

  // replay attack 방지: 5분 초과 요청 거부
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) return false;

  const baseString = `v0:${timestamp}:${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.SLACK_SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(baseString));
  const hex = "v0=" + Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hex === signature;
}

// 메인 메시지 전송 후 thread_ts 반환
export async function postSlackMessage(
  text: string,
  channelId: string,
  env: Env
): Promise<string> {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({ channel: channelId, text }),
  });

  if (!res.ok) throw new Error(`Slack API error: ${res.status}`);

  const data = await res.json<{ ok: boolean; ts: string; error?: string }>();
  console.log("postSlackMessage response:", JSON.stringify(data));
  if (!data.ok) throw new Error(`Slack API error: ${data.error}`);
  return data.ts;
}

// 스레드에 메시지 전송
export async function postSlackThreadMessage(
  text: string,
  channelId: string,
  threadTs: string,
  env: Env
): Promise<void> {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({ channel: channelId, text, thread_ts: threadTs }),
  });

  if (!res.ok) throw new Error(`Slack thread API error: ${res.status}`);
}

// 스레드에 이미지 업로드
export async function uploadImageToSlack(
  filename: string,
  mimeType: string,
  data: Uint8Array,
  channelId: string,
  threadTs: string,
  env: Env
): Promise<void> {
  // Step 1: 업로드 URL 요청
  const urlRes = await fetch("https://slack.com/api/files.getUploadURLExternal", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
    },
    body: new URLSearchParams({ filename, length: String(data.length) }),
  });

  const urlData = await urlRes.json<{ ok: boolean; upload_url: string; file_id: string; error?: string }>();
  console.log("getUploadURLExternal response:", JSON.stringify(urlData));
  if (!urlData.ok) throw new Error(`Slack upload URL error: ${urlData.error}`);

  const { upload_url, file_id } = urlData;

  // Step 2: 파일 업로드
  await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: data,
  });

  // Step 3: 업로드 완료 및 채널/스레드에 공유
  await fetch("https://slack.com/api/files.completeUploadExternal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({
      files: [{ id: file_id, title: filename }],
      channel_id: channelId,
      thread_ts: threadTs,
    }),
  });
}
