'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { resolveDshHome } = require('./home')
const { isNodeSupported, nodeVersionError } = require('./node-version')
const { parseStartArgs, parseStopArgs } = require('./parse')
const {
  runPaths,
  readState,
  writeState,
  removeState,
  rotateIfLarge,
  tail,
  lockAgeMs,
} = require('./state')
const {
  sleep,
  portOpen,
  pidAlive,
  waitGone,
  portOwner,
  processTree,
  listListeningPorts,
  isOurProcess,
  killHard,
  stopPid,
  openUrl,
} = require('./runtime')
const { readConfig } = require('./config')

const DEFAULT_PORT = 3080
const LOCK_STALE_MS = 5000

function version() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version
  } catch {
    return '0.0.0'
  }
}

function usage(paths) {
  console.log(`dsh-better-launcher ${version()} - DeepSeek Harness start / stop / status`)
  console.log('')
  console.log('Usage:')
  console.log('  dsh start [--port <port>|--port=<port>] [--open] [web flags...]')
  console.log('  dsh stop [--force] [--port <port>]')
  console.log('  dsh status')
  console.log('  dsh --version | -V')
  console.log('  dsh <anything else>     forwarded to the real dsh CLI')
  console.log('')
  console.log('Official CLI help (this wrapper only owns start / stop / status):')
  console.log('  dsh web --help          web flags (--host, --port, --trusted-host)')
  console.log('  dsh -- --help           official launcher help (profiles, plugin, ...)')
  console.log('')
  console.log(`State and logs live under: ${paths.runDir}`)
  console.log('Requires Node.js ^22.19.0 || >=24.0.0')
}

function requireSupportedNode() {
  if (!isNodeSupported()) throw new Error(nodeVersionError())
}

async function reclaimStalePidfile(paths) {
  if (!fs.existsSync(paths.pidFile)) return
  const existing = readState(paths.pidFile)
  if (existing.pid > 0 && await isOurProcess(existing.pid, existing)) return existing
  if (existing.pending && existing.pid === 0 && lockAgeMs(paths.pidFile) < LOCK_STALE_MS) {
    throw new Error('another start is already in progress')
  }
  if (existing.pending && existing.pid > 0 && pidAlive(existing.pid) && lockAgeMs(paths.pidFile) < LOCK_STALE_MS) {
    throw new Error('another start is already in progress')
  }
  removeState(paths.pidFile)
  return null
}

async function discoverListenPort(pid, explicitPort) {
  if (explicitPort && explicitPort !== 0) {
    if (await portOpen(explicitPort)) return explicitPort
    return 0
  }
  const tree = await processTree(pid)
  const ports = await listListeningPorts(tree)
  if (ports.includes(DEFAULT_PORT)) return DEFAULT_PORT
  if (ports.length > 0) return ports[0]
  if (await portOpen(DEFAULT_PORT)) {
    const owner = await portOwner(DEFAULT_PORT)
    if (owner === pid || tree.includes(owner)) return DEFAULT_PORT
  }
  return 0
}

async function cmdStart(rest, ctx) {
  const parsed = parseStartArgs(rest)
  if (parsed.help) {
    usage(ctx.paths)
    return 0
  }
  requireSupportedNode()

  fs.mkdirSync(ctx.paths.runDir, { recursive: true })
  const running = await reclaimStalePidfile(ctx.paths)
  if (running) {
    const urlPort = running.port || parsed.port || DEFAULT_PORT
    console.log(`dsh: already running (PID ${running.pid} -> http://127.0.0.1:${urlPort}); use "dsh stop" first.`)
    return 0
  }

  if (parsed.port && parsed.port !== 0 && await portOpen(parsed.port)) {
    const owner = await portOwner(parsed.port)
    console.log(`dsh: port ${parsed.port} is already in use${owner > 0 ? ` (PID ${owner})` : ''}. Stop that instance first.`)
    return 1
  }

  const cfg = readConfig({ configFile: ctx.paths.configFile })
  if (!fs.existsSync(cfg.cli)) throw new Error(`dsh CLI not found at: ${cfg.cli}`)
  if (cfg.cwd && !fs.existsSync(cfg.cwd)) throw new Error(`configured cwd does not exist: ${cfg.cwd}`)

  rotateIfLarge(ctx.paths.logFile)
  rotateIfLarge(ctx.paths.errLog)

  const pending = {
    pid: 0,
    port: parsed.port || 0,
    startedAt: new Date().toISOString(),
    cli: cfg.cli,
    execPath: process.execPath,
    pending: true,
  }
  try {
    writeState(ctx.paths.pidFile, pending, { exclusive: true })
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('another start is already in progress')
    throw error
  }

  const logFd = fs.openSync(ctx.paths.logFile, 'a')
  const errFd = fs.openSync(ctx.paths.errLog, 'a')
  let child
  try {
    child = spawn(process.execPath, [...cfg.nodeArgs, cfg.cli, 'web', ...parsed.forward], {
      cwd: cfg.cwd || process.cwd(),
      detached: true,
      stdio: ['ignore', logFd, errFd],
      windowsHide: true,
    })
  } catch (error) {
    fs.closeSync(logFd)
    fs.closeSync(errFd)
    removeState(ctx.paths.pidFile)
    throw new Error(`cannot launch dsh CLI: ${error.message}`)
  }
  fs.closeSync(logFd)
  fs.closeSync(errFd)
  child.on('error', error => {
    try { removeState(ctx.paths.pidFile) } catch { /* already gone */ }
    console.error(`dsh: cannot launch dsh CLI: ${error.message}`)
  })
  child.unref()

  writeState(ctx.paths.pidFile, { ...pending, pid: child.pid, pending: true })
  console.log('dsh: starting the web profile in the background...')

  let readyPort = 0
  for (let i = 0; i < 60; i++) {
    await sleep(500)
    readyPort = await discoverListenPort(child.pid, parsed.port)
    if (readyPort) break
    if (!pidAlive(child.pid)) break
  }

  if (readyPort) {
    writeState(ctx.paths.pidFile, { ...pending, pid: child.pid, port: readyPort, pending: false })
    console.log(`dsh: running - PID ${child.pid} -> http://127.0.0.1:${readyPort}`)
    console.log(`dsh: logs at ${ctx.paths.logFile}`)
    if (parsed.open) openUrl(`http://127.0.0.1:${readyPort}`)
    return 0
  }

  if (pidAlive(child.pid)) {
    writeState(ctx.paths.pidFile, { ...pending, pid: child.pid, port: parsed.port || 0, pending: true })
    console.log(`dsh: still booting (PID ${child.pid}); watch ${ctx.paths.logFile}`)
    return 0
  }

  removeState(ctx.paths.pidFile)
  console.error('dsh: exited during startup. Last stderr:')
  for (const line of tail(ctx.paths.errLog, 20)) console.error(`  ${line}`)
  const out = tail(ctx.paths.logFile, 10)
  if (out.length > 0) {
    console.error('dsh: last stdout:')
    for (const line of out) console.error(`  ${line}`)
  }
  return 1
}

async function cmdStop(rest, ctx) {
  const parsed = parseStopArgs(rest)
  if (parsed.help) {
    usage(ctx.paths)
    return 0
  }

  const state = readState(ctx.paths.pidFile)
  if (state.pid > 0) {
    if (!pidAlive(state.pid)) {
      removeState(ctx.paths.pidFile)
      console.log('dsh: not running (stale pidfile removed).')
      return 0
    }
    const ours = await isOurProcess(state.pid, state)
    if (!ours && !parsed.force) {
      console.log(`dsh: pidfile PID ${state.pid} does not look like a dsh start instance.`)
      console.log('dsh: refuse to kill it; pass --force to kill this PID anyway, or delete the pidfile.')
      return 1
    }
    console.log(`dsh: stopping (PID ${state.pid})...`)
    const gone = parsed.force
      ? (await killHard(state.pid), await waitGone(state.pid, 20))
      : await stopPid(state.pid)
    if (!gone && pidAlive(state.pid)) throw new Error(`PID ${state.pid} is still alive after stop.`)
    removeState(ctx.paths.pidFile)
    console.log('dsh: stopped.')
    return 0
  }

  const port = parsed.port || DEFAULT_PORT
  if (!await portOpen(port)) {
    console.log('dsh: not running.')
    return 0
  }
  const owner = await portOwner(port)
  if (parsed.force && owner > 0) {
    console.log(`dsh: no pidfile; stopping by port owner PID ${owner}...`)
    await killHard(owner)
    await waitGone(owner, 20)
    console.log('dsh: stopped.')
    return 0
  }
  console.log(`dsh: port ${port} is in use${owner > 0 ? ` (PID ${owner})` : ''} but there is no pidfile.`)
  console.log('dsh: it was started outside "dsh start" - stop it in its original terminal, or run "dsh stop --force".')
  if (parsed.port === undefined) console.log('dsh: if it is on another port, pass --port <port>.')
  return 1
}

function formatSince(state, pidFile) {
  if (state.startedAt) {
    return state.startedAt.replace('T', ' ').replace(/\.\d+Z$/, ' UTC').slice(0, 23)
  }
  try {
    const birth = fs.statSync(pidFile).birthtime
    if (birth && birth.getTime() > 0) return birth.toISOString().replace('T', ' ').slice(0, 19)
  } catch { /* no birthtime */ }
  return null
}

async function cmdStatus(ctx) {
  const state = readState(ctx.paths.pidFile)
  if (state.pid > 0 && await isOurProcess(state.pid, state)) {
    console.log('dsh: RUNNING')
    console.log(`  PID    : ${state.pid}`)
    const since = formatSince(state, ctx.paths.pidFile)
    if (since) console.log(`  Since  : ${since}`)
    const port = state.port || DEFAULT_PORT
    console.log(`  URL    : http://127.0.0.1:${port}`)
    console.log(`  Log    : ${ctx.paths.logFile}`)
    const lines = tail(ctx.paths.logFile, 3)
    if (lines.length > 0) {
      console.log('  Recent log:')
      for (const line of lines) console.log(`    ${line}`)
    }
    return 0
  }
  if (state.pid > 0) removeState(ctx.paths.pidFile)

  const ports = [...new Set([state.port, DEFAULT_PORT].filter(port => port > 0))]
  for (const port of ports) {
    if (!await portOpen(port)) continue
    const owner = await portOwner(port)
    console.log(`dsh: appears to be RUNNING without a pidfile${owner > 0 ? ` (PID ${owner})` : ''} on port ${port}.`)
    console.log('dsh: it was started outside "dsh start" - stop it in its original terminal, or run "dsh stop --force".')
    return 0
  }
  console.log('dsh: STOPPED')
  return 0
}

function cmdVersion(ctx) {
  console.log(`dsh-better-launcher ${version()}`)
  console.log(`node ${process.version}`)
  try {
    const cfg = readConfig({ configFile: ctx.paths.configFile })
    console.log(`cli  ${cfg.cli}`)
  } catch {
    console.log('cli  (unresolved)')
  }
  return 0
}

function forward(args, ctx) {
  requireSupportedNode()
  const cfg = readConfig({ configFile: ctx.paths.configFile })
  if (!fs.existsSync(cfg.cli)) throw new Error(`dsh CLI not found at: ${cfg.cli}`)
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn(process.execPath, [...cfg.nodeArgs, cfg.cli, ...args], {
        cwd: cfg.cwd || process.cwd(),
        stdio: 'inherit',
      })
    } catch (error) {
      reject(new Error(`cannot launch dsh CLI: ${error.message}`))
      return
    }
    child.on('error', error => reject(new Error(`cannot launch dsh CLI: ${error.message}`)))
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)))
  })
}

function createContext(env = process.env) {
  const dshHome = resolveDshHome(env)
  return { dshHome, paths: runPaths(dshHome) }
}

async function main(argv, env = process.env) {
  const ctx = createContext(env)
  const command = argv[0]
  switch (command) {
    case 'start':
      return cmdStart(argv.slice(1), ctx)
    case 'stop':
      return cmdStop(argv.slice(1), ctx)
    case 'status':
      return cmdStatus(ctx)
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      usage(ctx.paths)
      return 0
    case '--version':
    case '-V':
    case 'version':
      return cmdVersion(ctx)
    case '--':
      return forward(argv.slice(1), ctx)
    default:
      return forward(argv, ctx)
  }
}

module.exports = { main, createContext, version, DEFAULT_PORT }
