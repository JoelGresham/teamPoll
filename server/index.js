require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

// Load config
const configPath = path.join(__dirname, '../config/config.json');
const config = fs.existsSync(configPath) ? require(configPath) : {};

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Import routes
const adminRoutes = require('./routes/admin');
const pollRoutes = require('./routes/poll');

// Import socket handlers
const initSocketHandlers = require('./socket/handlers');

// API Routes
app.use('/api/admin', adminRoutes);
app.use('/api/poll', pollRoutes);

// Serve admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin/index.html'));
});

// Serve poll page
app.get('/poll/:sessionId', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/poll/index.html'));
});

// Serve results page
app.get('/results/:sessionId', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/results/index.html'));
});

// Serve comparison page
app.get('/compare/:rerunSessionId/:originalSessionId', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/compare/index.html'));
});

// Home page redirect
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// Initialize WebSocket handlers
initSocketHandlers(io);

// Start server
const PORT = process.env.PORT || config.port || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Team Poll server running on port ${PORT}`);
  console.log(`Admin interface: http://localhost:${PORT}/admin`);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n${signal} received, shutting down gracefully...`);

  // Close Socket.io connections
  io.close(() => {
    console.log('Socket.io connections closed');

    // Close HTTP server
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });

  // Force exit after 5 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
