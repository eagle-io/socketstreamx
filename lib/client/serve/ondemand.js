// Serve Assets On Demand
// ----------------------
// Serves assets to browsers on demand, caching responses in production mode
//
// SECURITY: these routes are unauthenticated and expose the entire /client/code tree, so they are
// only bound when the app opts in with ss.client.set({serveOnDemand: true})

var magicPath, pathlib, queryCache, queryCacheLimit, utils;

require('colors');

pathlib = require('path');

magicPath = require('../magic_path');

utils = require('./utils');

// When packing assets, cache responses to each query in RAM to avoid
// having to re-compile and minify assets
queryCache = {};

// Queries are supplied by the client so the cache must be bounded
queryCacheLimit = 100;

module.exports = function(ss, router, options) {
  var asset, cacheResponse, code, notFound, serve, worker;
  asset = require('../asset')(ss, options);

  cacheResponse = function(path, output) {
    var keys;
    if (!queryCache[path]) {
      keys = Object.keys(queryCache);
      if (keys.length >= queryCacheLimit) {
        delete queryCache[keys[0]];  // evict oldest entry
      }
    }
    queryCache[path] = output;
  };

  // Always send a response, otherwise unfulfillable requests leave the connection open
  notFound = function(response) {
    response.statusCode = 404;
    response.setHeader('Content-Length', 0);
    return response.end();
  };

  serve = function(processor) {
    return function(request, response) {
      var path;
      path = utils.parseUrl(request.url);
      if (path == null || path.length === 0) {
        return notFound(response);
      }
      if (options.packedAssets && queryCache[path]) {
        return utils.serve.js(queryCache[path], response);
      } else {
        return processor(request, response, path, function(output) {
          if (output == null) {
            return notFound(response);
          }
          cacheResponse(path, output);
          return utils.serve.js(output, response);
        });
      }
    };
  };

  // Async Code Loading  
  code = function(request, response, path, cb) {
    var completed, dir, files, output, processed;
    output = [];
    dir = pathlib.join(ss.root, options.dirs.code);
    files = magicPath.files(dir, [path]);
    if (files.length === 0) {
      return cb(null);
    }
    // count every file we finish with (loaded or failed) so a failure can not stall the response
    processed = 0;
    completed = function() {
      processed++;
      if (processed === files.length) {  // last file
        return cb(output.join("\n"));
      }
    };
    return files.forEach(function(file) {
      var description;
      try {
        return asset.js(file, {
          pathPrefix: path,
          compress: options.packedAssets
        }, function(js) {
          output.push(js);
          return completed();
        });
      } catch (e) {
        description = e.stack && e.stack.split("\n")[0] || 'Unknown Error';
        ss.log(("! Unable to load " + file + " on demand:").red + ' ' + description);
        return completed();
      }
    });
  };

  // Web Workers
  worker = function(request, response, path, cb) {
    var description;
    try {
      return asset.worker(path, {
        compress: options.packedAssets
      }, cb);
    } catch (e) {
      description = e.stack && e.stack.split("\n")[0] || 'Unknown Error';
      ss.log(("! Unable to load worker " + path + " on demand:").red + ' ' + description);
      return cb(null);
    }
  };

  // Bind to routes  
  router.on('/_serve/code?*', serve(code));
  return router.on('/_serve/worker?*', serve(worker));
};
