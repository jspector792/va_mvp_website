const { createServer } = require('node:http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const hostname = '127.0.0.1';
const port = 3000;

const server = createServer((req, res) => {
  // Parse the request URL to handle query parameters
  const parsedUrl = url.parse(req.url);
  let pathname = parsedUrl.pathname;
  
  // Set default file for root path
  if (pathname === '/') {
    pathname = '/index.html';
  }

  // Fix common path issues (remove '/js/' prefix if accidentally added)
  if (pathname.startsWith('/js/') && pathname.endsWith('.html')) {
    pathname = pathname.replace('/js/', '/');
  }

  // Determine the file path
  let filePath = path.join(__dirname, 'public', pathname);
  const extname = path.extname(filePath);
  
  // Set content type based on file extension
  let contentType = 'text/html';
  switch (extname) {
    case '.js':
      contentType = 'text/javascript';
      break;
    case '.css':
      contentType = 'text/css';
      break;
    case '.json':
      contentType = 'application/json';
      break;
    case '.png':
      contentType = 'image/png';
      break;
    case '.jpg':
      contentType = 'image/jpg';
      break;
  }

  // Read and serve the file
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code == 'ENOENT') {
        // Special handling for page transitions
        if (pathname.startsWith('/page') && pathname.endsWith('.html')) {
          // Try serving the page without .html extension
          const altPath = path.join(__dirname, 'public', pathname.replace('.html', '') + '.html');
          fs.readFile(altPath, (err, content) => {
            if (err) {
              // Final fallback to 404
              fs.readFile(path.join(__dirname, 'public', '404.html'), (err, content) => {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end(content, 'utf-8');
              });
            } else {
              res.writeHead(200, { 'Content-Type': contentType });
              res.end(content, 'utf-8');
            }
          });
        } else {
          // Normal 404 handling
          fs.readFile(path.join(__dirname, 'public', '404.html'), (err, content) => {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end(content, 'utf-8');
          });
        }
      } else {
        // Some server error
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      // Success - serve the file with query parameters preserved
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
  console.log(`Test pages:
  - Page 1: http://${hostname}:${port}/page1.html
  - Page 2: http://${hostname}:${port}/page2.html?ancestry=meta&pvalue=1e-04
  `);
});