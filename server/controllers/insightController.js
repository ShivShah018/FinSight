const { pool } = require('../db');
const { runMl } = require('../utils/mlHelper');

const keywordMap = {
  'Food & Dining': ["food", "restaurant", "pizza", "lunch", "dinner", "breakfast",
                    "grocery", "groceries", "snack", "cafe", "coffee", "zomato", "swiggy",
                    "hungry", "eat", "eating", "dine", "dining", "meal", "takeaway",
                    "delivery", "order", "tea", "juice", "shake", "bakery", "beverage"],
  'Rent': ["rent", "lease", "apartment"],
  'Transport': ["uber", "ola", "cab", "taxi", "fuel", "petrol", "diesel", "metro",
                "bus", "train", "auto", "parking", "toll"],
  'Utilities': ["electricity", "water", "gas", "bill", "broadband", "wifi",
                "internet", "phone", "mobile", "recharge"],
  'Entertainment': ["movie", "netflix", "prime", "hotstar", "concert", "game",
                    "sport", "spotify", "youtube"],
  'Healthcare': ["doctor", "hospital", "clinic", "medicine", "pharmacy", "dental",
                 "health", "insurance", "checkup"],
  'Shopping': ["amazon", "flipkart", "myntra", "cloth", "shoe", "electronics",
               "amazon pay", "shopping", "mall"],
  'Education': ["course", "udemy", "coursera", "book", "college", "fee",
                "tuition", "exam"],
  'Salary': ["salary", "payroll", "wage"],
  'Freelance': ["freelance", "contract", "gig", "upwork", "fiverr"],
  'Investments': ["investment", "mutual fund", "stock", "dividend", "interest"]
};

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

function suggestCategoryLocal(description, categories) {
  if (!description || !categories || categories.length === 0) {
    return null;
  }

  const descLower = description.toLowerCase();
  const scores = {};

  categories.forEach(cat => {
    const kws = keywordMap[cat.name] || [];
    if (kws.length === 0) return;

    let matches = 0;
    kws.forEach(kw => {
      // Word boundaries match: \bkw\b
      const regex = new RegExp('\\b' + escapeRegExp(kw) + '\\b', 'i');
      if (regex.test(descLower)) {
        matches++;
      }
    });

    if (matches > 0) {
      scores[cat.name] = { matches, category: cat };
    }
  });

  const matchedNames = Object.keys(scores);
  if (matchedNames.length === 0) {
    return null;
  }

  let totalMatches = 0;
  let bestName = null;
  let bestScore = -1;

  matchedNames.forEach(name => {
    const matchCount = scores[name].matches;
    totalMatches += matchCount;
    if (matchCount > bestScore) {
      bestScore = matchCount;
      bestName = name;
    }
  });

  const bestCat = scores[bestName].category;
  const confidence = totalMatches > 0 ? (bestScore / totalMatches) : 1.0;

  return {
    category: bestCat.name,
    category_id: bestCat.id,
    score: Math.round(confidence * 100) / 100
  };
}

const insightController = {
  predictSpending: async (req, res) => {
    try {
      const userId = req.user.id;

      const [txRows] = await pool.execute(`
        SELECT t.id, t.amount, t.type, t.transaction_date
        FROM transactions t
        WHERE t.user_id = ? AND t.deleted_at IS NULL
        LIMIT 5000
      `, [userId]);

      const transactions = txRows.map(r => ({
        ...r,
        amount: parseFloat(r.amount)
      }));

      let prediction = { predicted_total: 0, trend: "insufficient_data", confidence: 0 };
      try {
        prediction = await runMl('predict', transactions);
      } catch (err) {
        console.warn('Linear Regression prediction failed/unavailable:', err.message);
      }

      return res.status(200).json(prediction);
    } catch (error) {
      console.error('Predict spending error:', error);
      return res.status(500).json({ detail: 'Internal server error' });
    }
  },

  suggestCategory: async (req, res) => {
    try {
      const userId = req.user.id;
      const { description } = req.query;

      if (!description || description.trim().length === 0) {
        return res.status(400).json({ detail: 'Missing description query parameter' });
      }

      const [categories] = await pool.execute(
        "SELECT id, name, type, icon, color FROM categories WHERE user_id = ? AND type = 'expense'",
        [userId]
      );

      const result = suggestCategoryLocal(description, categories);
      if (result) {
        return res.status(200).json(result);
      }
      return res.status(200).json({ category: null, score: 0 });
    } catch (error) {
      console.error('Suggest category error:', error);
      return res.status(500).json({ detail: 'Internal server error' });
    }
  },

  getClusters: async (req, res) => {
    try {
      const userId = req.user.id;

      const [txRows] = await pool.execute(`
        SELECT t.id, t.amount, t.type, t.transaction_date, c.name AS category_name
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = ? AND t.deleted_at IS NULL
        LIMIT 5000
      `, [userId]);

      const transactions = txRows.map(r => ({
        ...r,
        amount: parseFloat(r.amount)
      }));

      const clusters = await runMl('cluster', transactions);
      return res.status(200).json(clusters);
    } catch (error) {
      console.error('Clustering error:', error);
      return res.status(200).json([]); // Return empty array if not enough clusters or error
    }
  },

  getAllInsights: async (req, res) => {
    try {
      const userId = req.user.id;

      // Fetch transactions
      const [txRows] = await pool.execute(`
        SELECT t.id, t.category_id, c.name AS category_name, 
               t.amount, t.type, t.currency, t.description, t.transaction_date
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = ? AND t.deleted_at IS NULL
        LIMIT 5000
      `, [userId]);

      const transactions = txRows.map(r => ({
        ...r,
        amount: parseFloat(r.amount)
      }));

      // Fetch goals
      const [goalRows] = await pool.execute(`
        SELECT id, name, target_amount, current_amount, deadline, status
        FROM savings_goals
        WHERE user_id = ? AND status != 'cancelled'
        ORDER BY created_at DESC
      `, [userId]);

      const goals = goalRows.map(r => {
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
          progress_pct: Math.round(Math.min(pct, 100) * 10) / 10
        };
      });

      // Fetch budgets
      const [budgetRows] = await pool.execute(`
        SELECT b.id, b.category_id, c.name AS category_name, b.monthly_limit
        FROM budget_limits b
        JOIN categories c ON b.category_id = c.id
        WHERE b.user_id = ?
      `, [userId]);

      const budgets = budgetRows.map(r => ({
        id: r.id,
        category_id: r.category_id,
        category_name: r.category_name,
        monthly_limit: parseFloat(r.monthly_limit)
      }));

      // Get predictions and clusters
      let prediction = { predicted_total: 0, trend: "insufficient_data", confidence: 0 };
      let clusters = [];

      try {
        prediction = await runMl('predict', transactions);
      } catch (err) {
        console.warn('Linear Regression failed:', err.message);
      }

      try {
        clusters = await runMl('cluster', transactions);
      } catch (err) {
        console.warn('KMeans Clustering failed:', err.message);
      }

      return res.status(200).json({
        transactions,
        goals,
        budgets,
        prediction,
        clusters
      });
    } catch (error) {
      console.error('Get all insights error:', error);
      return res.status(500).json({ detail: 'Internal server error' });
    }
  }
};

module.exports = {
  insightController
};
