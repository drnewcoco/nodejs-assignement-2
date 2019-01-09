/*
* Author: Dr NewCoco
* Assignment 2 of Node.Js Master Class
* Primary file for the Pizzeria API
*/

//Dependencies
var server  = require('./lib/server');
var workers = require('./lib/workers');

//declare the app
var app = {};

//Init function
app.init = function() {
    //start the server
    server.init();

    //start the workers
    workers.init();
};

//execute
app.init();

//export the app
module.exports = app;