# bili-danmaku-capture

B 站（bilibili）多直播间弹幕实时监控网站。Node + TypeScript + React。

## 功能

- 单密钥登录，无用户名；会话保存在 httpOnly Cookie。
- 网页扫码登录 B 站账号，Cookie 自动检查与续期。
- 同时监控多个直播间，实时展示弹幕、醒目留言、礼物、上舰、进场与关注事件。
- 弹幕中的 `[表情]` token 自动替换为 B 站表情图片，包括直播间自定义/装扮表情，历史记录同样支持。
- 按类型、关键词、用户筛选；暂停、自动滚动、历史回看。
- 按房间与北京时间日期落盘 JSONL，支持 CSV 导出。
- 连接状态、在线用户数、看过人数与最近 60 秒弹幕速率。

## 环境要求

- Node.js >= 22.12（使用内置 `fetch`、`process.loadEnvFile` 与 Brotli）
- npm

## 快速开始

```bash
npm install
cp .env.example .env
```

编辑 `.env`，至少填写：

```ini
ACCESS_KEY=你的网站登录密钥
SESSION_SECRET=至少32位的随机字符串
```

然后启动开发环境：

```bash
npm run dev
```

打开 `http://localhost:5173`，输入 `ACCESS_KEY` 登录。之后：

1. 点击右上角「B 站未登录」，用 B 站手机客户端扫码登录（可选；未登录时昵称与 UID 会被打码）。
2. 在左侧输入房间号或粘贴 `https://live.bilibili.com/<房间号>` 链接。
3. 在「实时 / 历史」之间切换，或导出当天 CSV。

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `ACCESS_KEY` | 是 | 网站登录密钥 |
| `SESSION_SECRET` | 是 | 会话签名与 B 站会话加密密钥，至少 32 字符 |
| `BILI_COOKIE` | 否 | 可选的 B 站 Cookie 兜底；扫码登录保存的会话优先 |
| `BILI_REFRESH_CHECK_MS` | 否 | Cookie 续期检查间隔，默认 6 小时 |
| `PORT` | 否 | 生产端口，默认 3000 |
| `APP_PORT` | 否 | 后端端口；开发模式 Vite 代理使用，默认回退 `PORT` |
| `MAX_ROOMS` | 否 | 监控房间上限，默认 10 |
| `SESSION_DAYS` | 否 | 网站会话有效期，默认 7 天 |
| `COOKIE_SECURE` | 否 | 通过 HTTPS 访问时设为 `true` |

## 生产运行

```bash
npm run build
npm start
```

服务端被 esbuild 打包成 `dist/main.mjs` 单文件，前端输出在 `dist/client`。部署时只需上传 `dist/` 与 `.env`，**不需要** `package.json` 或 `node_modules`：

```bash
node dist/main.mjs
```

访问 `http://127.0.0.1:3000`。建议只监听本机，通过 Caddy/Nginx 等 HTTPS 反向代理对外提供服务，并设置 `COOKIE_SECURE=true`。容器部署时设 `HOST=0.0.0.0`，否则容器内只监听回环地址。

## 数据与隐私

- `data/rooms.json`：监控中的房间配置。
- `data/<真实房间号>/<YYYY-MM-DD>.jsonl`：每个事件一行，日期按北京时间。
- `data/bili-session.json`：B 站 Cookie 与 `refresh_token`，使用 AES-256-GCM 加密。
- `.env`、`data/`、`docs/bilibili-API-collect/` 均不会提交到 Git。
- Cookie、`refresh_token`、访问密钥只存在于服务端，不会出现在前端代码或接口响应中。

## 常用命令

```bash
npm run dev          # 同时启动服务端与 Vite
npm run build        # 类型检查 + 打包服务端 + 构建前端
npm start            # 运行 dist/main.mjs（无需 node_modules）
npm run typecheck    # 类型检查
npm test             # 单元测试（node:test）
npm run probe -- 6   # 探测房间信息、WBI、弹幕服务器
npm run watch-room -- 6 15   # 直接连接直播间弹幕并打印 15 秒
npm run ws-probe -- 6 20     # 通过 WebSocket 网关验证订阅与推送
```

## 目录

```
src/shared/     前后端共享类型、协议与北京时间工具
src/server/     Express、认证、B 站接入、房间管理、JSONL、WebSocket 网关
src/client/     React 监控界面、实时客户端与事件缓冲
tests/          node:test 单元测试
scripts/        开发探针脚本
docs/           第三方 B 站 API 文档（本地参考，不提交）
```

仓库协作与提交规范见 [CLAUDE.md](CLAUDE.md)。
