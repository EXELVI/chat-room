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
})



io.on('connection', (socket) => {
    io.emit('system message', '+ User connected');
    socket.on('chat message', (msg) => {
        var user = socket.id;
        io.emit('chat message', { msg: msg, user });
    });

    socket.on('disconnect', () => {
        console.log('- User disconnected');
        io.emit('system message', 'User disconnected');
    });
});



const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
