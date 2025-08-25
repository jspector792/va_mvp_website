const { createServer } = require('node:http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Use Railway's PORT env var, default to 3000 locally
// const port = process.env.PORT || 3000;
const port = 3000;
// Listen on all interfaces, not just localhost
const hostname = '0.0.0.0';

const server = createServer((req, res) => {
  const parsedUrl = url.parse(req.url);
  let pathname = parsedUrl.pathname;
  
  if (pathname === '/') {
    pathname = '/index.html';
  }

  if (pathname.startsWith('/js/') && pathname.endsWith('.html')) {
    pathname = pathname.replace('/js/', '/');
  }

  let filePath = path.join(__dirname, 'public', pathname);
  const extname = path.extname(filePath);

  let contentType = 'text/html';
  switch (extname) {
    case '.js': contentType = 'text/javascript'; break;
    case '.css': contentType = 'text/css'; break;
    case '.json': contentType = 'application/json'; break;
    case '.png': contentType = 'image/png'; break;
    case '.jpg': contentType = 'image/jpg'; break;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code == 'ENOENT') {
        fs.readFile(path.join(__dirname, 'public', '404.html'), (err, content) => {
          res.writeHead(404, { 'Content-Type': 'text/html' });
          res.end(content || '404 Not Found', 'utf-8');
        });
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
