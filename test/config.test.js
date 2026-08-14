'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { readConfig } = require('../lib/config')

describe('config', () => {
  it('prefers DSH_CLI over a config file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cfg-'))
    const configFile = path.join(dir, 'dsh-launcher.json')
    fs.writeFileSync(configFile, JSON.stringify({ cli: '/from/file.js' }))
    const cfg = readConfig({
      configFile,
      env: { DSH_CLI: '/from/env.js', DSH_NODE_ARGS: '--import tsx/esm', DSH_CWD: '/work' },
    })
    assert.deepEqual(cfg, {
      cli: '/from/env.js',
      nodeArgs: ['--import', 'tsx/esm'],
      cwd: '/work',
    })
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('reads dsh-launcher.json when env is unset', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cfg-'))
    const configFile = path.join(dir, 'dsh-launcher.json')
    fs.writeFileSync(configFile, JSON.stringify({
      cli: '/checkout/apps/cli/src/bin.ts',
      nodeArgs: ['--import', 'tsx/esm'],
      cwd: '/checkout',
    }))
    const cfg = readConfig({ configFile, env: {} })
    assert.equal(cfg.cli, '/checkout/apps/cli/src/bin.ts')
    assert.deepEqual(cfg.nodeArgs, ['--import', 'tsx/esm'])
    assert.equal(cfg.cwd, '/checkout')
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('rejects a config file whose cli is empty', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cfg-'))
    const configFile = path.join(dir, 'dsh-launcher.json')
    fs.writeFileSync(configFile, JSON.stringify({ cli: '' }))
    assert.throws(() => readConfig({ configFile, env: {} }), /bad config/)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
