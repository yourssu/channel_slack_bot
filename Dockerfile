# Python 3.11 슬림 버전 이미지 사용 (용량 최적화)
FROM python:3.11-slim

# 작업 디렉토리 설정
WORKDIR /app

# 종속성 파일 복사 및 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 소스 코드 복사
COPY . .

# 환경 변수 예시 (실행 시 -e 옵션으로 실제 값을 전달해야 함)
ENV SLACK_BOT_TOKEN=""
ENV SLACK_APP_TOKEN=""
ENV TARGET_CHANNEL_ID=""

# 앱 실행 (unbuffered 옵션으로 실시간 로그 확인 가능)
CMD ["python", "-u", "bot.py"]
