'use strict'

const fs = require('node:fs')
const path = require('node:path')

const LOG_ROTATE_BYTES = 5 * 1024 * 1024

function runPaths(dshHome) {
  const runDir = path.join(dshHome, 'run')
  return {
    runDir,
    pidFile: path.join(runDir, 'web.pid'),
    logFile: path.join(runDir, 'web.log'),
    errLog: path.join(runDir, 'web.err.log'),
    configFile: path.join(dshHome, 'dsh-launcher.json'),
  }
}

function emptyState() {
  return { pid: 0, port: 0, startedAt: undefined, cli: undefined, execPath: undefined, pending: false }
}

function readState(pidFile) {
  if (!fs.existsSync(pidFile)) return emptyState()
  try {
    const raw = fs.readFileSync(pidFile, 'utf8').trim()
    if (!raw) return emptyState()
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw)
      const pid = Number.parseInt(parsed.pid, 10)
      const port = Number.parseInt(parsed.port, 10)
      return {
        pid: Number.isInteger(pid) && pid > 0 ? pid : 0,
        port: Number.isInteger(port) && port >= 0 && port <= 65535 ? port : 0,
        startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : undefined,
        cli: typeof parsed.cli === 'string' && parsed.cli !== '' ? parsed.cli : undefined,
        execPath: typeof parsed.execPath === 'string' && parsed.execPath !== '' ? parsed.execPath : undefined,
        pending: parsed.pending === true,
      }
    }
    const lines = raw.split(/\r?\n/)
    const pid = Number.parseInt(lines[0] || '', 10)
    const port = Number.parseInt(lines[1] || '', 10)
    return {
      ...emptyState(),
      pid: Number.isInteger(pid) && pid > 0 ? pid : 0,
      port: Number.isInteger(port) && port > 0 && port <= 65535 ? port : 0,
    }
  } catch {
    return emptyState()
  }
}

function writeState(pidFile, state, { exclusive = false } = {}) {
  const body = `${JSON.stringify({
    pid: state.pid || 0,
    port: state.port || 0,
    startedAt: state.startedAt || new Date().toISOString(),
    cli: state.cli,
    execPath: state.execPath,
    pending: state.pending === true,
  }, null, 2)}\n`
  fs.writeFileSync(pidFile, body, { encoding: 'utf8', flag: exclusive ? 'wx' : 'w' })
}

function removeState(pidFile) {
  try { fs.unlinkSync(pidFile) } catch { /* absent */ }
}

function rotateIfLarge(file, maxBytes = LOG_ROTATE_BYTES) {
  try {
    if (!fs.existsSync(file) || fs.statSync(file).size <= maxBytes) return
    fs.renameSync(file, `${file}.1`)
  } catch { /* best-effort */ }
}

function tail(file, count) {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).slice(-count)
  } catch {
    return []
  }
}

function lockAgeMs(pidFile) {
  try {
    return Date.now() - fs.statSync(pidFile).mtimeMs
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

module.exports = {
  LOG_ROTATE_BYTES,
  runPaths,
  emptyState,
  readState,
  writeState,
  removeState,
  rotateIfLarge,
  tail,
  lockAgeMs,
}
