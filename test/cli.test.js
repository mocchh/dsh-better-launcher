'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')

const bin = path.join(__dirname, '..', 'bin', 'dsh.js')
const fakeCli = path.join(__dirname, '..', 'fixtures', 'fake-cli.js')

function runDsh(args, extraEnv = {}) {
  return new Promise(resolve => {
    execFile(process.execPath, [bin, ...args], {
      env: { ...process.env, ...extraEnv },
      timeout: 15000,
      windowsHide: true,
      encoding: 'utf8',
    }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === 'number' ? error.code : (error.status ?? 1)) : 0
      resolve({ code, stdout: String(stdout || ''), stderr: String(stderr || '') })
    })
  })
}

describe('cli', () => {
  let home

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cli-'))
  })

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true })
  })

  function env() {
    return { DSH_HOME: home, DSH_CLI: fakeCli }
  }

  it('prints wrapper help that points at official help', async () => {
    const result = await runDsh(['--help'], env())
    assert.equal(result.code, 0)
    assert.match(result.stdout, /dsh-better-launcher/)
    assert.match(result.stdout, /dsh start/)
    assert.match(result.stdout, /dsh -- --help/)
    assert.match(result.stdout, /dsh web --help/)
    assert.match(result.stdout, /22\.19\.0/)
  })

  it('prints wrapper version without launching the official CLI as a child command', async () => {
    const result = await runDsh(['--version'], env())
    assert.equal(result.code, 0)
    assert.match(result.stdout, /dsh-better-launcher 1\.0\.1/)
    assert.match(result.stdout, /node v/)
    assert.match(result.stdout, /fake-cli\.js/)
    assert.doesNotMatch(result.stdout, /fake-cli invoked/)
  })

  it('forwards unknown commands to the real CLI', async () => {
    const result = await runDsh(['web', '--help'], env())
    assert.equal(result.code, 0, result.stderr || result.stdout)
    assert.match(result.stdout, /fake-cli invoked with args: \["web","--help"\]/)
  })

  it('forwards official launcher help after --', async () => {
    const result = await runDsh(['--', '--help'], env())
    assert.equal(result.code, 0)
    assert.match(result.stdout, /fake-cli invoked with args: \["--help"\]/)
  })

  it('reports STOPPED when nothing is running', async () => {
    const result = await runDsh(['status'], env())
    assert.equal(result.code, 0)
    assert.match(result.stdout, /STOPPED/)
  })
})
