// Simple wrapper for modules

exports.module = function(modPath, code) {
  return "require.define(\"" + modPath + "\", function (require, module, exports, __dirname, __filename){\n" + code + "\n});";
};

exports.htmlTag = {
  css: function(path) {
    return '<link href="' + path + '" media="all" rel="stylesheet" type="text/css">';
  },
  js: function(path, integrity, nonce) {
    return '<script src="' + path + '" crossorigin="anonymous" type="text/javascript"' + (integrity ? ' integrity="' + integrity + '"' : '') + (nonce ? ' nonce="' + nonce + '"' : '') + '></script>';
  }
};