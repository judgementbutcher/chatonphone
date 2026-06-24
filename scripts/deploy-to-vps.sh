#!/bin/bash

# ChatOnPhone VPS 部署脚本
# VPS地址: gamer@23.94.194.124

set -e

echo "开始部署 ChatOnPhone 到 VPS..."

# VPS配置
VPS_USER="gamer"
VPS_HOST="23.94.194.124"
VPS_PATH="/home/gamer/chatonphone"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}步骤 1: 构建项目...${NC}"
npm run build

echo -e "${YELLOW}步骤 2: 打包构建文件...${NC}"
tar -czf chatonphone-dist.tar.gz dist/ server-dist/ package.json package-lock.json

echo -e "${YELLOW}步骤 3: 上传到 VPS...${NC}"
scp chatonphone-dist.tar.gz ${VPS_USER}@${VPS_HOST}:~/

echo -e "${YELLOW}步骤 4: 在 VPS 上部署...${NC}"
ssh ${VPS_USER}@${VPS_HOST} << 'ENDSSH'
    set -e

    echo "创建目录..."
    mkdir -p ~/chatonphone
    cd ~/chatonphone

    echo "解压文件..."
    tar -xzf ~/chatonphone-dist.tar.gz
    rm ~/chatonphone-dist.tar.gz

    echo "安装生产依赖..."
    npm install --omit=dev

    echo "重启服务..."
    # 检查是否有旧进程
    if pgrep -f "chatonphone-server" > /dev/null; then
        echo "停止旧服务..."
        pkill -f "chatonphone-server" || true
        sleep 2
    fi

    # 使用 nohup 在后台启动服务
    echo "启动新服务..."
    nohup node server-dist/chatonphone-server.mjs > chatonphone.log 2>&1 &

    echo "等待服务启动..."
    sleep 3

    # 检查服务是否正在运行
    if pgrep -f "chatonphone-server" > /dev/null; then
        echo "服务启动成功！"
        echo "查看日志: tail -f ~/chatonphone/chatonphone.log"
    else
        echo "服务启动失败，请检查日志"
        tail -20 chatonphone.log
        exit 1
    fi
ENDSSH

echo -e "${YELLOW}步骤 5: 清理本地临时文件...${NC}"
rm chatonphone-dist.tar.gz

echo -e "${GREEN}部署完成！${NC}"
echo ""
echo "访问地址: http://23.94.194.124:3000"
echo "查看日志: ssh ${VPS_USER}@${VPS_HOST} 'tail -f ~/chatonphone/chatonphone.log'"
echo "停止服务: ssh ${VPS_USER}@${VPS_HOST} 'pkill -f chatonphone-server'"
