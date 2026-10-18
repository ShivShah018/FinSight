const { pool } = require('../db');

const budgetController = {
  listBudgets: async (req, res) => {
    try {
      const userId = req.user.id;

      const [rows] = await pool.execute(`
        SELECT b.id, b.category_id, c.name AS category_name, b.monthly_limit
        FROM budget_limits b
        JOIN categories c ON b.category_id = c.id
        WHERE b.user_id = ?
        ORDER BY c.name
      `, [userId]);

      const budgets = rows.map(r => ({
        id: r.id,
        category_id: r.category_id,
        category_name: r.category_name,
        monthly_limit: parseFloat(r.monthly_limit)
      }));

      return res.status(200).json(budgets);
    } catch (error) {
      console.error('List budgets error:', error);
      return res.status(500).json({ detail: 'Internal server error' });
    }
  },

  setBudget: async (req, res) => {
    try {
      const userId = req.user.id;
      const { category_id, monthly_limit } = req.body;

      if (!category_id || monthly_limit === undefined || monthly_limit === null) {
        return res.status(400).json({ detail: 'Missing category_id or monthly_limit' });
      }

      const limitNum = parseFloat(monthly_limit);
      if (isNaN(limitNum) || limitNum < 0 || !isFinite(limitNum)) {
        return res.status(400).json({ detail: 'monthly_limit must be a non-negative number' });
      }

      // Check if category belongs to user
      const [cats] = await pool.execute(
        'SELECT id FROM categories WHERE id = ? AND user_id = ?',
        [category_id, userId]
      );

      if (cats.length === 0) {
        return res.status(400).json({ detail: 'Category not found or does not belong to this user' });
      }

      await pool.execute(`
        INSERT INTO budget_limits (user_id, category_id, monthly_limit)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE monthly_limit = ?
      `, [userId, category_id, monthly_limit, monthly_limit]);

      return res.status(201).json({ message: 'Budget limit set' });
    } catch (error) {
      console.error('Set budget error:', error);
      return res.status(400).json({ detail: error.message });
    }
  },

  updateBudget: async (req, res) => {
    try {
      const userId = req.user.id;
      const budgetId = req.params.budget_id;
      const { monthly_limit } = req.body;

      if (monthly_limit === undefined || monthly_limit === null) {
        return res.status(400).json({ detail: 'Missing monthly_limit' });
      }

      const limitNum = parseFloat(monthly_limit);
      if (isNaN(limitNum) || limitNum < 0 || !isFinite(limitNum)) {
        return res.status(400).json({ detail: 'monthly_limit must be a non-negative number' });
      }

      await pool.execute(`
        UPDATE budget_limits
        SET monthly_limit = ?
        WHERE id = ? AND user_id = ?
      `, [monthly_limit, budgetId, userId]);

      return res.status(200).json({ message: 'Budget updated' });
    } catch (error) {
      console.error('Update budget error:', error);
      return res.status(500).json({ detail: 'Internal server error' });
    }
  },

  deleteBudget: async (req, res) => {
    try {
      const userId = req.user.id;
      const budgetId = req.params.budget_id;

      await pool.execute(`
        DELETE FROM budget_limits
        WHERE id = ? AND user_id = ?
      `, [budgetId, userId]);

      return res.status(200).json({ message: 'Budget deleted' });
    } catch (error) {
      console.error('Delete budget error:', error);
      return res.status(500).json({ detail: 'Internal server error' });
    }
  },

  getUtilization: async (req, res) => {
    try {
      const userId = req.user.id;
      const today = new Date();
      if (req.query.month && (isNaN(parseInt(req.query.month, 10)) || parseInt(req.query.month, 10) < 1 || parseInt(req.query.month, 10) > 12)) {
        return res.status(400).json({ detail: 'Invalid month parameter' });
      }
      if (req.query.year && (isNaN(parseInt(req.query.year, 10)) || parseInt(req.query.year, 10) < 1970)) {
        return res.status(400).json({ detail: 'Invalid year parameter' });
      }
      const month = req.query.month ? parseInt(req.query.month, 10) : today.getMonth() + 1;
      const year = req.query.year ? parseInt(req.query.year, 10) : today.getFullYear();

      const [rows] = await pool.execute(`
        SELECT b.id, b.category_id, b.monthly_limit, c.name AS category_name,
               COALESCE(SUM(t.amount), 0) AS spent
        FROM budget_limits b
        JOIN categories c ON b.category_id = c.id
        LEFT JOIN transactions t ON t.category_id = c.id
        AND t.user_id = ? AND t.type = 'expense' AND t.deleted_at IS NULL
        AND YEAR(t.transaction_date) = ? AND MONTH(t.transaction_date) = ?
        WHERE b.user_id = ?
        GROUP BY b.id, b.category_id, b.monthly_limit, c.name
      `, [userId, year, month, userId]);

      const result = {};
      rows.forEach(r => {
        const limit = parseFloat(r.monthly_limit);
        const spent = parseFloat(r.spent);
        const percentage = limit > 0 ? Math.round((spent / limit) * 100 * 10) / 10 : 0;

        result[r.category_name] = {
          id: r.id,
          category_id: r.category_id,
          category_name: r.category_name,
          limit,
          spent,
          percentage
        };
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error('Get utilization error:', error);
      return res.status(500).json({ detail: 'Internal server error' });
    }
  }
};

module.exports = budgetController;
