const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const socketIo = require('socket.io');
const logger = require('morgan');
const { type } = require('os');
const markdown = require('markdown-it')();

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

var usersTyping = {};

const MESSAGE_LIMIT = 5;
const TIME_FRAME = 5000;

let messageCount = {};

const activities = [];


//TicTacToe/Tris
function checkDraw(board) {
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            if (board[i][j] === '') {
                return false;
            }
        }
    }
    return true;
}

function checkWin(board, player) {
    for (let i = 0; i < 3; i++) {
        if (board[i][0] === player && board[i][1] === player && board[i][2] === player) {
            return true;
        }
        if (board[0][i] === player && board[1][i] === player && board[2][i] === player) {
            return true;
        }
    }
    if (board[0][0] === player && board[1][1] === player && board[2][2] === player) {
        return true;
    }
    if (board[0][2] === player && board[1][1] === player && board[2][0] === player) {
        return true;
    }
    return false;
}

io.on('connection', (socket) => {
    let currentChannel = 'general';
    socket.join(currentChannel);
    channels[currentChannel].push(socket.id);
    updateChannelsAndUsers();
    io.to(currentChannel).emit('system message', { msg: `+ User ${socket.id} connected`, type: "success" });

    socket.on('join channel', (channel) => {
        socket.leave(currentChannel);
        channels[currentChannel] = channels[currentChannel].filter(id => id !== socket.id);
        if (currentChannel !== channel) {
            io.to(currentChannel).emit('system message', { msg: `- User ${socket.id} left channel ${currentChannel}`, type: "danger" });
            currentChannel = channel;
        }
        socket.join(currentChannel);
        channels[currentChannel].push(socket.id);
        updateChannelsAndUsers();
        io.to(currentChannel).emit('system message', { msg: `+ User ${socket.id} joined channel ${currentChannel}`, type: "success" });
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

        if (!messageCount[user]) {
            messageCount[user] = [];
        }

        const currentTime = Date.now();
        messageCount[user] = messageCount[user].filter(timestamp => currentTime - timestamp < TIME_FRAME);
        if (messageCount[user].length > MESSAGE_LIMIT) {
            socket.emit('system message', { msg: 'You are sending messages too quickly', type: 'danger' });
            socket.emit('set input', msg);
            return;
        }

        messageCount[user].push(currentTime);


        io.to(channel).emit('chat message', { channel, user, msg: markdown.render(msg), msgRaw: msg });
        if (usersTyping[channel]) {
            usersTyping[channel] = usersTyping[channel].filter(id => id !== socket.id);
            socket.broadcast.to(channel).emit('typing', usersTyping[channel]);
        }
    });

    socket.on('disconnect', () => {
        channels[currentChannel] = channels[currentChannel].filter(id => id !== socket.id);
        updateChannelsAndUsers();
        io.to(currentChannel).emit('system message', { msg: `- User ${socket.id} disconnected`, type: "danger" });
        if (usersTyping[currentChannel]) {
            usersTyping[currentChannel] = usersTyping[currentChannel].filter(id => id !== socket.id);
            socket.broadcast.to(currentChannel).emit('typing', usersTyping[currentChannel]);
        }
        var activity = activities.find(activity => activity.player1 === socket.id || activity.player2 === socket.id);
        if (activity) {
            io.to(currentChannel).emit('activity stop', activity);
            activities.splice(activities.indexOf(activity), 1); 
        }
    });


    socket.on('typing', () => {
        usersTyping[currentChannel] = usersTyping[currentChannel] || [];
        if (!usersTyping[currentChannel].includes(socket.id)) {
            usersTyping[currentChannel].push(socket.id);
        }
        socket.broadcast.to(currentChannel).emit('typing', usersTyping[currentChannel]);
    });

    socket.on('stop typing', () => {
        usersTyping[currentChannel] = usersTyping[currentChannel] || [];
        usersTyping[currentChannel] = usersTyping[currentChannel].filter(id => id !== socket.id);
        socket.broadcast.to(currentChannel).emit('typing', usersTyping[currentChannel]);
    });

    socket.on('create activity', (data) => {
       if (data.type == "tris") {
        const activity = {
            player1: socket.id,
            player2: data.user,
            type: data.type,
            channel: currentChannel,
            board: [['', '', ''], ['', '', ''], ['', '', '']],
            currentPlayer: "X",
            win: false, 
            draw: false,
            startTime: Date.now(),
            id: Math.floor(Math.random() * 1000000)
        }
        activities.push(activity);
        socket.emit('set input', "");
        io.to(currentChannel).emit('activity created', activity);
       }
    })

    socket.on('tris move', (data) => {
        const activity = activities.find(activity => activity.id == data.id);
        if (!activity) {
            return socket.emit('system message', { msg: 'Activity not found', type: 'danger' });
        }
        if (activity.player1 !== socket.id && activity.player2 !== socket.id) {
            return socket.emit('system message', { msg: 'You are not a player', type: 'danger' });
        }
        if (activity.currentPlayer !== "X" && activity.player1 === socket.id) {
            return socket.emit('system message', { msg: 'Not your turn', type: 'danger' });
        }
        if (activity.currentPlayer !== "O" && activity.player2 === socket.id) {
            return socket.emit('system message', { msg: 'Not your turn', type: 'danger' });
        }
        var col = data.move % 3,
        row = Math.floor(data.move / 3);
        if (activity.board[row][col] !== "") {
            return socket.emit('system message', { msg: 'Invalid move', type: 'danger' });
        }
        activity.board[row][col] = activity.currentPlayer;
        if (checkWin(activity.board, activity.currentPlayer)) {
            activity.win = true;
            return io.to(currentChannel).emit('activity update', activity);
        }
        if (checkDraw(activity.board)) {
            activity.draw = true;
            return io.to(currentChannel).emit('activity update', activity);
        }
        activity.currentPlayer = activity.currentPlayer === "X" ? "O" : "X";
        io.to(currentChannel).emit('activity update', activity);      
    })
});

function updateChannelsAndUsers() {
    const channelNames = Object.keys(channels);
    const channelArray = []; //{name: 'general', users: 5}
    channelNames.forEach(channel => {
        channelArray.push({ name: channel, users: channels[channel].length });
    });
    io.emit('update channels', channelArray);
    channelNames.forEach(channel => {
        io.to(channel).emit('update users', channels[channel]);
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

process.on('SIGINT', () => {
    console.log('Shutting down server');
    io.emit('system message', { msg: 'Server shutting down', type: 'danger' });
    server.close();
    process.exit();
});

process.on('uncaughtException', (err) => {
    console.log('Uncaught exception', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.log('Unhandled rejection', reason);
});

