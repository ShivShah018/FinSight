const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { getJwtSecret } = require('./jwtConfig');

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ detail: 'Not authenticated' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      const secret = getJwtSecret();
      decoded = jwt.verify(token, secret);
    } catch (err) {
      if (err.message && err.message.startsWith('FATAL CONFIGURATION ERROR')) {
        console.error(err.message);
        return res.status(500).json({ detail: 'Authentication service misconfigured' });
      }
      return res.status(401).json({ detail: 'Invalid or expired token' });
    }

    const userId = decoded.sub;
    if (!userId) {
      return res.status(401).json({ detail: 'Invalid token payload' });
    }

    // Verify user exists in database
    const [rows] = await pool.execute(
      'SELECT id, full_name, email, currency, preferred_currency FROM users WHERE id = ?',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(401).json({ detail: 'User not found' });
    }

    // Attach user to request
    req.user = {
      id: rows[0].id,
      full_name: rows[0].full_name,
      email: rows[0].email,
      currency: rows[0].currency,
      preferred_currency: rows[0].preferred_currency
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ detail: 'Internal server error' });
  }
}

module.exports = authMiddleware;
