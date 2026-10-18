const { z } = require('zod');

// Schema for user chat request
const chatRequestSchema = z.object({
  message: z.string().min(1, 'Message is required').max(2000, 'Message too long'),
  history: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string()
    })
  ).optional().default([]),
  reporting_period: z.object({
    period: z.enum(['this_month', 'last_month', 'ytd', 'year_to_date', 'full_year', 'custom', 'all_time']).optional(),
    year: z.number().int().min(2000).max(2100).optional(),
    month: z.number().int().min(1).max(12).optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional()
  }).optional()
});

// Tool Schemas
const getMonthlySpendingSchema = z.object({
  year: z.number().int().min(2000, 'Year must be between 2000 and 2100').max(2100, 'Year must be between 2000 and 2100').optional().describe('4-digit calendar year (e.g. 2026). If provided without month, queries year-to-date or full year.'),
  month: z.number().int().min(1, 'Month must be between 1 and 12').max(12, 'Month must be between 1 and 12').optional().describe('Month number 1-12. If omitted, queries year-to-date or full year.'),
  period: z.enum(['this_month', 'last_month', 'ytd', 'year_to_date', 'full_year', 'custom']).optional().describe('Preset period. Use ytd for year-to-date (Jan 1 to today).'),
  start_date: z.string().optional().describe('Start date YYYY-MM-DD for custom range.'),
  end_date: z.string().optional().describe('End date YYYY-MM-DD for custom range.')
});

const getCategoryBreakdownSchema = z.object({
  year: z.number().int().min(2000, 'Year must be between 2000 and 2100').max(2100, 'Year must be between 2000 and 2100').optional().describe('4-digit calendar year. If provided without month, queries year-to-date or full year.'),
  month: z.number().int().min(1, 'Month must be between 1 and 12').max(12, 'Month must be between 1 and 12').optional().describe('Month number 1-12. If omitted, queries year-to-date or full year.'),
  period: z.enum(['this_month', 'last_month', 'ytd', 'year_to_date', 'full_year', 'custom']).optional().describe('Preset period.'),
  start_date: z.string().optional().describe('Start date YYYY-MM-DD for custom range.'),
  end_date: z.string().optional().describe('End date YYYY-MM-DD for custom range.'),
  type: z.enum(['expense', 'income']).optional().default('expense').describe('Transaction type, either expense or income. Defaults to expense.')
});

const getBudgetStatusSchema = z.object({
  year: z.number().int().min(2000, 'Year must be between 2000 and 2100').max(2100, 'Year must be between 2000 and 2100').optional().describe('4-digit calendar year. Defaults to current year.'),
  month: z.number().int().min(1, 'Month must be between 1 and 12').max(12, 'Month must be between 1 and 12').optional().describe('Month number 1-12. Defaults to current month.'),
  period: z.enum(['this_month', 'last_month', 'ytd', 'year_to_date', 'full_year']).optional().describe('Preset period.')
});

const getSpendingComparisonSchema = z.object({
  current_period: z.enum(['this_month', 'last_month', 'ytd', 'year_to_date']).optional().describe('Period preset for current window.'),
  current_month: z.number().int().min(1, 'Month must be between 1 and 12').max(12, 'Month must be between 1 and 12').optional().describe('Current month 1-12. Defaults to current month.'),
  current_year: z.number().int().min(2000, 'Year must be between 2000 and 2100').max(2100, 'Year must be between 2000 and 2100').optional().describe('Current year. Defaults to current year.'),
  previous_month: z.number().int().min(1, 'Month must be between 1 and 12').max(12, 'Month must be between 1 and 12').optional().describe('Comparison month 1-12. Defaults to month immediately before current.'),
  previous_year: z.number().int().min(2000, 'Year must be between 2000 and 2100').max(2100, 'Year must be between 2000 and 2100').optional().describe('Comparison year. Defaults to appropriate year for previous month.')
});

const getUnusualTransactionsSchema = z.object({
  year: z.number().int().min(2000, 'Year must be between 2000 and 2100').max(2100, 'Year must be between 2000 and 2100').optional().describe('Calendar year.'),
  month: z.number().int().min(1, 'Month must be between 1 and 12').max(12, 'Month must be between 1 and 12').optional().describe('Month 1-12.'),
  period: z.enum(['this_month', 'last_month', 'ytd', 'year_to_date', 'full_year']).optional().describe('Period preset.'),
  start_date: z.string().optional().describe('Start date YYYY-MM-DD.'),
  end_date: z.string().optional().describe('End date YYYY-MM-DD.'),
  threshold_multiplier: z.number().min(1.2).max(10).optional().default(2.0).describe('Multiplier above average expense to consider unusual (default 2.0).')
});

// Proposal Action Schema (used when proposing budget update)
const proposeBudgetUpdateSchema = z.object({
  category_name: z.string().min(1, 'Category name is required').describe('Name of the category to update budget for'),
  proposed_amount: z.number().positive('Proposed budget must be greater than zero').max(100000000, 'Amount exceeds maximum limit').describe('New proposed monthly budget limit in currency units'),
  reason: z.string().min(10, 'Reason must be detailed and at least 10 characters').describe('Detailed financial justification based on actual spending and savings goals')
});

module.exports = {
  chatRequestSchema,
  getMonthlySpendingSchema,
  getCategoryBreakdownSchema,
  getBudgetStatusSchema,
  getSpendingComparisonSchema,
  getUnusualTransactionsSchema,
  proposeBudgetUpdateSchema
};
