'use strict'

const path = require('node:path')
const os = require('node:os')
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { expandHomePath, defaultDshHome, resolveDshHome } = require('../lib/home')

describe('home', () => {
  it('expands ~ and ~/ and ~\\', () => {
    assert.equal(expandHomePath('~'), os.homedir())
    assert.equal(expandHomePath('~/.dsh-work'), path.join(os.homedir(), '.dsh-work'))
    assert.equal(expandHomePath('~\\.dsh-work'), path.join(os.homedir(), '.dsh-work'))
    assert.equal(expandHomePath('/tmp/abs'), '/tmp/abs')
  })

  it('defaults to ~/.dsh', () => {
    assert.equal(defaultDshHome(), path.join(os.homedir(), '.dsh'))
    assert.equal(resolveDshHome({}), defaultDshHome())
  })

  it('treats empty or whitespace DSH_HOME as unset', () => {
    assert.equal(resolveDshHome({ DSH_HOME: '' }), defaultDshHome())
    assert.equal(resolveDshHome({ DSH_HOME: '   ' }), defaultDshHome())
  })

  it('resolves an explicit DSH_HOME and expands a tilde prefix', () => {
    const resolved = resolveDshHome({ DSH_HOME: '~/.dsh-custom' })
    assert.equal(resolved, path.resolve(path.join(os.homedir(), '.dsh-custom')))
  })
})
