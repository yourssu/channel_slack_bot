import type { Env } from "../env";
import { verifySlackSignature, postSlackMessage } from "../slack";

export async function handleSlackEvents(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const rawBody = await request.text();
  const body = JSON.parse(rawBody);

  // Slack Events API URL 등록 시 일회성 검증 (서명 검증 불필요)
  if (body.type === "url_verification") {
    return Response.json({ challenge: body.challenge });
  }

  const isValid = await verifySlackSignature(request, rawBody, env);
  if (!isValid) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (body.event?.type === "channel_created") {
    const channelId: string = body.event.channel.id;
    const creatorId: string = body.event.channel.creator;

    ctx.waitUntil(
      postSlackMessage(
        `🎉 새로운 채널 <#${channelId}> 이(가) <@${creatorId}> 님에 의해 개설되었습니다!`,
        env.CHANNEL_CREATED_CHANNEL_ID,
        env
      )
    );
  }

  return new Response("OK", { status: 200 });
}
