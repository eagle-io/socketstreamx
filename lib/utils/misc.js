// Adapted from http://www.broofa.com/Tools/Math.uuid.js
exports.randomString = function (len) {
  let chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('');
  let uuid = [];
  let radix = chars.length;
  for (let i = 0; i < len; i++) uuid[i] = chars[0 | Math.random()*radix];
  return uuid.join('');
};

// Parse incoming websocket messages into message type and contents
exports.parseWsMessage = function (msg) {
  let i;
  if ((i = msg.indexOf('|')) > 0) {
    return [msg.substr(0, i), msg.substr(i+1)];
  } else {
    throw new Error('Invalid message');
  }
};

// Taken from underscore.js
exports.extend = function (obj) {
  for (let i = 1; i < arguments.length; i++) {
    let source = arguments[i];
    for (let prop in source) {
      obj[prop] = source[prop];
    }
  }
  return obj;
};

// Useful for declaring default parameter
exports.defaults = function (args, defaults) {
  return exports.extend({}, defaults, args);
};
