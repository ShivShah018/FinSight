const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool, seedCategories } = require('../db');
const { sendPasswordResetEmail } = require('../utils/emailService');

const resetRateLimitMap = new Map();

const JWT_SECRET = process.env.JWT_SECRET_KEY || 'finsight-jwt-secret-change-in-production';
const JWT_EXPIRATION_MINUTES = parseInt(process.env.JWT_EXPIRATION_MINUTES || '1440', 10);

function createAccessToken(userId, email) {
  const expires = Math.floor(Date.now() / 1000) + (JWT_EXPIRATION_MINUTES * 60);
  return jwt.sign({ sub: userId.toString(), email, exp: expires }, JWT_SECRET);
}

const authController = {
  register: async (req, res) => {
    let connection;
    try {
      const { full_name, email, password } = req.body;
      if (!full_name || !email || !password) {
        return res.status(400).json({ detail: 'Missing required fields' });
      }

      const trimmedName = full_name.trim();
      const trimmedEmail = email.trim().toLowerCase();

      connection = await pool.getConnection();
      await connection.beginTransaction();

      // Check if user already exists
      const [existingUsers] = await connection.execute(
        'SELECT id FROM users WHERE email = ?',
        [trimmedEmail]
      );

      if (existingUsers.length > 0) {
        connection.release();
        return res.status(409).json({ detail: 'Email already registered.' });
      }

      // Hash password and insert
      const passwordHash = await bcrypt.hash(password, 10);
      const [result] = await connection.execute(
        'INSERT INTO users (full_name, email, password_hash, currency, preferred_currency) VALUES (?, ?, ?, ?, ?)',
        [trimmedName, trimmedEmail, passwordHash, 'USD', 'INR']
      );

      const userId = result.insertId;

      // Seed categories
      await seedCategories(connection, userId);

      await connection.commit();
      connection.release();

      const token = createAccessToken(userId, trimmedEmail);

      return res.status(200).json({
        access_token: token,
        user_id: userId,
        name: trimmedName,
        email: trimmedEmail
      });
    } catch (error) {
      if (connection) {
        await connection.rollback();
        connection.release();
      }
      console.error('Register error:', error);
      return res.status(500).json({ detail: 'Internal server error' });
    }
  },

  login: async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ detail: 'Missing email or password' });
      }

      const trimmedEmail = email.trim().toLowerCase();

      const [rows] = await pool.execute(
        'SELECT id, full_name, email, password_hash FROM users WHERE email = ?',
        [trimmedEmail]
      );

      if (rows.length === 0) {
        return res.status(401).json({ detail: 'Invalid email or password.' });
      }

      const user = rows[0];
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ detail: 'Invalid email or password.' });
      }

      const token = createAccessToken(user.id, user.email);

      return res.status(200).json({
        access_token: token,
        user_id: user.id,
        name: user.full_name,
        email: user.email
      });
    } catch (error) {
      console.error('Login error:', error);
      return res.status(500).json({ detail: 'Internal server error' });
    }
  },

  getMe: async (req, res) => {
    try {
      const user = req.user;
      return res.status(200).json({
        user_id: user.id,
        name: user.full_name,
        email: user.email,
        currency: user.preferred_currency
      });
    } catch (error) {
      console.error('Get profile error:', error);
      return res.status(500).json({ detail: 'Internal server error' });
    }
  },

  forgotPassword: async (req, res) => {
    try {
      const { email } = req.body;
      const genericResponse = {
        message: "If an account with that email exists, a password reset link has been sent."
      };

      if (!email || typeof email !== 'string') {
        return res.status(200).json(genericResponse);
      }

      const trimmedEmail = email.trim().toLowerCase();

      // Simple in-memory rate limiting check
      const now = Date.now();
      const lastSent = resetRateLimitMap.get(trimmedEmail);
      if (lastSent && now - lastSent < 60000) {
        return res.status(200).json(genericResponse);
      }
      resetRateLimitMap.set(trimmedEmail, now);

      const [rows] = await pool.execute(
        'SELECT id, email FROM users WHERE email = ?',
        [trimmedEmail]
      );

      if (rows.length > 0) {
        const user = rows[0];
        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(now + 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

        // Invalidate older unused tokens for this user
        await pool.execute(
          'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL',
          [user.id]
        );

        // Store hashed token
        await pool.execute(
          'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
          [user.id, tokenHash, expiresAt]
        );

        // Send email with raw token
        const result = await sendPasswordResetEmail(user.email, rawToken);
        if (!result.success) {
          console.error(`[authController] Password reset email failed for ${user.email}: ${result.error}`);
        }
      } else {
        console.log(`[authController] Forgot password requested for email not found in database: ${trimmedEmail}`);
      }

      return res.status(200).json(genericResponse);
    } catch (error) {
      console.error('Forgot password error:', error);
      return res.status(200).json(genericResponse);
    }
  },

  resetPassword: async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        return res.status(400).json({ detail: 'Invalid or expired password reset link.' });
      }

      if (password.length < 6) {
        return res.status(400).json({ detail: 'Password must be at least 6 characters.' });
      }

      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const [tokens] = await pool.execute(
        'SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?',
        [tokenHash]
      );

      if (tokens.length === 0) {
        return res.status(400).json({ detail: 'Invalid or expired password reset link.' });
      }

      const tokenRecord = tokens[0];

      if (tokenRecord.used_at !== null || new Date(tokenRecord.expires_at) < new Date()) {
        return res.status(400).json({ detail: 'Invalid or expired password reset link.' });
      }

      // Hash new password and update user
      const passwordHash = await bcrypt.hash(password, 10);
      await pool.execute(
        'UPDATE users SET password_hash = ? WHERE id = ?',
        [passwordHash, tokenRecord.user_id]
      );

      // Mark token as used
      await pool.execute(
        'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ?',
        [tokenRecord.user_id]
      );

      return res.status(200).json({ message: 'Password reset successfully.' });
    } catch (error) {
      console.error('Reset password error:', error);
      return res.status(500).json({ detail: 'Internal server error' });
    }
  }
};

module.exports = authController;
