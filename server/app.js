const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('./utils/authMiddleware');

// Import routers & controllers
const authRouter = require('./routes/auth');
const transactionsRouter = require('./routes/transactions');
const goalsRouter = require('./routes/goals');
const budgetsRouter = require('./routes/budgets');
const analyticsRouter = require('./routes/analytics');
const insightsRouter = require('./routes/insights');

const transactionController = require('./controllers/transactionController');
const analyticsController = require('./controllers/analyticsController');
const currencyController = require('./controllers/currencyController');

const app = express();

// Read version from package.json
let appVersion = '1.0.0';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  appVersion = pkg.version || appVersion;
} catch (e) { /* use default */ }
// Version source: server/package.json

// CORS — read origins from env, fall back to dev defaults
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(cors({ origin: corsOrigins, credentials: true }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get('/health', (req, res) => {
  return res.status(200).json({
    status: 'healthy',
    version: appVersion,
    email: {
      provider: 'resend',
      configured: !!process.env.RESEND_API_KEY,
      resend_api_key_set: !!process.env.RESEND_API_KEY,
      email_from_set: !!process.env.EMAIL_FROM,
      frontend_url: process.env.FRONTEND_URL || 'https://fin-sight-beta-dusky.vercel.app'
    }
  });
});

// Top-level unauthenticated routes
app.get('/currency/rates', currencyController.getRates);

// Mounted routes
app.use('/auth', authRouter);
app.use('/transactions', transactionsRouter);
app.use('/goals', goalsRouter);
app.use('/budgets', budgetsRouter);
app.use('/analytics', analyticsRouter);
app.use('/insights', insightsRouter);

// Top-level authenticated routes
app.get('/categories', authMiddleware, transactionController.listCategories);
app.get('/dashboard', authMiddleware, analyticsController.getDashboard);
app.post('/report/generate', authMiddleware, analyticsController.generateReport);

// 404 handler for unmatched routes
app.use((req, res) => {
  return res.status(404).json({ detail: `Route ${req.method} ${req.path} not found` });
});

// Global Exception Handler
app.use((err, req, res, next) => {
  console.error('Unhandled error on', req.method, req.path, err);
  return res.status(500).json({
    detail: 'Internal server error'
  });
});

module.exports = app;
