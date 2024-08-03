const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const socketIo = require('socket.io');
const logger = require('morgan');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(logger('dev'));

app.get('/', (req, res) => {
    res.render('index');
});

const channels = { general: [], random: [], tech: [] };

io.on('connection', (socket) => {
    let currentChannel = 'general';
    socket.join(currentChannel);
    channels[currentChannel].push(socket.id);
    updateChannelsAndUsers();
    io.to(currentChannel).emit('system message', '+ User ' + socket.id + ' connected');

    socket.on('join channel', (channel) => {
        socket.leave(currentChannel);
        channels[currentChannel] = channels[currentChannel].filter(id => id !== socket.id);
        io.to(currentChannel).emit('system message', `- User ${socket.id} left channel ${currentChannel}`);
        currentChannel = channel;
        socket.join(currentChannel);
        channels[currentChannel].push(socket.id);
        updateChannelsAndUsers();
        io.to(currentChannel).emit('system message', `+ User ${socket.id} joined channel ${currentChannel}`);
    });

    socket.on('create channel', (newChannel) => {
        if (!channels[newChannel]) {
            channels[newChannel] = [];
            updateChannelsAndUsers();
        }
    });

    socket.on('chat message', (data) => {
        const { channel, msg } = data;
        const user = socket.id;
        io.to(channel).emit('chat message', { channel, msg, user });
        io.to(channel).emit('stop typing', socket.id);
    });

    socket.on('disconnect', () => {
        channels[currentChannel] = channels[currentChannel].filter(id => id !== socket.id);
        updateChannelsAndUsers();
        io.to(currentChannel).emit('system message', '- User ' + socket.id + ' disconnected');
    });

    socket.on('typing', () => {
        socket.broadcast.to(currentChannel).emit('typing', socket.id);
    });

    socket.on('stop typing', () => {
        socket.broadcast.to(currentChannel).emit('stop typing', socket.id);
    });
});

function updateChannelsAndUsers() {
    const channelNames = Object.keys(channels);
    io.emit('update channels', channelNames);
    channelNames.forEach(channel => {
        io.to(channel).emit('update users', channels[channel]);
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
