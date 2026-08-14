'use strict'

const fs = require('node:fs')
const { createRequire } = require('node:module')

function readEnvConfig(env = process.env) {
  if (!env.DSH_CLI) return null
  return {
    cli: env.DSH_CLI,
    nodeArgs: env.DSH_NODE_ARGS ? env.DSH_NODE_ARGS.split(/\s+/).filter(Boolean) : [],
    cwd: env.DSH_CWD || undefined,
  }
}

function readFileConfig(configFile) {
  const raw = JSON.parse(fs.readFileSync(configFile, 'utf8'))
  if (typeof raw.cli !== 'string' || raw.cli === '') throw new Error('"cli" must be a non-empty path')
  return {
    cli: raw.cli,
    nodeArgs: Array.isArray(raw.nodeArgs) ? raw.nodeArgs.map(String) : [],
    cwd: typeof raw.cwd === 'string' && raw.cwd !== '' ? raw.cwd : undefined,
  }
}

function readBundledConfig(fromFile = __filename) {
  const requireFrom = createRequire(fromFile)
  const bin = requireFrom.resolve('@deepseek-ai/dsh/lib/bin.js')
  if (!fs.existsSync(bin)) throw new Error('bundled @deepseek-ai/dsh/lib/bin.js is missing')
  return { cli: bin, nodeArgs: [], cwd: undefined }
}

function readConfig({ configFile, env = process.env, fromFile = __filename } = {}) {
  const fromEnv = readEnvConfig(env)
  if (fromEnv) return fromEnv
  if (configFile && fs.existsSync(configFile)) {
    try {
      return readFileConfig(configFile)
    } catch (error) {
      throw new Error(`bad config ${configFile}: ${error.message}`)
    }
  }
  try {
    return readBundledConfig(fromFile)
  } catch { /* dependency not installed */ }
  throw new Error(`cannot locate the dsh CLI: install @deepseek-ai/dsh, set DSH_CLI, or write ${configFile}`)
}

module.exports = { readEnvConfig, readFileConfig, readBundledConfig, readConfig }
