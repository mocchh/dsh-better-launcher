# dsh-better-launcher

[中文](README.md)

One-command lifecycle management for DeepSeek Harness: `dsh start / stop / status`.

Repository: <https://github.com/mocchh/dsh-better-launcher>

The official `@deepseek-ai/dsh` only runs in the foreground via `dsh web`. This wrapper takes over the global `dsh` command name, adds background lifecycle management, and forwards every other argument to the official CLI unchanged.

Requirements: Node.js `^22.19.0 || >=24.0.0`

## Installation

```sh
# Windows (PowerShell)
irm https://raw.githubusercontent.com/mocchh/dsh-better-launcher/main/install.ps1 | iex

# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/mocchh/dsh-better-launcher/main/install.sh | sh
```

Override via environment variables:

| Variable | Purpose |
|---|---|
| `DSH_LAUNCHER_VERSION` | Git ref (tag / branch / sha); defaults to the repo's default branch |
| `DSH_LAUNCHER_REPO` | GitHub repository; defaults to `mocchh/dsh-better-launcher` |
| `DSH_LAUNCHER_BASE` | Base URL for an intranet tarball; when set, downloads `dsh-better-launcher-<ver>.tgz` instead |
| `DSH_LAUNCHER_SHA256` | **Required** when `DSH_LAUNCHER_BASE` is set; used to verify the tarball |

## Usage

| Command | What it does |
|---|---|
| `dsh start [--port 8080\|--port=8080] [--open] [other web args]` | Starts the Web UI in the background, detects the actual listening port, and prints `http://127.0.0.1:<port>`; `--open` opens the browser |
| `dsh stop [--force] [--port 8080]` | Stops via the pidfile: sends SIGTERM first (on Windows too), then force-kills. Without a pidfile it refuses to kill blindly and requires `--force` (finds the owner by port on Unix and Windows alike) |
| `dsh status` | Shows run state, PID, start time, URL, and recent logs |
| `dsh --version` / `dsh -V` | Wrapper version, current Node, and the resolved CLI path |
| `dsh -- --help` | Official launcher help (profiles / plugin) |
| `dsh web --help` | Official web help (`--host` / `--port` / `--trusted-host`) |
| `dsh <other>` | Forwarded to the real dsh CLI unchanged |

`dsh --help` prints only this wrapper's help; use the two lines above for the official help.

State and logs: `run/web.pid`, `web.log`, and `web.err.log` under `<DSH_HOME>` (empty means unset; `~/` is expanded; defaults to `~/.dsh`).

`--port 0` is passed to the official CLI and lets the OS pick the port; the real port is written to the pidfile once startup succeeds. When the port was changed in `cordis.patch.yml` and no `--port` was given on the command line, the process's actual listening port is recorded as well.

## Resolving the real dsh CLI (by priority)

1. Environment variable `DSH_CLI` (path to the CLI entry), plus optional `DSH_NODE_ARGS` (space-separated node args) and `DSH_CWD`;
2. `<DSH_HOME>/dsh-launcher.json`:

   ```json
   {
     "cli": "C:\\path\\to\\deepseek-harness\\apps\\cli\\src\\bin.ts",
     "nodeArgs": ["--import", "tsx/esm"],
     "cwd": "C:\\path\\to\\deepseek-harness"
   }
   ```

   Use this to point at a source checkout (equivalent to `pnpm dsh web`);
3. Falls back to the bundled dependency `@deepseek-ai/dsh/lib/bin.js` (the npm-installed harness; works out of the box).

Delete `dsh-launcher.json` to switch back to the bundled npm CLI.

## Notes

- The global command name of this tool is `dsh`. If an official or older `dsh` already exists on your PATH, whichever comes first wins; once the old shim is removed, the new `dsh` in the npm global directory (usually `%APPDATA%\npm` on Windows) takes effect.
- `dsh stop --force` terminates instances not started by this tool, based on port ownership. Confirm who owns the port before running it.
- The pidfile records the pid, port, start time, and CLI path. `stop` verifies the command line to avoid killing an unrelated process after PID reuse.
- When logs grow beyond ~5 MB, the next `dsh start` rotates the old files to `web.log.1` / `web.err.log.1`.
