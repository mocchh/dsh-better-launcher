'use strict'

const path = require('node:path')
const os = require('node:os')

function expandHomePath(input) {
  if (input === '~') return os.homedir()
  if (input.startsWith('~/') || input.startsWith('~\\')) return path.join(os.homedir(), input.slice(2))
  return input
}

function defaultDshHome() {
  return path.join(os.homedir(), '.dsh')
}

/**
 * Match official @deepseek-ai/dsh-home-paths:
 * blank/whitespace DSH_HOME is unset; ~/ and ~\ are expanded.
 */
function resolveDshHome(env = process.env) {
  const fromEnv = env.DSH_HOME
  const selected = fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : defaultDshHome()
  return path.resolve(expandHomePath(selected))
}

module.exports = { expandHomePath, defaultDshHome, resolveDshHome }
