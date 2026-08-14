#!/usr/bin/env node
/**
 * dsh-better-launcher — one-command lifecycle wrapper for DeepSeek Harness.
 *
 *   dsh start   start the web UI in the background
 *   dsh stop    stop the background instance
 *   dsh status  show whether it is running
 *   dsh <other> forward to the real dsh CLI (e.g. dsh web, dsh --profile tui ...)
 *
 * The real dsh CLI is located by the first of these that succeeds:
 *   1. DSH_CLI env var (path to the CLI entry) plus optional DSH_NODE_ARGS and DSH_CWD
 *   2. <DSH_HOME|~/.dsh>/dsh-launcher.json: { "cli": "...", "nodeArgs": [...], "cwd": "..." }
 *   3. the bundled @deepseek-ai/dsh dependency (npm-installed harness)
 *
 * State files: <DSH_HOME>/run/web.pid, web.log, web.err.log
 */
'use strict'

const { main } = require('../lib/main')

main(process.argv.slice(2)).then(code => {
  if (typeof code === 'number' && code !== 0) process.exit(code)
}).catch(error => {
  console.error(`dsh: ${error.message}`)
  process.exit(1)
})
