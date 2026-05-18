const http = require('http');

const PORT = process.env.PORT || 3000;

const req = http.request(
  { host: 'localhost', port: PORT, path: '/health', timeout: 4000 },
  (res) => process.exit(res.statusCode === 200 ? 0 : 1),
);

req.on('error', () => process.exit(1));
req.on('timeout', () => { req.destroy(); process.exit(1); });
req.end();
