// Serve Views
// -----------
// Extend Node's HTTP http.ServerResponse object to serve views either from a cache (in production)
// or by generating them on-the-fly (in development)
// Note: Even though this is exactly what Express.js does, it's not best practice to extend Node's native
// objects and we don't be doing this in SocketStream 0.4

var cache, fs, http, pathlib, res, view;

require('colors');

fs = require('fs');

pathlib = require('path');

http = require('http');

view = require('./view');

// Added support for server-side jade cache
viewJade = require('./view_jade');

// Cache each view in RAM when packing assets (i.e. production mode)
cache = {};

// Get hold of the 'response' object so we can extend it later
res = http.ServerResponse.prototype;

module.exports = function(ss, clients, options) {

  // Append the 'serveClient' method to the HTTP Response object  
  res.serveClient = function(name, locals, statusCode) {
    var client, fileName, self, sendHTML;
    self = this;
    sendHTML = function(html, code) {
      if (code == null) {
        code = 200;
      }
      
      // removed to allow connect.compress() perform static HTML files compression.
      // self.writeHead(code, {
      //   'Content-Length': Buffer.byteLength(html),
      //   'Content-Type': 'text/html'
      // });
      // return self.end(html);

      self.statusCode = statusCode || code;
      self.setHeader('Content-Length', Buffer.byteLength(html));
      self.setHeader('Content-Type', 'text/html');
      self.end(html);
    };

    renderJade = function(view, cb) {
      var locals = (view.options && view.options.locals) ? view.options.locals : {};
      //// If passing optional headers for main view HTML
      if (view.options && view.options.headers) locals['SocketStream'] = view.options.headers;
      return cb(view.jade(locals));
    };

    if (typeof locals === 'object') {
      options.locals = locals;
    };

    try {
      client = typeof name === 'string' && clients[name];
      if (client == null) {
        throw new Error('Unable to find single-page client: ' + name);
      }

      // cache the data returned from viewJade and on subsequent calls (ie. cached) call the jade parser method with the cached options (+ new passed in options)
      if (options.packedAssets) {
        if (!cache[name]) {
          return viewJade(ss, client, options, function(path, jade, opts) {
            cache[name] = {path: path, jade: jade, options: opts};
            return renderJade(cache[name], sendHTML);
          });
        }
        // Need to add in any local vars
        if (options.locals) {
          cache[name].options.locals = options.locals;
        }
        return renderJade(cache[name], sendHTML);
      }
      else {
        return viewJade(ss, client, options, function(path, jade, opts) {
          return renderJade({path: path, jade: jade, options: opts}, sendHTML);
        });
      }

    } catch (e) {
      // Never send stack trace to the browser, log it to the terminal instead      
      ss.log('Error: Unable to serve HTML!'.red);
      ss.log(e.message);
      if (self.err) return self.err(500, 'Content Temporarily Unavailable', { format: 'HTML' })
      return sendHTML('Internal Server Error', 500);
    }
  };

  // Alias res.serveClient to keep compatibility with existing apps  
  return res.serve = res.serveClient;
};