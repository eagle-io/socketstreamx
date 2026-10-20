// Module loading code from Browserify: https://github.com/substack/node-browserify

window.require = function (file, cwd) {
    let resolved = require.resolve(file, cwd || '/');
    let mod = require.modules[resolved];
    if (!mod) throw new Error(
        'Failed to resolve module ' + file + ', tried ' + resolved
    );
    let res = mod._cached ? mod._cached : mod();
    return res;
}

require.paths = [];
require.modules = {};
require.extensions = [".js",".coffee",".ls"];

require._core = {
    'assert': true,
    'events': true,
    'fs': true,
    'path': true,
    'vm': true
};

require.resolve = (function () {
    return function (x, cwd) {
        if (!cwd) cwd = '/';
        
        if (require._core[x]) return x;
        let path = require.modules.path();
        cwd = path.resolve('/', cwd);
        let y = cwd || '/';
        
        if (x.match(/^(?:\.\.?\/|\/)/)) {
            let m = loadAsFileSync(path.resolve(y, x))
                || loadAsDirectorySync(path.resolve(y, x));
            if (m) return m;
        }
        
        let n = loadNodeModulesSync(x, y);
        if (n) return n;
        
        throw new Error("Cannot find module '" + x + "' at '" + y + "'");
        
        function loadAsFileSync (x) {
            if (require.modules[x]) {
                return x;
            }
            
            for (let i = 0; i < require.extensions.length; i++) {
                let ext = require.extensions[i];
                if (require.modules[x + ext]) return x + ext;
            }
        }
        
        function loadAsDirectorySync (x) {
            x = x.replace(/\/+$/, '');           
            return loadAsFileSync(x + '/index');
        }
        
        function loadNodeModulesSync (x, start) {
            let dirs = nodeModulesPathsSync(start);
            for (let i = 0; i < dirs.length; i++) {
                let dir = dirs[i];
                let m = loadAsFileSync(dir + '/' + x);
                if (m) return m;
                let n = loadAsDirectorySync(dir + '/' + x);
                if (n) return n;
            }
            
            let m = loadAsFileSync(x);
            if (m) return m;
        }
        
        function nodeModulesPathsSync (start) {
            let parts;
            if (start === '/') parts = [ '' ];
            else parts = path.normalize(start).split('/');
            
            let dirs = [];
            for (let i = parts.length - 1; i >= 0; i--) {
                if (parts[i] === 'node_modules') continue;
                let dir = parts.slice(0, i + 1).join('/') + '/node_modules';
                dirs.push(dir);
            }
            
            return dirs;
        }
    };
})();

require.alias = function (from, to) {
    let path = require.modules.path();
    let res = null;
    try {
        res = require.resolve(from + '/package.json', '/');
    }
    catch (err) {
        res = require.resolve(from, '/');
    }
    let basedir = path.dirname(res);
    
    let keys = (Object.keys || function (obj) {
        let res = [];
        for (let key in obj) res.push(key)
        return res;
    })(require.modules);
    
    for (let i = 0; i < keys.length; i++) {
        let key = keys[i];
        if (key.slice(0, basedir.length + 1) === basedir + '/') {
            let f = key.slice(basedir.length);
            require.modules[to + f] = require.modules[basedir + f];
        }
        else if (key === basedir) {
            require.modules[to] = require.modules[basedir];
        }
    }
};

require.define = function (filename, fn) {
    let dirname = require._core[filename]
        ? ''
        : require.modules.path().dirname(filename)
    ;
    
    let require_ = function (file) {
        return require(file, dirname)
    };
    require_.resolve = function (name) {
        return require.resolve(name, dirname);
    };
    require_.modules = require.modules;
    require_.define = require.define;
    let module_ = { exports : {} };
    
    require.modules[filename] = function () {
        require.modules[filename]._cached = module_.exports;
        fn.call(
            module_.exports,
            require_,
            module_,
            module_.exports,
            dirname,
            filename
        );
        require.modules[filename]._cached = module_.exports;
        return module_.exports;
    };
};

if (typeof process === 'undefined') process = {};

if (!process.nextTick) process.nextTick = (function () {
    let queue = [];
    let canPost = typeof window !== 'undefined'
        && window.postMessage && window.addEventListener
    ;
    
    if (canPost) {
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'browserify-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    let fn = queue.shift();
                    fn();
                }
            }
        }, true);
    }
    
    return function (fn) {
        if (canPost) {
            queue.push(fn);
            window.postMessage('browserify-tick', '*');
        }
        else setTimeout(fn, 0);
    };
})();

if (!process.title) process.title = 'browser';

if (!process.binding) process.binding = function (name) {
    if (name === 'evals') return require('vm')
    else throw new Error('No such module')
};

if (!process.cwd) process.cwd = function () { return '.' };

require.define("path", function (require, module, exports, __dirname, __filename) {
function filter (xs, fn) {
    let res = [];
    for (let i = 0; i < xs.length; i++) {
        if (fn(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  let up = 0;
  for (let i = parts.length; i >= 0; i--) {
    let last = parts[i];
    if (last == '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Regex to split a filename into [*, dir, basename, ext]
// posix version
let splitPathRe = /^(.+\/(?!$)|\/)?((?:.+?)?(\.[^.]*)?)$/;

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
let resolvedPath = '',
    resolvedAbsolute = false;

for (let i = arguments.length; i >= -1 && !resolvedAbsolute; i--) {
  let path = (i >= 0)
      ? arguments[i]
      : process.cwd();

  // Skip empty and invalid entries
  if (typeof path !== 'string' || !path) {
    continue;
  }

  resolvedPath = path + '/' + resolvedPath;
  resolvedAbsolute = path.charAt(0) === '/';
}

// At this point the path should be resolved to a full absolute path, but
// handle relative paths to be safe (might happen when process.cwd() fails)

// Normalize the path
resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
let isAbsolute = path.charAt(0) === '/',
    trailingSlash = path.slice(-1) === '/';

// Normalize the path
path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }
  
  return (isAbsolute ? '/' : '') + path;
};


// posix version
exports.join = function() {
  let paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    return p && typeof p === 'string';
  }).join('/'));
};


exports.dirname = function(path) {
  let dir = splitPathRe.exec(path)[1] || '';
  let isWindows = false;
  if (!dir) {
    // No dirname
    return '.';
  } else if (dir.length === 1 ||
      (isWindows && dir.length <= 3 && dir.charAt(1) === ':')) {
    // It is just a slash or a drive letter with a slash
    return dir;
  } else {
    // It is a full dirname, strip trailing slash
    return dir.substring(0, dir.length - 1);
  }
};


exports.basename = function(path, ext) {
  let f = splitPathRe.exec(path)[2] || '';
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPathRe.exec(path)[3] || '';
};

});
