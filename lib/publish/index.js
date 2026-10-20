// Publish Event API
// -----------------
// Allows you to publish events to browser clients. All this code is closely related to the 'event' websocket responder

let isInternal,
  __slice = [].slice;

module.exports = function() {
  return {
    transport: require('./transport')(),
    api: function(transport) {
      let methods;
      methods = {
        local: function() {
          let event, obj, params;
          event = arguments[0], params = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
          obj = {
            t: 'all',
            e: event,
            p: params
          };
          transport.send(obj, true); // specify it should go to local 'all' channel
          if (!isInternal(event)) {
            return console.log('⇠' + ' event:all' + ' ' + event);
          }
        },
        all: function() {
          let event, obj, params;
          event = arguments[0], params = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
          obj = {
            t: 'all',
            e: event,
            p: params
          };
          transport.send(obj);
          if (!isInternal(event)) {
            return console.log('⇠' + ' event:all' + ' ' + event);
          }
        },
        socketId: function() {
          let event, obj, params, socketId;
          socketId = arguments[0], event = arguments[1], params = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
          obj = {
            t: 'socketId',
            socketId: socketId,
            e: event,
            p: params
          };
          transport.send(obj, true); // socketId requests are always sent local and not via rabbitmq
          return console.log('⇠' + (" event:socketId:" + socketId) + ' ' + event);
        },
        users: function() {
          let event, obj, params, users;
          users = arguments[0], event = arguments[1], params = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
          users = users instanceof Array && users || [users];
          obj = {
            t: 'user',
            users: users,
            e: event,
            p: params
          };
          transport.send(obj);
          return console.log('⇠' + (" event:users:[" + (users.join(',')) + "]") + ' ' + event);
        },
        channels: function() {
          let channels, event, obj, params;
          channels = arguments[0], event = arguments[1], params = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
          channels = channels instanceof Array && channels || [channels];
          obj = {
            t: 'channel',
            channels: channels,
            e: event,
            p: params
          };
          transport.send(obj);
          return console.log('⇠' + (" event:channels:[" + (channels.join(',')) + "]") + ' ' + event);
        }
      };

      // Alias 0.2 command      
      methods.broadcast = methods.all;

      // Alias singles to plurals      
      methods.channel = methods.channels;
      methods.user = methods.users;

      // Return all methods      
      return methods;
    }
  };
};

// Private

isInternal = function(event) {
  return event.substr(0, 5) === '__ss:';
};
