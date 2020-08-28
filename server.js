const listenPort = process.env.PORT || 8181;

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const app = express();
const axios = require('axios');
const cron = require('node-cron');
const gameserver = require('./gameserver.js');

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Init server vars
let gameServers = [];
let currentServerIndex;
let serverToJoinIndex;

app.post('/servers/current', [
	body('app_key').equals(process.env.APP_KEY),
	body('ip').isIP(),
	body('port').isPort().toInt(),
	body('password').matches(/^[a-zA-Z0-9_\-]*$/).withMessage('Password contains illegal characters'),
	body('in_rotation').isBoolean().toBoolean(),
	validateInputs
], (req, res) => {
	// Add server
	let gameServer = addServer(req.body.ip, req.body.port, req.body.password, req.body.in_rotation);
	// Update index
	currentServerIndex = gameServers.indexOf(gameServer)
	
	// Remove to join index if to join server is now the current server
	if (currentServerIndex === serverToJoinIndex) serverToJoinIndex = undefined;
	
	// Send response
	res.json({
		message: 'Updated current server succesfully',
		server: {
			ip: gameServer.ip,
			port: gameServer.gamePort
		}
	});
	console.log('Current server updated');
});

app.post('/servers/join', [
	body('app_key').equals(process.env.APP_KEY),
	body('ip').isIP(),
	body('port').isPort().toInt(),
	body('password').matches(/^[a-zA-Z0-9_\-]*$/).withMessage('Password contains illegal characters'),
	validateInputs
], (req, res) => {
	// Set index
	let gameServer = addServer(req.body.ip, req.body.port, req.body.password, false);

	// Update server to join index (only if index is different from currrent server index)
	let message;
	if (gameServers.indexOf(gameServer) !== currentServerIndex) {
		message = 'Specator will join server shortly';
		serverToJoinIndex = gameServers.indexOf(gameServer);
	} else {
		message = 'Spectator is already on requested server';
	}

	// Send response
	res.json({
		message: message,
		server: {
			ip: gameServer.ip,
			port: gameServer.gamePort
		}
	});
});

// Allow Moobot to send a join server request via HTTP GET
app.get('/servers/join-moobot', [
	query('app_key').equals(process.env.APP_KEY),
	query('ip').isIP(),
	query('port').isPort().toInt(),
	query('password').matches(/^[a-zA-Z0-9_\-]*$/).withMessage('Password contains illegal characters'),
	validateInputs
], (req, res) => {
	// Add game server
	let gameServer = addServer(req.query.ip, req.query.port, req.query.password, false);

	// Update server to join index (only if index is different from currrent server index)
	let message;
	if (gameServers.indexOf(gameServer) !== currentServerIndex) {
		message = 'Specator will join server shortly';
		serverToJoinIndex = gameServers.indexOf(gameServer);
	} else {
		message = 'Spectator is already on requested server';
	}

	// Send response
	res.json({
		message: message,
		server: {
			ip: gameServer.ip,
			port: gameServer.gamePort
		}
	});
});

app.get('/servers/current', (req, res) => {
	if (gameServers.length > 0 && currentServerIndex !== undefined) {
		res.json(gameServers[currentServerIndex]);
	} else {
		res.status(404).send('No servers have been added/specator not on any server');
	}
})


app.get('/servers/current/players/total', (req, res) => {
	if (gameServers.length > 0 && currentServerIndex !== undefined) {
		res.send(`${gameServers[currentServerIndex].players.length}/${gameServers[currentServerIndex].maxplayers}`);
	} else {
		res.status(404).send('No servers have been added/specator not on any server');
	}
})

app.get('/servers/current/players/summary', (req, res) => {
	if (gameServers.length > 0 && currentServerIndex !== undefined) {
		let humanPlayers = getHumanPlayers(gameServers[currentServerIndex]);
		res.json({
			max: gameServers[currentServerIndex].maxplayers,
			online: gameServers[currentServerIndex].players.length,
			human: humanPlayers.length,
			active: getActivePlayers(gameServers[currentServerIndex]).length,
			bots: gameServers[currentServerIndex].players.length - humanPlayers.length
		});
	} else {
		res.status(404).send('No servers have been added/specator not on any server');
	}
})

app.get('/servers/current/players/top', [
	query('count').toInt().customSanitizer(value => {
		if (value >= 1 && value <= 10) {
			return value;
		} else {
			return 3;
		}
	}),
	query('as_text').toBoolean(),
], (req, res) => {
	if (gameServers.length > 0 && currentServerIndex !== undefined) {
		// Get the top n slice of players
		let players = gameServers[currentServerIndex].players.slice(0, req.query.count);

		// Send text of json response
		if (req.query.as_text) {
			// Determine number to pad up to
			let indexPadTo = String(req.query.count).length;
			// Build text message (format: #[padded index/place]: [player name])
			let rankings = players.map((player, index) => {
				// Determine whether to add space after player tag (no space if no tag)
				let tagPadTo = player.tag.length > 0 ? player.tag.length + 1 : 0;
				const text = `#${String(index + 1).padStart(indexPadTo, '0')}: ${player.tag.padEnd(tagPadTo, ' ')}${player.name}`;
				// Add space after dots so tags/names will not show up as links 
				return text.replace('.', '. ');
			});
			res.send(rankings.join(' - '));
		} else {
			res.json(players);
		}
	} else {
		res.status(404).send('No servers have been added/specator not on any server');
	}
})

app.get('/servers/join', (req, res) => {
	if (gameServers.length > 0 && serverToJoinIndex !== undefined) {
		let gameServer = gameServers[serverToJoinIndex];
		// Only send server details required to join it
		res.json({
			ip: gameServer.ip,
			gamePort: gameServer.gamePort,
			password: gameServer.password,
			inRotation: gameServer.inRotation
		});
	} else {
		res.status(404).send('No servers have been added/no server to join');
	}
});

function validateInputs(req, res, next) {
	// Validate inputs
	const errors = validationResult(req)
	if (!errors.isEmpty()) {
		return res.status(422).json({ errors: errors.array() });
	}
	next()
}

function addServer(ip, gamePort, password, inRotation) {
	// Check if server is in global array
	let gameServer = gameServers.find(server => server.ip === ip && server.gamePort === gamePort);

	// Update or add gameserver
	if (gameServer !== undefined) {
		gameServer.password = password;
		gameServer.inRotation = inRotation;
	} else {
		// Unknown server, init server object
		gameServer = new gameserver(ip, gamePort);
		gameServer.password = password;
		gameServer.inRotation = inRotation;

		// Add server to global array
		gameServers.push(gameServer);

		// Fetch server state
		getServerState(gameServer);
	}

	return gameServer;
}

function getServerState(server) {
	axios.get(`https://bflist.io/api/bf2/v1/servers/${server.ip}:${server.gamePort}`)
	.then((response) => {
		const state = response.data;
		server.gamePort = parseInt(state.gamePort);
		server.name = state.name;
		server.map = state.map;
		server.maxplayers = parseInt(state.maxPlayers);
		// Add players sorted by score (desc)
		server.players = [];
		state.players.sort((a, b) => {
			return b.score - a.score;
		}).forEach((player) => {
			server.players.push({
				pid: parseInt(player.pid),
				name: player.name,
				tag: player.tag,
				score: parseInt(player.score),
				kills: parseInt(player.skill),
				deaths: parseInt(player.deaths),
				ping: parseInt(player.ping),
				teamIndex: parseInt(player.teamIndex),
				teamLabel: player.teamLabel,
				aibot: player.aitbot
			})
		});
	}).catch((error) => {
		console.log(error.message, server.ip, server.gamePort);
	});
}

function getHumanPlayers(gameServer) {
	// Return all players that are not the spectator and not a placeholder bot (have 0 ping)
	return gameServer.players.filter((player) => {
		return !player.aibot && player.name !== process.env.SPECTATOR_NAME && (player.ping > 0 || player.score !== 0 || player.kills !== 0 || player.deaths !== 0);
	});
}

function getActivePlayers(gameServer) {
	// Get human players
	let humanPlayers = getHumanPlayers(gameServer);

	// Return all players that either have a score other than zero or have died
	return humanPlayers.filter((player) => {
		return player.score !== 0 || player.kills !== 0 || player.deaths !== 0;
	});
}

// Update current server's state every 30 seconds
// (bflist updates at 00 and 30, so get fresh data at 10 and 40)
cron.schedule('10,40 * * * * *', () => {
	if (gameServers.length > 0 && currentServerIndex !== undefined) {
		console.log('Updating game server state')
		getServerState(gameServers[currentServerIndex]);
	}
});

app.listen(listenPort, () => {
	console.log('Listening on port', listenPort);
});