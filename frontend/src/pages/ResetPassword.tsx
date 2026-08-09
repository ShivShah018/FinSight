import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { TrendingUp, KeyRound, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';
import { AuthService } from '../services';

const resetPasswordSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(6, 'Please confirm your password'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

export const ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: ResetPasswordFormValues) => {
    if (!token) {
      setServerError('Missing or invalid reset token.');
      return;
    }
    setServerError(null);
    try {
      const res = await AuthService.resetPassword(token, data.password);
      setSuccessMessage(res.message || 'Password reset successfully.');
    } catch (err: any) {
      setServerError(err.response?.data?.detail || 'Invalid or expired password reset link.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      {/* Brand Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-purple-500/25">
          <TrendingUp className="w-6 h-6 text-white" />
        </div>
        <span className="font-bold text-2xl bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
          FinSight
        </span>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-slate-900 border border-slate-800/80 rounded-2xl p-8 shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-2">Set New Password</h2>
        <p className="text-sm text-slate-400 mb-6">
          Please enter your new password below.
        </p>

        {!token ? (
          <div className="space-y-6 text-center">
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex flex-col items-center gap-2">
              <AlertCircle className="w-8 h-8 text-rose-400" />
              <p className="text-sm text-slate-200 font-medium">
                Invalid or missing password reset link.
              </p>
              <p className="text-xs text-slate-400">
                Please request a new link from the forgot password page.
              </p>
            </div>
            <Link
              to="/forgot-password"
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-medium py-3 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-sm shadow-lg shadow-purple-600/10"
            >
              <span>Request New Reset Link</span>
            </Link>
          </div>
        ) : successMessage ? (
          <div className="space-y-6">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-100">{successMessage}</p>
                <p className="text-xs text-slate-400 mt-1">
                  You can now log in using your updated password.
                </p>
              </div>
            </div>
            <Link
              to="/login"
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-medium py-3 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-sm shadow-lg shadow-purple-600/10"
            >
              <span>Continue to Login</span>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {serverError && (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-xs text-rose-400 font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{serverError}</span>
              </div>
            )}

            {/* New Password Field */}
            <div>
              <label htmlFor="reset-password" className="block text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wide">
                New Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <KeyRound className="w-5 h-5" />
                </span>
                <input
                  id="reset-password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  {...register('password')}
                  className={`w-full bg-slate-950 border text-slate-200 pl-11 pr-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/30 transition-all ${
                    errors.password ? 'border-rose-500/60' : 'border-slate-800 hover:border-slate-700'
                  }`}
                />
              </div>
              {errors.password && (
                <span className="text-xs text-rose-400 mt-1 block font-medium">
                  {errors.password.message}
                </span>
              )}
            </div>

            {/* Confirm Password Field */}
            <div>
              <label htmlFor="reset-confirm-password" className="block text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wide">
                Confirm New Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <KeyRound className="w-5 h-5" />
                </span>
                <input
                  id="reset-confirm-password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  {...register('confirmPassword')}
                  className={`w-full bg-slate-950 border text-slate-200 pl-11 pr-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/30 transition-all ${
                    errors.confirmPassword ? 'border-rose-500/60' : 'border-slate-800 hover:border-slate-700'
                  }`}
                />
              </div>
              {errors.confirmPassword && (
                <span className="text-xs text-rose-400 mt-1 block font-medium">
                  {errors.confirmPassword.message}
                </span>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-medium py-3 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-sm shadow-lg shadow-purple-600/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                'Save New Password'
              )}
            </button>
          </form>
        )}

        {!successMessage && (
          <div className="mt-6 pt-6 border-t border-slate-800 text-center">
            <Link to="/login" className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-purple-400 font-semibold transition-all">
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Login</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};
