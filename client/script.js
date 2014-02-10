var cards = {};
var totalcolumns = 0;
var columns = [];
var boardInitialized = false;

var socket = io.connect();

//an action has happened, send it to the
//server
function sendAction(a, d) {
	var message = {
		action: a,
		data: d
	}
	socket.json.send ( message );
}

socket.on('connect', function(){
	//console.log('successful socket.io connect');

	//let the path be the room name
	var path = location.pathname;

	//imediately join the room which will trigger the initializations
	sendAction('joinRoom', path);
})

socket.on('disconnect', function(){
	blockUI("Server disconnected. Refresh page to try and reconnect...");
});

socket.on('message', function(data){
	getMessage(data);
})


function unblockUI() {
	$('.loader-wrapper').fadeOut();
}

function blockUI(message) {
	message = message || 'Waiting...';

	$('.loader-wrapper').find('.loader').html(message);
	$('.loader-wrapper').fadeIn();
}

//respond to an action event
function getMessage( m ) {
	var message = m; //JSON.parse(m);
	var action = message.action;
	var data = message.data;

	//console.log('<-- ' + action);

	switch (action)
	{
		case 'roomAccept':
			//okay we're accepted, then request initialization
			//(this is a bit of unnessary back and forth but that's okay for now)
			sendAction('initializeMe', null);
			break;

		case 'roomDeny':
			//this doesn't happen yet
			break;

		case 'moveCard':
			moveCard($("#" + data.id), data.position);
			break;

		case 'initCards':
			initCards(data);
			break;

		case 'createCard':
			drawNewCard(data.id, data.text, data.x, data.y, data.rot, data.colour, null);
			break;

		case 'deleteCard':
			$("#" + data.id).fadeOut(500,
				function() {$(this).remove();}
			);
			break;

		case 'editCard':
			$("#" + data.id).children('.content:first').text(data.value);
			break;

		case 'initColumns':
			initColumns(data);
			break;

		case 'updateColumns':
			initColumns(data);
			break;

		default:
			//unknown message
			console.error('unknown action: ' + JSON.stringify(message));
			break;
	}


}

function drawNewCard(id, text, x, y, rot, colour, sticker, animationspeed) {
	//cards[id] = {id: id, text: text, x: x, y: y, rot: rot, colour: colour};

	var h = '<div id="' + id + '" class="card ' + colour + ' draggable" style="-webkit-transform:rotate(' + rot + 'deg);">\
	<img src="/images/icons/token/Xion.png" class="card-icon delete-card-icon" />\
	<div id="content:' + id + '" class="content">' + text + '</div>\
	</div>';

	var card = $(h).css({
		left: x + "px",
		top: y + "px"
	});
	card.appendTo('#board');

	card.draggable({
		stack: ".card",
		stop: function(event, ui) {
			var data = {
				id: this.id,
				position: ui.position
			};
			sendAction('moveCard', data);
		}
	});

	card.on('click', '.delete-card-icon', function(){
		$("#" + id).remove();
		//notify server of delete
		sendAction( 'deleteCard' , { 'id': id });
	});

	card.children('.content').editable( "/edit-card/" + id, {
		style : 'inherit',
		cssclass : 'card-edit-form',
		type : 'textarea',
		placeholder: 'Double-click to edit',
		onblur: 'submit',
		event: 'dblclick',
		callback: onCardChange
	});
}


function onCardChange( text, result ) {
	var path = result.target;
	//e.g. /edit-card/card46156244
	var id = path.slice(11);

	sendAction('editCard', { id: id, value: text });


}

function moveCard(card, position) {
		card.animate({
				left: position.left+"px",
				top: position.top+"px"
		}, 500);
}


//----------------------------------
// cards
//----------------------------------
function createCard( id, text, x, y, rot, colour ) {
	drawNewCard(id, text, x, y, rot, colour, null);

	var action = "createCard";

	var data = {
		id: id,
		text: text,
		x: x,
		y: y,
		rot: rot,
		colour: colour
	};

	sendAction(action, data);

}

function randomCardColour() {
	var colours = ['yellow', 'green', 'blue', 'white', 'red'];

	var i = Math.floor(Math.random() * colours.length);

	return colours[i];
}


function initCards( cardArray ) {
	//first delete any cards that exist
	$('.card').remove();

	cards = cardArray;

	for (i in cardArray)
	{
		card = cardArray[i];

		drawNewCard(
			card.id,
			card.text,
			card.x,
			card.y,
			card.rot,
			card.colour,
			card.sticker
		);
	}

	boardInitialized = true;
	unblockUI();
}


//----------------------------------
// cols
//----------------------------------


function drawNewColumn (columnName) {
	var cls = "col";
	if (totalcolumns == 0)
	{
		cls = "col first";
	}

	$('#icon-col').before('<td class="' + cls + '" width="10%" style="display:none"><h2 id="col1" class="editable">' + columnName + '</h2></td>');

	$('.editable').editable( "/edit-column",
		{
			style   : 'inherit',
			cssclass   : 'column-edit-form',
			type      : 'textarea',
			placeholder   : 'New',
			onblur: 'submit',
			width: '',
			height: '',
			event: 'dblclick',
			callback: onColumnChange
		}
	);

	$('.col:last').fadeIn(1500);

	totalcolumns ++;
}

function onColumnChange( text, settings ) {
	var names = [];

	//Get the names of all the columns
	$('.col').each(function() {
		names.push(
			$(this).text()
		);
	});

	updateColumns(names);

}

function displayRemoveColumn() {
	if (totalcolumns <= 0) return false;

	$('.col:last').fadeOut( 150,
		function() {
			$(this).remove();
		}
	);

	totalcolumns --;
}

function createColumn( name ) {
	if (totalcolumns >= 8) return false;

	drawNewColumn( name );
	columns.push(name);

	var action = "updateColumns";

	var data = columns;

	sendAction(action, data);
}

function deleteColumn() {
	if (totalcolumns <= 0) return false;

	displayRemoveColumn();
	columns.pop();

	var action = "updateColumns";

	var data = columns;

	sendAction(action, data);
}

function updateColumns( c ) {
	columns = c;

	var action = "updateColumns";

	var data = columns;

	sendAction(action, data);
}

function deleteColumns( next ) {
	//delete all existing columns:
	$('.col').fadeOut( 'slow', next() );
}

function initColumns( columnArray ) {
	totalcolumns = 0;
	columns = columnArray;

	$('.col').remove();

	for (i in columnArray)
	{
		column = columnArray[i];

		drawNewColumn(
			column
		);
	}


}

//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////

$(function() {

	if (boardInitialized == false) {
		blockUI('<img src="/images/ajax-loader.gif" width=43 height=11/>');
	}

	$( "#create-card" )
		.click(function() {
			var rotation = Math.random() * 10 - 5; //add a bit of random rotation (+/- 10deg)
			uniqueID = Date.now() + Math.round(Math.random() * 1000000);
			//alert(uniqueID);
			createCard(
				'card' + uniqueID,
				'',
				20,
				20,
				rotation,
				randomCardColour());
		});

	$( "#board" )
		.dblclick(function(e) {
			var rotation = Math.random() * 10 - 5; //add a bit of random rotation (+/- 10deg)
			uniqueID = Date.now() + Math.round(Math.random() * 1000000);
			//alert(uniqueID);
			createCard(
				'card' + uniqueID,
				'',
				e.pageX - 20,
				e.pageY - 20,
				rotation,
				randomCardColour());
		});

	$('#add-col').on('click dblclick', function (e) {
		createColumn('New');
		e.preventDefault();
		e.stopPropagation();
	})

	$('#delete-col').on('click dblclick', function (e){
		deleteColumn();
		e.preventDefault();
		e.stopPropagation();
	});

});











