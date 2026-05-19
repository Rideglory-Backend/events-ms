const net = require('net');

const PORT = process.env.PORT || 3003;

const socket = new net.Socket();
socket.setTimeout(4000);

socket
  .connect(PORT, 'localhost', () => {
    socket.destroy();
    process.exit(0);
  })
  .on('error', () => {
    socket.destroy();
    process.exit(1);
  })
  .on('timeout', () => {
    socket.destroy();
    process.exit(1);
  });
