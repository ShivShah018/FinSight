const { pool } = require('../db');

const transactionController = {
  listTransactions: async (req, res) => {
    try {
      const userId = req.user.id;
      const rawLimit = parseInt(req.query.limit || '100', 10);
      const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 100 : rawLimit), 100);
      const month = req.query.month ? parseInt(req.query.month, 10) : null;
      const year = req.query.year ? parseInt(req.query.year, 10) : null;

      let query = `
        SELECT t.id, t.category_id, c.name AS category_name, 
               t.amount, t.type, t.currency, t.description, t.transaction_date
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = ? AND t.deleted_at IS NULL
      `;
      const params = [userId];

      if (year) {
        query += ' AND YEAR(t.transaction_date) = ?';
        params.push(year);
        if (month) {
          query += ' AND MONTH(t.transaction_date) = ?';
          params.push(month);
        }
      }

      query += ' ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT ?';
      params.push(limit);

      const [rows] = await pool.query(query, params);

      // Convert amount to float
      const transactions = rows.map(r => ({
        ...r,
        amount: parseFloat(r.amount)
      }));

      return res.status(200).json({
        transactions,
        total: transactions.length
      });
    } catch (error) {
      console.error('List transactions error:', error);
      return res.status(500).json({ detail: 'Internal server error' });
    }
  },

  getTransaction: async (req, res) => {
    try {
      const userId = req.user.id;
      const txId = req.params.tx_id;

      const [rows] = await pool.execute(`
        SELECT t.id, t.category_id, c.name AS category_name, 
               t.amount, t.type, t.currency, t.description, t.transaction_date
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.id = ? AND t.user_id = ?
      `, [txId, userId]);

      if (rows.length === 0) {
        return res.status(404).json({ detail: 'Transaction not found' });
      }

      const tx = rows[0];
      tx.amount = parseFloat(tx.amount);

      return res.status(200).json(tx);
    } catch (error) {
      console.error('Get transaction error:', error);
      return res.status(500).json({ detail: 'Internal server error' });
    }
  },

  createTransaction: async (req, res) => {
    try {
      const userId = req.user.id;
      const { category_id, amount, type, description, transaction_date, currency, is_bill } = req.body;

      if (!category_id || amount === undefined || amount === null || !type || !transaction_date) {
        return res.status(400).json({ detail: 'Missing required transaction fields' });
      }

      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0 || !isFinite(numAmount)) {
        return res.status(400).json({ detail: 'Amount must be a positive number' });
      }

      const parsedDate = new Date(transaction_date);
      if (isNaN(parsedDate.getTime()) || !/^\d{4}-\d{2}-\d{2}/.test(transaction_date)) {
        return res.status(400).json({ detail: 'Invalid date format' });
      }

      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (parsedDate > today) {
        return res.status(400).json({ detail: 'Transaction date cannot be in the future' });
      }

      const txCurrency = currency || 'INR';
      const txIsBill = is_bill ? 1 : 0;

      const [result] = await pool.execute(`
        INSERT INTO transactions (user_id, category_id, amount, type, currency, description, transaction_date, is_bill)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [userId, category_id, amount, type.toLowerCase(), txCurrency, description || null, transaction_date, txIsBill]);

      return res.status(201).json({
        id: result.insertId,
        message: 'Transaction created'
      });
    } catch (error) {
      console.error('Create transaction error:', error);
      return res.status(400).json({ detail: error.message });
    }
  },

  updateTransaction: async (req, res) => {
    try {
      const userId = req.user.id;
      const txId = req.params.tx_id;
      const { category_id, amount, type, description, transaction_date, currency } = req.body;

      if (transaction_date !== undefined && transaction_date !== null) {
        const parsedDate = new Date(transaction_date);
        if (isNaN(parsedDate.getTime()) || !/^\d{4}-\d{2}-\d{2}/.test(transaction_date)) {
          return res.status(400).json({ detail: 'Invalid date format' });
        }
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        if (parsedDate > today) {
          return res.status(400).json({ detail: 'Transaction date cannot be in the future' });
        }
      }

      const [existing] = await pool.execute(
        'SELECT category_id, amount, type, description, transaction_date, currency FROM transactions WHERE id = ? AND user_id = ?',
        [txId, userId]
      );

      if (existing.length === 0) {
        return res.status(404).json({ detail: 'Transaction not found' });
      }

      const current = existing[0];
      const newCategoryId = category_id !== undefined ? category_id : current.category_id;
      const newAmount = amount !== undefined ? amount : current.amount;
      const newType = type !== undefined ? type.toLowerCase() : current.type;
      const newDescription = description !== undefined ? description : current.description;
      const newDate = transaction_date !== undefined ? transaction_date : current.transaction_date;
      const newCurrency = currency !== undefined ? currency : current.currency;

      await pool.execute(`
        UPDATE transactions
        SET category_id = ?, amount = ?, type = ?, description = ?, transaction_date = ?, currency = ?
        WHERE id = ? AND user_id = ?
      `, [newCategoryId, newAmount, newType, newDescription, newDate, newCurrency, txId, userId]);

      return res.status(200).json({ message: 'Transaction updated' });
    } catch (error) {
      console.error('Update transaction error:', error);
      return res.status(404).json({ detail: error.message });
    }
  },

  deleteTransaction: async (req, res) => {
    try {
      const userId = req.user.id;
      const txId = req.params.tx_id;
      const soft = req.query.soft !== 'false'; // default to true

      if (soft) {
        await pool.execute(
          'UPDATE transactions SET deleted_at = NOW() WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
          [txId, userId]
        );
        return res.status(200).json({ message: 'Soft-deleted' });
      } else {
        await pool.execute(
          'DELETE FROM transactions WHERE id = ? AND user_id = ?',
          [txId, userId]
        );
        return res.status(200).json({ message: 'Permanently deleted' });
      }
    } catch (error) {
      console.error('Delete transaction error:', error);
      return res.status(500).json({ detail: 'Internal server error' });
    }
  },

  restoreTransaction: async (req, res) => {
    try {
      const userId = req.user.id;
      const txId = req.params.tx_id;

      await pool.execute(
        'UPDATE transactions SET deleted_at = NULL WHERE id = ? AND user_id = ?',
        [txId, userId]
      );

      return res.status(200).json({ message: 'Transaction restored' });
    } catch (error) {
      console.error('Restore transaction error:', error);
      return res.status(500).json({ detail: 'Internal server error' });
    }
  },

  getDeleted: async (req, res) => {
    try {
      const userId = req.user.id;

      const [rows] = await pool.execute(`
        SELECT t.id, t.category_id, c.name AS category_name, 
               t.amount, t.type, t.currency, t.description, t.transaction_date
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = ? AND t.deleted_at IS NOT NULL
        ORDER BY t.deleted_at DESC LIMIT 20
      `, [userId]);

      const transactions = rows.map(r => ({
        ...r,
        amount: parseFloat(r.amount)
      }));

      return res.status(200).json(transactions);
    } catch (error) {
      console.error('Get deleted transactions error:', error);
      return res.status(500).json({ detail: 'Internal server error' });
    }
  },

  listCategories: async (req, res) => {
    try {
      const userId = req.user.id;
      const type = req.query.type; // 'income' | 'expense' or undefined

      let query = 'SELECT id, name, type, icon, color FROM categories WHERE user_id = ?';
      const params = [userId];

      if (type) {
        query += ' AND type = ? ORDER BY name';
        params.push(type);
      } else {
        query += ' ORDER BY type, name';
      }

      const [rows] = await pool.execute(query, params);
      return res.status(200).json(rows);
    } catch (error) {
      console.error('List categories error:', error);
      return res.status(500).json({ detail: 'Internal server error' });
    }
  }
};

module.exports = transactionController;
