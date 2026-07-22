class Client {
  constructor(useragent, url, httpport, socketport) {
    this.ua = useragent || "ChB-WebLib";
    this.url = url ? "http://"+url+':'+httpport : ''; // if url is empty, use current server ip/port (as in, the server that this web client is on)
    this.ws = new WebSocket('ws://'+url+':'+socketport);
    this.ws.onopen = function() {
      console.log('Connected via WebSocket');
    }
    this.ws.onmessage = (event) => {
      var data = JSON.parse(event.data)
      if (this.onMessage) { // check if callback has been created yet
        this.onMessage(data);
      };
    }
    this.ws.onerror = (err) => {
      if (this.onError) {
        this.onError(err);
      };
    }
    this.ws.onclose = () => {
      if (this.onClose) {
        this.onClose();
      };
    }
  }
  async signup(username, password) {
    const response = await fetch(this.url+"/api/signup", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': this.ua
      },
      body: JSON.stringify({"username": username, "password": password})
    })
    const data = await response.json();
    return data;
  }
  async login(username, password) {
    const response = await fetch(this.url+"/api/login", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': this.ua
        },
        body: JSON.stringify({"username": username, "password": password})
    })
    const data = await response.json();
    console.log(data)
    return data;
  }
  async send(token, msg, room, platform, img) {
    if (!platform) {platform="Web"}
    const response = await fetch(this.url+"/api/chat", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': this.ua,
          'Authorization': token
        },
        body: JSON.stringify({"room": room, "content": msg, "platform": platform, "img": img})
    })
    const data = await response.json();
    return data;
  }
  async test() {
    const response = await fetch(this.url+"/api/test", {
        method: 'GET'
    })
    const data = await response.json();
    return data.result;
  }
  async rooms(token) {
    const response = await fetch(this.url+"/api/rooms", {
        method: 'GET',
        headers: {
          'Content-Type': 'text/plain',
          'User-Agent': this.ua,
          'Authorization': token
        }
    })
    const data = await response.json();
    return data
  }
  async info(token, infotype) {
    const response = await fetch(this.url+"/api/"+infotype, {
      method: 'GET',
      headers: {
        'Content-Type': 'text/plain',
        'User-Agent': this.ua,
        'Authorization': token
      }
    })
    const data = await response.text();
    return data;
  }
  async online(token, room) {
    const response = await fetch(this.url+"/api/online", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': this.ua,
        'Authorization': token
      },
      body: JSON.stringify({"room": room})
    })
    const data = await response.json();
    return data.count;
  }
}
