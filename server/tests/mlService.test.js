const { test, describe } = require('node:test');
const assert = require('node:assert');
const { runMl, resolvePythonPath } = require('../utils/mlHelper');

describe('Applied ML Service & Helper Test Suite', () => {
  test('1. Python executable resolves successfully', () => {
    const pythonPath = resolvePythonPath();
    assert.ok(pythonPath, 'Python path should be non-empty');
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

  test('5. ML clustering groups expenses and returns ranked clusters', async () => {
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
  });

  test('6. ML clustering with insufficient data returns empty list', async () => {
    const transactions = [
      { type: 'expense', amount: 100, transaction_date: '2026-01-01' }
    ];

    const clusters = await runMl('cluster', transactions);
    assert.deepStrictEqual(clusters, []);
  });

  test('7. Helper rejects non-array transactions with validation error', async () => {
    await assert.rejects(
      () => runMl('predict', 'not-an-array'),
      { message: /must be an array/ }
    );
  });
});
