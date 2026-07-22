const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const websocket = require('ws');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const censor = require('./censor');
const admin = require("./admin");
const { readUsers, writeUsers } = require("./db")
const { TOKEN_SECRET, SESSION_SECRET, HTTP_PORT, SOCKET_PORT, WEBSOCKET_PORT, ROOMS } = require('./config');

const userMessageTimes = {};
const userRecentMessages = {};
const app = express(); // Create the http server
app.use(express.text()); // Make sure to accept raw text because JSON parsing in base C is hell
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'User-Agent']
}));

const HISTORY_LIMIT = 100; // Easily changeable if moments pass. Shattered glass? Hands of time. Where's that chime?!
/**
 * @type { Object.<string,{ username: string, message: string }[]> }
 */
const chatHistory = {};

// Initialize an empty history array for every single room
for(const room of ROOMS) {
  chatHistory[room] = []
}

const RECENT_LIMIT = 10; // How many recent messages to replay to clients on connect
// Ring buffer of the last few broadcast lines (stored verbatim so replay is byte-identical to a live broadcast)
/** @type { string[] } */
const recentMessages = [];

// The amount of rooms the client should parse (calculate dynamically in the future when user-created rooms exist)
const roomCount = ROOMS.length;

// Client storage, keeps track of all sockets.
const clients = [];

// Websocket server
const ws_server = new websocket.Server({ port: WEBSOCKET_PORT, clientTracking: true }, () => {
  console.log(`ChatterWSS listening on port ${WEBSOCKET_PORT}`);
});
// WSS connection handling
ws_server.on('connection', (ws, req) => {
  console.log(`[${req.socket.remoteAddress}] Client connected`);

  // Replay recent messages so there's some permanence across reconnects
  for(const line of recentMessages) {
    ws.send(line);
  }

  ws.on('message', (data) => {
    const msg = data.toString('utf-8').trim()
    const parts = msg.split('|')

    if(parts[0] === 'history') {
      let limit = parts[1] ? parseInt(parts[1]) : 0
      const room = parts[2]
      if(limit == NaN) limit = 0
      if(limit < 0) limit = 0
      let message = ''
      if(room) {
        const history = chatHistory[room]
        if(history) 
          for(const msg of history) {
            message += `${msg.username}|${msg.message}|${room}|\n`
          }
        else {
          console.log(`${req.socket.remoteAddress} requested message history for nonexistent room (${room})`)
          return
        }
      } else for(const room in chatHistory) {
        const history = chatHistory[room]
        for(const msg of history) {
          message += `${msg.username}|${msg.message}|${room}|\n`
        }
      }
      if(limit && message.length > limit) {
        message = message.substring(message.length - limit, message.length)
      }
      ws.send(message)
      console.log(`${req.socket.remoteAddress} requested message history`)
      return
    }

    console.log(`${req.socket.remoteAddress} tried sending data (Murder him): ${data}`);
  });

  ws.on('close', (code, reason) => {
    console.log(`[${req.socket.remoteAddress}] Client disconnected`);
  });

  ws.on('error', (err) => {
    console.log(`[${req.socket.remoteAddress}] error: ${err.message}`);
  });
});

// Verify the JWT token provided by the client
function verifyToken(req, res, next) {
  const token = req.headers['auth'];

  if (!token) {
    console.log(`[${req.ip}]: Error: Invalid Token.`);
    return res.send("ERR_INVALID_TOKEN");
  }

  try {
    const decoded = jwt.verify(token, TOKEN_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.log(`AHHHH OH HELP OH MY GOODNESS AHHHH ${err}`);
    return res.send("ERR_WHAT_THE_HECK");
  }
}

// Check if an IP is banned
function checkBan(req, res, next) {
  const users = readUsers();
  const user = users.users.find(user => user.ip === req.ip);
  if (user) {
    if (user.banned == true) {
      console.log(`Banned user attempted access: ${user.username}`);
      const reason = user.banReason || "No reason specified";
      return res.send(`ERR_BANNED|${reason}|`);
    } else {
      next();
    }
  } else {
    next();
  }
}

// web version
app.use('/web', express.static('web'));
app.get('/', checkBan, (req, res) => {
  return res.redirect("/web");
})

// Unused, simple API test
app.get('/api/test', checkBan, (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.status(200).send('Online');
  console.log("Client requested API status");
});

// Grab rooms
app.post('/api/rooms', checkBan, (req, res) => {
  res.set('Content-Type', 'text/plain');
  const responseString = `${roomCount}|${ROOMS.join('|')}|`;
  res.status(200).send(responseString);
  console.log("Sent room list");
});

/*
Send a message

Formatting:
message|room|

Make CERTAIN it ends with a |, otherwise it'll get messy sometimes.
*/
app.post('/api/chat', verifyToken, checkBan, async (req, res) => {
  const splittered = req.body.split("|");
  if (!splittered[1] || !splittered[0]) {
    return res.status(200).send("ERR_MISSING_FIELD");
  }
  if (!ROOMS.includes(splittered[1])) {
    return res.status(200).send("ERR_FAKE_ROOM_YOU_MORON");
  }
  if (splittered[1] == "announcements") {
    console.log("Message in announcements:");
    const users = readUsers();
    const user = users.users.find(user => user.username === req.user.username);
    if (user) {
      if (user.admin == false) {
        console.log("Not enough rights");
        return res.send("ERR_NO_RIGHTS");
      }
    }
  }
  const users2 = readUsers();
  const user2 = users2.users.find(user => user.username === req.user.username);
  if (user2) {
    if (user2.banned) {
      const reason = user2.banReason || "No reason specified";
      return res.status(200).send(`ERR_BANNED|${reason}|`);
    }
    if (user2.muted) {
      console.log(`Muted user ${req.user.username} tried to chat.`);
      return res.status(200).send("ERR_MUTED");
    }
  } else {
    return res.status(200).send("ERR_FAKE_USER");
  }
  const username = req.user.username;
  const now = Date.now();
  const currentMsg = req.body.split('|')[0];
  
  console.log(`[${req.ip}] ${req.user.username}: ${req.body.split('|')[0]}`);
  console.log(`recieved:`,req.body);
  const currentRoom = splittered[1];
  const msgText = splittered[0];

  if (chatHistory[currentRoom]) {
    chatHistory[currentRoom].push({
      username: req.user.username,
      message: msgText
    });

    // drop the oldest message if we exceed it
    if (chatHistory[currentRoom].length > HISTORY_LIMIT) {
      chatHistory[currentRoom].splice(0, chatHistory[currentRoom].length - HISTORY_LIMIT)
    }
  }
  var censored = censor(req.body)
  var line = `${req.user.username}|${censored}|\n`
  // Cache the last few messages so we can replay them to clients on connect
  recentMessages.push(line);
  if (recentMessages.length > RECENT_LIMIT) {
    recentMessages.splice(0, recentMessages.length - RECENT_LIMIT);
  }

  clients.forEach(client => {
    client.write(line);
  });
  ws_server.clients.forEach(ws => {
    ws.send(line);
  });
  return res.status(200).send("OK");
});


/*
Account Signup

Formatting:
username|password|


*/
app.post('/api/signup', checkBan, async (req, res) => {
  const splitten = req.body.split("|");
  const username = splitten[0];
  const password = splitten[1];

  if (!username || !password) {
    console.log("Signup: missing fields");
    return res.send("ERR_MISSING_INPUT");
  }
  if (username.length > 30) {
    console.log("Signup: Username too long");
    return res.send("You know, this doesn't actually have to be all caps. I can write whatever I want in here.");
  }
  const users = readUsers();
  if (users.users.find(user => user.username === username)) {
    console.log("Signup: account already in use");
    return res.send("ERR_USER_USED");
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = { id: Date.now().toString(), username, password: hashedPassword, admin: false, ip: req.ip, banned: false, banReason: "", muted: false };
  users.users.push(newUser);
  writeUsers(users);

  const token = jwt.sign({ id: newUser.id, username }, TOKEN_SECRET, { expiresIn: '1h' });
  console.log("Account created!");
  return res.status(200).send(`${token}`);
});

/*
Account Login

Formatting:
username|password|

*/
app.post('/api/login', checkBan, async (req, res) => {
  const splitten = req.body.split("|");
  const username = splitten[0];
  const password = splitten[1];

  const users = readUsers();
  const user = users.users.find(user => user.username === username);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    console.log("Wrong password");
    return res.send("ERR_WRONG_PASS");
  }

  if (user) {
    if (user.banned) {
      const reason = user.banReason || "No reason specified";
      return res.status(200).send(`ERR_BANNED|${reason}|\n`);
    }
  } else {
    return res.status(200).send("ERR_FAKE_USER");
  }

  const token = jwt.sign({ id: user.id, username }, TOKEN_SECRET, { expiresIn: '1h' });
  console.log("Client logged in!");
  return res.status(200).send(`${token}|\n`);
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

app.get('/api/rules', async (req, res) => {
  const filePath = path.join(__dirname, 'data', 'rules.txt');
  res.sendFile(filePath, (err) => {
      if (err) {
          console.error(err);
          if (!res.headersSent) {
              res.status(404).send('An error occurred while fetching rules.');
          }
      }
  });
});
app.get('/api/faq', async (req, res) => {
  const filePath = path.join(__dirname, 'data', 'faq.txt');
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error(err);
      if (!res.headersSent) {
        res.status(404).send('An error occurred while fetching FAQ.');
      }
    }
  });
});
app.get('/api/changelog', async (req, res) => {
  const filePath = path.join(__dirname, 'data', 'changelog.txt');
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error(err);
      if (!res.headersSent) {
        res.status(404).send('An error occurred while fetching changelog.');
      }
    }
  });
});

app.post('/api/online', async (req, res) => {
  room = req.body;
  // get online count for room, currently placeholder
  res.status(200).send("?")
})

app.post('/api/isadmin', async (req, res) => {
  const {username} = req.body;
  
  const users = readUsers();
  const user = users.users.find(user => user.username === username);
  if (!user) {
    return res.status(404).send("Invalid user.");
  }
  res.status(200).send(`${user.admin}`)
});

app.use("/admin", admin); // admin panel

app.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`ChatterHTTP running on port ${HTTP_PORT}`);
});
