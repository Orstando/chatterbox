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
const { UserDatabase, MessageDatabase } = require("./db");
const { TOKEN_SECRET, SESSION_SECRET, PORT, ROOMS, USERNAME_LIMIT, HISTORY_LIMIT, MESSAGE_LIMIT, IS_CLOUDFLARE } = require('./config');

const userdb = new UserDatabase();

const userMessageTimes = {};
const userRecentMessages = {};
const app = express(); // Create the http server
app.use(express.json());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'User-Agent']
}));

const chatHistory = {};

// Initialize an empty history array for every single room
for(const room of ROOMS) {
  chatHistory[room] = []
}

// The amount of rooms the client should parse (calculate dynamically in the future when user-created rooms exist)
const roomCount = ROOMS.length;

// Get IP via Cloudflare header
app.use(function(req, res, next) {
  if (IS_CLOUDFLARE) {
    req.ip = req.headers["CF-Connecting-IP"];
  }
  next();
});

// Verify the JWT token provided by the client
function verifyToken(req, res, next) {
  const token = req.headers.authorization;

  if (!token) {
    console.log(`[${req.ip}]: Error: Invalid Token.`);
    console.log(token)
    return res.send({"error": "Invalid token"});
  }

  try {
    const decoded = jwt.verify(token, TOKEN_SECRET);
    req.uid = decoded.id;
    next();
  } catch (err) {
    console.log(`Token error: ${err}`);
    return res.send({"error": "Token verification error"});
  }
}

// Check if an IP is banned
async function checkBan(req, res, next) {
  result = await userdb.isIpBanned(req.ip);
  if (result) {
      console.log(`Banned user attempted access: ${result.id}`);
      return res.send({"error": "Banned", "reason": result.reason});
  } else {
    next();
  }
}
app.use(checkBan);

// web version
app.use('/web', express.static('web'));
app.get('/', (req, res) => {
  return res.redirect("/web");
})

// Unused, simple API test
app.get('/api/test', (req, res) => {
  res.set('Content-Type', 'application/json');
  res.status(200).send({"result": "Online"});
  console.log(`${req.ip} requested API status`);
});

// Grab rooms
app.get('/api/rooms', verifyToken, (req, res) => {
  res.set('Content-Type', 'application/json');
  res.status(200).send(ROOMS);
  console.log("Sent room list");
});

// {"room": "general", "content": "test", "platform": "Web", "img": "[image url]"}
app.post('/api/chat', verifyToken, async (req, res) => {
  var data = req.body
  if (!ROOMS.includes(data.room)) {
    return res.status(200).send({"error": "Room not found"});
  }
  if (data.room == "announcements") {
    console.log("Message in announcements:");
    if (!(await userdb.isAdmin(req.uid))) {
      console.log("Not enough rights");
      return res.send({"error": "No permission"});
    }
  }
  const isbanned = await userdb.isUserBanned(req.uid);
  if (isbanned) {
    const reason = isbanned.reason;
    return res.status(200).send({"error": "Banned", "reason": reason});
  }
  if (data.content.length > MESSAGE_LIMIT) {
    return res.status(200).send({"error": "Message too long", "limit": MESSAGE_LIMIT});
  }
  console.log(`[${req.ip}] ${req.uid}: ${JSON.stringify(req.body)}`);

  var censored = censor(data.content)
  var name = (await userdb.getUser(req.uid)).username
  var result = {
    "author": {
      "id": req.uid,
      "name": name
    },
    "content": censored,
    "room": data.room,
    "pfp": "img/pfp.png", // placeholder
    "platform": "img/plt/web.png" // placeholder
  }

  if (chatHistory[data.room]) {
    chatHistory[data.room].push(result);

    // drop the oldest message if we exceed it
    if (chatHistory[data.room].length > HISTORY_LIMIT) {
      chatHistory[data.room].splice(0, chatHistory[data.room].length - HISTORY_LIMIT)
    }
  }

  console.log("sent", JSON.stringify(result))
  ws_server.clients.forEach(client => {
    client.send(JSON.stringify(result));
  });
  return res.status(200).send({"result": "Success"});
});


// {"username": "orstando", "password": "wowsopassword"}
app.post('/api/signup', async (req, res) => {
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
  if (await userdb.doesUnameExist(username)) {
    console.log("Signup: account already in use");
    return res.send({"error": "Username unavailable"});
  }
  await userdb.createUser(username, password);
  const newUserId = await userdb.getUIDByName(username)
  console.log(newUserId)
  const token = jwt.sign({id: newUserId}, TOKEN_SECRET, { expiresIn: '1h' });
  console.log("Account created!");
  return res.status(200).send({"token": token});
});

// {"username": "orstando", "password": "wowsopassword"}
app.post('/api/login', async (req, res) => {
  const data = req.body
  const username = data.username;
  const password = data.password;

  const id = await userdb.getUIDByName(username);
  console.log(id)
  const user = await userdb.getUser(id)
  if (!user || !(await bcrypt.compare(password, (new TextDecoder().decode(user.password))))) {
    console.log("Wrong password");
    return res.send({"error": "Incorrect username or password"});
  }

  const isbanned = await userdb.isUserBanned(user.id);
  if (isbanned) {
    const reason = isbanned.reason;
    return res.status(200).send({"error": "Banned", "reason": reason});
  }

  const token = jwt.sign({ id: user.id }, TOKEN_SECRET, { expiresIn: '1h' });
  console.log("Client logged in!");
  return res.status(200).send({"token": token});
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: function (req) {
      return {
        path: '/',
        httpOnly: true,
        secure: req.secure,
        maxAge: 3600000
      }
    }
}));

app.use(express.text());
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

app.use(express.json());

app.get('/api/online', async (req, res) => {
  room = req.query.room;
  // get online count for room, currently placeholder
  res.status(200).send({"count": 1})
})

app.get('/api/isadmin', async (req, res) => {
  const id = req.query.id;
  const result = !!userdb.isAdmin(id)
  res.status(200).send({"result": result})
});
app.get('/api/idfromname', async (req, res) => {
  const username = req.query.name;
  const result = userdb.getUIDByName(username);
  res.status(200).send({"result": result});
})

app.get('/api/history', verifyToken, async (req, res) => {
  const room = req.query.room;
  let messages = []
  if(room) {
    const history = chatHistory[room]
    if(history) {
      for(const msg of history) {
        messages.push(msg);
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

server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Chatterbox running on port ${PORT}`);
});

// Websocket server
const ws_server = new websocket.Server({ server: server, clientTracking: true });
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