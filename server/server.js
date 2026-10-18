require('dotenv').config();
const { initializeSchema } = require('./db');
const { validateJwtConfig } = require('./utils/jwtConfig');
const app = require('./app');

const PORT = process.env.API_PORT || process.env.PORT || 8000;
const HOST = process.env.API_HOST || '0.0.0.0';

async function start() {
  validateJwtConfig();
  await initializeSchema();

  const server = app.listen(PORT, HOST, () => {
    console.log(`FinSight Express API running on http://${HOST}:${PORT}`);
    console.log(`Health Check: http://${HOST}:${PORT}/health`);
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
    });
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
