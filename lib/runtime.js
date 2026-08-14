'use strict'

const fs = require('node:fs')
const net = require('node:net')
const path = require('node:path')
const { spawn, execFile } = require('node:child_process')

const IS_WIN = process.platform === 'win32'
const IS_MAC = process.platform === 'darwin'

function execFileOut(cmd, args, opts = {}) {
  return new Promise(resolve => {
    execFile(cmd, args, {
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
      ...opts,
    }, (error, stdout) => {
      if (error) return resolve('')
      resolve(String(stdout || ''))
    })
  })
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function portOpen(port, host = '127.0.0.1') {
  if (!port) return Promise.resolve(false)
  return new Promise(resolve => {
    const socket = net.connect({ host, port, timeout: 500 })
    let done = false
    const finish = value => {
      if (done) return
      done = true
      try { socket.destroy() } catch { /* already closed */ }
      resolve(value)
    }
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

function pidAlive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

function waitGone(pid, tries) {
  return new Promise(resolve => {
    const tick = left => {
      if (!pidAlive(pid)) return resolve(true)
      if (left <= 0) return resolve(false)
      setTimeout(() => tick(left - 1), 250)
    }
    tick(tries)
  })
}

async function portOwner(port) {
  if (!port) return 0
  if (IS_WIN) {
    const stdout = await execFileOut('netstat', ['-ano'])
    const pattern = new RegExp(`:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`, 'i')
    for (const line of stdout.split(/\r?\n/)) {
      const match = line.match(pattern)
      if (match) return Number(match[1])
    }
    return 0
  }
  const lsof = await execFileOut('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])
  const fromLsof = lsof.split(/\r?\n/).map(line => Number.parseInt(line.trim(), 10)).find(value => value > 0)
  if (fromLsof) return fromLsof
  const ss = await execFileOut('ss', ['-ltnp'])
  for (const line of ss.split(/\r?\n/)) {
    if (!new RegExp(`:${port}(?:\\s|$)`).test(line) || !/LISTEN/i.test(line)) continue
    const match = line.match(/pid=(\d+)/)
    if (match) return Number(match[1])
  }
  const fuser = await execFileOut('fuser', [`${port}/tcp`])
  const fromFuser = fuser.match(/(\d+)/)
  return fromFuser ? Number(fromFuser[1]) : 0
}

async function childPids(pid, depth = 4) {
  if (!pid || depth <= 0) return []
  let kids = []
  if (IS_WIN) {
    const wmic = await execFileOut('wmic', ['process', 'where', `ParentProcessId=${pid}`, 'get', 'ProcessId', '/value'])
    kids = [...wmic.matchAll(/ProcessId=(\d+)/gi)].map(match => Number(match[1])).filter(value => value > 0)
    if (kids.length === 0) {
      const ps = await execFileOut('powershell', [
        '-NoProfile',
        '-Command',
        `Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}" | Select-Object -Expand ProcessId`,
      ])
      kids = ps.split(/\r?\n/).map(line => Number.parseInt(line.trim(), 10)).filter(value => value > 0)
    }
  } else {
    const out = await execFileOut('pgrep', ['-P', String(pid)])
    kids = out.split(/\r?\n/).map(line => Number.parseInt(line.trim(), 10)).filter(value => value > 0)
  }
  const all = [...kids]
  for (const kid of kids) all.push(...await childPids(kid, depth - 1))
  return [...new Set(all)]
}

async function processTree(pid) {
  if (!pid) return []
  return [pid, ...await childPids(pid)]
}

async function listListeningPorts(pids) {
  const wanted = new Set(pids.filter(pid => pid > 0))
  if (wanted.size === 0) return []
  const found = []
  if (IS_WIN) {
    const stdout = await execFileOut('netstat', ['-ano'])
    for (const line of stdout.split(/\r?\n/)) {
      const match = line.match(/:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i)
      if (match && wanted.has(Number(match[2]))) found.push(Number(match[1]))
    }
    return [...new Set(found)]
  }
  for (const pid of wanted) {
    const lsof = await execFileOut('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-p', String(pid)])
    for (const line of lsof.split(/\r?\n/)) {
      const match = line.match(/:(\d+)\s+\(LISTEN\)/)
      if (match) found.push(Number(match[1]))
    }
  }
  if (found.length > 0) return [...new Set(found)]
  const ss = await execFileOut('ss', ['-ltnp'])
  for (const line of ss.split(/\r?\n/)) {
    const pidMatch = line.match(/pid=(\d+)/)
    if (!pidMatch || !wanted.has(Number(pidMatch[1]))) continue
    const portMatch = line.match(/:(\d+)\s/)
    if (portMatch) found.push(Number(portMatch[1]))
  }
  return [...new Set(found)]
}

async function processCmdline(pid) {
  if (!pid) return ''
  if (process.platform === 'linux') {
    try {
      return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim()
    } catch { /* fall through */ }
  }
  if (IS_WIN) {
    const ps = await execFileOut('powershell', [
      '-NoProfile',
      '-Command',
      `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
    ])
    return ps.trim()
  }
  const out = await execFileOut('ps', ['-p', String(pid), '-ww', '-o', 'args='])
  return out.trim()
}

function cmdlineLooksLikeOurs(cmd, state) {
  if (!cmd) return null
  if (state.cli) {
    const base = path.basename(state.cli)
    if (cmd.includes(state.cli) || (base && cmd.includes(base))) return true
    return false
  }
  if (/\bnode(?:\.exe)?\b/i.test(cmd) || /\bdsh\b/i.test(cmd)) return true
  return false
}

async function isOurProcess(pid, state) {
  if (!pid || !pidAlive(pid)) return false
  const cmd = await processCmdline(pid)
  const fromCmd = cmdlineLooksLikeOurs(cmd, state)
  if (fromCmd === true) return true
  if (fromCmd === false) return false
  if (state.port > 0) {
    const owner = await portOwner(state.port)
    if (owner === pid) return true
    const kids = await childPids(pid)
    if (owner > 0 && kids.includes(owner)) return true
    return state.pending === true
  }
  return state.pending === true
}

function killSoft(pid) {
  if (!pid) return
  if (IS_WIN) {
    try { process.kill(pid, 'SIGTERM') } catch { /* gone */ }
    return
  }
  try { process.kill(-pid, 'SIGTERM') } catch {
    try { process.kill(pid, 'SIGTERM') } catch { /* gone */ }
  }
}

function killHard(pid) {
  return new Promise(resolve => {
    if (!pid) return resolve()
    if (IS_WIN) {
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }, () => resolve())
      return
    }
    try { process.kill(-pid, 'SIGKILL') } catch {
      try { process.kill(pid, 'SIGKILL') } catch { /* gone */ }
    }
    resolve()
  })
}

async function stopPid(pid) {
  if (!pidAlive(pid)) return true
  killSoft(pid)
  if (await waitGone(pid, 40)) return true
  await killHard(pid)
  return waitGone(pid, 20)
}

function openUrl(url) {
  try {
    if (IS_WIN) spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', windowsHide: true })
    else if (IS_MAC) spawn('open', [url], { stdio: 'ignore' })
    else spawn('xdg-open', [url], { stdio: 'ignore' })
  } catch { /* best-effort */ }
}

module.exports = {
  IS_WIN,
  IS_MAC,
  execFileOut,
  sleep,
  portOpen,
  pidAlive,
  waitGone,
  portOwner,
  childPids,
  processTree,
  listListeningPorts,
  processCmdline,
  isOurProcess,
  killSoft,
  killHard,
  stopPid,
  openUrl,
}
