# CLAUDE.md

本文件是 Claude Code 在本仓库工作时的行为约定，优先级高于默认习惯。开始任何任务前先读完本文件。

## 项目概况

- 仓库名：`bili-danmaku-capture`
- 目标：一个 Node + React + TypeScript 网站，实时监控 B 站（bilibili）多个指定直播间的弹幕并持久化。
- 主要能力：单密钥登录、B 站网页扫码登录、Cookie 自动检查与续期、多直播间并发连接、弹幕 / 醒目留言 / 礼物 / 上舰 / 进场事件、WebSocket 实时推送、按日 JSONL 落盘、历史回看与 CSV 导出。

## 必须遵守的仓库规则

1. **提交信息一律使用中文。** 包括标题与正文，不使用 `feat:`、`fix:`、`chore:` 这类英文类型前缀。
2. **每完成一个任务就提交一次。** 任务指一个可独立描述、可独立回滚的改动。同一任务内的多轮修改可以合并为一次提交。
3. **不要推送。** 不要执行 `git push`，不要自行添加或修改远程仓库（remote）。
4. **提交前先检查。** 运行 `git status` 和 `git diff --cached` 确认暂存内容，只提交与本次任务相关的文件；不要提交 `.env`、`data/`、日志或临时文件。
5. **不要改写已有历史。** 不执行 `git commit --amend`、`git rebase`、`git reset --hard`，除非用户明确要求。
6. **提交前验证。** 至少运行 `npm run typecheck`；涉及协议、存储、认证的改动同时运行 `npm test`；涉及构建配置的改动运行 `npm run build`。

## 提交信息格式

首行为中文简述，不超过 50 字，说明做了什么；需要时空一行写正文，分条说明原因或影响。

示例：

```
实现直播间弹幕 WebSocket 连接

- 复用登录 Cookie 完成鉴权握手
- 断线后按指数退避重连
```

## 技术栈

- 运行时：Node.js 24、TypeScript、ESM（`"type": "module"`）、Express 5、`ws`、React 19、Vite 8。
- 样式与交互：Tailwind CSS v4（`@tailwindcss/vite`，CSS-first `@theme`）、`@phosphor-icons/react`、`motion`。
- 其他：`qrcode` 生成登录二维码；`node:crypto` 做 MD5/HMAC/AES/RSA；`node:zlib` 解压；内置 `fetch`。
- 服务端 tsconfig 使用 NodeNext，相对导入必须带 `.js` 后缀。
- 构建：服务端由 esbuild 打包成 `dist/main.mjs` 单文件（ESM，仅 `node:*` 与 `ws` 的可选原生依赖保持 external），生产运行不需要 `node_modules`（`express`、`ws`、`qrcode` 已打进产物）；前端由 Vite 输出 `dist/client`。
- 不引入 UI 组件库、路由库、状态管理库、图表库、数据库驱动；新增依赖前先说明理由并更新本文件。

## 目录结构

```
src/shared/            前后端共享类型与常量（禁止依赖 Node/浏览器 API）
src/server/
  index.ts             组合根：配置、HTTP、WS、静态托管、优雅退出
  config.ts            .env 读取与校验
  auth.ts              单密钥登录、HMAC 会话、限流、HTTP/WS 鉴权
  routes/              auth、rooms、history、bili
  bili/                WBI、HTTP 封装、会话/Cookie Jar、扫码登录、Cookie 续期、房间信息、封包、事件归一化、直播连接
  monitor/             房间生命周期、JSONL 存储、CSV 导出
  ws.ts                浏览器 WebSocket 网关
src/client/            React 页面、组件、hooks、实时客户端、事件缓冲、样式
tests/                 node:test 单元测试（不依赖真实 B 站网络）
scripts/               probe / watch-room / ws-probe 开发探针
.claude/launch.json    本地预览配置（dev 与 prod 两个入口）
data/                  运行时数据，已被 gitignore
docs/bilibili-API-collect/  第三方 API 文档，已被 gitignore
```

## 常用命令

```bash
npm install          # 安装依赖
npm run dev          # 同时启动后端（APP_PORT，默认 3000）与 Vite（5173）
npm run build        # 类型检查 + esbuild 打包服务端 + 构建前端
npm start            # 运行 dist/main.mjs（需先 build，无需 node_modules）
npm run typecheck    # 服务端与前端类型检查
npm test             # node:test 单元测试
npm run probe -- 6   # 探测房间信息、WBI 与弹幕服务器
npm run watch-room -- 6 15   # 直接连接弹幕 15 秒并打印
npm run ws-probe -- 6 20     # 验证 WebSocket 鉴权、订阅与推送
```

生产部署只需 `dist/`（`main.cjs` + `client/`）与 `.env`；`data/` 按需挂载。不再需要上传 `package.json` 或 `node_modules`。

## 环境变量（.env）

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `ACCESS_KEY` | 是 | 网站登录密钥，只此一项，无用户名 |
| `SESSION_SECRET` | 是 | 会话 Cookie 与 B 站会话加密的密钥，至少 32 字符 |
| `BILI_COOKIE` | 否 | 可选的 B 站 Cookie 兜底；扫码登录保存的会话优先 |
| `BILI_REFRESH_CHECK_MS` | 否 | Cookie 续期检查间隔，默认 6 小时 |
| `PORT` | 否 | HTTP 端口，默认 3000 |
| `APP_PORT` | 否 | 后端端口；开发模式下 Vite 代理使用，未设置时回退 `PORT` |
| `MAX_ROOMS` | 否 | 同时监控房间上限，默认 10 |
| `SESSION_DAYS` | 否 | 网站会话有效期，默认 7 天 |
| `COOKIE_SECURE` | 否 | 通过 HTTPS 访问时设为 `true`，会话 Cookie 带 `Secure` |

## 认证与安全约定

- 网站登录只比较 `ACCESS_KEY`，两边先 SHA-256 再 `timingSafeEqual`；按 IP 限流，失败日志不记录密钥。
- 会话为 HMAC 签名的 httpOnly Cookie：`SameSite=Lax`、`Path=/`，HTTPS 下加 `Secure`。
- B 站凭证只存在服务端：扫码登录得到的 Cookie 与 `refresh_token` 用 AES-256-GCM 加密写入 `data/bili-session.json`；`.env` 的 `BILI_COOKIE` 仅作兜底。
- Cookie 续期按官方流程：`cookie/info` → CorrespondPath → `refresh_csrf` → `cookie/refresh` → `confirm/refresh`；`refresh_token` 会轮换，确认步骤用旧 token + 新 Cookie 的 `bili_jct`。
- 任何日志、接口响应、前端 bundle 都不得出现 Cookie、`refresh_token`、`ACCESS_KEY`。
- `data/` 不允许挂到静态目录，历史与导出只能走鉴权 API。
- WebSocket 升级阶段校验会话 Cookie 与同源 Origin。
- 响应带 CSP、`X-Frame-Options: DENY`、`nosniff` 等安全头；`COOKIE_SECURE=true` 时追加 HSTS。
- 开发环境后端端口优先读取 `APP_PORT`，避免宿主注入的 `PORT` 与 Vite 端口冲突。

## 数据与存储

- `data/rooms.json`：监控中的房间配置（输入号、真实房间号、标题、主播、添加时间），原子写入。
- `data/<真实房间号>/<YYYY-MM-DD>.jsonl`：每行一个归一化事件；日期固定按 `Asia/Shanghai` 计算；UTF-8、LF、无 BOM。
- 事件结构见 `src/shared/types.ts`，含 `v`、`id`、`roomId`、`type`、`ts`、`receivedAt`、`user`、`text`、`price`、`emoticons`、`extra`。
- 弹幕表情从 `DANMU_MSG` 的 `extra.emots` 提取，只保留 `*.hdslb.com` 的图片地址并升级为 https；前端按 token 替换为图片，历史记录同样可回显。
- 装扮/UP 主表情（`upower_` 等）不在 `emots` 中，用直播间历史弹幕接口的 `emoticon` 字段补齐 token→图片映射；房间启动与每 60 秒刷新缓存，遇到未匹配 token 时按需再查一次。
- 写入按房间串行、批量 flush；历史读取从文件尾部反向读取；CSV 带 UTF-8 BOM，并防公式注入。

## 直播指标口径

- **在线用户**：WebSocket `ONLINE_RANK_COUNT.online_count`，可能被房间隐藏或封顶；未收到时显示 `—`。
- **看过人数**：`WATCHED_CHANGE.num` 或 `getInfoByRoom.watched_show.num`。
- 界面不展示人气。`get_info.online` 是热度值，心跳 op3 在部分房间会返回 `1`，二者都不可当作在线人数。

## 开发约定

- 代码注释、文档、示例文本使用中文；标识符（变量、函数、接口名）使用英文。
- **所有时间统一使用北京时间（`Asia/Shanghai`）**：日志、JSONL 文件名与内容、CSV、界面显示都不得使用服务器本地时区或 UTC；统一走 `src/shared/time.ts` 的工具函数。
- 前后端共享的结构、WS 消息、常量统一放在 `src/shared/`；修改协议必须同步两端。
- 服务端只有 `src/server/index.ts` 读取 `process.env`，其余模块通过参数注入依赖，便于测试。
- 一个提交只做一件事，避免把无关改动混在一起。
- 单元测试使用 Node 内置 `node:test`；协议、存储、认证逻辑必须有纯函数测试，不依赖真实 B 站网络。
- 前端遵循 design-taste 基线：非对称布局、克制动效、单一低饱和强调色；禁用 emoji、纯黑、紫蓝霓虹、每行重动画。
- 引入新依赖、确定技术栈或调整目录结构属于设计决策，先更新本文件再动代码。

## 未来可扩展

- 弹幕关键词高亮与告警、虚拟列表、按用户/时间统计、导出格式扩展。
- 目前只支持直播弹幕，不支持视频弹幕与发送弹幕。
