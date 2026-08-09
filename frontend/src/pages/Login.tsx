import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { TrendingUp, KeyRound, Mail } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export const Login: React.FC = () => {
  const { login } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    try {
      await login(data.email, data.password);
    } catch (e) {
      // Errors handled by AuthContext toasts
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
        <h2 className="text-xl font-bold text-white mb-2">Welcome Back</h2>
        <p className="text-sm text-slate-400 mb-6">Log in to manage your budget and savings goals.</p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Email Field */}
          <div>
            <label htmlFor="login-email" className="block text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wide">
              Email Address
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                <Mail className="w-5 h-5" />
              </span>
              <input
                id="login-email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                {...register('email')}
                className={`w-full bg-slate-950 border text-slate-200 pl-11 pr-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/30 transition-all ${
                  errors.email ? 'border-rose-500/60' : 'border-slate-800 hover:border-slate-700'
                }`}
              />
            </div>
            {errors.email && (
              <span className="text-xs text-rose-400 mt-1 block font-medium">
                {errors.email.message}
              </span>
            )}
          </div>

          {/* Password Field */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label htmlFor="login-password" className="block text-xs font-semibold text-slate-300 uppercase tracking-wide">
                Password
              </label>
              <Link to="/forgot-password" className="text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors">
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                <KeyRound className="w-5 h-5" />
              </span>
              <input
                id="login-password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
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



          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-purple-600 hover:bg-purple-500 text-white font-medium py-3 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-sm shadow-lg shadow-purple-600/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              'Log in'
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-800 text-center">
          <p className="text-xs text-slate-400">
            Don't have an account?{' '}
            <Link to="/register" className="text-purple-400 hover:text-purple-300 font-semibold transition-all">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
