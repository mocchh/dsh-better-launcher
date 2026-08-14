'use strict'

function parsePortNumber(value, { allowZero = true, label = '--port' } = {}) {
  if (value == null || value === '' || !/^\d+$/.test(String(value))) {
    throw new Error(`${label} needs a numeric value`)
  }
  const port = Number(value)
  if (port > 65535) throw new Error(`${label} out of range (0-65535)`)
  if (port === 0 && !allowZero) throw new Error(`${label} must be 1-65535`)
  return port
}

function takePort(rest, index, options) {
  const token = rest[index]
  if (token.startsWith('--port=')) {
    return { port: parsePortNumber(token.slice('--port='.length), options), next: index }
  }
  if (token === '--port') {
    const value = rest[index + 1]
    if (value == null || value.startsWith('-')) throw new Error(`${options.label || '--port'} needs a numeric value`)
    return { port: parsePortNumber(value, options), next: index + 1 }
  }
  return null
}

function parseStartArgs(rest) {
  let port
  let open = false
  let help = false
  const forward = []
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]
    if (token === '-h' || token === '--help') {
      help = true
      continue
    }
    if (token === '--open') {
      open = true
      continue
    }
    const taken = takePort(rest, i, { allowZero: true, label: '--port' })
    if (taken) {
      port = taken.port
      if (rest[i].startsWith('--port=')) forward.push(rest[i])
      else forward.push('--port', rest[taken.next])
      i = taken.next
      continue
    }
    forward.push(token)
  }
  return { port, open, help, forward }
}

function parseStopArgs(rest) {
  let force = false
  let port
  let help = false
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]
    if (token === '-h' || token === '--help') {
      help = true
      continue
    }
    if (token === '--force') {
      force = true
      continue
    }
    const taken = takePort(rest, i, { allowZero: false, label: '--port' })
    if (taken) {
      port = taken.port
      i = taken.next
      continue
    }
    throw new Error(`stop: unknown argument ${token}`)
  }
  return { force, port, help }
}

module.exports = { parsePortNumber, parseStartArgs, parseStopArgs }
