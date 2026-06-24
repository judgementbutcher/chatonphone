#!/bin/bash
# ChatOnPhone VPS 同步脚本
# 用于快速同步本地更新到VPS

set -e

VPS_USER="gamer"
VPS_HOST="23.94.194.124"
DEPLOY_DIR="/var/www/chatonphone/releases/20260609132832"

echo "========================================"
echo "ChatOnPhone VPS 同步"
echo "========================================"
echo ""

echo "[1/6] 构建项目..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ 构建失败"
    exit 1
fi

echo ""
echo "[2/6] 打包文件..."
tar -czf chatonphone-dist.tar.gz dist server-dist
echo "✅ 打包完成 ($(ls -lh chatonphone-dist.tar.gz | awk '{print $5}'))"

echo ""
echo "[3/6] 上传到 VPS..."
scp chatonphone-dist.tar.gz ${VPS_USER}@${VPS_HOST}:~/
if [ $? -ne 0 ]; then
    echo "❌ 上传失败"
    rm chatonphone-dist.tar.gz
    exit 1
fi

echo ""
echo "[4/6] 在 VPS 上部署..."
ssh ${VPS_USER}@${VPS_HOST} bash << 'ENDSSH'
    cd ~/chatonphone
    tar -xzf ~/chatonphone-dist.tar.gz
    rm ~/chatonphone-dist.tar.gz

    echo "  复制文件到部署目录..."
    cp -r ~/chatonphone/dist/* /var/www/chatonphone/releases/20260609132832/dist/
    cp -r ~/chatonphone/server-dist/* /var/www/chatonphone/releases/20260609132832/server-dist/

    echo "  重启 Docker 容器..."
    docker restart chatonphone-server > /dev/null

    sleep 3

    echo "  验证容器状态..."
    if docker ps | grep -q chatonphone-server; then
        echo "  ✅ 容器运行正常"
    else
        echo "  ❌ 容器启动失败"
        exit 1
    fi
ENDSSH

if [ $? -ne 0 ]; then
    echo "❌ 部署失败"
    rm chatonphone-dist.tar.gz
    exit 1
fi

echo ""
echo "[5/6] 清理本地临时文件..."
rm chatonphone-dist.tar.gz

echo ""
echo "[6/6] 验证部署..."
ssh ${VPS_USER}@${VPS_HOST} "docker logs --tail 2 chatonphone-server"

echo ""
echo "========================================"
echo "✅ 同步完成！"
echo "========================================"
echo ""
echo "📦 部署信息："
echo "  容器: chatonphone-server"
echo "  端口: 127.0.0.1:3004 -> 0.0.0.0:3003"
echo ""
echo "⚠️  浏览器缓存清理提示："
echo "  1. 按 Ctrl+Shift+R (Mac: Cmd+Shift+R) 强制刷新"
echo "  2. 或打开 DevTools (F12):"
echo "     - Application -> Service Workers -> Unregister"
echo "     - Application -> Clear storage -> Clear site data"
echo "  3. 刷新页面"
echo ""
echo "📝 常用命令："
echo "  查看日志: ssh ${VPS_USER}@${VPS_HOST} 'docker logs -f chatonphone-server'"
echo "  重启服务: ssh ${VPS_USER}@${VPS_HOST} 'docker restart chatonphone-server'"
echo "  容器状态: ssh ${VPS_USER}@${VPS_HOST} 'docker ps | grep chatonphone'"
echo ""
