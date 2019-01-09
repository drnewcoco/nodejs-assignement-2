/*
* helpers for various tasks
*/
var crypto  = require('crypto');
var config  = require('./config');
//we send to twilio api via https. we can use the package to also craft https requests
var https   = require('https'); 
var querystring = require('querystring');

//abstraction of the menu via call functions
//global variable for the restaurant menu
menuItems = [
    ["pizza 1",21],
    ["pizza 2",22],
    ["pizza 3",23],
    ["pizza 4",24],
    ["pizza 5",25],
    ["pizza 6",26]
];

var helpers = {};

//to display the menu
helpers.menuList = function() {
    return menuItems;
};

//check if any of the items is valid or not.
helpers.menuCheck = function(items) {
    var valid=true;
    items.forEach(function(item){
        if ((item < 0)||(item >= menuItems.length)) {
            valid=false;
        }
    });
    return valid;
};

//information compiled about a menu : total + details.
helpers.menuCompile = function(items) {
    var amount=0.0;
    var message='\nThis is the menu you ordered:';
    items.forEach(function(item){
        amount+=parseFloat(menuItems[item][1]);
        message+='\n'+menuItems[item][0]+':$'+parseFloat(menuItems[item][1]).toFixed(2);
    });
    message+='\nTotal : $'+amount.toFixed(2);
    message+='\nThank you.';
    return {
        amount:amount,
        message:message
    };
};

//hash a string
helpers.hash = function(str) {
    if (typeof(str)=='string' && str.length>0) {
        var hash = crypto.createHmac('sha256',config.hashingSecret).update(str).digest('hex');
        return hash;
    } else {
        return false;
    }
}

//parse a json string into an object in all cases, without throwing
helpers.parseJsonToObject = function(str) {
    //by default javascript crashes if invalid json is provided, so we prevent that
    try {
        var obj = JSON.parse(str);
        return obj;
    } catch(e) {
        return {};
    }
};

//validate an email address using regex
helpers.validateEmail = function(email) {
    if ((typeof(email) == 'string') && (email.trim().length > 0) && (/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email.trim()))) {
        return email.trim().toLowerCase();
    } else {
        return (false);
    }
};

//create 20 chars tokens
helpers.createRandomString = function(strlen) {
    strlen = typeof(strlen) == 'number' && strlen > 0 ? strlen : 0;
    if (strlen) {
        var possibleCharacters = 'abcdefghijklmnopqrstuvwxyz0123456789';
        var str='';
        for (i=1; i <= strlen; i++) {
            //get a random char
            randomCharacter = possibleCharacters.charAt(Math.floor(Math.random() * possibleCharacters.length));
            str+=randomCharacter;
        }
        return str;
    } else {
        return false;
    }
};

//check if the timeStamp is still within the configurated time limit
helpers.submittedPaymenttooOld = function(tm) {
    return ((Date.now() - tm) >  config.paySubmit);
};

//payment with stripe
helpers.pay = function(user,amount,order_id,callback) {
    if (amount > 0) {
        var payload = {
            amount:amount,
            currency:user.currency,
            source:user.card,
            metadata: {
                order_id : order_id
            }
        };
        var formData = querystring.stringify(payload);
        var contentLength = formData.length;
        var opt = {
            method:"POST",
            auth : config.stripe.key+':',
            headers: {
                'Content-Length': contentLength,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }
        var req = https.request(config.stripe.addr,opt,function(res) {
            var status = res.statusCode;
            //callback to our original caller successfully if success
            if ((status==200)||(status==201)) {
                callback(false);    //all ok, no errors
            } else {
                callback('Status code returned is '+status);
            }
        });
        //Bind to the error event so it does not get thrown and kill the thread
        req.on('error',function(e){
            callback(e);
        });
        //now that we defined the request and handled the error, we need to send it of
        req.write(formData);
        //end the request
        req.end();
    } else {
        callback('Given amount is invalid');
    }
};

//email with mailgun
helpers.sendEmail = function(email,name,message,callback) {
    //validate parameters
    email = helpers.validateEmail(email);
    message = typeof(message) == 'string' && message.trim().length > 0 && message.trim().length < 1600 ? message : false;
    if (email && message) {
        //configure the request payload
        var payload = {
            from:config.mailgun.from,
            to:name+' <'+email+'>',
            subject:"Hello "+name,
            text:message
        };
        var formData = querystring.stringify(payload);
        var contentLength = formData.length;
        //options
        var opt = {
            method:"POST",
            auth : config.mailgun.key,
            headers: {
                'Content-Length': contentLength,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        };
        var req = https.request(config.mailgun.addr,opt,function(res) {
            var status = res.statusCode;
            //callback to our original caller successfully if success
            if ((status==200)||(status==201)) {
                callback(false);    //all ok, no errors
            } else {
                callback(status);   //return the status as error code
            }
        });
        //Bind to the error event so it does not get thrown and kill the thread
        req.on('error',function(e){
            callback(e);
        });
        //now that we defined the request and handled the error, we need to send it of
        req.write(formData);
        //end the request
        req.end();
    } else {
        callback('Given parameters were missing or invalid');
    }
};

module.exports = helpers;