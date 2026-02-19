var magicPath, pathlib, wrap;

pathlib = require('path');

magicPath = require('./magic_path');

wrap = require('./wrap');

fs = require('fs');

module.exports = function(ss, client, options, cb) {
  var asset, headers, htmlOptions, includes, resolveAssetLink, templateEngine, templates;
  templateEngine = require('./template_engine')(ss);
  resolveAssetLink = function(type) {
    var defaultPath, file, link, _ref, _ref1;
    defaultPath = "/assets/" + client.name + "/" + client.id + "." + type;
    if (link = (_ref = options.packedAssets) != null ? (_ref1 = _ref.cdn) != null ? _ref1[type] : void 0 : void 0) {
      if (typeof link === 'function') {
        file = {
          id: client.id,
          name: client.name,
          extension: type,
          path: defaultPath
        };
        return link(file);
      } else if (typeof link === 'string') {
        return link;
      } else {
        throw new Error("CDN " + type + " param must be a Function or String");
      }
    } else {
      return defaultPath;
    }
  };
  resolveAssetIntegrity = function() {
    // check for integrity hash for packed js file for this client
    return options.packedAssets.integrity && options.packedAssets.integrity[client.name];
  };
  templates = function() {
    var dir, files, output;
    dir = pathlib.join(ss.root, options.dirs.templates);
    output = [];
    if (client.paths.tmpl) {
      files = [];
      client.paths.tmpl.forEach(function(tmpl) {
        return files = files.concat(magicPath.files(dir, tmpl));
      });
      // added bool (false) to indicate to template engine that template will NOT be used in external js
      templateEngine.generate(dir, files, false, function(templateHTML) {
        return output.push(templateHTML);
      });
    }
    return output;
  };
  headers = function() {
    var css, js, output, nonce;
    output = [];
    // include nonce if provided in template
    nonce = options.locals.nonce;
    if (options.packedAssets) {
      css = resolveAssetLink('css');
      js = resolveAssetLink('js');
      output.push(wrap.htmlTag.css(css));
      output.push(wrap.htmlTag.js(js, resolveAssetIntegrity(), nonce));
    } else {
      output.push(wrap.htmlTag.js("/_serveDev/system?ts=" + client.id, null, nonce));
      client.paths.css.forEach(function(path) {
        return magicPath.files(pathlib.join(ss.root, options.dirs.css), path).forEach(function(file) {
          return output.push(wrap.htmlTag.css("/_serveDev/css/" + file + "?ts=" + client.id));
        });
      });
      client.paths.code.forEach(function(path) {
        return magicPath.files(pathlib.join(ss.root, options.dirs.code), path).forEach(function(file) {
          return output.push(wrap.htmlTag.js("/_serveDev/code/" + file + "?ts=" + client.id + "&pathPrefix=" + path, null, nonce));
        });
      });
      output.push(wrap.htmlTag.js("/_serveDev/start?ts=" + client.id, null, nonce));
    }
    return output;
  };
  asset = require('./asset')(ss, options);
  includes = headers();

  // Do not include client-side templates in html if pre-packed in asset js
  if (!options.packedAssets) {
    includes = includes.concat(templates());
  }

  htmlOptions = {
    headers: includes.join(''),
    compress: options.packedAssets,
    filename: client.paths.view
  };
  if (options.locals) {
    htmlOptions.locals = options.locals;
  }
  // grab the path to the jade file and read from disk
  dir = pathlib.join(ss.root, options.dirs.views);
  path = pathlib.join(dir, client.paths.view);

  formatter = ss.client.formatters["jade"];
  htmlOptions.compileOnly = true;
  return formatter.compile(path.replace(/\\/g, '/'), htmlOptions, cb);
};
