import type { Env } from "../env";
import { checkGmailHealth } from "../gmail";
import { postSlackMessage } from "../slack";

export async function runHealthCheck(env: Env): Promise<void> {
  try {
    await checkGmailHealth(env);
    console.log("Health check passed");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Health check failed:", message);

    const isTokenError = /40[01]|unauthorized_client|invalid_grant/i.test(message);
    const detail = isTokenError
      ? "\n\n*원인:* Google OAuth 토큰 만료 또는 무효화\n*조치:* Refresh Token 재발급 후 `wrangler secret put GOOGLE_REFRESH_TOKEN` 실행"
      : "";

    await postSlackMessage(
      `🚨 *Gmail 수신 이상 감지*\n\n*오류:* ${message}${detail}\n\n*레포:* <https://github.com/yourssu/channel_slack_bot|yourssu/channel_slack_bot>`,
      env.EMAIL_CHANNEL_ID,
      env
    ).catch((slackErr) => console.error("Slack notification failed:", slackErr));
  }
}
