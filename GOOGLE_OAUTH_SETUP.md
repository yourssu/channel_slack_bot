# Google OAuth 설정 가이드

## 1. Client ID / Client Secret 재발급

1. [console.cloud.google.com](https://console.cloud.google.com) 접속
2. **API 및 서비스** → **사용자 인증 정보**
3. 기존 OAuth 클라이언트 우측 **연필 아이콘(수정)** 클릭
4. **보안 비밀 재설정** 클릭 → 확인
5. 새 **클라이언트 ID**, **클라이언트 보안 비밀번호** 복사

---

## 2. Refresh Token 발급

### 브라우저에서 인증 URL 접속

아래 URL의 `YOUR_CLIENT_ID` 를 실제 값으로 교체 후 브라우저에서 접속:

```
https://accounts.google.com/o/oauth2/v2/auth?client_id=YOUR_CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=https://www.googleapis.com/auth/gmail.readonly&access_type=offline&prompt=consent
```

1. Google 계정 로그인 (Gmail을 감시할 계정)
2. 권한 승인
3. 화면에 표시된 **인증 코드** 복사

### 인증 코드로 Refresh Token 교환

```bash
curl -X POST https://oauth2.googleapis.com/token \
  -d "code=인증코드" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "redirect_uri=urn:ietf:wg:oauth:2.0:oob" \
  -d "grant_type=authorization_code"
```

응답 예시:
```json
{
  "access_token": "...",
  "refresh_token": "1//0e...",
  "token_type": "Bearer"
}
```

`refresh_token` 값 복사

---

## 3. Wrangler Secret 등록

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GOOGLE_REFRESH_TOKEN
```

---

## 4. Gmail Watch 재등록

Secret 변경 후 Gmail watch를 다시 등록해야 합니다.

```bash
npx wrangler dev --test-scheduled
```

별도 터미널에서:

```bash
curl "http://localhost:8787/__scheduled?cron=0+0+*%2F6+*+*"
```

터미널에 에러 없이 200 응답이 오면 완료입니다.

---

## 5. 재배포

```bash
npx wrangler deploy
```

---

## 주의사항

- Refresh Token은 **1회만 발급**됩니다. 반드시 저장해 두세요.
- Client Secret을 재설정하면 기존 Refresh Token은 **무효화**됩니다. 반드시 Refresh Token도 재발급해야 합니다.
- `.dev.vars` 파일에 시크릿을 입력할 때 대화창에 붙여넣지 마세요. 노출될 수 있습니다.
