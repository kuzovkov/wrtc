var fs = require('fs');
var static = require('node-static');
var https = require('https');
var port = 1234;
var options = {
    key: fs.readFileSync('cert/key.pem'),
    cert: fs.readFileSync('cert/cert.pem')
};
var file = new(static.Server)();
var app = https.createServer(options, function (req, res) {
    file.serve(req, res);

}).listen(port, function(){console.log('Server start ' + (new Date()).toLocaleString() + ' at port ' + port);});

var io = require('socket.io').listen(app);

io.sockets.on('connection', function (socket) {
    function log() {
        var array = [">>> "];
        for(var i = 0; i < arguments.length; i++) {
            array.push(arguments[i]);
        }
        socket.emit('log', array);
    }

    socket.on('message', function (message) {
        log('Got message: ', message);
        socket.broadcast.emit('message', message); // should be room only
    });

    socket.on('create or join', function (room) {
        var numClients = io.sockets.clients(room).length;

        log('Room ' + room + ' has ' + numClients + ' client(s)');
        log('Request to create or join room', room);

        if(numClients == 0) {
            socket.join(room);
            socket.emit('created', room);
        }

        else if(numClients == 1) {
            io.sockets.in(room).emit('join', room);
            socket.join(room);
            socket.emit('joined', room);
        }

        else { // max two clients
            socket.emit('full', room);
        }

        socket.emit('emit(): client ' + socket.id + ' joined room ' + room);
        socket.broadcast.emit('broadcast(): client ' + socket.id + ' joined room ' + room);
    });
});