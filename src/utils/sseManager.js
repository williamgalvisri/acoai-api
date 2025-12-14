let clients = [];

exports.addClient = (res) => {
    clients.push(res);
};

exports.removeClient = (res) => {
    clients = clients.filter(client => client !== res);
};

exports.sendEvent = (eventName, data) => {
    clients.forEach(client => {
        client.write(`event: ${eventName}\n`);
        client.write(`data: ${JSON.stringify(data)}\n\n`);
    });
};
