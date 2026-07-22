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
const { TOKEN_SECRET, SESSION_SECRET, HTTP_PORT, SOCKET_PORT, WEBSOCKET_PORT, ROOMS, USERNAME_LIMIT, HISTORY_LIMIT, MESSAGE_LIMIT } = require('./config');

const userMessageTimes = {};
const userRecentMessages = {};
const app = express(); // Create the http server
app.use(express.json());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'User-Agent']
}));

/**
 * @type { Object.<string,{ username: string, message: string }[]> }
 */
const chatHistory = {};

// Initialize an empty history array for every single room
for(const room of ROOMS) {
  chatHistory[room] = []
}

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

  ws.on('message', (data) => {
    console.log(`${req.socket.remoteAddress} tried sending data: ${data}`);
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

// {"room": "general", "content": "test"}
app.post('/api/chat', verifyToken, checkBan, async (req, res) => {
  var data = req.body
  if (!ROOMS.includes(data.room)) {
    return res.status(200).send({"error": "Room not found"});
  }
  const users = readUsers();
  if (data.room == "announcements") {
    console.log("Message in announcements:");
    const user = users.users.find(user => user.username === req.user.username);
    if (user) {
      if (!user.admin) {
        console.log("Not enough rights");
        return res.send({"error": "No permission"});
      }
    }
  }
  const user2 = users.users.find(user => user.username === req.user.username);
  if (user2) {
    if (user2.banned) {
      const reason = user2.banReason || "No reason specified";
      return res.status(200).send({"error": "Banned", "reason": reason});
    }
    if (user2.muted) {
      console.log(`Muted user ${req.user.username} tried to chat.`);
      return res.status(200).send({"error": "Muted"});
    }
  } else {
    return res.status(404).send({"error": "User not found"});
  }
  if (data.content.length > MESSAGE_LIMIT) {
    return res.status(200).send({"error": "Message too long", "limit": MESSAGE_LIMIT});
  }
  console.log(`[${req.ip}] ${req.user.username}: ${req.body}`);

  var censored = censor(data.content)
  var result = {"author": req.user.username, "content": censored}

  if (chatHistory[data.room]) {
    chatHistory[data.room].push({
      username: req.user.username,
      message: censored
    });

    // drop the oldest message if we exceed it
    if (chatHistory[data.room].length > HISTORY_LIMIT) {
      chatHistory[data.room].splice(0, chatHistory[data.room].length - HISTORY_LIMIT)
    }
  }

  clients.forEach(client => {
    client.write(result);
  });
  ws_server.clients.forEach(ws => {
    ws.send(result);
  });
  return res.status(200).send({"result": "Success"});
});


// {"username": "orstando", "password": "wowsopassword"}
app.post('/api/signup', checkBan, async (req, res) => {
  const data = req.body
  const username = data.username;
  const password = data.password;

  if (!username || !password) {
    console.log("Signup: missing fields");
    return res.send({"error": "Missing fields"});
  }
  if (username.length > USERNAME_LIMIT) {
    console.log("Signup: Username too long");
    return res.send({"error": "Username too long", "limit": USERNAME_LIMIT});
  }
  const users = readUsers();
  if (users.users.find(user => user.username === username)) {
    console.log("Signup: account already in use");
    return res.send({"error": "Username unavailable"});
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = { id: Date.now().toString(), username, password: hashedPassword, admin: false, ip: req.ip, banned: false, banReason: "", muted: false };
  users.users.push(newUser);
  writeUsers(users);

  const token = jwt.sign({ id: newUser.id, username }, TOKEN_SECRET, { expiresIn: '1h' });
  console.log("Account created!");
  return res.status(200).send(`${token}`);
});

// {"username": "orstando", "password": "wowsopassword"}
app.post('/api/login', checkBan, async (req, res) => {
  const data = req.body
  const username = data.username;
  const password = data.password;

  const users = readUsers();
  const user = users.users.find(user => user.username === username);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    console.log("Wrong password");
    return res.send({"error": "Incorrect username or password"});
  }

  if (user.banned) {
    const reason = user.banReason || "No reason specified";
    return res.status(200).send({"error": "Banned", "reason": reason});
  }

  const token = jwt.sign({ id: user.id, username }, TOKEN_SECRET, { expiresIn: '1h' });
  console.log("Client logged in!");
  return res.status(200).send({"token": token});
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
  res.status(200).send({"count": 1})
})

app.post('/api/isadmin', async (req, res) => {
  const {username} = req.body;
  
  const users = readUsers();
  const user = users.users.find(user => user.username === username);
  if (!user) {
    return res.status(404).send("Invalid user.");
  }
  res.status(200).send({"result": user.admin})
});

// {"room": "general"}
app.post('/api/history', verifyToken, checkBan, async (req, res) => {
  const data = req.body;
  let messages = []
  if(data.room) {
    const history = chatHistory[data.room]
    if(history) {
      for(const msg of history) {
        messages.push({
          "author": msg.username,
          "content": msg.message,
        });
      }
    }
  } else {
    console.log(`${req.ip} requested message history for nonexistent room (${data.room})`)
    return res.status(404).send({
      "error": "Room not found"
    });
  }
  res.status(200).send(messages)
  console.log(`${req.ip} requested message history`)
  return
})

app.use("/admin", admin); // admin panel

app.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`ChatterHTTP running on port ${HTTP_PORT}`);
});
