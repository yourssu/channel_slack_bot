import os
from slack_bolt import App
from slack_bolt.adapter.socket_mode import SocketModeHandler
# 로컬 개발 시 .env 파일을 읽기 위한 라이브러리 (선택 사항이나 권장함)
# pip install python-dotenv 실행 필요
from dotenv import load_dotenv

# .env 파일이 있으면 환경 변수로 로드함
load_dotenv()

# =====================================================================
# 환경 변수에서 값을 가져옴 (없을 경우 None 반환)
BOT_TOKEN = os.environ.get("SLACK_BOT_TOKEN")
APP_TOKEN = os.environ.get("SLACK_APP_TOKEN")
TARGET_CHANNEL_ID = os.environ.get("TARGET_CHANNEL_ID")

# 필수 값이 없을 경우 에러 발생
if not all([BOT_TOKEN, APP_TOKEN, TARGET_CHANNEL_ID]):
    raise ValueError("필수 환경 변수(SLACK_BOT_TOKEN, SLACK_APP_TOKEN, TARGET_CHANNEL_ID)가 설정되지 않았음.")
# =====================================================================

# 앱 초기화
app = App(token=BOT_TOKEN)

# 새 채널 생성 이벤트 감지
@app.event("channel_created")
def handle_channel_created_events(event, client, say):
    try:
        new_channel_id = event["channel"]["id"]
        creator_id = event["channel"]["creator"]
        
        client.chat_postMessage(
            channel=TARGET_CHANNEL_ID,
            text=f"🎉 새로운 채널 <#{new_channel_id}> 이(가) <@{creator_id}> 님에 의해 개설되었습니다!"
        )
        print(f"알림 전송 성공: {new_channel_id} 채널 생성됨")
        
    except Exception as e:
        print(f"에러 발생: {e}")

# 프로그램 실행 부분
if __name__ == "__main__":
    print("⚡️ 슬랙 봇이 켜졌습니다! 새 채널 감지를 시작합니다...")
    handler = SocketModeHandler(app, APP_TOKEN)
    handler.start()