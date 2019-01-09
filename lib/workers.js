/*
* Workers related file
*/

//Dependencies
var path = require('path');
var fs = require('fs');
var _data = require('./data');
var http = require('http');
var https = require('https');
var helpers = require('./helpers');
var url=require('url');

//allow to fix NODE_DEBUG to workers, so it reduces the console log of NODE_DEBUG to workers
var utils=require('util');
//replace the console.log with debug except the console.log with colors.
//it will also add the origin WORKER and the PID number
var debug = utils.debuglog('workers');

//our private log library
var _logs = require('./logs');

//Instantiate the worker object
var workers = {};

workers.log = function(originalMenuData,outcome,now) {
    var logData = {
        'Menu':originalMenuData,
        'outcome':outcome,
        'time':now
    };
    var logString = JSON.stringify(logData);
    //determine the name of the log file - on log per Menu
    var logFilename = originalMenuData.id;
    _logs.append(logFilename,logString,function(err){
        if (!err) {
            debug('Logging to file successful');
        } else {
            debug('Logging to file failed');
        }
    })
};

//gather all the menus
workers.gatherAllMenus = function() {
    //gather all the menus that exist in the system
    _data.list('menus',function(err,menus){
        if (!err && menus && menus.length>0) {
            menus.forEach(function(menu) {
                //read the menu data
                _data.read('menus',menu,function(err,originalMenuData){
                    if (!err && originalMenuData) {
                        //pass it to the validator and let that function continue or log errs as needed
                        workers.validateMenuData(originalMenuData);
                    } else {
                        //console.log("Error: Could not read one of the menu data");            
                        debug("Error: Could not read one of the menu data");            
                    }
                });
            });
        } else {
            //console.log("Error: Could not find any menu to process"); //background worker can show on console's server
            debug("Error: Could not find any menu to process"); //background worker can show on console's server
        }
    });
};

//sanity Check of the menu data
workers.validateMenuData = function(originalMenuData) {
    originalMenuData = typeof(originalMenuData) == 'object' && originalMenuData !== null ? originalMenuData : {};
    originalMenuData.id = typeof(originalMenuData.id) == 'string' && originalMenuData.id.trim().length == 20 ? originalMenuData.id.trim() : false;
    originalMenuData.state = typeof(originalMenuData.state) == 'string' && ['create','submitted','pending','paid'].indexOf(originalMenuData.state.trim()) > -1 ? originalMenuData.state.trim() : false;    
    originalMenuData.userEmail = helpers.validateEmail(originalMenuData.userEmail);
    originalMenuData.menu = typeof(originalMenuData.menu) == 'object' && originalMenuData.menu instanceof Array && originalMenuData.menu.length > 0 ? originalMenuData.menu:false;
    originalMenuData.timeStamp = typeof(originalMenuData.timeStamp) =='number' && originalMenuData.timeStamp > 0 ? originalMenuData.timeStamp:false;
    //if all the Checks pass, pass the data along to the next step in the process
    //We process only the menus that have a state "submitted" which stands for "submitted for payment".
    if (originalMenuData.id
        &&(originalMenuData.state == 'submitted')
        &&originalMenuData.userEmail
        &&originalMenuData.menu
        &&originalMenuData.timeStamp) {
        workers.processPayments(originalMenuData);
    } else {
        debug('Error: one of the parameters of the Menu is not properly formatted. Skipping it.');
    }
};

//perform the Menu, send the original Menu data and the outcome of the Menu process to the next step in the process
//look at the url, make the http request to the url, then will record an outcome, then send the original Menu data and
//the outcome to the next steps in the process
workers.processPayments = function(originalMenuData) {
    //check if the payment was requested too long ago
    var already_done=false;
    var userEmail = originalMenuData.userEmail;
    _data.read('users',userEmail,function(err,userData){
        if (!err&&userData) {
            var details  = helpers.menuCompile(originalMenuData.menu);
            if (details.amount > 0.001) {
                if (!helpers.submittedPaymenttooOld(originalMenuData.timeStamp)) {
                    helpers.pay(userData,details.amount,originalMenuData.id,function(err) {
                        if (!err) {
                            if (!already_done) {
                                workers.processSuccessfulPayment(userData,originalMenuData,details);
                                already_done=true;
                            } 
                        } else {
                            if (!already_done) {
                                workers.processFailedPayment(userData,originalMenuData,details);
                                already_done=true;
                            }
                        }
                    });
                } else {
                    //this payment is too Old. We inform the user that is was cancelled.
                    if (!already_done) {
                        workers.processNoPaymentTooOld(userData,originalMenuData,details);
                        already_done=true;
                    }
                }
            } else {
                if (!already_done) {
                    //this menu amounts to zero dollars...
                    //we remove it from the menus and the user account.
                    workers.processGhostMenu(userData,originalMenuData);
                    already_done=true;
                } 
            } 
        } else {
            //unmark the menu as submitted (remove from the payment queue)
            if (!already_done) {
                workers.processNoPaymentNoUser(originalMenuData);
                already_done=true;
            }
        } 
    });
}

//process the successful payment of the Menu
//mark the menu as paid.
//alert the user by email.
workers.processSuccessfulPayment = function(userData,originalMenuData,details) {
    //log the transaction
    var now = Date.now();
    workers.log(originalMenuData,"paid",now);
    //Update the Menu data
    var newMenuData = originalMenuData;
    newMenuData.state = 'paid';
    newMenuData.timeStamp = now;
    //write on disk
    _data.update('menus',newMenuData.id,newMenuData,function(err){
        if (!err) {
            //send the new Menudata to the next phase of the process
            workers.alertUserEmail("Payment Successful!",userData,details);
        } else {
            debug('Error trying to save update on one of the Menus');
        }
    });
};

//process the failed payment of the Menu
//mark the menu as create.
//do not email the user
workers.processFailedPayment = function(userData,originalMenuData,details) {
    //log the transaction
    var now = Date.now();
    workers.log(originalMenuData,"failed",now);
    //Update the Menu data
    var newMenuData = originalMenuData;
    newMenuData.state = 'create';
    newMenuData.timeStamp = now;
    //write on disk
    _data.update('menus',newMenuData.id,newMenuData,function(err){
        if (err) {
            debug('Error trying to save update on one of the Menus');
        }
    });
};

//we cannot retrieve the user who owned this menu...
workers.processNoPaymentNoUser = function(originalMenuData) {
    //log the transaction
    var now = Date.now();
    workers.log(originalMenuData,"owner failed",now);
    //Update the Menu data
    var newMenuData = originalMenuData;
    newMenuData.state = 'create';
    newMenuData.timeStamp = now;
    //write on disk
    _data.update('menus',newMenuData.id,newMenuData,function(err){
        if (err) {
            debug('Error trying to save update on one of the Menus');
        }
    });
};

//this submitted menu is too old - remove it from the payment queue
workers.processNoPaymentTooOld = function(userData,originalMenuData,details) {
    //log the transaction
    var now = Date.now();
    workers.log(originalMenuData,"failed - too old",now);
    //Update the Menu data
    var newMenuData = originalMenuData;
    newMenuData.state = 'create';
    newMenuData.timeStamp = now;
    //write on disk
    _data.update('menus',newMenuData.id,newMenuData,function(err){
        if (!err) {
            //send the new Menudata to the next phase of the process
            workers.alertUserEmail("Payment Cancelled!",userData,details);
        } else {
            debug('Error trying to save update on one of the Menus');
        }
    });
};

//this menu has a total bill of zero... 
workers.processGhostMenu = function(userData,menuData) {
    var now = Date.now();
    workers.log(menuData,"ghost menu",now);
    _data.delete('menus',menuData.id,function(err){
        if (!err) {
            var userMenus = typeof(userData.menus) == 'object' && userData.menus instanceof Array ? userData.menus : [];
            //remove the menu to delete
            var menuPosition = userMenus.indexOf(menuData.id);
            if (menuPosition > -1) {
                //remove it
                userMenus.splice(menuPosition,1);
                //resave the user
                _data.update('users',userData.email,userData,function(err){
                    if (!err) {
                        debug('Success: ghost menu removed');
                    } else {
                        debug('Error : Could not update user object');
                    }
                });
            }
        } else {
            debug('Error : Could not find the menu on the user object');
        }
    }); 
};

workers.alertUserEmail = function(title,userData,details) {
    var email = userData.email;
    var message = title+'\nName : '+userData.name+'\nAddress : '+userData.address+'\n'+details.message;
    helpers.sendEmail(email,userData.name,message,function(err){
        if (!err) {
            //console.log('Success: User was alerted to status change in their Menu via SMS ',message);
            debug('Success: User was alerted via Email ',message);
        } else {
            //console.log('Error: could not send SMS alert to user who had a state change to their Menu');
            debug('Error: could not alert the user via email');
        }
    });
}

//timer to execute the worker process once per 60 seconds
workers.loop = function() {
    setInterval(function(){
        workers.gatherAllMenus();
    },1000*1);
};

//rotate - aka compress the log files
workers.rotateLogs = function() {
    //List all the non compress log files in the .logs folders
    //false means we do not list the zipped ones.
    _logs.list(false,function(err,logs) {
        if ((!err)&&logs&&logs.length>0) {
            logs.forEach(function(logName){
                //compress the data to a different file
                var logId = logName.replace('.log','');
                var newFile=logId +'-'+Date.now();
                _logs.compress(logId,newFile,function(err){
                    if (!err) {
                        _logs.truncate(logId,function(err){
                            if (!err) {
                                //console.log('Success truncating log file');
                                debug('Success truncating log file');
                            } else {
                                //console.log('Error truncating log file');
                                debug('Error truncating log file');
                            }
                        });
                    } else {
                        //console.log('Error compressing one of the log file '+err);
                        debug('Error compressing one of the log file '+err);
                    }
                });
            });
        } else {
            //console.log('Error: could not find any logs to rotate');
            debug('Error: could not find any logs to rotate');
        }
    });
};

//timer to execution the log rotation loop every 24h
workers.logRotationLoop = function(){
    setInterval(function(){
        workers.rotateLogs();
    },1000*60*60*24);
};

//Initialize the workers
workers.init = function() {
    //send to console in YELLOW
    console.log('\x1b[33m%s\x1b[0m','Background workers are running');
    //Execute all the Menus
    workers.gatherAllMenus();
    //Call the loop so that the Menus can execute on their own
    workers.loop();
    //Compress all the logs immediately
    workers.rotateLogs();
    //Compression loop so logs will be compressed later on
    workers.logRotationLoop();
};

//Export
module.exports = workers;


