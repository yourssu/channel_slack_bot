import type { Env } from "../env";

export async function handleEmailView(
  request: Request,
  env: Env
): Promise<Response> {
  const { pathname } = new URL(request.url);
  const token = pathname.replace("/view/", "");

  if (!/^[0-9a-f]{64}$/.test(token)) {
    return new Response("Not Found", { status: 404 });
  }

  const html = await env.GMAIL_KV.get(`email:${token}`);
  if (!html) {
    return new Response("링크가 만료되었거나 존재하지 않습니다.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
