# Channel Slack Bot

Slack 채널 생성 알림과 Gmail 수신 알림을 하나의 Cloudflare Worker로 처리하는 봇입니다.

## 기능

- **채널 생성 알림**: 새 Slack 채널이 생성되면 지정된 채널에 알림 전송
- **이메일 알림**: Gmail 수신함에 새 메일이 도착하면 지정된 채널에 알림 전송

## 아키텍처

```
Slack channel_created → POST /slack/events  ─┐
                                              ├─ CF Worker ──→ Slack chat.postMessage
Gmail 수신 → Google Pub/Sub → POST /gmail/webhook ─┘

Cron (6일마다) → Gmail watch 자동 갱신
```

## 프로젝트 구조

```
src/
├── index.ts                 # 진입점: URL 라우팅 + Cron 핸들러
├── env.ts                   # 환경변수 타입 정의
├── slack.ts                 # Slack 서명 검증, 메시지 전송
├── gmail.ts                 # Google OAuth2, Gmail watch/history/message API
└── handlers/
    ├── slackEvents.ts       # POST /slack/events 처리
    └── gmailWebhook.ts      # POST /gmail/webhook 처리
```

## 사전 준비

### 1. Slack App 설정

1. [api.slack.com/apps](https://api.slack.com/apps) 에서 앱 선택
2. **Socket Mode** 비활성화
3. **Event Subscriptions** 활성화
   - Request URL: `https://<worker-name>.<account>.workers.dev/slack/events`
   - Subscribe to bot events: `channel_created` 추가
4. **OAuth & Permissions** 에서 `chat:write` scope 확인
5. **Basic Information** 에서 `Signing Secret` 복사

### 2. Google Cloud 설정

#### Gmail API + Pub/Sub 활성화

```
Google Cloud Console
├── APIs & Services → Gmail API 활성화
├── APIs & Services → Cloud Pub/Sub API 활성화
└── IAM → OAuth 2.0 클라이언트 생성 (Desktop app 타입)
```

#### Refresh Token 발급

로컬에서 OAuth 인증을 한 번 진행해 Refresh Token을 발급받습니다.

```bash
# scope: https://www.googleapis.com/auth/gmail.readonly
# 발급된 refresh_token 저장
```

#### Pub/Sub 토픽 및 구독 생성

```bash
# 토픽 생성
gcloud pubsub topics create gmail-push

# Gmail 서비스 계정에 Publisher 권한 부여 (필수)
gcloud pubsub topics add-iam-policy-binding gmail-push \
  --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
  --role="roles/pubsub.publisher"

# Push 구독 생성
gcloud pubsub subscriptions create gmail-push-sub \
  --topic=gmail-push \
  --push-endpoint=https://<worker-name>.<account>.workers.dev/gmail/webhook
```

## 배포

### 1. 의존성 설치

```bash
npm install
```

### 2. wrangler.toml 환경변수 수정

```toml
[vars]
TARGET_CHANNEL_ID = "C0XXXXXXXXX"   # 알림을 보낼 Slack 채널 ID
GMAIL_USER_ID = "me"                # 감시할 Gmail 계정 (me = 인증된 계정)
PUBSUB_TOPIC_NAME = "projects/YOUR_PROJECT_ID/topics/gmail-push"
```

### 3. 시크릿 등록

```bash
wrangler secret put SLACK_SIGNING_SECRET   # Slack App Signing Secret
wrangler secret put SLACK_BOT_TOKEN        # Slack Bot Token (xoxb-...)
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GOOGLE_REFRESH_TOKEN
```

### 4. 배포

```bash
wrangler deploy
```

### 5. Gmail watch 최초 등록

배포 후 Gmail watch를 수동으로 한 번 등록합니다. (이후 Cron이 6일마다 자동 갱신)

```bash
# Worker에 요청을 보내거나, 로컬에서 Gmail API watch() 직접 호출
curl -X POST https://gmail.googleapis.com/gmail/v1/users/me/watch \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "topicName": "projects/YOUR_PROJECT_ID/topics/gmail-push",
    "labelIds": ["INBOX"]
  }'
```

## 환경변수 목록

| 변수 | 종류 | 설명 |
|------|------|------|
| `SLACK_SIGNING_SECRET` | secret | Slack 요청 서명 검증 키 |
| `SLACK_BOT_TOKEN` | secret | Slack Bot API 토큰 |
| `GOOGLE_CLIENT_ID` | secret | Google OAuth2 클라이언트 ID |
| `GOOGLE_CLIENT_SECRET` | secret | Google OAuth2 클라이언트 시크릿 |
| `GOOGLE_REFRESH_TOKEN` | secret | Gmail API 인증용 Refresh Token |
| `TARGET_CHANNEL_ID` | var | 알림을 전송할 Slack 채널 ID |
| `GMAIL_USER_ID` | var | 감시할 Gmail 사용자 ID (`me`) |
| `PUBSUB_TOPIC_NAME` | var | Google Pub/Sub 토픽 전체 경로 |

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST` | `/slack/events` | Slack Events API 웹훅 수신 |
| `POST` | `/gmail/webhook` | Google Pub/Sub 푸시 수신 |

## 알림 메시지 형식

**채널 생성**
```
🎉 새로운 채널 #channel-name 이(가) @username 님에 의해 개설되었습니다!
```

**이메일 수신**
```
📧 새 이메일이 도착했습니다
보낸 사람: sender@example.com
제목: 메일 제목
```

## 주의사항

- Gmail `watch()`는 **7일마다 만료**됩니다. Cron Trigger가 6일마다 자동 갱신합니다.
- Slack Events API는 **3초 내 응답**을 요구합니다. 외부 API 호출은 모두 `ctx.waitUntil()`로 백그라운드 처리됩니다.
- Google Pub/Sub는 **최소 1회 전달(at-least-once)** 을 보장하므로 중복 알림이 발생할 수 있습니다.
