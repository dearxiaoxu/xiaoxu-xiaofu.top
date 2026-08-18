#!/usr/bin/env bash
# ============================================================
#  小站一键部署脚本 · xiaoxu & xiaofu
#  在云服务器上运行：bash deploy/deploy.sh
#  预览执行步骤：bash deploy/deploy.sh --dry-run
# ============================================================
set -euo pipefail

APP_NAME="xiaoxu-xiaofu"
INSTALL_DIR="/opt/${APP_NAME}"
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DRY_RUN=false
[ "${1:-}" = "--dry-run" ] && DRY_RUN=true
PORT="${PORT:-3000}"

info() { echo -e "\033[1;32m[deploy]\033[0m $*"; }
warn() { echo -e "\033[1;33m[deploy]\033[0m $*"; }
fail() { echo -e "\033[1;31m[deploy]\033[0m $*"; exit 1; }
run() {
  if [ "$DRY_RUN" = true ]; then echo "  [dry-run] $*"; else "$@"; fi
}

if [ "$DRY_RUN" = false ]; then
  [ "$(id -u)" -eq 0 ] || fail "请以 root 运行：sudo bash deploy/deploy.sh"
fi

[ -f "$SRC_DIR/server.js" ] || fail "未找到 server.js，请先把整个项目目录上传到服务器，再在项目根目录运行本脚本"

# ---------- 1. Node.js ----------
if ! command -v node >/dev/null 2>&1; then
  info "未检测到 Node.js，正在安装 Node.js 22 LTS（内置 SQLite）…"
  if command -v apt-get >/dev/null 2>&1; then
    run apt-get update -y
    run apt-get install -y ca-certificates curl gnupg
    run bash -c "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -"
    run apt-get install -y nodejs
  elif command -v dnf >/dev/null 2>&1; then
    run bash -c "curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -"
    run dnf install -y nodejs
  elif command -v yum >/dev/null 2>&1; then
    run bash -c "curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -"
    run yum install -y nodejs
  else
    fail "无法识别的包管理器，请先手动安装 Node.js（版本 ≥22.13.0）"
  fi
fi
if ! node -e 'var p=process.version.slice(1).split(".").map(Number); var ok=p[0]>22||(p[0]===22&&(p[1]>13||(p[1]===13))); process.exit(ok?0:1)'; then
  fail "Node.js 版本过低（当前 $(node -v)），本版需要 ≥22.13.0（内置 node:sqlite）"
fi
info "Node.js $(node -v) ✓"

# ---------- 2. 同步项目文件 ----------
info "同步项目文件到 ${INSTALL_DIR} …"
if [ "$SRC_DIR" != "$INSTALL_DIR" ]; then
  run mkdir -p "$INSTALL_DIR"
  if command -v rsync >/dev/null 2>&1; then
    # 只同步代码，data/ 单独处理：服务器上的数据永不删除
    run rsync -a --delete \
      --exclude 'data/' --exclude '.git/' --exclude 'deploy/' \
      "$SRC_DIR/" "$INSTALL_DIR/"
  else
    warn "未找到 rsync，改用 cp（不清理旧文件）"
    run cp -rf "$SRC_DIR/." "$INSTALL_DIR/"
  fi
fi
run mkdir -p "$INSTALL_DIR/data" "$INSTALL_DIR/data/uploads"

# 首次部署：带上本地内容数据；若服务器已有数据则保留服务器的
if [ ! -f "$INSTALL_DIR/data/db.json" ] && [ -f "$SRC_DIR/data/db.json" ]; then
  run cp "$SRC_DIR/data/db.json" "$INSTALL_DIR/data/db.json"
  info "已带入本地内容数据 db.json"
else
  info "服务器已有 db.json，保持不变 ✓"
fi
if [ -d "$SRC_DIR/data/uploads" ] && [ "$SRC_DIR" != "$INSTALL_DIR" ]; then
  run cp -rn "$SRC_DIR/data/uploads/." "$INSTALL_DIR/data/uploads/" || true
fi

# ---------- 3. 管理员密码 ----------
ADMIN_PW="admin123"
if [ "$DRY_RUN" = false ]; then
  read -rp "设置管理员初始密码（回车使用默认 admin123）：" ADMIN_PW
  ADMIN_PW="${ADMIN_PW:-admin123}"
  [ ${#ADMIN_PW} -ge 6 ] || fail "密码至少 6 位"
fi

# ---------- 4. systemd 服务 ----------
info "配置 systemd 服务 ${APP_NAME}.service（端口 ${PORT}）"
cat > /tmp/${APP_NAME}.service <<EOF
[Unit]
Description=xiaoxu & xiaofu site
After=network.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
ExecStart=$(command -v node) server.js
Restart=always
RestartSec=3
Environment=PORT=${PORT}
Environment=ADMIN_PASSWORD=${ADMIN_PW}
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF
run cp /tmp/${APP_NAME}.service /etc/systemd/system/${APP_NAME}.service
run systemctl daemon-reload
run systemctl enable ${APP_NAME}
run systemctl restart ${APP_NAME}

# ---------- 5. 防火墙（尽力而为） ----------
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  run ufw allow ${PORT}/tcp
fi
if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state 2>/dev/null | grep -q running; then
  run firewall-cmd --permanent --add-port=${PORT}/tcp
  run firewall-cmd --reload
fi

# ---------- 6. 验证与提示 ----------
sleep 1
if [ "$DRY_RUN" = false ]; then
  systemctl is-active --quiet ${APP_NAME} || warn "服务未运行，请查看：journalctl -u ${APP_NAME} -n 50"
  curl -sf "http://127.0.0.1:${PORT}/api/content" >/dev/null && info "服务健康检查通过 ✓" || warn "本地健康检查未通过"
fi

PUB_IP=$(curl -sf --max-time 5 ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "你的服务器IP")
cat <<EOF

==============================================================
 部署完成！
 前台:      http://${PUB_IP}:${PORT}/
 管理后台:  http://${PUB_IP}:${PORT}/admin/
 管理员密码: ${ADMIN_PW}（请登录后立即修改）

 常用命令:
   查看状态:  systemctl status ${APP_NAME}
   查看日志:  journalctl -u ${APP_NAME} -f
   重启服务:  systemctl restart ${APP_NAME}

 注意:
   1. 大陆服务器需在云控制台【安全组】放行 TCP ${PORT} 端口；
   2. 域名绑定需要先完成 ICP 备案，见 deploy/部署指南.md；
   3. 更新代码：重新上传项目 → 重跑本脚本（服务器数据不受影响）。
==============================================================
EOF
