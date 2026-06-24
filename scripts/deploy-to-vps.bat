@echo off
REM ChatOnPhone VPS 部署脚本（Windows版本）
REM VPS地址: gamer@23.94.194.124

setlocal EnableDelayedExpansion

set VPS_USER=gamer
set VPS_HOST=23.94.194.124
set VPS_PATH=/home/gamer/chatonphone

echo ========================================
echo ChatOnPhone VPS 部署工具
echo ========================================
echo.

echo [1/5] 构建项目...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo 构建失败！
    exit /b 1
)

echo.
echo [2/5] 打包构建文件...
tar -czf chatonphone-dist.tar.gz dist server-dist package.json package-lock.json
if %ERRORLEVEL% neq 0 (
    echo 打包失败！
    exit /b 1
)

echo.
echo [3/5] 上传到 VPS...
scp chatonphone-dist.tar.gz %VPS_USER%@%VPS_HOST%:~/
if %ERRORLEVEL% neq 0 (
    echo 上传失败！请检查SSH连接。
    del chatonphone-dist.tar.gz
    exit /b 1
)

echo.
echo [4/5] 在 VPS 上部署...
ssh %VPS_USER%@%VPS_HOST% "mkdir -p ~/chatonphone && cd ~/chatonphone && tar -xzf ~/chatonphone-dist.tar.gz && rm ~/chatonphone-dist.tar.gz && npm install --omit=dev && pkill -f chatonphone-server || true && sleep 2 && nohup node server-dist/chatonphone-server.mjs > chatonphone.log 2>&1 & sleep 3 && pgrep -f chatonphone-server"
if %ERRORLEVEL% neq 0 (
    echo 部署失败！请检查VPS日志。
    del chatonphone-dist.tar.gz
    exit /b 1
)

echo.
echo [5/5] 清理本地临时文件...
del chatonphone-dist.tar.gz

echo.
echo ========================================
echo 部署完成！
echo ========================================
echo.
echo 访问地址: http://23.94.194.124:3000
echo.
echo 常用命令：
echo   查看日志: ssh %VPS_USER%@%VPS_HOST% "tail -f ~/chatonphone/chatonphone.log"
echo   停止服务: ssh %VPS_USER%@%VPS_HOST% "pkill -f chatonphone-server"
echo   重启服务: ssh %VPS_USER%@%VPS_HOST% "cd ~/chatonphone && pkill -f chatonphone-server; nohup node server-dist/chatonphone-server.mjs > chatonphone.log 2>&1 &"
echo.
pause
