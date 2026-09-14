# OpenTV Go Worker

OpenTV 的可选 Go 服务端，负责服务器离线下载与 OpenList 根目录列举。原有 Next.js API 继续承担用户鉴权、权限判断和业务入口，前端及 Android TV 使用原来的地址与协议。默认部署不启动此服务，两个 Node 适配开关默认关闭。

## 首期能力

| 模块           | Go 负责                                                      | Node 继续负责                                                               |
| -------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| 服务器离线下载 | 任务管理、HLS 获取、分片并发、重试、删除取消、任务文件持久化 | 原 `/api/offline-download` 鉴权与转发、下载页面、本地媒体读取               |
| OpenList 扫描  | 登录、多根目录分页列举、401 刷新、并发与出站控制             | 扫描任务及进度、文件夹名称解析、TMDB 匹配、元数据合并、数据库保存、缓存失效 |

下载沿用 `tasks.json` 和 `source/videoId/epN/` 文件布局。已完成文件可以通过原 `/api/offline-download/local` 接口播放；启动时将旧 `pending` / `downloading` 任务标为 `paused`，通过原有“重试”操作继续。普通视频和 IPTV 的播放请求仍按原配置由浏览器访问来源。

支持原实现能够完整保存的单层 HLS master、TS 分片和单把 AES-128 密钥，保留 IV、标签及签名查询参数。fMP4/MAP、BYTERANGE、独立音轨、多层 master、不同密钥轮换和低延迟 HLS 会返回明确的任务错误。Go 不新增转码、直播录制、浏览器下载或自动代理回退。

OpenList 此阶段列举各根目录的第一层文件夹，不递归扫描媒体文件；匹配算法和数据存储留在 Node。扫描状态仍使用现有 Node 任务机制，不提供跨 Node 重启的扫描恢复。

## 本地运行

使用 Go 1.25 或更高版本，模块仅依赖标准库。Docker 默认使用 Go 1.27 构建。Go 不自动加载 `.env.local`，需要向进程传入环境变量。

在项目根目录的 PowerShell 中启动仅扫描服务：

```powershell
$env:OPENTV_GO_TOKEN = 'REPLACE_WITH_AN_INDEPENDENT_RANDOM_TOKEN'
$env:OPENTV_GO_LISTEN_ADDR = '127.0.0.1:8081'
$env:OPENTV_GO_OFFLINE_DOWNLOADS = 'false'
# 仅在 OpenList 部署于受信任内网时填写其精确 origin。
$env:OPENTV_GO_ALLOWED_ORIGINS = '["http://127.0.0.1:5244"]'
Set-Location services/go-worker
go run ./cmd/opentv-worker
```

将占位令牌换为至少 32 字符、不含空白的独立随机值。Node 的 `.env.local` 配置相同令牌并重启应用：

```dotenv
OPENTV_GO_URL=http://127.0.0.1:8081
OPENTV_GO_TOKEN=REPLACE_WITH_AN_INDEPENDENT_RANDOM_TOKEN
OPENTV_GO_OPENLIST_SCAN=true
OPENTV_GO_OFFLINE_DOWNLOADS=false
```

仅扫描模式不会打开下载目录。迁移下载时，先停止原 Node 及已有 Go 进程，备份下载目录，再在 **Node 和 Go 两端**设置 `OPENTV_GO_OFFLINE_DOWNLOADS=true`，并为两者配置相同绝对路径 `OFFLINE_DOWNLOAD_DIR`。启动 Go 后重新启动 Node。原 `NEXT_PUBLIC_ENABLE_OFFLINE_DOWNLOAD=true` 与管理员权限仍是下载 API 的前提。

## Docker Compose

使用仓库根目录的可选 [compose.go-worker.yaml](../../compose.go-worker.yaml)，与现有 [compose.local.yaml](../../compose.local.yaml) 组合。该覆盖文件默认仅切换扫描；下载需显式启用。Go 只加入 Compose 内部网络，不发布主机端口，与 Node 共享原 `downloads` 数据卷。

既有项目改名先阅读[从旧 Compose 名称升级](../../docs/DOCKER.md#从旧-compose-名称升级)。迁移及后续切换继续保留 `--env-file .env.go-worker.local -f compose.local.yaml -f compose.go-worker.yaml`，使 Node 与 Go 两端沿用相同的适配配置。当前项目名为 `opentv-local`，应用服务名为 `opentv`，下载卷仍显式绑定原有卷。

按 [Docker 部署指南](../../docs/DOCKER.md) 准备原有三个环境文件。另建未跟踪的 `.env.go-worker.local`，供 Compose 插值读取：

```dotenv
OPENTV_GO_TOKEN=REPLACE_WITH_AN_INDEPENDENT_RANDOM_TOKEN
OPENTV_GO_OPENLIST_SCAN=true
OPENTV_GO_OFFLINE_DOWNLOADS=false
# 内网 OpenList 示例；公网来源通常无需此项。
OPENTV_GO_ALLOWED_ORIGINS=["http://openlist:5244"]
```

OpenList 主机须能从 Go 容器访问；容器内的 `127.0.0.1` 指向 Go 容器自身。此文件通过 `--env-file` 读取，只在 `.env.docker.local` 填写这些值不会覆盖 Compose 的同名 `environment`。若原部署配置了 `PUID` / `PGID`，在此文件填写相同值，使两个服务都能访问原下载卷。

```sh
docker compose --env-file .env.go-worker.local -f compose.local.yaml -f compose.go-worker.yaml build opentv opentv-go
docker compose --env-file .env.go-worker.local -f compose.local.yaml -f compose.go-worker.yaml up -d --no-build --wait
```

切换下载引擎前，应完成或停止当前下载并备份下载卷。将覆盖环境文件的 `OPENTV_GO_OFFLINE_DOWNLOADS` 改为 `true` 后，先停止旧 Node 和 Go，再启动两者，避免启动先后顺序造成双写：

```sh
docker compose --env-file .env.go-worker.local -f compose.local.yaml -f compose.go-worker.yaml stop opentv opentv-go
docker compose --env-file .env.go-worker.local -f compose.local.yaml -f compose.go-worker.yaml up -d --no-build --wait
```

Go 使用文件锁阻止两个 Go 下载进程同时操作同一任务库。**旧 Node 下载器不识别此锁，因此切换时必须停止旧进程；不要对同一个下载卷运行多个下载实例。** 此服务暂不支持下载任务的多副本调度。

回退到 Node：先按上面的 `stop` 命令停掉两者，改回 `OPENTV_GO_OFFLINE_DOWNLOADS=false`，需要时也关闭 `OPENTV_GO_OPENLIST_SCAN`，再 `up` 重建环境。完全移除 Go 时，停止 Go 后只用原 `compose.local.yaml` 重建 Node；同时确保 `.env.docker.local` 中没有启用 Go 的开关。保留下载卷和 `tasks.json`，不要使用 `down -v`。

## 配置

| 变量                            | 位置及默认值         | 说明                                                      |
| ------------------------------- | -------------------- | --------------------------------------------------------- |
| `OPENTV_GO_URL`                 | Node，未设置         | Go 的 HTTP(S) origin，不带路径、查询或凭证                |
| `OPENTV_GO_TOKEN`               | 两端，必填           | 相同的独立服务令牌，至少 32 字符且无空白                  |
| `OPENTV_GO_OFFLINE_DOWNLOADS`   | 两端，`false`        | 仅精确值 `true` 启用；Go 关闭时不打开任务库               |
| `OPENTV_GO_OPENLIST_SCAN`       | Node，`false`        | 将根目录列举委派给 Go；覆盖 Compose 默认 `true`           |
| `OPENTV_GO_LISTEN_ADDR`         | Go，`127.0.0.1:8081` | 容器为 `0.0.0.0:8081`                                     |
| `OFFLINE_DOWNLOAD_DIR`          | 两端                 | Go 默认工作目录下 `.data/downloads`，容器两端统一 `/data` |
| `OPENTV_GO_ALLOWED_ORIGINS`     | Go，`[]`             | 允许访问的受信任内网 origin JSON 数组，包含协议和端口     |
| `OFFLINE_DOWNLOAD_PROXY`        | Go，空               | 仅下载使用的显式 HTTP(S) CONNECT 代理；不作用于 OpenList  |
| `OPENTV_GO_MAX_DOWNLOADS`       | Go，`2`              | 下载任务并发，1–16                                        |
| `OPENTV_GO_SEGMENT_CONCURRENCY` | Go，`6`              | 每个任务的分片并发，1–16                                  |
| `OPENTV_GO_SCAN_CONCURRENCY`    | Go，`4`              | 一次扫描内的根目录并发，1–16                              |

Go 默认只请求公网 HTTP(S) 来源，每次重定向重新校验 DNS 并固定连接 IP。内网放行必须配置完整 origin；元数据、链路本地、未指定及组播地址始终拒绝。Go 不读取通用 `HTTP_PROXY` / `HTTPS_PROXY`；下载代理必须支持数值 IP 的 CONNECT（包括 HTTP 目标），不支持时任务明确失败，不自动改为直连。详情见 [出站策略](internal/outbound/README.md)。

管理请求体上限 1 MiB，Node 读取超时 15 秒，Go 下载 API 读写超时 10 秒，Node 委派超时 30 秒。播放列表读取 10 秒，分片和密钥各 30 秒；任务总时长不设固定截止，但可删除取消或关停。

下载任务 JSON 库上限为 32 MiB（不包含视频文件），接纳任务时会预留进度、状态和错误字段增长空间。容量不足返回 507，可通过原管理界面删除旧任务后重试。超限或损坏的旧任务库会阻止 Go 下载模块启动，原文件保持原样，应先在旧 Node 模式整理并备份后再切换。

Go 同时只接受一次 OpenList 目录扫描，忙时立即返回 429；原扫描任务会显示失败，不排队或自动重试。单次最多 64 个根目录、每根 1000 页、每页 100 项，聚合文件夹 JSON 上限 16 MiB，任务上限 5 分钟。超限或请求失败时丢弃该根目录的部分结果，其他成功根目录仍按原 Node 逻辑处理和保存；全部根目录失败才终止本次扫描。

启用 Go 后，连接失败或超时会通过原接口报告错误，**不会自动重试写操作或回退到 Node**；超时的任务可能已被接受，应先刷新任务列表确认状态。

## 内部接口与检查

| 接口                                       | 用途                                                         |
| ------------------------------------------ | ------------------------------------------------------------ |
| `GET /healthz`、`GET /readyz`              | 进程就绪检查，无敏感状态，不需要令牌                         |
| `GET/POST/PUT/DELETE /v1/offline-download` | 原下载管理协议，需 `Authorization: Bearer <OPENTV_GO_TOKEN>` |
| `POST /v1/openlist/roots`                  | 内部目录列举协议，同上                                       |

健康检查代表进程已初始化，不承诺外部 OpenList 或视频来源可用。除健康检查外，所有内部接口在处理前校验令牌；用户身份和功能权限仍由 Node 验证。不要把 worker 端口直接发布给浏览器或用于替代公开 API 的用户鉴权。

```sh
cd services/go-worker
go test ./... -count=1
go vet ./...
go build -o bin/opentv-worker.exe ./cmd/opentv-worker
```

在项目根目录的 PowerShell 中执行真实 Node → Go → 本地测试源联调：

```powershell
$env:OPENTV_GO_TEST_BINARY = (Resolve-Path services/go-worker/bin/opentv-worker.exe).Path
pnpm exec jest --runTestsByPath tests/go-worker-bridge.test.js tests/go-openlist-scan.test.js tests/go-worker.integration.test.js --runInBand
```

联调只使用临时目录和本地 HTTP 测试源，验证原 API 下载、原本地播放接口、重试/删除、OpenList 登录列举及仅扫描启动。未设置测试二进制时，普通 `pnpm check` 跳过这组真实进程测试；桥接单元测试仍照常执行。Linux CI 额外执行竞态检测；本地没有 CGO/C 编译器时可使用隔离的 Docker 测试阶段：

```sh
docker build --target test -t opentv-go-worker-test:local services/go-worker
```
