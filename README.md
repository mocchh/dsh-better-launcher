# dsh-better-launcher

DeepSeek Harness 的 `dsh start / stop / status` 一键服务管理命令。

仓库：https://github.com/mocchh/dsh-better-launcher

官方 `@deepseek-ai/dsh` 只有前台 `dsh web`。本包装层占用全局命令 `dsh`，补上后台生命周期，其余参数原样转发给官方 CLI。

要求：Node.js `^22.19.0 || >=24.0.0`

## 安装

```sh
# Windows (PowerShell)
irm https://raw.githubusercontent.com/mocchh/dsh-better-launcher/main/install.ps1 | iex

# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/mocchh/dsh-better-launcher/main/install.sh | sh
```
可通过环境变量覆盖：

| 变量 | 作用 |
|---|---|
| `DSH_LAUNCHER_VERSION` | git ref（tag / branch / sha），默认仓库默认分支 |
| `DSH_LAUNCHER_REPO` | GitHub 仓库，默认 `mocchh/dsh-better-launcher` |
| `DSH_LAUNCHER_BASE` | 内网 tarball 基地址；设置后改为下载 `dsh-better-launcher-<ver>.tgz` |
| `DSH_LAUNCHER_SHA256` | 使用 `DSH_LAUNCHER_BASE` 时**必须**提供，用于校验 tarball |


## 用法

| 命令 | 作用 |
|---|---|
| `dsh start [--port 8080\|--port=8080] [--open] [其他 web 参数]` | 后台启动 Web UI，探测实际监听端口后打印 `http://127.0.0.1:<port>`；`--open` 打开浏览器 |
| `dsh stop [--force] [--port 8080]` | 按 pidfile 关闭；先 SIGTERM（Windows 同样先发 SIGTERM），再强制结束。无 pidfile 时拒绝误杀，需 `--force`（Unix / Windows 均可按端口找属主） |
| `dsh status` | 显示运行状态、PID、启动时间、URL 和最近日志 |
| `dsh --version` / `dsh -V` | 包装层版本、当前 Node、解析到的 CLI 路径 |
| `dsh -- --help` | 官方 launcher 帮助（profiles / plugin） |
| `dsh web --help` | 官方 web 帮助（`--host` / `--port` / `--trusted-host`） |
| `dsh <其他>` | 原样转发给真正的 dsh CLI |

`dsh --help` 只打印本包装层帮助。官方帮助请用上面两行。

状态与日志：`<DSH_HOME>`（空白视为未设置；支持 `~/` 展开，默认 `~/.dsh`）下的 `run/web.pid`、`web.log`、`web.err.log`。

`--port 0` 交给官方让 OS 分配端口；启动成功后会把真实端口写入 pidfile。用户在 `cordis.patch.yml` 里改过端口、命令行没带 `--port` 时，同样按进程实际监听端口记录。

## 定位真正的 dsh CLI（按优先级）

1. 环境变量 `DSH_CLI`（CLI 入口路径），可选 `DSH_NODE_ARGS`（空格分隔的 node 参数）与 `DSH_CWD`；
2. `<DSH_HOME>/dsh-launcher.json`：

   ```json
   {
     "cli": "C:\\path\\to\\deepseek-harness\\apps\\cli\\src\\bin.ts",
     "nodeArgs": ["--import", "tsx/esm"],
     "cwd": "C:\\path\\to\\deepseek-harness"
   }
   ```

   指向源码 checkout 时用它（等价于 `pnpm dsh web`）；
3. 自动使用内置依赖 `@deepseek-ai/dsh/lib/bin.js`（npm 安装的 harness，默认即可用）。

删除 `dsh-launcher.json` 即可切回内置 npm 版 CLI。

## 提示

- 本工具的全局命令名是 `dsh`。若 PATH 里已有官方或旧版 `dsh`，以靠前者为准；删掉旧 shim 后，npm 全局目录（Windows 通常为 `%APPDATA%\npm`）中的新 `dsh` 即生效。
- `dsh stop --force` 会按端口属主结束非本工具启动的实例。请确认端口归属后再执行。
- pidfile 会记录 pid、端口、启动时间和 CLI 路径。`stop` 会核对命令行，避免 PID 复用后误杀无关进程。
- 日志超过约 5MB 时，下次 `dsh start` 会把旧文件轮转到 `web.log.1` / `web.err.log.1`。
