/*
 * create and export the configuration variables
 */
 //general container for all the environments
 var environments = {};

 //staging (dev) environment
 environments.staging = {
   'httpPort' : 3000,
   'httpsPort' : 3001,
   'envName':'staging',
   'hashingSecret': 'thisisasecretforSHA256',
   'maxMenus' : 5,
   'paySubmit' : 5*60*1000,   //5 minutes
   'mailgun' : {
      'from' : "Mailgun Sandbox <postmaster@sandboxXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.mailgun.org>",
      'key'  : "api:YOUR API KEY",
      'addr' : "https://api.mailgun.net/v3/sandboxXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.mailgun.org/messages"
   },
   'stripe' : {
      'pubkey' : 'YOUR PUBLIC KEY',  //account id for stripe - used to create tokens 
      'key'    : 'YOU SECURE KEY',   //all api request
      'addr'   : "https://api.stripe.com/v1/charges"
   }
 };

//production environment
environments.production = {
   'httpPort' : 5000,
   'httpsPort' : 5001,
   'envName':'production',
   'hashingSecret': 'thisisalsoasecretforSHA256',
   'maxMenus' : 5,
   'paySubmit' : 5*60*1000,   //5 minutes
   'mailgun' : {
      'from' : "Mailgun Sandbox <postmaster@sandboxXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.mailgun.org>",
      'key'  : "api:YOUR API KEY",
      'addr' : "https://api.mailgun.net/v3/sandboxXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.mailgun.org/messages"
   },
   'stripe' : {
      'pubkey' : 'YOUR PUBLIC KEY',  //account id for stripe - used to create tokens 
      'key'    : 'YOU SECURE KEY',   //all api request
      'addr'   : "https://api.stripe.com/v1/charges"
   }
};

//determine which one should be exported out as a command-line argument
//command line NODE_ENV=staging node index.js (for example)
var currentEnvironment = typeof(process.env.NODE_ENV) == 'string' ? process.env.NODE_ENV.toLowerCase() : '';

 //check that the current environment is one of the defined, if not default to staging
var environmentToExport = typeof(environments[currentEnvironment]) == 'object' ? environments[currentEnvironment] : environments.staging;

//export the module
module.exports = environmentToExport;
