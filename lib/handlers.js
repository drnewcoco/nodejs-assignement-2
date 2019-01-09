/*
* this is the request handlers
*/

//dependencies
var _data = require('./data');
var helpers = require('./helpers');
var config = require('./config');

//define the handlers
var handlers = {};

/*--------------------------------------------------*
 * Define the GET,POST,PUT,DEL methods for the user *
 *--------------------------------------------------*/
handlers.users = function(data,callback) {
    var acceptableMethods = ['post','get','put','delete'];
    if (acceptableMethods.indexOf(data.method) > -1) {
        handlers._users[data.method](data,callback);    //hidden handler
    } else {
        callback(405);  //http status code for method not allowed
    }
};

//container for the user sub-methods
handlers._users = {};

//create a new user
//required data : name, UNIQUE email, address, password
//credit card, currency for stripe
//Each user can have a maximum a N menus
handlers._users.post = function(data,callback) {
    //check that all fields are required
    var name = typeof(data.payload.name) =='string' && data.payload.name.trim().length > 0 ? data.payload.name.trim():false;
    var email = helpers.validateEmail(data.payload.email);
    var address = typeof(data.payload.address) =='string' && data.payload.address.trim().length > 0 ? data.payload.address.trim():false;
    var password = typeof(data.payload.password) =='string' && data.payload.password.trim().length > 0 ? data.payload.password.trim():false;
    if (name&&email&&address&&password) {
        _data.read('users',email,function(err,data) {
            if (err) {
                //user does not exist, create it.
                var hashedPassword = helpers.hash(password);
                if (hashedPassword) {
                    var userObject = {
                        'name'      : name,
                        'email'     : email,
                        'address'   : address,
                        'hashedPassword' : hashedPassword,
                        'currency'  : 'sgd',
                        'card'      : 'tok_mastercard',
                        'menus'     : []  //list of menus of the user
                    };
                    _data.create('users',email,userObject,function(err){
                        if (!err) {
                            callback(200);        
                        } else {
                            callback(500,{'Error' : 'Could not create the new user'}); 
                        }
                    });
                } else {
                    callback(500,{'Error' : 'Could not create the hashed password'}); 
                }
            } else {
                callback(400,{'Error' : 'Could not create the new user'});
            }

        });
    } else {
       callback(400,{'Error' : 'Missing required field'});
    }
}
//required data : email
//optional data : none
//ONLY let an authenticated user access their object, don't let them access anyone else
handlers._users.get = function(data,callback) {
    //check email is valid - we take the email from the queryString
    var email = helpers.validateEmail(data.queryStringObject.email);
    if (email) {
        //get the token from the headers
        var token = typeof(data.headers.token) == 'string' ? data.headers.token : false;
        //verify that the given token is valid
        handlers._tokens.verifyToken(token,email,function(tokenIsValid){
            //we validate that you are you, to access this, you need a token
            if (tokenIsValid) {
                _data.read('users',email,function(err,data) {
                    if (!err && data) {
                        delete data.hashedPassword;
                        //return the user data without the password
                        callback(200,data); 
                    } else {
                        callback(404,{'Error' : 'Could not find the specified user'});  //not found
                    }
                });
            } else {
                callback(403,{'Error': 'Missing required token in header or token is invalid'});
            }
        });
    } else {
        callback(400,{'Error' : 'Missing required field'});
    }
}
//PUT - update
//required data : email
//optional data : name, address, password
//ONLY let an authenticated update their object, don't let them access anyone else
handlers._users.put = function(data,callback) {
    //check email is valid - we take the email from the queryString
    var name = typeof(data.payload.name) =='string' && data.payload.name.trim().length > 0 ? data.payload.name.trim():false;
    var email = helpers.validateEmail(data.payload.email);
    var address = typeof(data.payload.address) =='string' && data.payload.address.trim().length > 0 ? data.payload.address.trim():false;
    var password = typeof(data.payload.password) =='string' && data.payload.password.trim().length > 0 ? data.payload.password.trim():false;
    if (email) {
        if (name||address||password) {
            //retrieve the connection token from the header
            var token = typeof(data.headers.token) == 'string' ? data.headers.token : false;
            //verify that the given token is valid
            handlers._tokens.verifyToken(token,email,function(tokenIsValid){
                if (tokenIsValid) {
                    //retrieve the user
                    _data.read('users',email,function(err,userData){
                        if (!err && userData) {
                            if (name) {
                                userData.name = name;
                            }
                            if (address) {
                                userData.address = address;
                            }
                            if (password) {
                                userData.hashedPassword = helpers.hash(password);
                            }
                            _data.update('users',email,userData,function(err){
                                if (!err) {
                                    callback(200,{'Message':'User data updated'});
                                } else {
                                    //500 because it is a serious error on our server
                                    callback(500,{'Error':'Could not update the user'});
                                }
                            });
                        } else {
                            callback(400,{'Error' : 'The specified user does not exist'});            
                        }
                    });
                } else {
                    callback(403,{'Error': 'Missing required token in header or token is invalid'});
                }
            });
        } else {
            callback(400,{'Error' : 'Missing field to update'});    
        }
    } else {
        callback(400,{'Error' : 'Missing required field'});
    }
}

//required data : email
//optional data : none
//delete menus files associated with this users and the connection token
handlers._users.delete = function(data,callback) {
    //check email is valid - we take the email from the queryString
    var email = helpers.validateEmail(data.queryStringObject.email);
    if (email) {
        var token = typeof(data.headers.token) == 'string' ? data.headers.token : false;
        //verify that the given token is valid
        handlers._tokens.verifyToken(token,email,function(tokenIsValid){
            if (tokenIsValid) {
                _data.read('users',email,function(err,data) {
                    if (!err && data) {
                        _data.delete('users',email,function(err){
                            if (!err) {
                                //delete each of the menus associated with the user
                                var userMenus = typeof(data.menus) == 'object' && data.menus instanceof Array ? data.menus : [];
                                var menusToDelete=userMenus.length;
                                var menusDeleted = 0;
                                var deletionErrors = false;
                                if (menusToDelete>0) {
                                    //attempt to delete the menus
                                    userMenus.forEach(function(menuId){
                                        _data.delete('menus',menuId,function(err){
                                            if (err) {
                                                deletionErrors=true;
                                            }
                                            menusDeleted++;
                                        });
                                    });
                                }
                                //delete the token associated to this user
                                if ((menusToDelete==menusDeleted)&&(!deletionErrors)) {
                                    //delete the token associated to this user
                                    _data.read('tokens',token,function(err,data) {
                                        if (!err && data) {
                                            _data.delete('tokens',token,function(err){
                                                if (!err) {
                                                    callback(200);
                                                } else {
                                                    callback(500,{'Error' : 'Could not delete the token'});  //not found
                                                }
                                            });
                                        } else {
                                            callback(400,{'Error' : 'Could not find the token'});  //not found
                                        }
                                    });
                                } else {
                                    callback(500,{'Errors':'Error encountered while attempting to delete the menus of the users.'});
                                }
                            } else {
                                callback(500,{'Error' : 'Could not delete the user'});  //not found
                            }
                        }); //end of _data.delete
                    } else {
                        callback(400,{'Error' : 'Could not find the user'});  //not found
                    } //end of if
                }); //end of _data.read
            } else {
                callback(403,{'Error': 'Missing required token in header or token is invalid'});
            }
        });
    } else {
        callback(400,{'Error' : 'Missing required field'});
    }
}

/*---------------------------------------------------------------------*/
/* Time-limited connection tokens. A user can have several tokens, but */
/*---------------------------------------------------------------------*/
//connection tokens
handlers.tokens = function(data,callback) {
    var acceptableMethods = ['post','get','put','delete'];
    if (acceptableMethods.indexOf(data.method) > -1) {
        handlers._tokens[data.method](data,callback);    //hidden handler
    } else {
        callback(405);  //http status code for method not allowed
    }
}

//container for the tokens sub-methods
handlers._tokens = {};

//user for login
//required data : email, password
//optional data : none
handlers._tokens.post = function(data,callback) {
    //check that all fields are required
    var email = helpers.validateEmail(data.payload.email);
    var password = typeof(data.payload.password) =='string' && data.payload.password.trim().length > 0 ? data.payload.password.trim():false;
    if (email&&password) {
        //check if user exists
        _data.read('users',email,function(err,userData) {
            if (!err && userData) {
                //compare the supplied password with the userData password
                var hashedPassword = helpers.hash(password);
                if (hashedPassword == userData.hashedPassword) {
                    //create a new token with random name and set expiration date 1h in the future.
                    var tokenId = helpers.createRandomString(20);
                    var expires = Date.now() + 1000 * 60 * 60;
                    var tokenObject = {
                        'email' : email,
                        'id'    : tokenId,
                        'expires': expires
                    };
                    //store the token
                    _data.create('tokens',tokenId,tokenObject,function(err){
                        if (!err) {
                            callback(200,tokenObject);
                        } else {
                            callback(500,{'Error' : 'Could not store the token'});
                        }
                    });
                } else {
                    callback(400,{'Error' : 'Invalid password'});    
                }
            } else {
                callback(400,{'Error' : 'User not found'});
            }
        });
    } else {
       callback(400,{'Error' : 'Missing required fields'});
    }
}

//required data : id of the token
//optional data : none
handlers._tokens.get = function(data,callback) {
    //check tokenId is valid
    var id = typeof(data.queryStringObject.id)=='string' && data.queryStringObject.id.trim().length == 20 ? data.queryStringObject.id.trim() : false;
    if (id) {
        _data.read('tokens',id,function(err,tokenData) {
            if (!err && tokenData) {
                //remove the hashpassword
                callback(200,tokenData);
            } else {
                callback(404);  //not found
            }
        });
    } else {
        callback(400,{'Error' : 'Missing required field'});
    }
}

//PUT - extend or not by an hour the timeout session for the token id
//important as we do not want to log out a customer who is buying pizza
handlers._tokens.put = function(data,callback) {
    var id = typeof(data.payload.id) =='string' && data.payload.id.trim().length == 20 ? data.payload.id.trim():false;
    var extend = typeof(data.payload.extend) =='boolean' && data.payload.extend == true ? true : false;
    if (id && extend) {
        //lookup the token and change the data
        _data.read('tokens',id,function(err,tokenData) {
            if (!err && tokenData) {
                //make sure the token is alive
                if (tokenData.expires > Date.now()) {
                    tokenData.expires = Date.now() + 1000*60*60;    //1 hour extension
                    //store the data
                    _data.update('tokens',id,tokenData,function(err){
                        if (!err) {
                            callback(200);
                        } else {
                            callback(500,{'Error' : 'Could not update the token expiration date'});                    
                        }
                    });
                } else {
                    callback(400,{'Error' : 'Token already expired and cannot be extended'});            
                }
            } else {
                callback(400,{'Error' : 'Token does not exist'});        
            }
        });
    } else {
        callback(400,{'Error' : 'Missing required fields or fields invalid'});
    }
};

//delete any other data files associated with this users.
handlers._tokens.delete = function(data,callback) {
    var id = typeof(data.queryStringObject.id)=='string' && data.queryStringObject.id.trim().length == 20 ? data.queryStringObject.id.trim() : false;
    if (id) {
        _data.read('tokens',id,function(err,data) {
            if (!err && data) {
                _data.delete('tokens',id,function(err){
                    if (!err) {
                        callback(200);
                    } else {
                        callback(500,{'Error' : 'Could not delete the token'});  //not found
                    }
                });
            } else {
                callback(400,{'Error' : 'Could not find the token'});  //not found
            }
        });
    } else {
        callback(400,{'Error' : 'Missing required field'});
    }
};

//verify if a given token id is currently valid for a given user
handlers._tokens.verifyToken = function(id,email,callback) {
    //lookup the token
    _data.read('tokens',id,function(err,tokenData){
        if (!err && tokenData) {
            if (tokenData.email==email&&tokenData.expires > Date.now()) {
                callback(true);
            } else {
                callback(false);
            }
        } else {
            callback(false);
        }
    }); 
};

/*
 * Menu management - list items, checkout the current menu, 
 */
handlers.menus = function(data,callback) {
    var acceptableMethods = ['post','get','put','delete'];
    if (acceptableMethods.indexOf(data.method) > -1) {
        handlers._menus[data.method](data,callback);    //hidden handler
    } else {
        callback(405);  //http status code for method not allowed
    }
}

//container for the menus sub-methods
handlers._menus = {};

//a user a creates a new menu. 
handlers._menus.post = function(data,callback) {
    //check that all fields are required
    var menu=typeof(data.payload.menu) == 'object' && data.payload.menu instanceof Array && data.payload.menu.length > 0 && helpers.menuCheck(data.payload.menu) ? data.payload.menu:false;
    if (menu) {
        //if we have a menu without error, check if the user is connected
        var token = typeof(data.headers.token) == 'string' ? data.headers.token : false;
        //verify that the given token is valid
        _data.read('tokens',token,function(err,tokenData){
            if (!err && tokenData) {
                var userEmail = tokenData.email;
                _data.read('users',userEmail,function(err,userData) {
                    if (!err && userData) {
                        //get the list of menus
                        var userMenus = typeof(userData.menus) == 'object' && userData.menus instanceof Array ? userData.menus : [];
                        //verify that the user has less than maxMenus
                        if (userMenus.length < config.maxMenus) {
                            //random id for the menu
                            var menu_id = helpers.createRandomString(20);
                            //create the menu object and include the user email
                            var menuObject = {
                                'id' : menu_id,
                                'userEmail':userEmail,
                                'menu':menu,
                                'state':"create"   //create, submitted, pending, paid
                            };
                            //store the menu in the table menus
                            _data.create('menus',menu_id,menuObject,function(err){
                                if (!err) {
                                    userData.menus = userMenus;
                                    userData.menus.push(menu_id);
                                    //add the menu in the user table
                                    _data.update('users',userEmail,userData,function(err){
                                        if (!err) {
                                            callback(200,menuObject);
                                        } else {
                                            callback(500,{'Error':'Cannot update the user with the new menu'});
                                        }
                                    });
                                } else {
                                    callback(500,{'Error':'Could not create the new menu'});
                                }
                            });
                        } else {
                            callback(400,{'Error':'The user has already the maximum number of menus ('+config.maxMenus+')'});
                        }
                    } else {
                        callback(403);  //not authorized
                    }
                });
            } else {
                callback(403); //not authorized
            }
        });
    } else {
       callback(400,{'Error' : 'Missing required fields or fields are invalid'});
    }
}

//required data : menu ID
//optional data : none
//if all OK, returns all the menus that belongs to this customer
handlers._menus.get = function(data,callback) {
    //check that the token is valid.
    var id = typeof(data.queryStringObject.id)=='string' && data.queryStringObject.id.trim().length == 20 ? data.queryStringObject.id.trim() : false;
    if (id) {
        _data.read('menus',id,function(err,menuData) {
            if (!err && menuData) {
                //check that the user is connected
                var token = typeof(data.headers.token) == 'string' ? data.headers.token : false;
                //verify that the given token is valid
                handlers._tokens.verifyToken(token,menuData.userEmail,function(tokenIsValid){
                    //we validate that you are you, to access this, you need a token
                    if (tokenIsValid) {
                        //return the current menu chosen by the user
                        callback(200,menuData);
                    } else {
                        callback(403);
                    }
                });
            } else {
                callback(404);  //not found
            }
        });
    } else {
        callback(400,{'Error' : 'Missing required field'});
    }
}

//PUT - update
//required data : id,menu
//cannot update a menu which is submitted for payment and being processed by a worker
//note: we could put the state change here but we let the workers handle it.
handlers._menus.put = function(data,callback) {
    //check that all fields are required - unique menu ID
    var id = typeof(data.payload.id)=='string' && data.payload.id.trim().length == 20 ? data.payload.id.trim() : false;
    var menu=typeof(data.payload.menu) == 'object' && data.payload.menu instanceof Array && data.payload.menu.length > 0 && helpers.menuCheck(data.payload.menu) ? data.payload.menu:false;
    if (id && menu) {
        //we have a menu without error and and ID
        _data.read('menus',id,function(err,menuData){
            if (!err && menuData) {
                var token = typeof(data.headers.token) == 'string' ? data.headers.token : false;
                //verify that the given token is valid
                handlers._tokens.verifyToken(token,menuData.userEmail,function(tokenIsValid){
                    //we validate that you are you, to access this, you need a token
                    if (tokenIsValid) {
                        //update the menu.
                        if (menuData.state == "pending") {
                            //this menu is being processed for payment... we can't change it
                            callback(400,{'Error':'This menu is being processed for payment and cannot be changed now.'});
                        } else {
                            //we reset the menu state to 'create', allowing it to be paid for, even if it was paid in the past (favorite list)
                            menuData.state = "create";
                            menuData.menu=menu;
                            _data.update('menus',id,menuData,function(err){
                                if (!err) {
                                    callback(200);  //all went well
                                } else {
                                    callback(500,{'Error':'could not update the menu'});
                                }
                            });
                        }
                    } else {
                        callback(403);
                    }
                });
            } else {
                callback(400,{'Error' : 'Menu ID did not exist'});        
            }
        });
    } else {
        callback(400,{'Error' : 'Missing required fields or fields are invalid'});
    }
}

//required data : id of the menu
//optional data : none
//we cannot delete a menu which is being paid. (status="pending")
handlers._menus.delete = function(data,callback) {
    //check if we have the id of the menu
    var id = typeof(data.queryStringObject.id)=='string' && data.queryStringObject.id.trim().length == 20 ? data.queryStringObject.id.trim() : false;
    if (id) {
        _data.read('menus',id,function(err,menuData){
            if (!err && menuData) {
                var token = typeof(data.headers.token) == 'string' ? data.headers.token : false;
                //verify that the given token is valid
                handlers._tokens.verifyToken(token,menuData.userEmail,function(tokenIsValid){
                    //we validate the user is connected
                    if (tokenIsValid) {
                        if (menuData.state == "pending") {
                            callback(400,{'Error':'Could not delete this menu as it is being paid. Please try again later.'});
                        } else {        
                            _data.delete('menus',id,function(err){
                                if (!err) {
                                    _data.read('users',menuData.userEmail,function(err,userData){
                                        if (!err && userData) {
                                            //recover the menu list of the user
                                            var userMenus = typeof(userData.menus) == 'object' && userData.menus instanceof Array ? userData.menus : [];
                                            //remove the menu to delete
                                            var menuPosition = userMenus.indexOf(id);
                                            if (menuPosition > -1) {
                                                //remove it
                                                userMenus.splice(menuPosition,1);
                                                //resave the user
                                                _data.update('users',menuData.userEmail,userData,function(err){
                                                    if (!err) {
                                                        callback(200);
                                                    } else {
                                                        callback(500,{'Error':'Could not update user object'});            
                                                    }
                                                });
                                            }
                                        } else {
                                            callback(500,{'Error':'Could not find the menu on the user object'});    
                                        }
                                    }); 
                                } else {
                                    callback(500,{'Error':'Cannot delete menu data'});
                                }
                            });
                        }
                    } else {
                        callback(403);  //invalid token
                    }
                });
            } else {
                callback(400,{'Error':'Menu ID not found'});
            }
        });
    } else {
        callback(400,{'Error' : 'Missing required field'});
    }
}

//the user wants to pay for a the menu ID
//required data : menu ID
handlers.pay = function(data,callback) {
    //check that all fields are required - unique menu ID
    var id = typeof(data.payload.id)=='string' && data.payload.id.trim().length == 20 ? data.payload.id.trim() : false;
    if (id) {
        //we have a menu without error and and ID
        _data.read('menus',id,function(err,menuData){
            if (!err && menuData) {
                var token = typeof(data.headers.token) == 'string' ? data.headers.token : false;
                //verify that the given token is valid
                handlers._tokens.verifyToken(token,menuData.userEmail,function(tokenIsValid){
                    //we validate that you are you, to access this, you need a token
                    if (tokenIsValid) {
                        if (menuData.menu.length > 0) {
                            //update the menu.
                            if (menuData.state == "pending") {
                                //this menu is being processed for payment... we have to wait for the payment to finish.
                                callback(400,{'Error':'This menu is already being processed for payment and cannot be changed now.'});
                            } else {
                                menuData.state = "submitted";       //submitted-for-payment- the background workers will take care of it.
                                menuData.timeStamp = Date.now();    //Timestamp. Pending payments too old are eliminated
                                _data.update('menus',id,menuData,function(err){
                                    if (!err) {
                                        callback(200);  //all went well
                                    } else {
                                        callback(500,{'Error':'could not update the menu'});
                                    }
                                });
                            }
                        } else {
                            //we decide to show this only for connected/verified users
                            callback(400,{'Error':'the menu is empty'});
                        }
                    } else {
                        callback(403);  //invalid token
                    }
                });
            } else {
                callback(400,{'Error' : 'Cannot retrieve the menu'});        
            }
        })
    } else {
        callback(400,{'Error' : 'Missing required fields or fields are invalid'});
    }
}

//In this assignment, the user must be connected to see the menu
handlers.list = function(data,callback) {
    var token = typeof(data.headers.token) == 'string' ? data.headers.token : false;
    //verify that the given token is valid
    if (token) {
        _data.read('tokens',token,function(err,tokenData){
            if (!err && tokenData) {
                var userEmail = tokenData.email;
                _data.read('users',userEmail,function(err,userData) {
                    if (!err && userData) {
                        callback(200,helpers.menuList());    //all went well - we return the restaurant's menu
                    } else {
                        callback(403);  //not authorized
                    }
                });
            } else {
                callback(403); //not authorized
            }
        });
    } else {
        callback(403); //not authorized
    }
}

handlers.ping = function(data,callback){
    callback(200);
}
  
handlers.notFound = function(data,callback){
    callback(404);  //page not found
}

module.exports = handlers;
