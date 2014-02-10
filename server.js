var	http = require('http');
var express = require('express');
var connect = require('connect');

var sys = require('sys');

var	async = require('async');

var	rooms	= require('./lib/rooms.js');
var	data	= require('./lib/data.js').db;

var sanitizer = require('sanitizer');

//Map of sids to user_names
var sids_to_user_names = [];

var db = new data(function() {
	console.log('db ready');
});

var app = express();
var server = app.listen(process.env.PORT || process.argv[2] || 8124, function () {
	console.log('scrum – http://%s:%s', this.address().address, this.address().port);
});
var io = require('socket.io').listen(server);

app.set('views', __dirname + '/views');
app.set('view engine', 'jade');

app.use(express.logger('dev'));
app.use(express.static(__dirname + '/client'));
app.use(express.bodyParser());

app.get('/', function(req, res) {
	var url = req.header('host');
	res.render('home', {
		locals: {
		 	url: url
		}
	});
});

app.get('/:id', function(req, res){
	console.log('req.params.id', req.params.id);
	res.render('index', {
		locals: {
			pageTitle: 'scrum - ' + req.params.id
		}
	});
});

app.post('/edit-card/:id', function(req, res){
	res.send(req.body.value);
});

app.post('/edit-column', function(req, res) {
	res.send(req.body.value);
});

/**
 * socket.io
 */

io.configure(function () {
  io.set('transports', ['websocket', 'flashsocket', 'jsonp-polling']);
  io.set('log level', 1);
});

io.sockets.on('connection', function (client) {

	client.on('message', function (message) {

		if (!message.action) return;

		switch (message.action) {
			case 'initializeMe':
				initClient(client);
				break;

			case 'joinRoom':
				joinRoom(client, message.data, function(clients) {

						client.json.send( { action: 'roomAccept', data: '' } );

				});
				break;

			case 'moveCard':
				//report to all other browsers
				var messageOut = {
					action: message.action,
					data: {
						id: scrub(message.data.id),
						position: {
							left: scrub(message.data.position.left),
							top: scrub(message.data.position.top)
						}
					}
				};


				broadcastToRoom( client, messageOut );

				// console.log("-----" + message.data.id);
				// console.log(JSON.stringify(message.data));

				getRoom(client, function(room) {
					db.cardSetXY( room , message.data.id, message.data.position.left, message.data.position.top)
				});

				break;

			case 'createCard':
				data = message.data;
				var clean_data = {};
				clean_data.text = scrub(data.text);
				clean_data.id = scrub(data.id);
				clean_data.x = scrub(data.x);
				clean_data.y = scrub(data.y);
				clean_data.rot = scrub(data.rot);
				clean_data.colour = scrub(data.colour);

				getRoom(client, function(room) {
					createCard( room, clean_data.id, clean_data.text, clean_data.x, clean_data.y, clean_data.rot, clean_data.colour);
				});

				var message_out = {
					action: 'createCard',
					data: clean_data
				};

				//report to all other browsers
				broadcastToRoom( client, message_out );
				break;

			case 'editCard':
				var clean_data = {};
				clean_data.value = scrub(message.data.value);
				clean_data.id = scrub(message.data.id);

				//send update to database
				getRoom(client, function(room) {
					db.cardEdit( room , clean_data.id, clean_data.value );
				});

				var message_out = {
					action: 'editCard',
					data: clean_data
				};

				broadcastToRoom(client, message_out);

				break;


			case 'deleteCard':
				var clean_message = {
					action: 'deleteCard',
					data: { id: scrub(message.data.id) }
				}

				getRoom( client, function(room) {
					db.deleteCard ( room, clean_message.data.id );
				});

				//report to all other browsers
				broadcastToRoom( client, clean_message );

				break;

			case 'createColumn':
				var clean_message = { data: scrub(message.data) };

				getRoom( client, function(room) {
					db.createColumn( room, clean_message.data, function() {} );
				});

				broadcastToRoom( client, clean_message );

				break;

			case 'deleteColumn':
				getRoom( client, function(room) {
					db.deleteColumn(room);
				});
				broadcastToRoom( client, { action: 'deleteColumn' } );

				break;

			case 'updateColumns':
				var columns = message.data;

				if (!(columns instanceof Array))
					break;

				var clean_columns = [];

				for (i in columns) {
					clean_columns[i] = scrub( columns[i] );
				}
				getRoom( client, function(room) {
					db.setColumns( room, clean_columns );
				});

				broadcastToRoom( client, { action: 'updateColumns', data: clean_columns } );

				break;

			case 'setUserName':
				var clean_message = {};

				clean_message.data = scrub(message.data);

				setUserName(client, clean_message.data);

				var msg = {};
				msg.action = 'nameChangeAnnounce';
				msg.data = { sid: client.id, user_name: clean_message.data };
				broadcastToRoom( client, msg );
				break;

			case 'addSticker':
				var cardId = scrub(message.data.cardId);
				var stickerId = scrub(message.data.stickerId);

				getRoom(client, function(room) {
					db.addSticker( room , cardId, stickerId );
				});

				broadcastToRoom( client, { action: 'addSticker', data: { cardId: cardId, stickerId: stickerId }});
				break;

			case 'setBoardSize':
				var size = {};
				size.width = scrub(message.data.width);;
				size.height = scrub(message.data.height);

				getRoom(client, function(room) {
					db.setBoardSize( room, size );
				});

				broadcastToRoom( client, { action: 'setBoardSize', data: size } );
				break;

			default:
				//console.log('unknown action');
				break;
		}
	});

	client.on('disconnect', function() {
		leaveRoom(client);
	});

});







function initClient ( client ) {
	//console.log ('initClient Started');
	getRoom(client, function(room) {

		db.getAllCards( room , function (cards) {

			client.json.send(
				{
					action: 'initCards',
					data: cards
				}
			);

		});


		db.getAllColumns ( room, function (columns) {
			client.json.send(
				{
					action: 'initColumns',
					data: columns
				}
			);
		});

		db.getBoardSize( room, function(size) {

			if (size != null) {
				client.json.send(
					{
						action: 'setBoardSize',
						data: size
					}
				);
			}
		});

		roommates_clients = rooms.room_clients(room);
		roommates = [];

		var j = 0;
		for (i in roommates_clients) {
			if (roommates_clients[i].id != client.id) {
				roommates[j] = {
					sid: roommates_clients[i].id,
					user_name:  sids_to_user_names[roommates_clients[i].id]
				};
				j++;
			}
		}

	});
}


function joinRoom (client, room, successFunction) {
	var msg = {};
	msg.action = 'join-announce';
	msg.data		= { sid: client.id, user_name: client.user_name };

	rooms.add_to_room_and_announce(client, room, msg);
	successFunction();
}

function leaveRoom (client) {
	//console.log (client.id + ' just left');
	var msg = {};
	msg.action = 'leave-announce';
	msg.data	= { sid: client.id };
	rooms.remove_from_all_rooms_and_announce(client, msg);

	delete sids_to_user_names[client.id];
}

function broadcastToRoom ( client, message ) {
	rooms.broadcast_to_roommates(client, message);
}

//----------------CARD FUNCTIONS
function createCard( room, id, text, x, y, rot, colour ) {
	var card = {
		id: id,
		colour: colour,
		rot: rot,
		x: x,
		y: y,
		text: text,
		sticker: null
	};

	db.createCard(room, id, card);
}

function roundRand( max ) {
	return Math.floor(Math.random() * max);
}

//------------ROOM STUFF
// Get Room name for the given Session ID
function getRoom( client , callback ) {
	room = rooms.get_room( client );
	//console.log( 'client: ' + client.id + " is in " + room);
	callback(room);
}


function setUserName ( client, name ) {
	client.user_name = name;
	sids_to_user_names[client.id] = name;
	//console.log('sids to user names: ');
	console.dir(sids_to_user_names);
}

//santizes text
function scrub( text ) {
	if (typeof text != "undefined" && text !== null) {
		//clip the string if it is too long
		if (text.length > 65535) {
			text = text.substr(0,65535);
		}
		return sanitizer.sanitize(text);
	}
	return null;
}


