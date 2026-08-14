# dsh-better-launcher

DeepSeek Harness 的 `dsh start / stop / status` 一键服务管理命令,以 npm 包形式分发。

仓库:https://github.com/mocchh/dsh-better-launcher

## 一键安装(推荐)

```sh
# Windows(PowerShell)
irm https://raw.githubusercontent.com/mocchh/dsh-better-launcher/main/install.ps1 | iex

# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/mocchh/dsh-better-launcher/main/install.sh | sh
```

安装脚本会检查 Node.js ≥ 18、下载包并执行 `npm install -g`。可通过环境变量覆盖(镜像/内网):

| 变量 | 作用 |
|---|---|
| `DSH_LAUNCHER_VERSION` | 指定版本,默认 `1.0.0` |
| `DSH_LAUNCHER_BASE` | tarball 下载基地址,默认 GitHub raw |

## 手动安装

```sh
# 从 GitHub raw 下载 tarball 安装(离线/内网)
npm install -g https://raw.githubusercontent.com/mocchh/dsh-better-launcher/main/dsh-better-launcher-1.0.0.tgz

# 从 npm 注册表安装
npm install -g dsh-better-launcher
```

要求:Node.js ≥ 18。安装时会自动带入官方 `@deepseek-ai/dsh` CLI(harness 运行时),无需源码 checkout、无需 pnpm。

## 用法

| 命令 | 作用 |
|---|---|
| `dsh start [--port 8080] [--open] [其他 web 参数]` | 后台启动 Web UI,等待端口就绪后打印 `http://127.0.0.1:3080`;`--open` 自动打开浏览器 |
| `dsh stop` | 按 pidfile 关闭实例;非 `dsh start` 启动的实例会拒绝误杀,需 `dsh stop --force` |
| `dsh status` | 显示运行状态、PID、启动时间、URL 和最近日志 |
| `dsh <其他>` | 原样转发给真正的 dsh CLI(如 `dsh web`、`dsh --profile tui ...`) |

状态与日志:`<DSH_HOME|~/.dsh>/run/` 下的 `web.pid`、`web.log`、`web.err.log`。

## 定位真正的 dsh CLI(按优先级)

1. 环境变量 `DSH_CLI`(CLI 入口路径),可选 `DSH_NODE_ARGS`(空格分隔的 node 参数)与 `DSH_CWD`;
2. `<DSH_HOME>/dsh-launcher.json`:

   ```json
   {
     "cli": "C:\\path\\to\\deepseek-harness\\apps\\cli\\src\\bin.ts",
     "nodeArgs": ["--import", "tsx/esm"],
     "cwd": "C:\\path\\to\\deepseek-harness"
   }
   ```

   指向源码 checkout 时用它(等价于 `pnpm dsh web`);
3. 自动使用内置依赖 `@deepseek-ai/dsh/lib/bin.js`(npm 安装的 harness,默认即可用)。

删除 `dsh-launcher.json` 即可切回内置 npm 版 CLI。

## 发布到 npm

```sh
npm login
npm publish   # 发布前可修改 package.json 中的 name(如改为自己的 scope)
```

## 提示

- 若机器上已存在同名 `dsh` 命令(如旧版 dsh.cmd),以 PATH 顺序靠前者为准;删除旧文件后 npm 全局目录(通常为 `%APPDATA%\npm`)中的新 `dsh` 即生效。
- Windows 的 `dsh stop --force` 通过 `netstat` + `taskkill /T /F` 关闭非本工具启动的实例,请确认端口归属后再执行。
