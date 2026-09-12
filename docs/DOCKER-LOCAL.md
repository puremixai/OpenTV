# 本地 Docker 运行

从 `D:\bbs\MoonTVPlus` 执行，使用当前工作区源码构建完整版。

```powershell
docker compose -f compose.local.yaml up -d --build
docker compose -f compose.local.yaml ps
docker compose -f compose.local.yaml logs --tail 100 -f
```

访问地址：<http://localhost:3000>，仅绑定本机回环地址。

管理员用户名为 `admin`。随机生成的密码保存在项目 `.env.docker.local` 的 `PASSWORD` 项中；该文件已被 Git 和 Docker 构建上下文排除。站长密码由环境变量决定，需要修改时编辑该文件，然后执行 `docker compose -f compose.local.yaml up -d` 重新创建容器。

数据库使用容器内的 SQLite，存储在 `moontvplus-local_database` 卷；离线下载存储在 `moontvplus-local_downloads` 卷。容器重建后数据保留。TV 遥控和内置观影室已启用，服务端自定义脚本默认关闭。

停止并保留数据：

```powershell
docker compose -f compose.local.yaml down
```

再次启动：

```powershell
docker compose -f compose.local.yaml up -d
```

不要给 `down` 添加 `-v`，除非确实需要删除数据库和下载卷。

## 本次启动验证

2026-09-13 使用本地源码构建并启动 `moontvplus:local`，容器为 `moontvplus-local-moontvplus-1`，健康检查通过。

- Linux 容器内 Node.js 24.21.0、Next.js 14.2.35、better-sqlite3 12.6.2；SQLite 的 12 个迁移完成。
- 应用进程使用 UID 1001 运行。
- 登录页、管理员登录、HttpOnly Cookie、持久化会话、媒体令牌、匿名代理拦截、Socket 连接及 TV 注册均验证通过，验证用登录会话已退出。
- 两个持久化卷已挂载，服务设置为 `unless-stopped` 自动重启。
