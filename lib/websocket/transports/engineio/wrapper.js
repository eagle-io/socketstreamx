// Engine.io client-side Wrapper
var reconnectSwitch        = false;
var reconnectionTimeout    = 1000;
var maxReconnectionTimeout = 30000;

var getUrlParameter = function(name) {
  name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
  var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
  var results = regex.exec(location.search);
  return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

if (typeof Object.assign != 'function') {
  Object.assign = function(target, varArgs) { // .length of function is 2
    'use strict';
    if (target == null) { // TypeError if undefined or null
      throw new TypeError('Cannot convert undefined or null to object');
    }

    var to = Object(target);

    for (var index = 1; index < arguments.length; index++) {
      var nextSource = arguments[index];

      if (nextSource != null) { // Skip over if undefined or null
        for (var nextKey in nextSource) {
          // Avoid bugs when hasOwnProperty is shadowed
          if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
            to[nextKey] = nextSource[nextKey];
          }
        }
      }
    }
    return to;
  };
}

module.exports = function(serverStatus, message, config){

  // extend config with secure,host,port options
  config = Object.assign(config, {
      secure  : document.location.protocol === "https:"
    , host    : document.location.hostname
    , port    : document.location.port
  })



  return {
    connect: function(){

      // check for page session key and include in query params
      var pageSessionKey = document.querySelector(config.sessionKeySelector) ? document.querySelector(config.sessionKeySelector).getAttribute(config.sessionKeyAttribute) : null;
      if (pageSessionKey && config.sessionKeyQueryParam) {
        config.query = {}
        config.query[config.sessionKeyQueryParam] = pageSessionKey
      }

      // its possible to change the engine.io path based on http parameter 'proxy-path' (for proxied connection)
      var socketAddress = getUrlParameter(config.addressQueryParam)
      var uri = (socketAddress && socketAddress.length ? socketAddress : undefined);

      // ISSUE: safari blocks 3rd party cookies by default with privacy option 'Prevent cross-site tracking'
      //        this causes dash/charts embedded in an iframe to break as engine.io relies on the AWSALB cookie for session stickiness for long-polling
      // FIX:   make 'websocket' the first transport to use since websockets are always sticky
      var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
      if (isSafari && (window.self !== window.top)) {
        console.debug("safari iframe detected. using websocket transport")
        config.transports = ['websocket', 'polling'];
      }
      
      var sock = new eio.Socket(uri, config);
      eio.socket = sock; // expose socket

      sock.on('message', function(e) {
        var i, x, msg = e;

        // Attempt to get the responderId from each message
        if ( (i = msg.indexOf('|')) > 0) {

          var responderId = msg.substr(0, i), 
                  content = msg.substr(i+1);

          switch (responderId) {

            // X = a system message
            case 'X':
              if (reconnectSwitch === false) {
                serverStatus.emit('ready');
              } else {
                reconnectionTimeout = 1000;
                serverStatus.emit('reconnect');
              }
              break;

            // 0 = incoming events
            // As events are so integral to SocketStream rather than breaking up the JSON message
            // sent over the event transport for efficiencies sake we append the meta data (typically 
            // the channel name) at the end of the JSON message after the final pipe | character
            case '0':
              if ( (x = content.lastIndexOf('|')) > 0) {
                var event = content.substr(0, x),
                     meta = content.substr(x+1);
                message.emit(responderId, event, meta);
              } else {
                console.error('Invalid event message received:', msg);
              }
              break;
            
            // All other messages are passed directly to the relevant Request Responder
            default:
              message.emit(responderId, content);
          }

        // EVERY message should have a responderId
        // If we can't find one, it's a malformed request
        } else {
          console.error('Invalid websocket message received:', msg);
        }

      });

      var attemptReconnect = function(time){
        setTimeout(function(){
          var ss = require('socketstream');
          ss.assignTransport(config);
          if (ss.server.event != "reconnect") {
            reconnectionTimeout *= 1.5;
            if (reconnectionTimeout > maxReconnectionTimeout) {
              reconnectionTimeout = maxReconnectionTimeout;
            }
          }
        }, time);
      };

      sock.on('close', function() {
        reconnectSwitch = true;
        serverStatus.emit('disconnect');
        attemptReconnect(reconnectionTimeout);
      });

      // Return a function which is used to send all messages to the server
      return function(msg){
        sock.send(msg)
      };
    }
  }
}