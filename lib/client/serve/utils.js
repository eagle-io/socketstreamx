// Client Asset Serving Shared Utils
var serve;

exports.serve = {
  js: function(body, response) {
    return serve(body, 'text/javascript; charset=utf-8', response);
  },
  css: function(body, response) {
    return serve(body, 'text/css', response);
  }
};

exports.parseUrl = function(url) {
  var cleanUrl;
  cleanUrl = url.split('&')[0];
  return cleanUrl.split('?')[1];
};

// Private

serve = function(body, type, response) {
  // removed to allow connect.compress() to gzip libs/etc in dev mode
  // response.writeHead(200, {
  //   'Content-type': type,
  //   'Content-Length': Buffer.byteLength(body)
  // });
  // return response.end(body);

  response.statusCode = 200;
  response.setHeader('Content-Length', Buffer.byteLength(body));
  response.setHeader('Content-Type', type);
  response.end(body);
};
