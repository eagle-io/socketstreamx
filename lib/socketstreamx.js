// SocketStream 0.3
// ----------------


let EventEmitter2 = require('eventemitter2').EventEmitter2;

// Get current version from package.json
let version = exports.version = require('./utils/file').loadPackageJSON().version;

// Set root path of your project
let root = exports.root = process.cwd().replace(/\\/g, '/'); // replace '\' with '/' to support Windows

// Warn if attempting to start without a cwd (e.g. through upstart script)
if (root == '/') throw new Error("You must change into the project directory before starting your SocketStream app");

// Set environment
let env = exports.env = (process.env['SS_ENV'] || 'development').toLowerCase();

// Session & Session Store
let session = exports.session = require('./session');

// Create an internal API object which is passed to sub-modules and can be used within your app
let api = exports.api = {

  version: version,
  root: root,
  env: env,
  log: console.log,
  session: session,

  // Call ss.api.add('name_of_api', value_or_function) from your app to safely extend the 'ss' internal API object passed through to your /server code
  add: function(name, fn) {
    if (api[name]) {
      throw new Error("Unable to register internal API extension '" + name + "' as this name has already been taken");
    } else {
      api[name] = fn;
      return true;
    }
  }
};

// Create internal Events bus
// Note: only used by the ss-console module for now. This idea will be expended upon in SocketStream 0.4
let events = exports.events = new EventEmitter2();

// Publish Events
let publish = exports.publish = require('./publish/index')();

// HTTP
let http = exports.http = require('./http/index')(root);

// Client Asset Manager
let client = exports.client = require('./client/index')(api, http.router);

// Allow other libs to send assets to the client
api.client = {send: client.assets.send};

// Incoming Request Responders
let responders = exports.responders = require('./request/index')(api);

// Websocket Layer (transport, message responders, transmit incoming events)
let ws = exports.ws = require('./websocket/index')(api, responders);

// Only one instance of the server can be started at once
let serverInstance = null; 

// Public API
let start = function(httpServer) {

  // Load SocketStream server instance
  let server = {
    responders:      responders.load(),
    eventTransport:  publish.transport.load(),
    sessionStore:    session.store.get()
  };

  // Extend the internal API with a publish object you can call from your own server-side code
  api.publish = publish.api(server.eventTransport);
 
  // Start web stack
  if (httpServer) {

    //console.log('Starting SocketStream %s in %s mode...', version, env);

    // Bind responders to websocket
    ws.load(httpServer, server.responders, server.eventTransport);

    // Append SocketStream middleware to stack
    http.load(client.options.dirs['static'], server.sessionStore, session.options);

    // Load Client Asset Manager
    client.load(api);

    // Send server instance to any registered modules (e.g. console)
    events.emit('server:start', server);

  // If no HTTP server is passed return an API to allow for server-side testing
  // Note this feature is currently considered 'experimental' and the implementation will
  // be changed in SocketStream 0.4 to ensure any type of Request Responder can be tested
  } else {

    let id, sessionID = session.create();

    for (id in server.responders) {

      let responder = server.responders[id];

      if (responder.name && responder.interfaces.internal) {
        let fn = function(){
          let args = Array.prototype.slice.call(arguments);
          let cb = args.pop();
          return responder.interfaces.internal(args, {sessionId: sessionID, transport: 'test'}, function(err, params){ cb(params); });
        };
        api.add(responder.name, fn);
      }
    }
    
  }

  return api;
};

// Ensure server can only be started once
exports.start = function(httpServer) {
  return serverInstance || (serverInstance = start(httpServer));
};