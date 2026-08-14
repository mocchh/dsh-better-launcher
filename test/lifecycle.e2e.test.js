'use strict'

const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const { spawn, execFile } = require('node:child_process')
const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { portOpen, pidAlive, killHard, waitGone } = require('../lib/runtime')
const { readState } = require('../lib/state')

const bin = path.join(__dirname, '..', 'bin', 'dsh.js')
const fakeWeb = path.join(__dirname, '..', 'fixtures', 'fake-web.js')

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(error => (error ? reject(error) : resolve(port)))
    })
    server.on('error', reject)
  })
}

function runDsh(args, extraEnv = {}) {
  return new Promise(resolve => {
    execFile(process.execPath, [bin, ...args], {
      env: { ...process.env, ...extraEnv },
      timeout: 25000,
      windowsHide: true,
      encoding: 'utf8',
    }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === 'number' ? error.code : (error.status ?? 1)) : 0
      resolve({ code, stdout: String(stdout || ''), stderr: String(stderr || '') })
    })
  })
}

describe('lifecycle', () => {
  let home
  const started = []

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-life-'))
  })

  afterEach(async () => {
    for (const pid of started.splice(0)) {
      if (pidAlive(pid)) {
        await killHard(pid)
        await waitGone(pid, 20)
      }
    }
    const state = readState(path.join(home, 'run', 'web.pid'))
    if (state.pid > 0 && pidAlive(state.pid)) {
      await killHard(state.pid)
      await waitGone(state.pid, 20)
    }
    fs.rmSync(home, { recursive: true, force: true })
  })

  function env() {
    return { DSH_HOME: home, DSH_CLI: fakeWeb }
  }

  function rememberPid(output) {
    const match = output.match(/PID (\d+)/)
    if (match) started.push(Number(match[1]))
  }

  it('starts, reports status, and stops with --port space form', { timeout: 30000 }, async () => {
    const port = await freePort()
    const start = await runDsh(['start', '--port', String(port)], env())
    assert.equal(start.code, 0, start.stderr || start.stdout)
    assert.match(start.stdout, new RegExp(`http://127\\.0\\.0\\.1:${port}`))
    rememberPid(start.stdout)
    assert.equal(await portOpen(port), true)

    const state = readState(path.join(home, 'run', 'web.pid'))
    assert.equal(state.port, port)
    assert.ok(state.cli.includes('fake-web.js'))

    const status = await runDsh(['status'], env())
    assert.equal(status.code, 0)
    assert.match(status.stdout, /RUNNING/)
    assert.match(status.stdout, new RegExp(`:${port}`))

    const stop = await runDsh(['stop'], env())
    assert.equal(stop.code, 0, stop.stderr || stop.stdout)
    assert.match(stop.stdout, /stopped/)
    assert.equal(await portOpen(port), false)

    const stopped = await runDsh(['status'], env())
    assert.match(stopped.stdout, /STOPPED/)
  })

  it('honors --port= and refuses a second start', { timeout: 30000 }, async () => {
    const port = await freePort()
    const start = await runDsh(['start', `--port=${port}`], env())
    assert.equal(start.code, 0, start.stderr || start.stdout)
    rememberPid(start.stdout)
    const again = await runDsh(['start', `--port=${port}`], env())
    assert.equal(again.code, 0)
    assert.match(again.stdout, /already running/)
    const stop = await runDsh(['stop'], env())
    assert.equal(stop.code, 0, stop.stderr || stop.stdout)
  })

  it('records the OS-assigned port for --port 0', { timeout: 30000 }, async () => {
    const start = await runDsh(['start', '--port', '0'], env())
    assert.equal(start.code, 0, start.stderr || start.stdout)
    rememberPid(start.stdout)
    const match = start.stdout.match(/http:\/\/127\.0\.0\.1:(\d+)/)
    assert.ok(match, start.stdout)
    const port = Number(match[1])
    assert.ok(port > 0)
    const state = readState(path.join(home, 'run', 'web.pid'))
    assert.equal(state.port, port)
    assert.equal(await portOpen(port), true)
    const stop = await runDsh(['stop'], env())
    assert.equal(stop.code, 0, stop.stderr || stop.stdout)
  })

  it('force-stops a foreign listener by port on every platform', { timeout: 30000 }, async () => {
    const port = await freePort()
    const child = spawn(process.execPath, [fakeWeb, 'web', '--port', String(port)], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
    started.push(child.pid)
    for (let i = 0; i < 40 && !await portOpen(port); i++) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.equal(await portOpen(port), true)

    const refused = await runDsh(['stop', '--port', String(port)], env())
    assert.equal(refused.code, 1)
    assert.match(refused.stdout, /no pidfile/)

    const forced = await runDsh(['stop', '--force', '--port', String(port)], env())
    assert.equal(forced.code, 0, forced.stderr || forced.stdout)
    assert.match(forced.stdout, /stopped/)
    assert.equal(await portOpen(port), false)
  })
})
