/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useAuth } from './FirebaseProvider';
import { translations } from '../translations';
import { Globe, LogOut, Shield, Award, UserCheck, RefreshCw } from 'lucide-react';

export const Header: React.FC = () => {
  const { 
    user, 
    role, 
    locale, 
    setLocale, 
    logoutUser, 
    isDemoMode,
    setDemoRole 
  } = useAuth();

  const t = translations[locale];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          
          {/* Logo & Slogan */}
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            <div className="flex items-center justify-center w-10 h-10 bg-slate-950 rounded border border-slate-800 shadow-sm">
              <div className="w-5 h-5 bg-blue-500 rounded flex items-center justify-center">
                <div className="w-2.5 h-2.5 bg-white rounded-sm"></div>
              </div>
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-slate-900 tracking-tight leading-none uppercase">
                {t.appName}
              </h1>
              <span className="text-[10px] text-slate-500 font-medium tracking-tight block">
                {t.tagline}
              </span>
            </div>
          </div>

          {/* Quick interactive parameters */}
          <div className="flex items-center space-x-2 sm:space-x-4 rtl:space-x-reverse">
            
            {/* Language Switcher */}
            <button
              onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
              className="flex items-center space-x-1.5 rtl:space-x-reverse text-xs font-semibold text-slate-650 hover:text-blue-600 px-3 py-1.5 rounded bg-slate-50 border border-slate-200 hover:border-blue-300 transition-colors cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{locale === 'ar' ? 'En' : 'العربية'}</span>
            </button>

            {user && (
              <>
                {/* Instant Role Controller for Reviewers */}
                <div className="hidden md:flex items-center bg-slate-50 p-1 rounded border border-slate-200 text-xs gap-1">
                  <span className="text-slate-400 px-1.5 font-bold tracking-tight text-[10px] uppercase">{t.switchRoleTest}:</span>
                  <button
                    onClick={() => setDemoRole('client')}
                    className={`px-2 py-1 rounded font-bold transition-all text-[11px] cursor-pointer ${
                      role === 'client' 
                        ? 'bg-blue-600 text-white shadow-xs' 
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {t.clientRole}
                  </button>
                  <button
                    onClick={() => setDemoRole('employee')}
                    className={`px-2 py-1 rounded font-bold transition-all text-[11px] cursor-pointer ${
                      role === 'employee' 
                        ? 'bg-emerald-600 text-white shadow-xs' 
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {t.employeeRole}
                  </button>
                  <button
                    onClick={() => setDemoRole('admin')}
                    className={`px-2 py-1 rounded font-bold transition-all text-[11px] cursor-pointer ${
                      role === 'admin' 
                        ? 'bg-amber-600 text-white shadow-xs' 
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {t.adminRole}
                  </button>
                </div>

                {/* User Badging */}
                <div className="flex items-center space-x-2 rtl:space-x-reverse">
                  <div className="text-right hidden sm:block">
                    <div className="text-xs font-bold text-slate-900">{user.displayName || user.email}</div>
                    <div className="flex justify-end items-center gap-1 mt-0.5">
                      {role === 'admin' && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <Award className="w-2.5 h-2.5 mr-0.5 rtl:mr-0 rtl:ml-0.5" />
                          {t.adminRole}
                        </span>
                      )}
                      {role === 'employee' && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <UserCheck className="w-2.5 h-2.5 mr-0.5 rtl:mr-0 rtl:ml-0.5" />
                          {t.employeeRole}
                        </span>
                      )}
                      {role === 'client' && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {t.clientRole}
                        </span>
                      )}
                      {isDemoMode && (
                        <span className="inline-flex items-center px-1 py-0.5 rounded text-[8px] font-bold bg-rose-50 text-rose-600 border border-rose-100 animate-pulse uppercase">
                          Demo
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Log Out */}
                  <button
                    onClick={logoutUser}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded border border-transparent hover:border-rose-100 transition-colors cursor-pointer"
                    title={t.logout}
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      </div>

      {/* Mobile-only Quick Role Switcher */}
      {user && (
        <div className="md:hidden bg-slate-50 border-t border-slate-250 px-4 py-2 flex items-center justify-around text-xs">
          <span className="text-slate-400 font-bold text-[10px] uppercase">{t.switchRoleTest}:</span>
          <button
            onClick={() => setDemoRole('client')}
            className={`px-2 py-0.5 rounded font-bold cursor-pointer ${
              role === 'client' ? 'bg-blue-600 text-white' : 'text-slate-600'
            }`}
          >
            {t.clientRole}
          </button>
          <button
            onClick={() => setDemoRole('employee')}
            className={`px-2 py-0.5 rounded font-bold cursor-pointer ${
              role === 'employee' ? 'bg-emerald-600 text-white' : 'text-slate-600'
            }`}
          >
            {t.employeeRole}
          </button>
          <button
            onClick={() => setDemoRole('admin')}
            className={`px-2 py-0.5 rounded font-bold cursor-pointer ${
              role === 'admin' ? 'bg-amber-600 text-white' : 'text-slate-600'
            }`}
          >
            {t.adminRole}
          </button>
        </div>
      )}
    </header>
  );
};
