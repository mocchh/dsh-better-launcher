'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { runPaths, readState, writeState, removeState, rotateIfLarge } = require('../lib/state')

describe('state', () => {
  let dir
  let pidFile

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-state-'))
    pidFile = path.join(dir, 'web.pid')
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('builds run paths under DSH_HOME', () => {
    const paths = runPaths(dir)
    assert.equal(paths.pidFile, path.join(dir, 'run', 'web.pid'))
    assert.equal(paths.configFile, path.join(dir, 'dsh-launcher.json'))
  })

  it('round-trips JSON state and exclusive create', () => {
    writeState(pidFile, {
      pid: 42,
      port: 8080,
      startedAt: '2026-08-14T00:00:00.000Z',
      cli: '/tmp/bin.js',
      execPath: '/usr/bin/node',
      pending: false,
    }, { exclusive: true })
    const state = readState(pidFile)
    assert.equal(state.pid, 42)
    assert.equal(state.port, 8080)
    assert.equal(state.cli, '/tmp/bin.js')
    assert.equal(state.pending, false)
    assert.throws(() => writeState(pidFile, { pid: 1 }, { exclusive: true }), { code: 'EEXIST' })
  })

  it('reads the legacy two-line pidfile', () => {
    fs.writeFileSync(pidFile, '1234\n3080\n')
    const state = readState(pidFile)
    assert.equal(state.pid, 1234)
    assert.equal(state.port, 3080)
    assert.equal(state.pending, false)
  })

  it('returns empty state when the file is missing or junk', () => {
    assert.equal(readState(path.join(dir, 'missing.pid')).pid, 0)
    fs.writeFileSync(pidFile, '{not-json')
    assert.equal(readState(pidFile).pid, 0)
  })

  it('rotates an oversized log once', () => {
    const log = path.join(dir, 'web.log')
    fs.writeFileSync(log, 'x'.repeat(100))
    rotateIfLarge(log, 50)
    assert.equal(fs.existsSync(log), false)
    assert.equal(fs.existsSync(`${log}.1`), true)
    removeState(pidFile)
    assert.equal(fs.existsSync(pidFile), false)
  })
})
