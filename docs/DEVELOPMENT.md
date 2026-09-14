# 开发指南

[返回项目首页](../README.md) · [Docker 部署](DOCKER.md) · [配置参考](CONFIGURATION.md)

## 开发环境

使用 Node.js 24 与 pnpm 10.14.0。项目依赖以 [pnpm-lock.yaml](../pnpm-lock.yaml) 为准，安装时保留锁文件。

```sh
pnpm install --frozen-lockfile
```

将 [.env.example](../.env.example) 复制为 `.env.local`，设置 `ADMIN_USERNAME`、`PASSWORD` 和独立的 `AUTH_SECRET`。该模板使用本地 SQLite；启动时自动初始化数据库，数据默认位于 `.data/moontv.db`。`ADMIN_USERNAME` 会映射为应用的 `USERNAME`，避免 Windows 系统同名环境变量影响站长账号。

```sh
pnpm dev
```

默认地址为 [http://localhost:3000](http://localhost:3000)。若 Docker 或其他服务已占用端口，可在 `.env.local` 中设置其他 `PORT`，并同步调整 `SITE_BASE`。

Docker 部署使用 `.env.docker.local`、`.env.postgres.local`、`.env.redis.local`；本地开发使用 `.env.local`，两种环境分别配置。不要将真实环境文件、数据库或认证信息提交到仓库。

## 目录结构

| 路径               | 用途                                         |
| ------------------ | -------------------------------------------- |
| `src/app/`         | App Router 页面、API 路由与全局样式          |
| `src/components/`  | 共享界面、播放器和业务组件                   |
| `src/lib/`         | 数据访问、认证和业务逻辑                     |
| `src/styles/`      | 共享样式与 Tailwind 配置                     |
| `server/`          | 自定义服务器使用的数据库、缓存与实时通信模块 |
| `scripts/`         | 数据初始化、迁移、构建与验证脚本             |
| `tests/`           | 单元测试与集成测试                           |
| `apps/android-tv/` | Android TV 客户端工程                        |
| `docs/`            | 部署、配置、开发及升级文档                   |

## 质量检查

在独立终端运行检查：

```sh
pnpm typecheck
pnpm lint
pnpm test --runInBand
```

`pnpm check` 顺序执行以上三项。需要验证 PostgreSQL 和 Redis 集成时，先启动 Docker，再执行：

```sh
pnpm test:postgres-redis
```

该命令创建独立的 PostgreSQL / Redis 测试容器，执行全量 Jest 测试后清理测试资源，不使用正式数据库。

生产构建与认证、Socket 冒烟检查：

```sh
pnpm build
pnpm test:smoke:production
```

验证时根据实际修改范围选择检查项。仅修改文档时，检查链接、示例语法和配置一致性即可。

## 构建方式

默认开发和生产构建使用 Webpack。Turbopack 入口为：

```sh
pnpm dev:turbo
```

```sh
pnpm build:turbo
```

不要同时执行两个生产构建，它们共享 `.next` 输出目录。生产构建完成后，可使用 `pnpm start` 启动服务；先停止占用同一端口的开发服务。

PWA 资源由独立 Workbox 脚本生成。版本升级与前端实现细节见 [Next.js 16 升级说明](NEXT16-UPGRADE.md)、[Tailwind 4 升级说明](TAILWIND4-UPGRADE.md) 和 [海报动效说明](CINEMATIC-HERO.md)。

## 版本维护

项目使用独立的 XTV 版本序列。发布前更新 [VERSION.txt](../VERSION.txt) 与 [CHANGELOG](../CHANGELOG)，手动保持 `package.json` 中的版本号一致，再生成界面使用的更新记录和版本文件：

```sh
node scripts/convert-changelog.js
node scripts/convert-changelog.js --sync-version
```

继承的上游更新记录位于 [CHANGELOG-UPSTREAM.md](CHANGELOG-UPSTREAM.md)，与 XTV 的发布记录分别维护。

## 品牌资源

| 资源            | 文件                                                                       | 用途                   |
| --------------- | -------------------------------------------------------------------------- | ---------------------- |
| Logo            | [public/logo.png](../public/logo.png)                                      | 项目首页、客户端菜单   |
| 浏览器图标      | [public/favicon.ico](../public/favicon.ico)                                | 浏览器标签页与收藏     |
| PWA 图标        | [public/icons/](../public/icons/)                                          | 安装入口、通知与主屏幕 |
| Android TV 图标 | [drawable/logo.png](../apps/android-tv/app/src/main/res/drawable/logo.png) | TV 启动器与应用入口    |

PWA 名称与图标引用由 [generate-manifest.js](../scripts/generate-manifest.js) 生成，开发和构建命令会自动执行，也可单独运行 `pnpm gen:manifest`。替换资源后需重新构建部署；Android TV 的 GitHub Actions 构建会复制根目录 Logo，本地构建需自行同步对应文件。

默认站点名称为 `XTV`。`NEXT_PUBLIC_SITE_NAME` 可设置初始名称；已有数据库中的站点设置以管理后台保存值为准。Compose 服务名、数据卷、数据库键和客户端协议保留已有技术标识，以兼容现有部署。
