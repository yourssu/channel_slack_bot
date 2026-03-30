export interface Env {
  // Slack
  SLACK_SIGNING_SECRET: string;
  SLACK_BOT_TOKEN: string;
  EMAIL_CHANNEL_ID: string;       // 이메일 알림용 (비공개)
  CHANNEL_CREATED_CHANNEL_ID: string; // 채널 생성 알림용 (공개)

  // Google OAuth2
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REFRESH_TOKEN: string;

  // Gmail / Pub/Sub
  GMAIL_USER_ID: string;
  PUBSUB_TOPIC_NAME: string;

  // KV
  GMAIL_KV: KVNamespace;
}
