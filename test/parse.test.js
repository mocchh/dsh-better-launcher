'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { parsePortNumber, parseStartArgs, parseStopArgs } = require('../lib/parse')

describe('parse', () => {
  it('accepts --port space and equals forms, including 0', () => {
    assert.deepEqual(parseStartArgs(['--port', '8080', '--open']), {
      port: 8080,
      open: true,
      help: false,
      forward: ['--port', '8080'],
    })
    assert.deepEqual(parseStartArgs(['--port=9090', '--trusted-host', 'example.test']), {
      port: 9090,
      open: false,
      help: false,
      forward: ['--port=9090', '--trusted-host', 'example.test'],
    })
    assert.equal(parseStartArgs(['--port', '0']).port, 0)
  })

  it('strips --open and --help from forwarded web args', () => {
    const parsed = parseStartArgs(['--open', '--help', '--host', '127.0.0.1'])
    assert.equal(parsed.open, true)
    assert.equal(parsed.help, true)
    assert.deepEqual(parsed.forward, ['--host', '127.0.0.1'])
  })

  it('rejects a missing, non-numeric, or out-of-range port', () => {
    assert.throws(() => parseStartArgs(['--port']), /needs a numeric value/)
    assert.throws(() => parseStartArgs(['--port', 'abc']), /needs a numeric value/)
    assert.throws(() => parseStartArgs(['--port=70000']), /out of range/)
    assert.throws(() => parsePortNumber('65536'), /out of range/)
  })

  it('parses stop --force and --port, rejecting port 0', () => {
    assert.deepEqual(parseStopArgs(['--force', '--port', '8080']), {
      force: true,
      port: 8080,
      help: false,
    })
    assert.deepEqual(parseStopArgs(['--port=8080', '--force']), {
      force: true,
      port: 8080,
      help: false,
    })
    assert.throws(() => parseStopArgs(['--port', '0']), /must be 1-65535/)
    assert.throws(() => parseStopArgs(['--nope']), /unknown argument/)
  })
})
