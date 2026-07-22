const path = require('path');
const fs = require('fs');

const USERS_FILE = path.join(__dirname, 'data', 'users.json');

// Read the users file
function readUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      return { users: [], admins: [] };
    }
    const data = fs.readFileSync(USERS_FILE);
    return JSON.parse(data);
  } catch (err) {
    console.error("Failed to read users.json:", err);
    return { users: [] };
  }
}

// Write to the users file
function writeUsers(data) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

module.exports = { readUsers, writeUsers }