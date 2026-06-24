# ChatOnPhone

<div align="center">

一个轻量级的 PWA 聊天应用，专为移动端设计，支持 OpenAI 兼容 API。

[English](#english) | [中文](#chinese)

</div>

---

## <a name="chinese"></a>🌟 特性

- 📱 **PWA 支持** - 可安装到手机主屏幕，离线可用
- 🎨 **现代化界面** - 简洁优雅的设计，流畅的动画效果
- 🌓 **深色模式** - 自动适配系统主题
- 💬 **多会话管理** - 支持创建、重命名、删除会话
- 🖼️ **图片上传** - 支持多张图片同时上传（需 API 支持）
- 🔄 **消息重试** - 支持编辑和重新生成消息
- ⚙️ **多提供商** - 支持配置多个 API 提供商
- 🔐 **账号同步** - 可选的云端设置同步功能
- ⚡ **快速切换** - 快捷模型选择器

## 🚀 快速开始

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 访问 http://localhost:5173
```

### 构建部署

```bash
# 构建生产版本
npm run build

# 预览构建产物
npm run preview
```

构建产物位于：
- `dist/` - 前端静态文件
- `server-dist/` - Node.js 代理服务器

### Docker 部署

1. 构建项目：
```bash
npm run build
```

2. 使用 Docker 运行：
```bash
docker run -d \
  --name chatonphone \
  -p 3003:3003 \
  -v $(pwd)/dist:/app/dist \
  -v $(pwd)/server-dist:/app/server-dist \
  node:24-alpine \
  node /app/server-dist/chatonphone-server.mjs
```

3. 访问 `http://localhost:3003`

### VPS 部署

使用提供的同步脚本：

```bash
# 编辑脚本中的 VPS 信息
vim scripts/sync-to-vps.sh

# 部署到 VPS
bash scripts/sync-to-vps.sh
```

脚本会自动：
1. 构建项目
2. 打包文件
3. 上传到 VPS
4. 重启容器

## ⚙️ 配置

### 首次使用

1. 打开应用，注册一个账号（用于设置同步）
2. 点击右上角设置按钮
3. 配置 API 提供商：
   - **API Base URL**: OpenAI 兼容 API 地址
   - **API Key**: 你的 API 密钥
   - **Model**: 模型名称（如 `gpt-4o-mini`）
4. 点击"测试连接"验证配置
5. 保存设置

### 多提供商配置

支持配置多个 API 提供商，方便快速切换：

```json
{
  "providers": [
    {
      "id": "openai",
      "name": "OpenAI",
      "apiBaseUrl": "https://api.openai.com/v1",
      "models": ["gpt-4o", "gpt-4o-mini"]
    },
    {
      "id": "custom",
      "name": "自定义",
      "apiBaseUrl": "https://your-api.com/v1",
      "models": ["custom-model"]
    }
  ]
}
```

### 代理模式

如果 API 不支持跨域，可以使用内置代理：

1. 启动代理服务器：
```bash
npm run start:server
```

2. 在设置中选择"代理模式"
3. 配置代理 URL: `http://localhost:3003/proxy`

## 🧪 测试

```bash
# 运行单元测试
npm run test

# 监听模式
npm run test:watch

# E2E 测试
npm run e2e
```

## 📱 PWA 安装

### Android
1. 在 Chrome 浏览器中打开应用
2. 点击右上角菜单
3. 选择"添加到主屏幕"
4. 确认安装

### iOS
1. 在 Safari 浏览器中打开应用
2. 点击底部分享按钮
3. 选择"添加到主屏幕"
4. 确认安装

## 🏗️ 技术栈

- **前端**: React 19 + TypeScript
- **构建**: Vite 8
- **PWA**: vite-plugin-pwa + Workbox
- **存储**: IndexedDB
- **UI**: Lucide React Icons
- **测试**: Vitest + Playwright
- **服务端**: Node.js 24

## 📁 项目结构

```
chatonphone/
├── src/
│   ├── components/       # React 组件
│   ├── domain/          # 业务逻辑
│   ├── storage/         # IndexedDB 操作
│   ├── state/           # 状态管理
│   ├── auth/            # 认证客户端
│   ├── sync/            # 设置同步
│   └── transport/       # API 通信
├── server/              # 代理服务器
├── tests/               # 单元测试
├── e2e/                 # E2E 测试
├── scripts/             # 部署脚本
└── public/              # 静态资源
```

## 🔧 常见问题

### 部署后看不到更新？

PWA 会缓存资源，更新后需要：
1. 按 `Ctrl + Shift + R` 强制刷新
2. 或在 DevTools 中注销 Service Worker
3. 详见脚本输出的提示

### CORS 错误？

1. 使用代理模式
2. 或在 API 服务器上配置 CORS

### 图片上传失败？

确保使用的模型支持图片输入（如 GPT-4 Vision）

## 📄 许可证

MIT License

---

## <a name="english"></a>🌟 Features

- 📱 **PWA Support** - Installable to home screen, works offline
- 🎨 **Modern UI** - Clean design with smooth animations
- 🌓 **Dark Mode** - Auto adapts to system theme
- 💬 **Multi-Conversation** - Create, rename, delete conversations
- 🖼️ **Image Upload** - Support multiple images (API dependent)
- 🔄 **Message Retry** - Edit and regenerate messages
- ⚙️ **Multi-Provider** - Configure multiple API providers
- 🔐 **Account Sync** - Optional cloud settings sync
- ⚡ **Quick Switch** - Fast model selector

## 🚀 Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Visit http://localhost:5173
```

### Build & Deploy

```bash
# Build for production
npm run build

# Preview build
npm run preview
```

Build outputs:
- `dist/` - Frontend static files
- `server-dist/` - Node.js proxy server

### Docker Deployment

1. Build the project:
```bash
npm run build
```

2. Run with Docker:
```bash
docker run -d \
  --name chatonphone \
  -p 3003:3003 \
  -v $(pwd)/dist:/app/dist \
  -v $(pwd)/server-dist:/app/server-dist \
  node:24-alpine \
  node /app/server-dist/chatonphone-server.mjs
```

3. Visit `http://localhost:3003`

### VPS Deployment

Use the provided sync script:

```bash
# Edit VPS information in the script
vim scripts/sync-to-vps.sh

# Deploy to VPS
bash scripts/sync-to-vps.sh
```

The script will automatically:
1. Build the project
2. Package files
3. Upload to VPS
4. Restart container

## ⚙️ Configuration

### First Time Setup

1. Open the app and register an account (for settings sync)
2. Click settings button in top-right corner
3. Configure API provider:
   - **API Base URL**: OpenAI-compatible API endpoint
   - **API Key**: Your API key
   - **Model**: Model name (e.g., `gpt-4o-mini`)
4. Click "Test Connection" to verify
5. Save settings

### Multi-Provider Setup

Configure multiple API providers for quick switching:

```json
{
  "providers": [
    {
      "id": "openai",
      "name": "OpenAI",
      "apiBaseUrl": "https://api.openai.com/v1",
      "models": ["gpt-4o", "gpt-4o-mini"]
    },
    {
      "id": "custom",
      "name": "Custom",
      "apiBaseUrl": "https://your-api.com/v1",
      "models": ["custom-model"]
    }
  ]
}
```

### Proxy Mode

If your API doesn't support CORS, use the built-in proxy:

1. Start the proxy server:
```bash
npm run start:server
```

2. Select "Proxy Mode" in settings
3. Configure proxy URL: `http://localhost:3003/proxy`

## 🧪 Testing

```bash
# Run unit tests
npm run test

# Watch mode
npm run test:watch

# E2E tests
npm run e2e
```

## 📱 PWA Installation

### Android
1. Open the app in Chrome browser
2. Tap menu in top-right corner
3. Select "Add to Home screen"
4. Confirm installation

### iOS
1. Open the app in Safari browser
2. Tap share button at bottom
3. Select "Add to Home Screen"
4. Confirm installation

## 🏗️ Tech Stack

- **Frontend**: React 19 + TypeScript
- **Build**: Vite 8
- **PWA**: vite-plugin-pwa + Workbox
- **Storage**: IndexedDB
- **UI**: Lucide React Icons
- **Testing**: Vitest + Playwright
- **Server**: Node.js 24

## 📁 Project Structure

```
chatonphone/
├── src/
│   ├── components/       # React components
│   ├── domain/          # Business logic
│   ├── storage/         # IndexedDB operations
│   ├── state/           # State management
│   ├── auth/            # Auth client
│   ├── sync/            # Settings sync
│   └── transport/       # API communication
├── server/              # Proxy server
├── tests/               # Unit tests
├── e2e/                 # E2E tests
├── scripts/             # Deploy scripts
└── public/              # Static assets
```

## 🔧 FAQ

### Can't see updates after deployment?

PWA caches resources. After updating:
1. Press `Ctrl + Shift + R` to hard refresh
2. Or unregister Service Worker in DevTools
3. See script output for details

### CORS errors?

1. Use proxy mode
2. Or configure CORS on your API server

### Image upload fails?

Ensure your model supports image input (e.g., GPT-4 Vision)

## 📄 License

MIT License
