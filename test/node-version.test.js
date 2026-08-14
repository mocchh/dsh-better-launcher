'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { parseNodeVersion, isNodeSupported, nodeVersionError } = require('../lib/node-version')

describe('node-version', () => {
  it('parses versions with or without a v prefix', () => {
    assert.deepEqual(parseNodeVersion('v22.19.0'), { major: 22, minor: 19, patch: 0 })
    assert.deepEqual(parseNodeVersion('24.1.2'), { major: 24, minor: 1, patch: 2 })
  })

  it('matches official harness engines', () => {
    assert.equal(isNodeSupported('22.18.0'), false)
    assert.equal(isNodeSupported('22.19.0'), true)
    assert.equal(isNodeSupported('22.20.1'), true)
    assert.equal(isNodeSupported('23.0.0'), false)
    assert.equal(isNodeSupported('24.0.0'), true)
    assert.equal(isNodeSupported('18.20.0'), false)
    assert.equal(isNodeSupported('20.11.0'), false)
    assert.equal(isNodeSupported(), isNodeSupported(process.versions.node))
  })

  it('formats a clear engine error', () => {
    assert.match(nodeVersionError('18.0.0'), /found v18\.0\.0/)
  })
})
