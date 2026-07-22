const express = require("express");
const session = require('express-session');
const bcrypt = require('bcryptjs');

const {readUsers, writeUsers} = require("./db")
const { TOKEN_SECRET, SESSION_SECRET, HTTP_PORT, SOCKET_PORT, WEBSOCKET_PORT, ROOMS } = require('./config');

const router = express.Router();

router.get('/login', async (req, res) => {
  res.send(`
    <form method="POST">
        <input name="username" placeholder="Username" required />
        <input name="password" type="password" placeholder="Password" required />
        <button type="submit">Login</button>
    </form>
    `);
});
router.post('/login', async (req, res) => {
  const {username, password} = req.body;
  const users = readUsers();
  const user = users.users.find(user => user.admin && user.username === username);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    console.log("Wrong password");
    return res.status(403).send(`<p>Wrong password.</p><a href='/admin/login'>Go back</a>`);
  }

  if (!user) {
    return res.status(403).send(`<p>Wrong password.</p><a href='/admin/login'>Go back</a>`);
  }

  req.session.admin = true;
  if (user.staff === true) {
    req.session.staff = true;
  }

  return res.redirect("/admin");
});

router.get('/', async (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }
  res.send(`
    <html>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100..900;1,100..900&display=swap" onload="this.onload=null;this.rel='stylesheet'">
        <noscript>
          <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100..900;1,100..900&display=swap">
        </noscript>

        <style>
          h1, p, h2, a {
            font-family: 'Roboto', Arial, sans-serif;
          }
        </style>
      </head>
      <body>
        <h2>User Negative Actions</h2>
        <a style='color: red;' href='/admin/mute'>Mute User</a><br>
        <a style='color: red;' href='/admin/ban'>Ban User</a><br>
        <a style='color: red;' href='/admin/delete'>Delete User</a><br>
        <h2>User Positive Actions</h2>
        <a style='color: green;' href='/admin/createAccount'>Create Account</a><br>
        <a style='color: #33351c;' href='/admin/unmute'>Unmute User</a><br>
        <a style='color: #e79b0d;' href='/admin/unban'>Unban User</a><br>
        <h2>Miscellaneous</h2>
        <a style='color: blue;' href='/admin/userinfo'>Check User Information</a><br>
        <a style='color: blue;' href='/admin/userswithip'>Check Users with IP</a><br>
        <a style='color: green;' href='/admin/changebanreason'>Change User Ban Reason</a><br>
      </body>
    </html>
  `);
});

router.get('/ban', async (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }
  return res.send(`
    <html>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100..900;1,100..900&display=swap" onload="this.onload=null;this.rel='stylesheet'">

        <style>
          h1, p, h2, a {
            font-family: 'Roboto', Arial, sans-serif;
          }
        </style>
      </head>
      <body>
      <h1>Ban User</h1>
      <form method="POST">
        <input name="username" placeholder="Username" required /><br><br>
        <input name="reason" placeholder="Reason" style="width: 300px;" /><br><br>
        <button type="submit">Ban</button>
    </form>
    </body>
    </html>
  `);
});

router.post('/ban', async (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }
  const {username, reason} = req.body;
  const users = readUsers();
  const user = users.users.find(user => user.username === username);
  if (user) {
    user.banned = true;
    user.banReason = reason || "No reason specified";
  }
  writeUsers(users);

  return res.send(`
    <p>User banned!</p>
    <p>Reason: ${reason || "No reason specified"}</p>
    <a href="/admin">Go back</a>
    `);
});
router.get('/unban', async (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }
  return res.send(`
    <html>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100..900;1,100..900&display=swap" onload="this.onload=null;this.rel='stylesheet'">

        <style>
          h1, p, h2, a {
            font-family: 'Roboto', Arial, sans-serif;
          }
        </style>
      </head>
      <body>
      <h1>Unban User</h1>
      <form method="POST">
        <input name="username" placeholder="Username to unban" /><br>
        <button type="submit">Unban</button>
    </form>
    </body>
    </html>
  `);
});

router.post('/unban', async (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }
  const {username} = req.body;
  const users = readUsers();
  const user = users.users.find(user => user.username === username);
  if (user) {
    user.banned = false;
    user.banReason = "";
  }
  writeUsers(users);

  return res.send(`
    <p>User unbanned!</p>
    <a href="/admin">Go back</a>
    `);
});

router.get('/delete', async (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }
  return res.send(`
    <html>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100..900;1,100..900&display=swap" onload="this.onload=null;this.rel='stylesheet'">

        <style>
          h1, p, h2, a {
            font-family: 'Roboto', Arial, sans-serif;
          }
        </style>
      </head>
      <body>
      <h1 style='color: red;'>Delete User</h1>
      <form method="POST">
        <input name="username" placeholder="Username" /><br>
        <button type="submit">Delete</button>
    </form>
    </body>
    </html>
  `);
});

router.post('/delete', async (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }
  const {username} = req.body;
  const users = readUsers();
  users.users = users.users.filter(user => user.username !== username);
  writeUsers(users);

  return res.send(`
    <p>User deleted!</p>
    <a href="/admin">Go back</a>
    `);
});
router.get('/mute', async (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }
  return res.send(`
    <html>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100..900;1,100..900&display=swap" onload="this.onload=null;this.rel='stylesheet'">

        <style>
          h1, p, h2, a {
            font-family: 'Roboto', Arial, sans-serif;
          }
        </style>
      </head>
      <body>
      <h1 style='color: red;'>Mute User</h1>
      <form method="POST">
        <input name="username" placeholder="Username" /><br>
        <button type="submit">Mute user</button>
    </form>
    </body>
    </html>
  `);
});

router.post('/mute', async (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }
  const { username } = req.body;
  const users = readUsers();
  const user = users.users.find(user => user.username === username);
  
  // Commit the mute to the database
  if (user) {
    user.muted = true;
    writeUsers(users);
    return res.send(`
      <p>User muted successfully.</p>
      <a href="/admin">Go back</a>
    `);
  }

  return res.send(`
    <p>User not found.</p>
    <a href="/admin">Go back</a>
  `);
});
router.get('/unmute', async (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }
  return res.send(`
    <html>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100..900;1,100..900&display=swap" onload="this.onload=null;this.rel='stylesheet'">

        <style>
          h1, p, h2, a {
            font-family: 'Roboto', Arial, sans-serif;
          }
        </style>
      </head>
      <body>
      <h1 style='color: green;'>Unmute User</h1>
      <form method="POST">
        <input name="username" placeholder="Username" /><br>
        <button type="submit">Unmute user</button>
    </form>
    </body>
    </html>
  `);
});

router.post('/unmute', async (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }
  const { username } = req.body;
  const users = readUsers();
  const user = users.users.find(user => user.username === username);
  
  if (user) {
    user.muted = false;
    writeUsers(users);
  }


  return res.send(`
    <p>User unmuted!</p>
    <a href="/admin">Go back</a>
  `);
});

router.get('/createAccount', async (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }
  return res.send(`
    <html>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100..900;1,100..900&display=swap" onload="this.onload=null;this.rel='stylesheet'">

        <style>
          h1, p, h2, a {
            font-family: 'Roboto', Arial, sans-serif;
          }
        </style>
      </head>
      <body>
      <h1 style='color: green;'>Create User</h1>
      <form method="POST">
        <input name="username" placeholder="Username" required /><br>
        <input name="password" placeholder="Password" /><br>
        <input name="passwordHash" placeholder="Password Hash" /><br>
        <button type="submit">Create Account</button>
    </form>
    </body>
    </html>
  `);
});

router.post('/createAccount', async (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }
  const {username, password, passwordHash} = req.body;
  

  const users = readUsers();
  if (users.users.find(user => user.username === username)) {
    console.log("Signup: account already in use");
    return res.status(409).send("ERR_USER_USED");
  }

  var hashedPassword;
  if (!passwordHash) {
    hashedPassword = await bcrypt.hash(password, 10);
  } else if (!password) {
    hashedPassword = passwordHash
  } else {
      return res.send(`
        <p>You need to at least include a password or a password hash.</p>
        <a href="/admin">Go back</a>
      `);
  }
  
  const newUser = { id: Date.now().toString(), username, password: hashedPassword, admin: false, ip: req.ip, banned: false, banReason: "", muted: false };
  users.users.push(newUser);
  writeUsers(users);

  return res.send(`
    <p>User created!</p>
    <a href="/admin">Go back</a>
  `);
});

router.get('/userinfo', async (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }
  return res.send(`
    <html>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100..900;1,100..900&display=swap" onload="this.onload=null;this.rel='stylesheet'">

        <style>
          h1, p, h2, a {
            font-family: 'Roboto', Arial, sans-serif;
          }
        </style>
      </head>
      <body>
      <h1 style='color: green;'>Check User Information</h1>
      <form method="POST">
        <input name="username" placeholder="Username" required /><br>
        <button type="submit">Grab Info</button>
    </form>
    </body>
    </html>
  `);
});

router.post('/userinfo', async (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }
  const {username} = req.body;
  
  const users = readUsers();
  const user = users.users.find(user => user.username === username);

  return res.send(`
    <p>Username: ${user.username}<br>Password Hash: ${user.password}<br>ID: ${user.id}<br>Banned: ${user.banned}<br>Ban Reason: ${user.banReason || "None"}<br>Muted: ${user.muted}<br>IP: <a href="#" onclick="return postName(this)">${user.ip}</a></p>
    <a href="/admin">Go back</a>
    <script>
      function postName(el) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/admin/userswithip';

        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'ip';
        input.value = '${user.ip}';

        form.appendChild(input);
        document.body.appendChild(form);
        form.submit();

        return false;
      }
    </script>
    `);
});

router.get('/userswithip', async (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }
  return res.send(`
    <html>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100..900;1,100..900&display=swap" onload="this.onload=null;this.rel='stylesheet'">

        <style>
          h1, p, h2, a {
            font-family: 'Roboto', Arial, sans-serif;
          }
        </style>
      </head>
      <body>
      <h1 style='color: green;'>Check Users with IP</h1>
      <form method="POST">
        <input name="ip" placeholder="IP" required /><br>
        <button type="submit">Submit</button>
    </form>
    </body>
    </html>
  `);
});

router.post('/userswithip', async (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }
  const {ip} = req.body;
  
  const users = readUsers()["users"];
  const matches = users.filter(item => item.ip === ip).map(item => item.username);
  const usernamesHtml = matches.map(username => `<a href="#" onclick="return postName(this)"><p>${username}</p></a>`).join("\n");

  return res.send(`
    ${usernamesHtml}
    <a href="/admin">Go back</a>
    <script>
    function postName(el) {
        const username = el.textContent.trim();

        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/admin/userinfo';

        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'username';
        input.value = username;

        form.appendChild(input);
        document.body.appendChild(form);
        form.submit();

        return false;
    }
    </script>
    `);
});

router.get('/changebanreason', async (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }
  return res.send(`
    <html>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100..900;1,100..900&display=swap" onload="this.onload=null;this.rel='stylesheet'">

        <style>
          h1, p, h2, a {
            font-family: 'Roboto', Arial, sans-serif;
          }
        </style>
      </head>
      <body>
      <h1 style='color: green;'>Change User Ban Reason</h1>
      <form method="POST">
        <input name="username" placeholder="Username" required /><br>
        <input name="reason" placeholder="Reason" required /><br>
        <button type="submit">Change Ban Reason</button>
    </form>
    </body>
    </html>
  `);
});

router.post('/changebanreason', async (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }
  const {username, reason} = req.body;
  const users = readUsers();
  const user = users.users.find(user => user.username === username);
  if (user) {
    user.banReason = reason || "No reason specified";
  }
  writeUsers(users);

  return res.send(`
    <p>Changed user ban reason!</p>
    <p>Reason: ${reason || "No reason specified"}</p>
    <a href="/admin">Go back</a>
    `);
});

module.exports = router;