function onmessage(data) {
    console.log("Recieved:", data)
}

function init() {
    return onmessage
}

module.exports = init;