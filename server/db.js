const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

function getDbConfig() {
  const mysqlUrl = process.env.MYSQL_URL;
  if (mysqlUrl) {
    try {
      const parsed = new URL(mysqlUrl);
      const useSsl = process.env.MYSQL_SSL === 'true' || parsed.searchParams.has('ssl');
      const cfg = {
        host: parsed.hostname,
        port: parseInt(parsed.port, 10) || 3306,
        user: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        database: parsed.pathname.slice(1),
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        dateStrings: true,
        connectTimeout: 10000,
        enableCleartextPlugin: true,
        ...(useSsl && { ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } })
      };
      console.log(`Connecting to MySQL at ${cfg.host}:${cfg.port}/${cfg.database}`);
      return cfg;
    } catch {
    }
  }

  const host = process.env.MYSQL_HOST || process.env.FINSIGHT_DB_HOST;
  if (host) {
    const useSsl = process.env.MYSQL_SSL === 'true' || process.env.DB_SSL === 'true';
    const cfg = {
      host,
      port: parseInt(process.env.MYSQL_PORT || process.env.FINSIGHT_DB_PORT || '3306', 10),
      user: process.env.MYSQL_USER || process.env.FINSIGHT_DB_USER || 'root',
      password: process.env.MYSQL_PASSWORD || process.env.FINSIGHT_DB_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || process.env.FINSIGHT_DB_NAME || 'finsight',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      dateStrings: true,
      connectTimeout: 10000,
      enableCleartextPlugin: true,
      ...(useSsl && { ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } })
    };
    console.log(`Connecting to MySQL at ${cfg.host}:${cfg.port}/${cfg.database}`);
    return cfg;
  }

  console.log('No MySQL env vars configured — database features will not work.');
  return {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    database: 'finsight',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true,
    connectTimeout: 10000
  };
}

const pool = mysql.createPool(getDbConfig());

async function initializeSchema() {
  let conn;
  try {
    conn = await pool.getConnection();
    const schemaPath = path.join(__dirname, 'database', 'schema_railway.sql');
    if (fs.existsSync(schemaPath)) {
      const rawSql = fs.readFileSync(schemaPath, 'utf8');
      const cleanSql = rawSql
        .split('\n')
        .filter(line => !line.trim().startsWith('--'))
        .join('\n');
      const statements = cleanSql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.toUpperCase().startsWith('CREATE DATABASE') && !s.toUpperCase().startsWith('USE '));

      if (statements.length === 0) {
        console.warn('Schema initialization warning: 0 statements parsed from schema file.');
        return;
      }

      let executedCount = 0;
      for (const stmt of statements) {
        await conn.execute(stmt);
        executedCount++;
      }
      console.log(`Database schema initialized successfully (${executedCount} statements executed)`);
    }
  } catch (err) {
    console.error('Schema initialization error:', err.message);
  } finally {
    if (conn) {
      try { conn.release(); } catch {}
    }
  }
}

const DEFAULT_INCOME_CATEGORIES = [
  ['Salary', '💵', '#22c55e'],
  ['Freelance', '💻', '#3b82f6'],
  ['Investments', '📈', '#a855f7'],
  ['Other Income', '💵', '#06b6d4'],
];

const DEFAULT_EXPENSE_CATEGORIES = [
  ['Food & Dining', '🍲', '#ef4444'],
  ['Rent', '🏠', '#f97316'],
  ['Transport', '🚗', '#eab308'],
  ['Utilities', '💡', '#64748b'],
  ['Entertainment', '🎬', '#ec4899'],
  ['Healthcare', '🏥', '#14b8a6'],
  ['Shopping', '🛍️', '#8b5cf6'],
  ['Education', '📚', '#6366f1'],
  ['Other', '📁', '#78716c'],
];

async function seedCategories(connection, userId) {
  for (const [name, icon, color] of DEFAULT_INCOME_CATEGORIES) {
    await connection.execute(
      'INSERT INTO categories (user_id, name, type, icon, color) VALUES (?, ?, ?, ?, ?)',
      [userId, name, 'income', icon, color]
    );
  }
  for (const [name, icon, color] of DEFAULT_EXPENSE_CATEGORIES) {
    await connection.execute(
      'INSERT INTO categories (user_id, name, type, icon, color) VALUES (?, ?, ?, ?, ?)',
      [userId, name, 'expense', icon, color]
    );
  }
}

module.exports = {
  pool,
  seedCategories,
  initializeSchema
};
