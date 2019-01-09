/*
* library for storing and editing data
*/

//dependencies
var fs = require('fs');
var path = require('path');
var helpers = require('./helpers');

//container for the module - to be exported
var lib = {};

//base directory of the lib folder
lib.baseDir = path.join(__dirname,'/../.data/');

//writing data to a file
lib.create = function(dir,file,data,callback) {
    //open the file for writing
    fs.open(lib.baseDir+dir+'/'+file+'.json','wx',function(err,fileDescriptor){
        if (!err && fileDescriptor) {
            //convert data to string
            var stringData = JSON.stringify(data);
            fs.writeFile(fileDescriptor,stringData,function(err){
                if (!err) {
                    fs.close(fileDescriptor,function(err){
                        if (!err) {
                            callback(false);
                        } else {
                            callback("Error closing the file");
                        }
                    });
                } else {
                    callback("Error writing in the file");
                }
            });
        } else {
            callback('Could not create the file! It may exist already');
        }
    });
}

lib.read = function(dir,file,callback) {
    fs.readFile(lib.baseDir+dir+'/'+file+'.json','utf-8',function(err,data){
        if (!err && data) {
            //because in our context, we accept only JSON data. But this is optional.
            var parsedData = helpers.parseJsonToObject(data);
            callback(false,parsedData);
        } else {
            callback(err,data);
        }
    });
}

lib.update = function(dir,file,data,callback) {
    //open the file for writing
    fs.open(lib.baseDir+dir+'/'+file+'.json','r+',function(err,fileDescriptor){
        if (!err && fileDescriptor) {
            //convert data to string
            var stringData = JSON.stringify(data);
            //truncate the file before I write to it
            fs.ftruncate(fileDescriptor,function(err){
                if (!err) {
                    //write to file and close it
                    fs.writeFile(fileDescriptor,stringData,function(err){
                        if (!err) {
                            fs.close(fileDescriptor,function(err){
                                if (!err) {
                                    callback(false);
                                } else {
                                    callback("Error closing the file");
                                }
                            });
                        } else {
                            callback("Error writing to existing the file");
                        }
                    });
                } else {
                    callback('Error truncating file');
                }
            })
        } else {
            callback('Could not open the file for updating! It may not exist yet');
        }
    });
}

lib.delete = function(dir,file,callback) {
    fs.unlink(lib.baseDir+dir+'/'+file+'.json',function(err){
        if (!err) {
            callback(false);
        } else {
            callback('Error deleting file');
        }
    });
}

//list all the items in a directory
lib.list = function(dir,callback) {
    fs.readdir(lib.baseDir+dir+'/',function(err,data) {
        if (!err && data && data.length > 0) {
            var trimmedFileName = [];
            data.forEach(function(filename){
                trimmedFileName.push(filename.replace('.json','')); //take .json of
            });
            callback(false,trimmedFileName);
        } else {
            callback(err,data);
        }
    });
}

module.exports = lib;