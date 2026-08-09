import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  User, 
  Globe, 
  Check, 
  ShieldAlert,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const Settings: React.FC = () => {
  const { user, updateUserCurrency } = useAuth();
  const [currency, setCurrency] = useState(user?.currency || 'INR');

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateUserCurrency(currency);
      toast.success('Settings updated successfully!');
    } catch {
      toast.error('Failed to save settings.');
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Settings</h1>
        <p className="text-sm text-slate-400">Configure your personal preferences and preferred currency.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Form Panel */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-6">
          <h3 className="text-base font-bold text-slate-200 border-b border-slate-800 pb-3 flex items-center gap-2">
            <User className="w-5 h-5 text-purple-400" />
            <span>Profile Information</span>
          </h3>

          <form onSubmit={handleSaveSettings} className="space-y-6">
            {/* Full Name */}
            <div>
              <label htmlFor="settings-name" className="block text-xs font-semibold text-slate-400 uppercase mb-2 tracking-wide">Full Name</label>
              <input
                id="settings-name"
                name="name"
                type="text"
                autoComplete="name"
                value={user?.name || ''}
                disabled
                className="w-full bg-slate-950 border border-slate-800 text-slate-400 px-4 py-2.5 rounded-xl text-sm focus:outline-none opacity-60 cursor-not-allowed"
              />
            </div>

            {/* Email Address */}
            <div>
              <label htmlFor="settings-email" className="block text-xs font-semibold text-slate-400 uppercase mb-2 tracking-wide">Email Address</label>
              <input
                id="settings-email"
                name="email"
                type="email"
                autoComplete="email"
                value={user?.email || ''}
                disabled
                className="w-full bg-slate-950 border border-slate-800 text-slate-400 px-4 py-2.5 rounded-xl text-sm focus:outline-none opacity-60 cursor-not-allowed"
              />
            </div>

            {/* Currency configuration */}
            <div>
              <label htmlFor="settings-currency" className="block text-xs font-semibold text-slate-300 uppercase mb-2 tracking-wide">Preferred Currency</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <Globe className="w-5 h-5" />
                </span>
                <select
                  id="settings-currency"
                  name="currency"
                  autoComplete="off"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 pl-11 pr-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/30 transition-all cursor-pointer"
                >
                  <option value="INR">INR (₹) - Indian Rupee</option>
                  <option value="USD">USD ($) - US Dollar</option>
                  <option value="NPR">NPR (रु) - Nepalese Rupee</option>
                </select>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm px-6 py-2.5 rounded-xl transition-all shadow-lg shadow-purple-600/10 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Save Preferences</span>
            </button>
          </form>
        </div>

        {/* Right Info Box */}
        <div className="space-y-6">
          <div className="bg-slate-900/40 border border-rose-500/10 p-6 rounded-2xl shadow-xl space-y-3">
            <div className="flex items-center gap-2 text-rose-400">
              <ShieldAlert className="w-5 h-5" />
              <h4 className="font-bold text-xs uppercase tracking-wider">Security Notice</h4>
            </div>
            <p className="text-xs text-slate-500 leading-normal">
              Authentication tokens expire after 24 hours. Keep your secret configuration files protected at all times.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
