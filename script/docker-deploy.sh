#!/bin/bash
set -e

# .env 파일 존재 확인 및 로드
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# 필수 변수 확인 (IMAGE_TAG는 ssh 실행 시 주입됨)
if [ -z "$IMAGE_TAG" ]; then
    echo "ERROR: IMAGE_TAG is not set."
    exit 1
fi

FULL_IMAGE="${ECR_REGISTRY}/yourssu/${PROJECT_NAME}:${IMAGE_TAG}"

echo "🚀 Starting deployment for ${PROJECT_NAME}..."
echo "📦 Image: ${FULL_IMAGE}"

# ECR Public 로그인 (인증 속도 제한 방지)
aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws

# 새 이미지 풀
echo "📥 Pulling new image..."
docker pull ${FULL_IMAGE}

# 기존 컨테이너 중지 및 제거
if [ "$(docker ps -aq -f name=${PROJECT_NAME})" ]; then
    echo "🛑 Stopping and removing existing container..."
    docker stop ${PROJECT_NAME} || true
    docker rm ${PROJECT_NAME} || true
fi

# 새 컨테이너 실행
# --env-file .env를 사용하여 파일 내의 모든 환경 변수를 주입합니다.
echo "🏃 Running new container..."
docker run -d \
  --name ${PROJECT_NAME} \
  --restart always \
  --env-file .env \
  ${FULL_IMAGE}

# 사용하지 않는 이미지 정리
echo "🧹 Cleaning up old images..."
docker image prune -f

echo "✅ Deployment successful!"
