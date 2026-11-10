# bili-danmaku-capture

B 站（bilibili）多直播间弹幕实时监控网站。Node + TypeScript + React。

## 功能

- 单密钥登录，无用户名。
- 网页扫码登录 B 站账号，Cookie 自动检查与续期。
- 同时监控多个直播间，实时展示弹幕、醒目留言、礼物、上舰与进场事件。
- 按房间与日期落盘 JSONL，支持历史回看与 CSV 导出。
- 连接状态、人气值、在线人数与弹幕速率监控。

## 快速开始

```bash
npm install
cp .env.example .env   # 填写 ACCESS_KEY 与 SESSION_SECRET
npm run dev
```

浏览器打开 `http://localhost:5173`，输入 `.env` 中的 `ACCESS_KEY` 登录，然后在页面内扫码登录 B 站账号并添加直播间。

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `ACCESS_KEY` | 是 | 网站登录密钥 |
| `SESSION_SECRET` | 是 | 会话签名与 B 站会话加密密钥，至少 32 字符 |
| `BILI_COOKIE` | 否 | 可选的 B 站 Cookie 兜底 |
| `BILI_REFRESH_CHECK_MS` | 否 | Cookie 续期检查间隔，默认 6 小时 |
| `PORT` | 否 | 端口，默认 3000 |
| `APP_PORT` | 否 | 后端端口；开发模式 Vite 代理使用，默认回退 `PORT` |
| `MAX_ROOMS` | 否 | 监控房间上限，默认 10 |
| `SESSION_DAYS` | 否 | 会话有效期，默认 7 天 |

## 生产运行

```bash
npm run build
npm start
```

生产模式由同一个 Node 进程提供 API、WebSocket 与前端静态文件。建议只监听本机，通过 HTTPS 反向代理对外提供服务。

## 说明

- B 站凭证仅保存在服务端，扫码登录的会话加密存放于 `data/bili-session.json`。
- 未登录 B 站时仍可连接，但 B 站会打码昵称与 UID。
- 仓库协作与提交规范见 [CLAUDE.md](CLAUDE.md)。
