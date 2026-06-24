#!/bin/bash

# VPS环境配置脚本 - 安装Node.js和依赖

set -e

VPS_USER="gamer"
VPS_HOST="23.94.194.124"

echo "========================================"
echo "ChatOnPhone VPS 环境配置"
echo "========================================"
echo ""

echo "正在连接到 VPS 并配置环境..."
echo ""

ssh ${VPS_USER}@${VPS_HOST} << 'ENDSSH'
set -e

echo "检测系统..."
uname -a
echo ""

echo "1. 安装 NVM (Node Version Manager)..."
if [ ! -d "$HOME/.nvm" ]; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
    echo "NVM 安装完成"
else
    echo "NVM 已安装"
fi

echo ""
echo "2. 加载 NVM..."
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

echo ""
echo "3. 安装 Node.js LTS..."
nvm install --lts
nvm use --lts
nvm alias default lts/*

echo ""
echo "4. 验证安装..."
node --version
npm --version

echo ""
echo "5. 配置 npm 镜像（加速下载）..."
npm config set registry https://registry.npmmirror.com

echo ""
echo "========================================"
echo "环境配置完成！"
echo "========================================"
echo ""
echo "Node.js 版本: $(node --version)"
echo "NPM 版本: $(npm --version)"
echo ""
echo "注意：请在 ~/.bashrc 或 ~/.bash_profile 中添加以下内容："
echo "export NVM_DIR=\"\$HOME/.nvm\""
echo "[ -s \"\$NVM_DIR/nvm.sh\" ] && \\. \"\$NVM_DIR/nvm.sh\""
echo ""

ENDSSH

echo ""
echo "========================================"
echo "配置完成！现在可以运行部署脚本。"
echo "========================================"
