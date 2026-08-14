'use strict'

function parseNodeVersion(version) {
  const parts = String(version).replace(/^v/i, '').split('.').map(part => Number.parseInt(part, 10))
  return {
    major: Number.isInteger(parts[0]) ? parts[0] : 0,
    minor: Number.isInteger(parts[1]) ? parts[1] : 0,
    patch: Number.isInteger(parts[2]) ? parts[2] : 0,
  }
}

/** Official harness engines: ^22.19.0 || >=24.0.0 (Node 23 is out). */
function isNodeSupported(version = process.versions.node) {
  const { major, minor } = parseNodeVersion(version)
  if (major >= 24) return true
  if (major === 22 && minor >= 19) return true
  return false
}

function nodeVersionError(version = process.versions.node) {
  return `Node.js ^22.19.0 || >=24.0.0 required (found v${String(version).replace(/^v/i, '')})`
}

module.exports = { parseNodeVersion, isNodeSupported, nodeVersionError }
