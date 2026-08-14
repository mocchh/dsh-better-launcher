'use strict'

const http = require('node:http')

let port = 3080
const args = process.argv.slice(2)
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port') {
    port = Number(args[++i])
  } else if (typeof args[i] === 'string' && args[i].startsWith('--port=')) {
    port = Number(args[i].slice('--port='.length))
  }
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' })
  res.end('ok')
})

server.listen(port, '127.0.0.1', () => {
  const address = server.address()
  const bound = typeof address === 'object' && address ? address.port : port
  console.log(`fake-web listening on ${bound}`)
})
