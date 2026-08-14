// Test double for CLI resolution + forwarding without touching the real harness.
console.log('fake-cli invoked with args:', JSON.stringify(process.argv.slice(2)))
console.log('cwd:', process.cwd())
