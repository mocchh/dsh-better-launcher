#!/usr/bin/env node
/**
 * dsh-service — one-command lifecycle wrapper for DeepSeek Harness.
 *
 *   dsh start   start the web UI in the background
 *   dsh stop    stop the background instance
 *   dsh status  show whether it is running
 *   dsh <other> forward to the real dsh CLI (e.g. dsh web, dsh --profile tui ...)
 *
 * The real dsh CLI is located by the first of these that succeeds:
 *   1. DSH_CLI env var (path to the CLI entry) plus optional DSH_NODE_ARGS and DSH_CWD
 *   2. <DSH_HOME|~/.dsh>/dsh-service.json: { "cli": "...", "nodeArgs": [...], "cwd": "..." }
 *   3. the bundled @deepseek-ai/dsh dependency (npm-installed harness)
 *
 * State files: <DSH_HOME>/run/web.pid, web.log, web.err.log
 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const { spawn, execFile } = require('node:child_process')
const { createRequire } = require('node:module')

const IS_WIN = process.platform === 'win32'
const IS_MAC = process.platform === 'darwin'
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const RUN_DIR = path.join(DSH_HOME, 'run')
const PID_FILE = path.join(RUN_DIR, 'web.pid')
const LOG_FILE = path.join(RUN_DIR, 'web.log')
const ERR_LOG = path.join(RUN_DIR, 'web.err.log')
const CONFIG_FILE = path.join(DSH_HOME, 'dsh-launcher.json')
const DEFAULT_PORT = 3080

function version() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version }
  catch { return '0.0.0' }
}

function usage() {
  console.log(`dsh-better-launcher ${version()} - DeepSeek Harness quick start / stop / status`)
  console.log('')
  console.log('Usage:')
  console.log('  dsh start [--port <port>] [--open] [web flags...]   start the web UI in the background')
  console.log('  dsh stop [--force]                                  stop the background instance')
  console.log('  dsh status                                           show whether DSH is running')
  console.log('  dsh <anything else>                                  run the dsh CLI directly')
  console.log('')
  console.log(`State and logs live under: ${RUN_DIR}`)
}

function fail(message) {
  console.error(`dsh: ${message}`)
  process.exit(1)
}

/** Resolve how to launch the real dsh CLI. */
function readConfig() {
  if (process.env.DSH_CLI) {
    return {
      cli: process.env.DSH_CLI,
      nodeArgs: process.env.DSH_NODE_ARGS ? process.env.DSH_NODE_ARGS.split(/\s+/) : [],
      cwd: process.env.DSH_CWD || undefined,
    }
  }
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
      if (typeof raw.cli !== 'string' || raw.cli === '') throw new Error('"cli" must be a non-empty path')
      return {
        cli: raw.cli,
        nodeArgs: Array.isArray(raw.nodeArgs) ? raw.nodeArgs.map(String) : [],
        cwd: typeof raw.cwd === 'string' && raw.cwd !== '' ? raw.cwd : undefined,
      }
    } catch (error) {
      fail(`bad config ${CONFIG_FILE}: ${error.message}`)
    }
  }
  try {
    const require = createRequire(__filename)
    const bin = require.resolve('@deepseek-ai/dsh/lib/bin.js')
    if (fs.existsSync(bin)) return { cli: bin, nodeArgs: [], cwd: undefined }
  } catch { /* dependency not installed */ }
  fail(`cannot locate the dsh CLI: install @deepseek-ai/dsh, set DSH_CLI, or write ${CONFIG_FILE}`)
}

/** Read pidfile: line 1 = pid, line 2 = port. */
function readState() {
  const state = { pid: 0, port: DEFAULT_PORT }
  if (!fs.existsSync(PID_FILE)) return state
  try {
    const lines = fs.readFileSync(PID_FILE, 'utf8').split(/\r?\n/)
    const pid = Number.parseInt(lines[0] || '', 10)
    if (Number.isInteger(pid) && pid > 0) state.pid = pid
    const port = Number.parseInt(lines[1] || '', 10)
    if (Number.isInteger(port) && port > 0) state.port = port
  } catch { /* keep defaults */ }
  return state
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

function portOpen(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port, timeout: 500 })
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('timeout', () => { socket.destroy(); resolve(false) })
    socket.once('error', () => resolve(false))
  })
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Windows: find the PID listening on a port via netstat; callback(0) on failure. */
function portOwnerWin(port, callback) {
  if (!IS_WIN) return callback(0)
  try {
    execFile('netstat', ['-ano'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
      if (error) return callback(0)
      const pattern = new RegExp(`:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`)
      for (const line of stdout.split(/\r?\n/)) {
        const match = line.match(pattern)
        if (match) return callback(Number(match[1]))
      }
      callback(0)
    })
  } catch { callback(0) }
}

/** Windows: force-kill a process tree. */
function killTreeWin(pid, callback) {
  try {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }, () => callback())
  } catch { callback() }
}

/** Wait until a pid is gone (or tries exhausted). */
function waitGone(pid, tries, callback) {
  if (tries <= 0 || !pidAlive(pid)) return callback()
  setTimeout(() => waitGone(pid, tries - 1, callback), 250)
}

function tail(file, count) {
  try {
    const data = fs.readFileSync(file, 'utf8')
    return data.split(/\r?\n/).filter(Boolean).slice(-count)
  } catch { return [] }
}

function openUrl(url) {
  try {
    if (IS_WIN) spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', windowsHide: true })
    else if (IS_MAC) spawn('open', [url], { stdio: 'ignore' })
    else spawn('xdg-open', [url], { stdio: 'ignore' })
  } catch { /* opening the browser is best-effort */ }
}

function removePidFile() {
  try { fs.unlinkSync(PID_FILE) } catch { /* absent */ }
}

async function cmdStart(rest) {
  let port = DEFAULT_PORT
  let open = false
  const forward = []
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--open') {
      open = true
    } else if (rest[i] === '--port') {
      const value = rest[i + 1]
      if (!value || !/^\d+$/.test(value)) fail('start: --port needs a numeric value')
      port = Number(value)
      forward.push('--port', value)
      i++
    } else {
      forward.push(rest[i])
    }
  }

  const state = readState()
  if (state.pid > 0 && pidAlive(state.pid)) {
    console.log(`dsh: already running (PID ${state.pid} -> http://127.0.0.1:${state.port}); use "dsh stop" first.`)
    return
  }
  if (await portOpen(port)) {
    portOwnerWin(port, owner => {
      console.log(`dsh: port ${port} is already in use${owner > 0 ? ` (PID ${owner})` : ''}. Stop that instance first.`)
      process.exitCode = 1
    })
    return
  }

  const { cli, nodeArgs, cwd } = readConfig()
  if (!fs.existsSync(cli)) fail(`dsh CLI not found at: ${cli}`)
  if (cwd && !fs.existsSync(cwd)) fail(`configured cwd does not exist: ${cwd}`)
  fs.mkdirSync(RUN_DIR, { recursive: true })
  removePidFile()

  const logFd = fs.openSync(LOG_FILE, 'a')
  const errFd = fs.openSync(ERR_LOG, 'a')
  let child
  try {
    child = spawn(process.execPath, [...nodeArgs, cli, 'web', ...forward], {
      cwd: cwd || process.cwd(),
      detached: true,
      stdio: ['ignore', logFd, errFd],
      windowsHide: true,
    })
  } catch (error) {
    fs.closeSync(logFd)
    fs.closeSync(errFd)
    fail(`cannot launch dsh CLI: ${error.message}`)
  }
  fs.closeSync(logFd)
  fs.closeSync(errFd)
  child.on('error', error => fail(`cannot launch dsh CLI: ${error.message}`))
  child.unref()
  fs.writeFileSync(PID_FILE, `${child.pid}\n${port}\n`)

  console.log('dsh: starting the web profile in the background...')
  for (let i = 0; i < 60; i++) {
    await sleep(500)
    if (await portOpen(port)) {
      console.log(`dsh: running - PID ${child.pid} -> http://127.0.0.1:${port}`)
      console.log(`dsh: logs at ${LOG_FILE}`)
      if (open) openUrl(`http://127.0.0.1:${port}`)
      return
    }
    if (!pidAlive(child.pid)) break
  }
  if (pidAlive(child.pid)) {
    console.log(`dsh: still booting (PID ${child.pid}); watch ${LOG_FILE}`)
  } else {
    removePidFile()
    console.error('dsh: exited during startup. Last stderr:')
    for (const line of tail(ERR_LOG, 20)) console.error(`  ${line}`)
    process.exit(1)
  }
}

function cmdStop(rest) {
  const force = rest.includes('--force')
  const state = readState()
  if (state.pid > 0) {
    if (!pidAlive(state.pid)) {
      removePidFile()
      console.log('dsh: not running (stale pidfile removed).')
      return
    }
    console.log(`dsh: stopping (PID ${state.pid})...`)
    if (IS_WIN) {
      killTreeWin(state.pid, () => {
        waitGone(state.pid, 40, () => {
          if (pidAlive(state.pid)) fail(`PID ${state.pid} is still alive after taskkill.`)
          removePidFile()
          console.log('dsh: stopped.')
        })
      })
    } else {
      try { process.kill(-state.pid, 'SIGTERM') } catch { try { process.kill(state.pid, 'SIGTERM') } catch { /* gone */ } }
      waitGone(state.pid, 40, () => {
        if (pidAlive(state.pid)) {
          try { process.kill(-state.pid, 'SIGKILL') } catch { /* gone */ }
        }
        removePidFile()
        console.log('dsh: stopped.')
      })
    }
    return
  }
  portOpen(DEFAULT_PORT).then(open => {
    if (!open) {
      console.log('dsh: not running.')
      return
    }
    portOwnerWin(DEFAULT_PORT, owner => {
      if (force && IS_WIN && owner > 0) {
        console.log(`dsh: no pidfile; stopping by port owner PID ${owner}...`)
        killTreeWin(owner, () => {
          waitGone(owner, 40, () => console.log('dsh: stopped.'))
        })
        return
      }
      console.log(`dsh: port ${DEFAULT_PORT} is in use${owner > 0 ? ` (PID ${owner})` : ''} but there is no pidfile.`)
      console.log('dsh: it was started outside "dsh start" - stop it in its original terminal, or run "dsh stop --force".')
      process.exitCode = 1
    })
  })
}

function cmdStatus() {
  const state = readState()
  if (state.pid > 0 && pidAlive(state.pid)) {
    console.log('dsh: RUNNING')
    console.log(`  PID    : ${state.pid}`)
    try {
      const since = fs.statSync(PID_FILE).birthtime.toISOString().replace('T', ' ').slice(0, 19)
      console.log(`  Since  : ${since}`)
    } catch { /* no birthtime */ }
    console.log(`  URL    : http://127.0.0.1:${state.port}`)
    console.log(`  Log    : ${LOG_FILE}`)
    const lines = tail(LOG_FILE, 3)
    if (lines.length > 0) {
      console.log('  Recent log:')
      for (const line of lines) console.log(`    ${line}`)
    }
    return
  }
  portOpen(DEFAULT_PORT).then(open => {
    if (!open) {
      console.log('dsh: STOPPED')
      return
    }
    portOwnerWin(DEFAULT_PORT, owner => {
      console.log(`dsh: appears to be RUNNING without a pidfile${owner > 0 ? ` (PID ${owner})` : ''} on port ${DEFAULT_PORT}.`)
      console.log('dsh: it was started outside "dsh start" - stop it in its original terminal, or run "dsh stop --force".')
    })
  })
}

function forward(args) {
  const { cli, nodeArgs, cwd } = readConfig()
  if (!fs.existsSync(cli)) fail(`dsh CLI not found at: ${cli}`)
  let child
  try {
    child = spawn(process.execPath, [...nodeArgs, cli, ...args], {
      cwd: cwd || process.cwd(),
      stdio: 'inherit',
      windowsHide: true,
    })
  } catch (error) {
    fail(`cannot launch dsh CLI: ${error.message}`)
  }
  child.on('error', error => fail(`cannot launch dsh CLI: ${error.message}`))
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
}

const argv = process.argv.slice(2)
const command = argv[0]
switch (command) {
  case 'start': cmdStart(argv.slice(1)); break
  case 'stop': cmdStop(argv.slice(1)); break
  case 'status': cmdStatus(); break
  case 'help':
  case '--help':
  case '-h':
  case undefined: usage(); break
  default: forward(argv); break
}
