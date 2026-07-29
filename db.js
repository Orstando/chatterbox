const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

class UserDatabase {
  constructor() {
    this.db = new DatabaseSync(path.join(__dirname, 'data', 'users.db'));
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TINYTEXT,
        password BINARY(40),
        ip TEXT(15)
      );
      CREATE TABLE IF NOT EXISTS bannedusers (
        id INTEGER,
        ip TEXT(15),
        reason TEXT
      );
      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER,
        type TINYINT
      );
    `);
  }
  async getUIDByName(username) {
    return this.db.prepare("SELECT id FROM users WHERE username = ?").get(username).id;
  }
  async getUser(uid) {
    return this.db.prepare("SELECT * FROM users WHERE id = ?").get(uid);
  }
  async createUser(username, password) {
    const hashedPassword = Buffer.from(await bcrypt.hash(password, 10));
    return this.db.prepare("INSERT INTO users (username, password, ip) VALUES (?, ?, ?)").run(username, hashedPassword, "x.x.x.x");
  }
  async updateIp(uid, ip) {
    this.db.prepare("UPDATE users SET ip = ? WHERE id = ?").run(ip, uid);
  }
  async isIpBanned(ip) {
    return this.db.prepare("SELECT * FROM bannedusers WHERE ip = ?").get(ip);
  }
  async isUserBanned(uid) {
    return this.db.prepare("SELECT * FROM bannedusers WHERE id = ?").get(uid);
  }
  async isAdmin(uid) {
    return this.db.prepare("SELECT type FROM admins WHERE id = ?").get(uid);
  }
  async banUser(uid, reason) {
    reason = reason || "No reason specified"
    const ip = this.db.prepare("SELECT ip FROM users WHERE id = ?").get(uid);
    this.db.prepare("INSERT INTO bannedusers (id, ip, reason) VALUES (?, ?, ?)").run(uid, ip, reason);
  }
  async doesUnameExist(username) {
    return !!this.db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  }
}
// wip
class MessageDatabase {
  constructor() {
    this.db = new DatabaseSync(path.join(__dirname, 'data', 'messages.db'));
  }
}

module.exports = { UserDatabase, MessageDatabase }