/*
* these are server related tasks
*/

//dependencies
var http = require('http');
var https= require('https');  //we also instantiate the https server
var url  = require('url');
var StringDecoder = require('string_decoder').StringDecoder; //payload
var fs = require('fs'); 
var config   = require('./config');  //config
var handlers = require('./handlers');
var helpers  = require('./helpers');
var path = require('path');

//allow to fix NODE_DEBUG to workers, so it reduces the console log of NODE_DEBUG to workers
var utils=require('util');
//replace the console.log with debug except the console.log with colors.
//it will also add the origin WORKER and the PID number
var debug = utils.debuglog('server');

//Instantiate the server module object
var server = {};

server.httpServer = http.createServer(function(request,response){
  server.unifiedServer(request,response);
});
//instantiating the https server
server.httpsServerOptions = {
  'key' : fs.readFileSync(path.join(__dirname,'/../https/key.pem')), //we read in synch to be sure the file is read entirely
  'cert': fs.readFileSync(path.join(__dirname,'/../https/cert.pem')) //we read in synch to be sure the file is read entirely
};
server.httpsServer = https.createServer(server.httpsServerOptions,function(request,response){
  server.unifiedServer(request,response);
});

//unified server logic for http and https
server.unifiedServer = function(request,response){
  var parseUrl = url.parse(request.url,true);   //get the url and parse it.
  var path = parseUrl.pathname;                 //get the path of the url
  var trimmedPath = path.replace(/^\/+|\/+$/g,'');
  var queryStringObject = parseUrl.query;       //get the query string as an object - recover the parameters after ?, like ...?fid-buz
  var headers = request.headers;                //get the headers as an object
  var method = request.method.toLowerCase();    //get the http method
  var decoder = new StringDecoder('utf-8');     //data send by POST - get the payload send by the customer if there is any
  var buffer = '';                              //chars come as a stream, a little bit at a time, so we accumulate them into a buffer. like Jquery, the event 'data' tells us that some data are coming, so we append them until we receive a EOS
  request.on('data',function(data){
    buffer += decoder.write(data);
  });
  request.on('end',function(){
    buffer += decoder.end();    //when we finish, we do the displays, send the response
    //choose the handler where this request should go to.
    var chosenHandler = typeof(server.router[trimmedPath])!=='undefined' ? server.router[trimmedPath] : handlers.notFound;
    var data = {                //construct the data object to send to the handler
      'trimmedPath' : trimmedPath,
      'queryStringObject':queryStringObject,
      'method':method,
      'headers':headers,
      //'payload':buffer  //raw, unconverted data
      'payload' : helpers.parseJsonToObject(buffer) //convert the data to JSON (optional)
    }

    //route the request to the handler specified in the router
    chosenHandler(data,function(statusCode,payload){
      //use the status code called back by the handler or default to 200
      statusCode = typeof(statusCode) == 'number' ? statusCode : 200;
      //use the payload called back by the handler or default to an empty object
      //console.log('check the type of the payload',typeof(payload));
      payload = typeof(payload) == 'object' ? payload : {};
      //convert the payload to a string
      var payloadString = JSON.stringify(payload); //this is not the payload sent by customer, but sent by system
      //we are going to return a JSON info, so we inform the browser that the response is JSON.
      response.setHeader('Content-Type','application/json');
      response.writeHead(statusCode);
      response.end(payloadString);

      //if the response is 200, print green otherwise print red within debug
      if (statusCode==200) {
        //green
        debug('\x1b[32m%s\x1b[0m',method.toUpperCase()+'/'+trimmedPath+' '+statusCode);
      } else {
        //red
        debug('\x1b[31m%s\x1b[0m',method.toUpperCase()+'/'+trimmedPath+' '+statusCode);
      }
      //console.log('Response ',statusCode,payloadString);
    });
  });
}

server.router = {
  'ping':handlers.ping,
  'users':handlers.users,
  'tokens':handlers.tokens,
  'menus':handlers.menus,
  'list':handlers.list, //list the menu of the restaurant
  'pay':handlers.pay    //mark the menu for payment
};

server.init = function() {
    //start the http server
    server.httpServer.listen(config.httpPort,function(){
      //33,34,35 ... colors - %s is the string parameter
      console.log('\x1b[34m%s\x1b[0m','The server is listening on port '+config.httpPort);
    });
    //start the https server
    server.httpsServer.listen(config.httpsPort,function(){
      //33,34,35 ... colors - %s is the string parameter
      console.log('\x1b[35m%s\x1b[0m','The server is listening on port '+config.httpsPort);
    });
}

//export the whole server
module.exports = server;