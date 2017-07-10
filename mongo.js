var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');
var url = "mongodb://localhost:27017/mydb";
// var url = "mongodb://52.91.229.192/mydb";

let _connection = undefined;

var exports = module.exports = {
     connect: function() {
          return new Promise((fulfill, reject) => {
               if (_connection) {
                    return fulfill(_connection);
               }
               MongoClient.connect(url, function(err, db) {
                    if (err) {
                         reject(err);
                    } else {
                         console.log("Database created!");
                         db.createCollection('oauth', {strict:true}, function(err, collection) {});
                         _connection = db;
                         return fulfill(_connection);
                    }
               });
          })
     }
}
