var express = require('express');
var app = express();
var port = 8080;
var fs = require('fs');
var readline = require('readline');
var google = require('googleapis');
var googleAuth = require('google-auth-library');
var bodyParser = require('body-parser');
var multer = require('multer'); // v1.0.5
var upload = multer(); // for parsing multipart/form-data
var mongo = require('./mongo.js');
let db = undefined;
let collection = undefined;
mongo.connect().then(function(conn) {
     db = conn;
     collection = db.collection('oauth');
})
.catch(err => console.log(err));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

let clientSecret = undefined;
let clientId = undefined;
// let redirectUrl = 'http://localhost:8080/redirect';
let redirectUrl = 'http://calendarbuddy.getone.io:8080/redirect';
let auth = new googleAuth();
let oauth2Client = undefined;

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/calendar-nodejs-quickstart.json
var SCOPES = ['https://www.googleapis.com/auth/calendar'];

fs.readFile('client_secret.json', function processClientSecrets(err, content) {
     if (err) {
          console.log('Error loading client secret file: ' + err);
          return;
     }
     credentials = JSON.parse(content);
     console.log(credentials);
     clientSecret = credentials.web.client_secret;
     clientId = credentials.web.client_id;
     oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);
     console.log("Loaded client secret file.");
});

app.get('/authenticate', function(req, res) {
     authenticate(res, req.query.user_id, printUrl);
});

app.get('/listEvents', function(req, res) {
     authenticate(res, req.query.user_id, listEvents);
});

app.post('/scheduleEvent', upload.array(), function(req, res, next) {
     authenticate(res, req.query.user_id, scheduleEvent, req.body);
});

app.listen(port, function() {
     console.log('Listening on port ' + port);
});

function authenticate(res, user_id, callback) {
     collection.findOne({user_id: user_id}, function(err, result) {
          if (err) console.log(err);
          authenticateHelper(res, user_id, result, callback, null);
     });
}

function authenticate(res, user_id, callback, message) {
     collection.findOne({user_id: user_id}, function(err, result) {
          if (err) console.log(err);
          authenticateHelper(res, user_id, result, callback, message);
     });
}

function authenticateHelper(res, user_id, result, callback, message) {
     // if the user has been authenticated and a prior token exists
     console.log("Result: " + result);
     if (result) {
          console.log(result['token']);
          oauth2Client.credentials = result['token'];
          if (message) callback(res, user_id, message);
          else callback(res, user_id, 'Authenticated.');
     // if user is a new user
     } else {
          var authUrl = oauth2Client.generateAuthUrl({
               access_type: 'offline',
               scope: SCOPES
          });
          printUrl(res, user_id, "Authenticate here: " + authUrl);
     }
}

function redirect(res, code, user_id) {
     oauth2Client.getToken(code, function(err, token) {
          if (err) {
               console.log('Error while trying to retrieve access token', err);
               res.send('Error while trying to retrieve access token ' + err);
               return;
          }
          oauth2Client.credentials = token;
          storeToken(user_id, token);
     });
     res.send('Authenticated. Please return to OneApp.');
}

// Stores token
function storeToken(user_id, token) {
     collection.insertOne({user_id: user_id, token: token}, function(err, result) {
          if (err) throw err;
     });
}

// Calendar callback functions
function printUrl(res, user_id, message) {
     console.log("Message: " + message);
     res.send({response: message});
     app.get('/redirect', function(redirectReq, redirectRes) {
          redirect(redirectRes, redirectReq.query.code, user_id);
     });
}

function listEvents(res, user_id, message) {
     var calendar = google.calendar('v3');
     calendar.events.list({
          auth: oauth2Client,
          calendarId: 'primary',
          timeMin: (new Date()).toISOString(),
          maxResults: 10,
          singleEvents: true,
          orderBy: 'startTime'
     }, function(err, response) {
          var eventsList = [];
          if (err) {
               console.log('Error: ' + err);
               eventsList.push('The API returned an error: ' + err);
               res.send({response: JSON.stringify(eventsList)});
               return;
          }
          var events = response.items;
          if (events.length == 0) {
               eventsList.push('No upcoming events found.');
          } else {
               eventsList.push('Here are your upcoming events:');
               for (var i = 0; i < events.length; i++) {
                    var event = events[i];
                    var start = event.start.dateTime || event.start.date;
                    eventsList.push(start)
                    eventsList.push(event.summary);
               }
          }
          console.log(eventsList);
          res.send({response: JSON.stringify(eventsList)});
     });
}

function scheduleEvent(res, user_id, message) {
     console.log(message);

     // find last instance of 'on'
     if (message.indexOf('on') != -1) {
          var index = message.length - 1 - message.reverse().indexOf('on');
     }

     // verify validity of format and date time
     if (index != message.reverse().length - 8) {
          res.send({response: 'Error: incorrect format. Format as: schedule '
               + '<event> on MM/DD/YYYY from hh:mm <am/pm> to hh:mm <am/pm>'});
          return;
     }

     // parse date and time
     var date = message[index + 1].split('/');
     var month = date[0];
     var day = date[1];
     var year = date[2];
     var startTime = message[index + 3].split(':');
     var startHours = startTime[0];
     var startMinutes = startTime[1];
     var startMeridiem = message[index + 4];
     if (startMeridiem.toLowerCase() == 'pm') {
          startHours = parseInt(startHours) + 12;
     }
     var start = (new Date(year, month - 1, day, startHours, startMinutes)).toISOString();
     var endTime = message[index + 6].split(':');
     var endHours = endTime[0];
     var endMinutes = endTime[1];
     var endMeridiem = message[index + 7];
     if (endMeridiem.toLowerCase() == 'pm') {
          endHours = parseInt(endHours) + 12;
     }
     var end = (new Date(year, month - 1, day, endHours, endMinutes)).toISOString();

     // grab everything prior and set as summary
     var summary = message.slice(0, index).join(' ');

     // create calendar and user requested event
     var calendar = google.calendar('v3');
     var eventContent = {
          'summary': summary,
          'start': {
               'dateTime': start
          },
          'end': {
               'dateTime': end
          },
          'reminders': {
               'useDefault': true
          }
     };

     var event = calendar.events.insert({
          auth: oauth2Client,
          calendarId: 'primary',
          resource: eventContent,
     }, function(err, event) {
          if (err) {
               console.log('There was an error contacting the Calendar service: ' + err);
               return;
          }
          console.log('Event created: %s', event.htmlLink);
          res.send({response: 'Event created: ' + event.htmlLink});
          console.log('ID: ' + event.id);
     });
}
