/*
* this is a library for storing and rotating logs
*/
var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

//container for the module
var lib = {};

lib.baseDir = path.join(__dirname,'/../.logs/');

//append a string to a file. Create the file if it is not exists.
lib.append = function(filename,str,callback) {
    fs.open(lib.baseDir+filename+'.log','a',function(err,fileDescriptor){
        if ((!err)&&fileDescriptor) {
            //append to the file and close it
            fs.appendFile(fileDescriptor,str+'\n',function(err){
                if (!err) {
                    fs.close(fileDescriptor,function(err){
                        if (!err) {
                            callback(false);
                        } else {
                            callback("Error closing file that was being appended");
                        }
                    });
                } else {
                    callback('Could not append to the file');
                }
            });
        } else {
            callback('Could not open the log file for appending');
        }
    });
};

//list all the logs. If bool is true, list also the compressed files.
lib.list = function(includeCompressedlogs,callback) {
    fs.readdir(lib.baseDir,function(err,data){
        if ((!err)&&data&&data.length>0) {
            var trimmedFileName = [];
            data.forEach(function(fileName){
                //add the .log files.
                if (fileName.indexOf('.log') > -1) {
                    trimmedFileName.push(fileName.replace('.log',''));
                }
                //add the .gz.b64
                if (includeCompressedlogs && (fileName.indexOf('.gz.b64') > -1)) {
                    trimmedFileName.push(fileName.replace('.gz.b64',''));
                }
            });
            callback(false,trimmedFileName);
        } else {
            callback(err,data);
        }
    });
};

//compress a log file into a .gz.b64 file in the same directory
lib.compress = function(logId,newfileId,callback) {
    var sourceFile = logId+'.log';
    var destFile   = newfileId+'.gz.b64';
    fs.readFile(lib.baseDir+sourceFile,'utf8',function(err,inputString) {
        if ((!err) && inputString) {
            //compression
            zlib.gzip(inputString,function(err,buffer){
                if ((!err) && buffer) {
                    //send the data to the destFile
                    fs.open(lib.baseDir+destFile,'wx',function(err,fileDescriptor) {
                        if ((!err)&&fileDescriptor) {
                            fs.writeFile(fileDescriptor,buffer.toString('base64'),function(err) {
                                if (!err) {
                                    fs.close(fileDescriptor,function(err) {
                                        if (!err) {
                                            callback(false);
                                        } else {
                                            callback(err);
                                        }
                                    });
                                } else {
                                    callback(err);
                                }
                            });
                        } else {
                            callback(err);
                        }
                    });
                } else {
                    callback(err);
                }
            });
        } else {
            callback(err)
        }
    });
};

//decompress the content of .gz.b64 file into an inputString variable
lib.decompress = function(fileId,callback) {
    var fileName = fileId+'.gz.b64';
    fs.readFile(lib.baseDir+fileName,'utf8',function(err,str) {
        if ((!err)&&str) {
            //decompress the data
            var inputBuffer = Buffer.from(str,'base64');
            zlib.unzip(inputBuffer,function(err,outputBuffer){
                if ((!err)&&outputBuffer) {
                    //create a string out of this buffer
                    var str = outputBuffer.toString();
                    callback(false,str);
                } else {
                    callback(err);
                }
            });
        } else {
            callback(err);
        }
    });
};

//truncating a log file
lib.truncate = function(logId,callback) {
    fs.truncate(lib.baseDir+logId+'.log',function(err){
        if (!err) {
            callback(false);
        } else {
            callback(err);
        }
    });
};

//export the module
module.exports = lib;