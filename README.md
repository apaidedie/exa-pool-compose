# Exa Pool

基于原始 `Cloudflare Worker + D1` 实现改造的本地部署版 Exa API 密钥池，现支持：

- 上游项目：`https://github.com/chengtx809/exa-pool`

- 直接用 Node.js 启动本地 HTTP 服务
- 使用 SQLite 兼容原有 D1 调用方式
- 通过 Docker Compose 持久化部署
- 保留原管理面板、管理接口与代理接口

## 功能特性

- Exa API 密钥轮询与自动故障转移
- 管理面板与 JWT 管理登录
- Allowed Keys 访问控制
- 兼容 Exa 官方核心接口
- Research 任务映射与查询
- SQLite 本地持久化

## 支持端点

| 端点 | 方法 | 说明 |
| ---- | ---- | ---- |
| `/` | GET | 管理面板 |
| `/api/admin/login` | POST | 管理登录 |
| `/api/admin/logout` | POST | 管理登出 |
| `/api/admin/keys` | GET/POST/DELETE | Exa 密钥管理 |
| `/api/admin/keys/validate` | POST | 批量标记校验结果 |
| `/api/admin/keys/check` | POST | 单 key 校验 |
| `/api/admin/keys/cleanup` | POST | 清理失效/耗尽 key |
| `/api/admin/allowed-keys` | GET/POST/DELETE | Allowed Keys 管理 |
| `/api/admin/stats` | GET | 统计信息 |
| `/search` | POST | 搜索 |
| `/contents` | POST | 获取内容 |
| `/findSimilar` | POST | 查找相似链接 |
| `/answer` | POST | AI 问答 |
| `/research/v1` | POST/GET | 创建或列出 Research 任务 |
| `/research/v1/:researchId` | GET | 查询单个 Research 任务 |

## 环境要求

- Node.js `>= 22.17.0`
- 推荐 Node.js `24.x`
- 启动时需使用 `--experimental-sqlite`

## 环境变量

复制 `.env.example` 为 `.env` 后按需修改：

```env
ADMIN_KEY=change-this-admin-key
PORT=3000
DB_PATH=./data/exa-pool.sqlite
VALIDATION_CONCURRENCY=10
```

变量说明：

- `ADMIN_KEY`: 管理面板登录密码，必填
- `PORT`: 本地 HTTP 监听端口，默认 `3000`
- `DB_PATH`: SQLite 文件路径，默认 `./data/exa-pool.sqlite`
- `VALIDATION_CONCURRENCY`: 前端批量校验并发数，默认 `10`

## 本地运行

```bash
cp .env.example .env
node --experimental-sqlite server.js
```

或使用脚本：

```bash
npm start
```

启动后访问：

- 管理面板：`http://127.0.0.1:3000/`

## Docker Compose 部署

### 1. 准备配置

```bash
cp .env.example .env
```

修改 `.env` 中至少以下参数：

- `ADMIN_KEY`
- `PORT`

### 2. 启动服务

```bash
docker compose up -d --build
```

### 3. 查看日志

```bash
docker compose logs -f
```

### 4. 停止服务

```bash
docker compose down
```

说明：

- SQLite 数据文件会持久化到宿主机的 `./data`
- 容器内数据库路径固定为 `/app/data/exa-pool.sqlite`

## 初始化使用

1. 打开管理面板 `/`
2. 用 `ADMIN_KEY` 登录
3. 添加 Exa API keys
4. 添加 Allowed Key
5. 用 Allowed Key 访问代理接口

## API 使用示例

### 管理登录

```bash
curl -X POST 'http://127.0.0.1:3000/api/admin/login' \
  -H 'Content-Type: application/json' \
  -d '{"adminKey":"your-admin-key"}'
```

### 添加 Allowed Key

```bash
curl -X POST 'http://127.0.0.1:3000/api/admin/allowed-keys' \
  -H 'Authorization: Bearer YOUR_ADMIN_JWT' \
  -H 'Content-Type: application/json' \
  -d '{"key":"YOUR_ALLOWED_KEY","name":"default"}'
```

### 搜索

```bash
curl -X POST 'http://127.0.0.1:3000/search' \
  -H 'x-api-key: YOUR_ALLOWED_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"query":"Latest AI research","numResults":5}'
```

### 获取内容

```bash
curl -X POST 'http://127.0.0.1:3000/contents' \
  -H 'x-api-key: YOUR_ALLOWED_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"urls":["https://example.com"],"text":true}'
```

### 查找相似链接

```bash
curl -X POST 'http://127.0.0.1:3000/findSimilar' \
  -H 'x-api-key: YOUR_ALLOWED_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://arxiv.org/abs/2307.06435","numResults":5}'
```

### AI 问答

```bash
curl -X POST 'http://127.0.0.1:3000/answer' \
  -H 'x-api-key: YOUR_ALLOWED_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"query":"What is the latest valuation of SpaceX?","text":true}'
```

### 创建 Research 任务

```bash
curl -X POST 'http://127.0.0.1:3000/research/v1' \
  -H 'x-api-key: YOUR_ALLOWED_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"instructions":"Summarize the latest papers on vision transformers.","model":"exa-research"}'
```

## 实现说明

- `worker.js` 仍保留原有核心业务逻辑
- `server.js` 负责把本地 HTTP 请求桥接到 `worker.fetch()`
- `d1-sqlite.js` 提供 D1 风格的 `prepare().bind().first().all().run()` 兼容层
- 数据库会在首次请求时自动初始化

## 验证情况

已完成本地烟测：

- 首页可访问
- 管理登录可用
- 统计接口可用
- Allowed Key 新增与查询可用
- 未认证代理请求会返回 `401`

## License

MIT
