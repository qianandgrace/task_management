#!/usr/bin/env bash
# 一键部署：在阿里云 ECS（47.93.40.210）上构建并启动任务管理应用。
# 用法：把项目目录拷到服务器后，在项目根目录执行 bash deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

PUBLIC_IP="47.93.40.210"

echo "==> 一键部署任务管理应用 (公网 IP: $PUBLIC_IP)"

# ---------- 1. 确保 docker ----------
if ! command -v docker >/dev/null 2>&1; then
  echo "docker 未安装，正在安装..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: docker compose 插件不可用。请安装 docker-compose-plugin 后重试。" >&2
  exit 1
fi

# ---------- 2. .env ----------
if [ ! -f .env ]; then
  SECRET=$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 40)
  cat > .env <<EOF
JWT_SECRET=$SECRET
CORS_ORIGIN=http://$PUBLIC_IP
EOF
  echo "==> 已生成 .env（随机 JWT_SECRET）"
else
  echo "==> 复用已有 .env"
fi

# ---------- 3. 构建并启动 ----------
echo "==> 构建并启动容器..."
docker compose down --remove-orphans 2>/dev/null || true
docker compose up -d --build

# ---------- 4. 健康检查 ----------
echo "==> 等待服务就绪..."
READY=no
for i in $(seq 1 30); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost/api/tasks" || echo 000)
  if [ "$CODE" = "401" ]; then
    READY=yes
    echo "✅ 服务就绪（/api/tasks 返回 401，整栈正常）"
    break
  fi
  sleep 2
done

if [ "$READY" = "no" ]; then
  echo "⚠ 30 秒内服务未就绪，查看日志：docker compose logs" >&2
fi

echo ""
docker compose ps
echo ""
echo "==> 部署完成。访问： http://$PUBLIC_IP"
echo "    若无法访问，请确认阿里云安全组已放行 80 端口（TCP 入方向）。"
