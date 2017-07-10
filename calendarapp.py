from oneapp import OneApp
import pprint
import json
import requests
from dateutil.parser import parse

# URL = 'http://localhost:8080' # the WebApp UI
URL = 'http://54.146.216.72:8080'
webapp_id = None

# Initialize the connection to the backend
oneapp = OneApp(
    username = 'buddytest1',
    password = 'Buddy1!',
    server_name = 'api.getone.io',
    server_port = 443
)

def info(chat_thread_id, args):
    oneapp.send_message(
        chat_thread_id = chat_thread_id,
        html_content = "<font face='Helvetica Neue'><b>HELP INFO</b>:<br>This is a calendar bot "
            + "with responses for key words: 'authenticate', 'events'.</font>"
    )

def authenticate(chat_thread_id, user_id, args):
    r = requests.get(URL + '/authenticate', params={'user_id': user_id})
    data = r.json()
    response = data['response']
    print(response)
    oneapp.send_message(chat_thread_id = chat_thread_id,
        text_content = response)

def get_upcoming_events(chat_thread_id, user_id, args):
    r = requests.get(URL + '/listEvents', params={'user_id': user_id})
    data = r.json()
    response = data['response']
    events_list = json.loads(data['response'])
    events_list_formatted = format_event(chat_thread_id, events_list)
    print(events_list_formatted)
    oneapp.send_message(chat_thread_id = chat_thread_id,
        html_content = events_list_formatted)

def schedule(chat_thread_id, user_id, args):
    if len(args) < 3:
        oneapp.send_message(chat_thread_id = chat_thread_id,
            text_content = 'Specify what event you would like to schedule '
                + 'in the form: schedule <event> on MM/DD/YYYY from hh:mm '
                + '<am/pm> to hh:mm <am/pm>')
    r = requests.post(URL + '/scheduleEvent', json = args, params={'user_id': user_id})
    data = r.json()
    response = data['response']
    print(response)
    oneapp.send_message(chat_thread_id = chat_thread_id,
        text_content = response)

def format_date(date):
    if len(date) > 10:
        parsed_date = parse(date) #dt.strptime(date, %Y-%m-%dT%H:%M:%S-%z')
        return parsed_date.strftime("%A, %B %d, %Y @ %I:%M%p")
    else:
        parsed_date = parse(date) #dt.strptime(date, '%Y-%m-%d')
        return parsed_date.strftime("%A, %B %d, %Y.")

def format_event(chat_thread_id, args):
    html_content = "<font face='Helvetica Neue'><b>" + args[0] + "</b><br>"
    for i in range(1, len(args)):
        if i % 2 == 1:
            html_content = html_content + "<br><b>" + format_date(args[i]) + "</b>"
        else:
            html_content = html_content + "<br>" + args[i]
    html_content = html_content + "</font>"
    return html_content

def message_handler(chat_thread_id, text_content, **msg):
    print('Received text message = ' + text_content)
    parts = text_content.split()
    command = parts[0]
    args = parts[1:]
    user_id = msg["user_id"]
    if command.lower() == 'authenticate':
        authenticate(chat_thread_id, user_id, args)
    elif command.lower() == 'events':
        get_upcoming_events(chat_thread_id, user_id, args)
    elif command.lower() == 'schedule':
        schedule(chat_thread_id, user_id, args)
    elif command.lower() == 'help':
        info(chat_thread_id, args)
    # unrecognized message
    else:
        oneapp.send_message(
            chat_thread_id = chat_thread_id,
            text_content = "Use key words: 'authenticate', 'events'."
        )

def webapp_handler(**webapp):
    # handle the webApp::create echo
    if webapp['content_type'] == 'webApp::create':
        if webapp['user_id'] == oneapp.user_id:
            print("Bubble created!")
        return
    # handle a webApp::dispatch command
    chat_thread_id = webapp['chat_thread_id']
    if webapp['content_type'] == 'webApp::dispatch':
        data = webapp['data'] if 'data' in webapp else None
        cmd = data['cmd'] if data and 'cmd' in data else None
        if cmd and cmd == "sendData":
            attributes = data['attributes']
            user_id = webapp['user_id']
            print("User " + user_id + " sent attributes:")
            pprint.pprint(attributes)
            global webapp_id
            oneapp.dispatch_webapp_data(
                chat_thread_id,
                webapp_id,
                data = {
                    "cmd": "sendDataResponse",
                    "userId": webapp['user_id'],
                    "attributes": attributes
                })
            return
        else:
            oneapp.send_text_message(
                chat_thread_id,
                'I received a dispatch message for command: ' + cmd
            )

oneapp.on_message(message_handler, chat_thread_id = True, text_content=True)
oneapp.on_webapp(webapp_handler)
print("Listening...")
oneapp.wait()
