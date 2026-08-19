pluginutil = null

function onmessage(data) {
    console.log("Recieved:", data);
    pluginutil.sendMessage({"author": { "id": 0, "name": "exampleplugin" }, "content": "recieved message", "room": data.data.room, "pfp": "img/pfp.png", "platform": "img/plt/web.png"})
}

function init(pluginutilarg) {
    pluginutil = pluginutilarg;
    return onmessage
}

module.exports = init;