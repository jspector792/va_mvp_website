const express = require('express');
const compression = require('compression');
const path = require('path');

const app = express();

// Enable gzip compression for all responses
app.use(compression());

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// Fallback for unknown routes → serve 404.html if it exists
app.use((req, res, next) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'), err => {
    if (err) {
      res.status(404).send('404 Not Found');
    }
  });
});

// Railway provides process.env.PORT; fallback to 3000 locally
const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}/`);
});
