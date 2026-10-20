// Plain CSS Formatter
let fs;

fs = require('fs');

exports.init = function() {
  return {
    extensions: ['css'],
    assetType: 'css',
    contentType: 'text/css',
    compile: function(path, options, cb) {
      return cb(fs.readFileSync(path, 'utf8'));
    }
  };
};
