const { spawnSync } = require('node:child_process');
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { runMl, resolvePythonPath } = require('../utils/mlHelper');

describe('Applied ML Service & Helper Test Suite', () => {
  test('1. Python executable resolves and imports numpy and scikit-learn dependencies', () => {
    const pythonPath = resolvePythonPath();
    assert.ok(pythonPath, 'Python path should be non-empty');

    const check = spawnSync(pythonPath, [
      '-c',
      'import numpy as np; import sklearn; from sklearn.cluster import KMeans; from sklearn.linear_model import LinearRegression; print("ML_DEPS_VERIFIED")'
    ], { encoding: 'utf8', timeout: 15000 });

    assert.strictEqual(
      check.status,
      0,
      `Python interpreter at "${pythonPath}" failed to import ML dependencies:\nStderr: ${check.stderr}\nStdout: ${check.stdout}`
    );
    assert.ok(check.stdout.includes('ML_DEPS_VERIFIED'), 'Interpreter must successfully run Python ML import check');
  });

  test('2. ML predict with 3+ months executes time-aware holdout and baseline comparison', async () => {
    const transactions = [
      { type: 'expense', amount: 1000, transaction_date: '2026-01-10', category_name: 'Food' },
      { type: 'expense', amount: 1200, transaction_date: '2026-02-14', category_name: 'Food' },
      { type: 'expense', amount: 1400, transaction_date: '2026-03-18', category_name: 'Food' }
    ];

    const result = await runMl('predict', transactions);
    assert.strictEqual(typeof result.predicted_total, 'number');
    assert.ok(result.predicted_total >= 0, 'Predicted total must be non-negative');
    assert.strictEqual(result.trend, 'rising');
    assert.strictEqual(result.historical_months, 3);
    assert.ok(result.evaluation, 'Evaluation metadata must be present');
    assert.strictEqual(result.evaluation.evaluation_type, 'time_aware_holdout');
    assert.strictEqual(typeof result.evaluation.model_holdout_mae, 'number');
    assert.strictEqual(typeof result.evaluation.baseline_holdout_mae, 'number');
    assert.ok(result.evaluation.baseline_comparison, 'Baseline comparison must be present');
  });

  test('3. ML predict with insufficient data returns graceful fallback without error', async () => {
    const transactions = [
      { type: 'expense', amount: 100, transaction_date: '2026-01-01' }
    ];

    const result = await runMl('predict', transactions);
    assert.strictEqual(result.predicted_total, 0);
    assert.strictEqual(result.trend, 'insufficient_data');
    assert.strictEqual(result.confidence, 0);
  });

  test('4. ML predict handles invalid/malformed date formats gracefully', async () => {
    const transactions = [
      { type: 'expense', amount: 'invalid-amount', transaction_date: 'not-a-date' },
      { type: 'expense', amount: 200, transaction_date: '2026-01-15' },
      { type: 'expense', amount: 300, transaction_date: '2026-02-15' }
    ];

    const result = await runMl('predict', transactions);
    assert.strictEqual(result.trend, 'insufficient_data');
    assert.strictEqual(result.predicted_total, 0);
  });

  test('5. ML clustering groups expenses and returns ranked clusters with valid input', async () => {
    const transactions = [
      { type: 'expense', amount: 450, transaction_date: '2026-01-05', category_name: 'Food' },
      { type: 'expense', amount: 500, transaction_date: '2026-01-06', category_name: 'Food' },
      { type: 'expense', amount: 20000, transaction_date: '2026-01-10', category_name: 'Rent' },
      { type: 'expense', amount: 3500, transaction_date: '2026-01-15', category_name: 'Shopping' }
    ];

    const clusters = await runMl('cluster', transactions);
    assert.ok(Array.isArray(clusters));
    assert.strictEqual(clusters.length, 3);
    assert.strictEqual(clusters[0].cluster_id, 0);
    assert.ok(clusters[0].total_amount >= clusters[1].total_amount, 'Clusters should be sorted by total_amount descending');
    assert.ok(clusters[0].name, 'Cluster name should be present');
    assert.ok(Array.isArray(clusters[0].categories));
    assert.ok(clusters[0].categories.length > 0);
    assert.strictEqual(typeof clusters[0].avg_amount, 'number');
    assert.strictEqual(typeof clusters[0].count, 'number');
  });

  test('6. ML clustering with insufficient data (empty array or <3 expenses) returns empty list safely', async () => {
    // Empty array
    const emptyClusters = await runMl('cluster', []);
    assert.deepStrictEqual(emptyClusters, []);

    // Single transaction
    const singleCluster = await runMl('cluster', [
      { type: 'expense', amount: 100, transaction_date: '2026-01-01', category_name: 'Food' }
    ]);
    assert.deepStrictEqual(singleCluster, []);

    // Two transactions (less than n_clusters=3)
    const twoClusters = await runMl('cluster', [
      { type: 'expense', amount: 100, transaction_date: '2026-01-01', category_name: 'Food' },
      { type: 'expense', amount: 200, transaction_date: '2026-01-02', category_name: 'Food' }
    ]);
    assert.deepStrictEqual(twoClusters, []);
  });

  test('7. ML clustering safely ignores non-expense transactions (income, transfer)', async () => {
    const transactions = [
      { type: 'income', amount: 50000, transaction_date: '2026-01-01', category_name: 'Salary' },
      { type: 'income', amount: 10000, transaction_date: '2026-01-15', category_name: 'Bonus' },
      { type: 'expense', amount: 450, transaction_date: '2026-01-05', category_name: 'Food' },
      { type: 'expense', amount: 500, transaction_date: '2026-01-06', category_name: 'Food' },
      { type: 'expense', amount: 20000, transaction_date: '2026-01-10', category_name: 'Rent' },
      { type: 'expense', amount: 3500, transaction_date: '2026-01-15', category_name: 'Shopping' }
    ];

    const clusters = await runMl('cluster', transactions);
    assert.ok(Array.isArray(clusters));
    assert.strictEqual(clusters.length, 3);
    // Ensure none of the clusters contain 'Salary' or 'Bonus'
    for (const c of clusters) {
      assert.ok(!c.categories.includes('Salary'), 'Income categories must not be in expense clusters');
      assert.ok(!c.categories.includes('Bonus'), 'Income categories must not be in expense clusters');
    }
  });

  test('8. ML clustering handles malformed amounts and invalid dates without crashing', async () => {
    const transactions = [
      { type: 'expense', amount: 'not-a-number', transaction_date: '2026-01-01', category_name: 'Food' },
      { type: 'expense', amount: -500, transaction_date: '2026-01-02', category_name: 'Food' },
      { type: 'expense', amount: null, transaction_date: '2026-01-03', category_name: 'Food' },
      { type: 'expense', amount: 150, transaction_date: 'invalid-date', category_name: 'Food' },
      { type: 'expense', amount: 450, transaction_date: '2026-01-05', category_name: 'Food' },
      { type: 'expense', amount: 500, transaction_date: '2026-01-06', category_name: 'Food' },
      { type: 'expense', amount: 20000, transaction_date: '2026-01-10', category_name: 'Rent' }
    ];

    // Out of the 7 transactions, exactly 3 are valid expenses. Clustering should run on the 3 valid expenses.
    const clusters = await runMl('cluster', transactions);
    assert.ok(Array.isArray(clusters));
    assert.strictEqual(clusters.length, 3);
  });

  test('9. Helper rejects non-array transactions with validation error', async () => {
    await assert.rejects(
      () => runMl('predict', 'not-an-array'),
      { message: /must be an array/ }
    );
  });

  test('10. Helper rejects invalid mode with validation error', async () => {
    await assert.rejects(
      () => runMl(null, []),
      { message: /Invalid mode/ }
    );
  });
});
