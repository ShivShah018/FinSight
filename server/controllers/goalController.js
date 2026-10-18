const { pool } = require('../db');

const goalController = {
  listGoals: async (req, res) => {
    try {
      const userId = req.user.id;

      const [rows] = await pool.execute(`
        SELECT id, name, target_amount, current_amount, deadline, status, auto_fund_amount, auto_fund_category_id
        FROM savings_goals
        WHERE user_id = ? AND status != 'cancelled'
        ORDER BY created_at DESC
      `, [userId]);

      const goals = rows.map(r => {
        const target = parseFloat(r.target_amount);
        const current = parseFloat(r.current_amount);
        const pct = target > 0 ? (current / target) * 100 : 0;
        return {
          id: r.id,
          name: r.name,
          target_amount: target,
          current_amount: current,
          deadline: r.deadline,
          status: r.status,
          progress_pct: Math.round(Math.min(pct, 100) * 10) / 10,
          auto_fund_amount: parseFloat(r.auto_fund_amount || 0),
          auto_fund_category_id: r.auto_fund_category_id
        };
      });

      return res.status(200).json(goals);
    } catch (error) {
      console.error('List goals error:', error);
      return res.status(500).json({ detail: 'Internal server error' });
    }
  },

  createGoal: async (req, res) => {
    try {
      const userId = req.user.id;
      const { name, target_amount, deadline, auto_fund_amount, auto_fund_category_id } = req.body;

      if (!name || target_amount === undefined || target_amount === null) {
        return res.status(400).json({ detail: 'Missing required goal fields' });
      }

      const targetNum = parseFloat(target_amount);
      if (isNaN(targetNum) || targetNum <= 0 || !isFinite(targetNum)) {
        return res.status(400).json({ detail: 'target_amount must be a positive number' });
      }

      if (deadline) {
        const parsedDate = new Date(deadline);
        if (isNaN(parsedDate.getTime()) || !/^\d{4}-\d{2}-\d{2}/.test(deadline)) {
          return res.status(400).json({ detail: 'Invalid deadline date format' });
        }
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (parsedDate < today) {
          return res.status(400).json({ detail: 'Goal deadline cannot be in the past' });
        }
      }

      const dl = deadline || null;
      const afAmount = auto_fund_amount || 0;
      const afCatId = auto_fund_category_id || null;

      const [result] = await pool.execute(`
        INSERT INTO savings_goals (user_id, name, target_amount, deadline, auto_fund_amount, auto_fund_category_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [userId, name, target_amount, dl, afAmount, afCatId]);

      return res.status(201).json({
        id: result.insertId,
        message: 'Goal created'
      });
    } catch (error) {
      console.error('Create goal error:', error);
      return res.status(400).json({ detail: error.message });
    }
  },

  updateGoal: async (req, res) => {
    try {
      const userId = req.user.id;
      const goalId = req.params.goal_id;
      const { name, target_amount, deadline } = req.body;

      if (deadline !== undefined && deadline !== null) {
        const parsedDate = new Date(deadline);
        if (isNaN(parsedDate.getTime()) || !/^\d{4}-\d{2}-\d{2}/.test(deadline)) {
          return res.status(400).json({ detail: 'Invalid deadline date format' });
        }
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (parsedDate < today) {
          return res.status(400).json({ detail: 'Goal deadline cannot be in the past' });
        }
      }

      const fields = [];
      const params = [];

      if (name !== undefined) {
        fields.push('name = ?');
        params.push(name);
      }
      if (target_amount !== undefined) {
        fields.push('target_amount = ?');
        params.push(target_amount);
      }
      if (deadline !== undefined) {
        fields.push('deadline = ?');
        params.push(deadline);
      }

      if (fields.length === 0) {
        return res.status(200).json({ message: 'No fields to update' });
      }

      params.push(goalId, userId);

      await pool.execute(`
        UPDATE savings_goals
        SET ${fields.join(', ')}
        WHERE id = ? AND user_id = ?
      `, params);

      return res.status(200).json({ message: 'Goal updated' });
    } catch (error) {
      console.error('Update goal error:', error);
      return res.status(400).json({ detail: error.message });
    }
  },

  fundGoal: async (req, res) => {
    try {
      const userId = req.user.id;
      const goalId = req.params.goal_id;
      const { amount } = req.body;

      if (amount === undefined || amount <= 0) {
        return res.status(400).json({ detail: 'Invalid fund amount' });
      }

      await pool.execute(`
        UPDATE savings_goals
        SET current_amount = current_amount + ?
        WHERE id = ? AND user_id = ? AND status = 'active'
      `, [amount, goalId, userId]);

      return res.status(200).json({ message: `Added ${amount} to goal` });
    } catch (error) {
      console.error('Fund goal error:', error);
      return res.status(500).json({ detail: 'Internal server error' });
    }
  },

  completeGoal: async (req, res) => {
    try {
      const userId = req.user.id;
      const goalId = req.params.goal_id;

      await pool.execute(`
        UPDATE savings_goals
        SET status = 'completed', current_amount = target_amount
        WHERE id = ? AND user_id = ?
      `, [goalId, userId]);

      return res.status(200).json({ message: 'Goal completed' });
    } catch (error) {
      console.error('Complete goal error:', error);
      return res.status(500).json({ detail: 'Internal server error' });
    }
  },

  cancelGoal: async (req, res) => {
    try {
      const userId = req.user.id;
      const goalId = req.params.goal_id;

      await pool.execute(`
        UPDATE savings_goals
        SET status = 'cancelled'
        WHERE id = ? AND user_id = ?
      `, [goalId, userId]);

      return res.status(200).json({ message: 'Goal cancelled' });
    } catch (error) {
      console.error('Cancel goal error:', error);
      return res.status(500).json({ detail: 'Internal server error' });
    }
  },

  deleteGoal: async (req, res) => {
    try {
      const userId = req.user.id;
      const goalId = req.params.goal_id;

      await pool.execute(`
        DELETE FROM savings_goals
        WHERE id = ? AND user_id = ?
      `, [goalId, userId]);

      return res.status(200).json({ message: 'Goal deleted permanently' });
    } catch (error) {
      console.error('Delete goal error:', error);
      return res.status(500).json({ detail: 'Internal server error' });
    }
  }
};

module.exports = goalController;
