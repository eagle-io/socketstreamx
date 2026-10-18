var assert = require('assert')
var fs = require('fs')
var http = require('http')
var path = require('path')
var vm = require('vm')
var engine = require('engine.io')
var engineClient = require('engine.io-client')

var transportDir = path.join(__dirname, '../../../lib/websocket/transports/engineio')
var clientFile = fs.readFileSync(path.join(transportDir, 'client.js'), 'utf8')

assert.ok(clientFile.indexOf('Engine.IO v6.6.7') > 0, 'packed client header')
assert.strictEqual(clientFile.length, 96601)

var sandbox = {
  exports: {},
  module: { exports: {} },
  self: {},
  navigator: { userAgent: 'node' },
  document: {},
  WebSocket: function () {},
  setTimeout: setTimeout,
  clearTimeout: clearTimeout
}
sandbox.window = sandbox
sandbox.global = sandbox
sandbox.globalThis = sandbox
vm.runInContext(clientFile, vm.createContext(sandbox), { filename: 'engine.io.js' })
var factory = sandbox.module.exports
assert.strictEqual(typeof factory, 'function')
assert.strictEqual(factory.Socket, undefined)
assert.strictEqual(engine.protocol, 4)

function installBrowser (userAgent, framed) {
  global.navigator = { userAgent: userAgent }
  global.window = framed ? { self: {}, top: { name: 'parent' } } : { self: global.window, top: null }
  if (!framed) {
    global.window.self = global.window
    global.window.top = global.window
  }
  global.document = {
    location: { protocol: 'https:', hostname: 'eagle.test', port: '443' },
    querySelector: function (selector) {
      if (selector === 'meta[name=ss-session]') return { getAttribute: function () { return 'session-1' } }
      if (selector === 'meta[name=csrf-token]') return { getAttribute: function () { return 'csrf-1' } }
      return null
    }
  }
}

function loadWrapper () {
  delete require.cache[require.resolve('../../../lib/websocket/transports/engineio/wrapper')]
  return require('../../../lib/websocket/transports/engineio/wrapper')
}

installBrowser('Mozilla/5.0 node', false)
var opened = []
global.eio = function (uri, config) {
  if (new.target) throw new Error('eio was constructed')
  var handlers = {}
  var sock = {
    on: function (event, fn) { handlers[event] = fn },
    send: function () {},
    handlers: handlers
  }
  opened.push({ uri: uri, config: config, sock: sock })
  return sock
}
global.console = console

var emitted = []
var statusEvents = []
var wrapper = loadWrapper()
var api = wrapper(
  { emit: function (name) { statusEvents.push(name) } },
  { emit: function () { emitted.push([].slice.call(arguments)) } },
  {
    sessionKeySelector: 'meta[name=ss-session]',
    sessionKeyAttribute: 'content',
    sessionKeyQueryParam: 'skey',
    csrfTokenSelector: 'meta[name=csrf-token]',
    csrfTokenAttribute: 'content',
    csrfTokenQueryParam: 'csrf-token'
  }
)
api.connect()
assert.strictEqual(opened.length, 1)
assert.strictEqual(opened[0].uri, undefined)
assert.strictEqual(opened[0].config.query.skey, 'session-1')
assert.strictEqual(opened[0].config.query['csrf-token'], 'csrf-1')
assert.strictEqual(opened[0].config.secure, true)
assert.strictEqual(global.eio.socket, opened[0].sock)

var errors = []
var originalError = console.error
console.error = function () { errors.push([].slice.call(arguments)) }
opened[0].sock.handlers.message(Buffer.from('nope'))
opened[0].sock.handlers.message({ binary: true })
assert.strictEqual(emitted.length, 0)
assert.strictEqual(errors.length, 2)
console.error = originalError

opened[0].sock.handlers.message('X|OK')
assert.deepStrictEqual(statusEvents, ['ready'])
opened[0].sock.handlers.message('0|{"n":1}|channel')
assert.deepStrictEqual(emitted[0], ['0', '{"n":1}', 'channel'])
opened[0].sock.handlers.message('4|payload')
assert.deepStrictEqual(emitted[1], ['4', 'payload'])

installBrowser('Mozilla/5.0 (Macintosh) Safari/605', true)
var previousAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent')
Object.defineProperty(navigator, 'userAgent', { configurable: true, get: function () { return 'Mozilla/5.0 (Macintosh) Safari/605' } })
opened.length = 0
api = loadWrapper()({ emit: function () {} }, { emit: function () {} }, {})
api.connect()
assert.deepStrictEqual(opened[0].config.transports, ['websocket', 'polling'])
if (previousAgent) Object.defineProperty(navigator, 'userAgent', previousAgent)

var server = http.createServer()
var replies = []
var transport = require('../../../lib/websocket/transports/engineio/index')({
  client: { send: function () {} },
  session: { find: function (_sessionId, _socketId, cb) { cb({}) } }
}, {
  emit: function (responderId, content, _meta, cb) {
    replies.push([responderId, content])
    cb('pong')
  }
}, server, {
  server: {
    cookie: false,
    pingInterval: 60000,
    pingTimeout: 55000,
    maxHttpBufferSize: 10 * 1024 * 1024,
    perMessageDeflate: true,
    getSessionKey: function () { return 'session-1' },
    getCsrfToken: function () { return 'csrf-1' }
  }
})

server.listen(0, '127.0.0.1', function () {
  var port = server.address().port
  var sock = new engineClient.Socket('ws://127.0.0.1:' + port, { transports: ['websocket'] })
  var received = []
  sock.on('message', function (msg) { received.push(msg) })
  sock.on('error', function (err) { throw err })
  var sawReady = false
  var timer = setTimeout(function () {
    server.close()
    sock.close()
    throw new Error('timed out waiting for X|OK, saw ' + received.join(','))
  }, 5000)
  sock.on('message', function () {
    if (!sawReady && received.indexOf('X|OK') >= 0) {
      sawReady = true
      sock.send(Buffer.from([1, 2, 3]))
      sock.send('5|ping')
    }
    if (received.indexOf('5|pong') >= 0) {
      clearTimeout(timer)
      assert.strictEqual(transport.event().all instanceof Function, true)
      assert.deepStrictEqual(replies, [['5', 'ping']])
      sock.close()
      server.close()
    }
  })
})
