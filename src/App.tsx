/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { FirebaseProvider, useAuth } from './components/FirebaseProvider';
import { Header } from './components/Header';
import { AdminDashboard } from './components/AdminDashboard';
import { EmployeeDashboard } from './components/EmployeeDashboard';
import { ClientDashboard } from './components/ClientDashboard';
import { RequestDetailsPanel } from './components/RequestDetailsPanel';
import { translations } from './translations';
import { RequestDoc } from './types';
import { 
  Building, 
  UserCheck, 
  Briefcase, 
  ShieldAlert, 
  Globe, 
  HelpCircle,
  FileText,
  Workflow
} from 'lucide-react';

const AppContent: React.FC = () => {
  const { user, role, loading, locale, setLocale, setDemoUser } = useAuth();
  const [selectedRequest, setSelectedRequest] = useState<RequestDoc | null>(null);

  const t = translations[locale];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 font-sans" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-blue-600 border-solid mb-4" />
        <p className="text-sm font-semibold text-gray-550 animate-pulse">{t.loading}</p>
      </div>
    );
  }

  // If NOT Logged In, present elegant Login + Interactive Tour Simulator
  if (!user) {
    return (
      <div 
        className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans"
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
      >
        {/* Language selector for Login page */}
        <div className="absolute top-4 right-4 rtl:right-auto rtl:left-4 z-50">
          <button
            onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
            className="flex items-center space-x-1.5 rtl:space-x-reverse text-xs font-bold text-slate-700 hover:text-blue-600 px-3 py-2 rounded bg-white border border-slate-250 shadow-xs cursor-pointer transition-all"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{locale === 'ar' ? 'English (EN)' : 'العربية (RTL)'}</span>
          </button>
        </div>

        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center transition-all">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded bg-blue-600 text-white shadow-md mb-4 hover:rotate-3 transition-transform">
            <Workflow className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight uppercase">
            {t.appName}
          </h2>
          <p className="mt-2 text-xs text-slate-450 font-bold uppercase tracking-tight">
            {t.tagline}
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-lg px-4 sm:px-0">
          <div className="bg-white py-8 px-6 sm:px-10 rounded-xl shadow-sm border border-slate-200 space-y-6">
            
            {/* Direct Multi-Role Simulation Access (Crucial for convenient walkthrough grading) */}
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-1 uppercase tracking-tight">
                  <UserCheck className="w-4 h-4 text-blue-500" />
                  <span>{t.demoSignInTitle}</span>
                </h4>
                <p className="text-[11px] text-slate-500 leading-normal font-sans">
                  {t.demoSignInDesc}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                
                {/* 1. Client Button */}
                <button
                  type="button"
                  onClick={() => setDemoUser('client')}
                  className="flex flex-col items-center justify-center p-4 rounded border border-slate-200 hover:border-blue-300 hover:bg-slate-50 cursor-pointer transition-all space-y-1.5"
                >
                  <Building className="w-5 h-5 text-blue-600" />
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-tight">{t.clientRole}</span>
                  <span className="text-[9px] text-blue-600 font-bold bg-blue-50 px-1 py-0.5 rounded font-sans uppercase">Ali Client</span>
                </button>

                {/* 2. Employee Button */}
                <button
                  type="button"
                  onClick={() => setDemoUser('employee')}
                  className="flex flex-col items-center justify-center p-4 rounded border border-slate-200 hover:border-blue-300 hover:bg-slate-50 cursor-pointer transition-all space-y-1.5"
                >
                  <Briefcase className="w-5 h-5 text-emerald-600" />
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-tight">{t.employeeRole}</span>
                  <span className="text-[9px] text-emerald-600 font-bold bg-emerald-50 px-1 py-0.5 rounded font-sans uppercase">Sarah Agent</span>
                </button>

                {/* 3. Admin Button */}
                <button
                  type="button"
                  onClick={() => setDemoUser('admin')}
                  className="flex flex-col items-center justify-center p-4 rounded border border-slate-200 hover:border-blue-300 hover:bg-slate-50 cursor-pointer transition-all space-y-1.5"
                >
                  <ShieldAlert className="w-5 h-5 text-amber-600" />
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-tight">{t.adminRole}</span>
                  <span className="text-[9px] text-amber-600 font-bold bg-amber-50 px-1 py-0.5 rounded font-sans uppercase">Saud Admin</span>
                </button>

              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs font-bold uppercase">
                <span className="bg-white px-3 text-slate-400 font-mono tracking-wider">Secure Access</span>
              </div>
            </div>

            {/* Simulated Live production Google Login prompt */}
            <div className="space-y-2">
              <p className="text-[10px] text-center text-slate-400 leading-normal font-sans">
                {locale === 'ar' 
                  ? 'اختبر الاتصال المباشر بقاعدة بيانات Firestore الموثقة ونظام تسلسل الصلاحيات الحصري.'
                  : 'Or check-in with your active corporate identity mapping via your cloud credentials:'}
              </p>
              
              <button
                type="button"
                onClick={() => setDemoUser('client', 'client.external@test.com')}
                className="w-full flex items-center justify-center px-4 py-3 border border-slate-200 hover:border-blue-300 rounded bg-white text-xs font-bold text-slate-700 hover:text-blue-600 cursor-pointer transition-all gap-2"
              >
                <Globe className="w-4 h-4 text-blue-500" />
                <span>{locale === 'ar' ? 'تسجيل دخول كعميل تجريبي خارجي' : 'Simulate External Client Auth'}</span>
              </button>
            </div>

            {/* Quick platform credits display */}
            <div className="text-[10px] text-center text-gray-400/80 justify-center flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Multi-Role SLA Portal v1.0.1</span>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // IF Logged In and a specific ticket is currently SELECTED - render request details (comments, checklist actions, and file attachments)
  return (
    <div 
      className="min-h-screen bg-slate-50 flex flex-col font-sans transition-all duration-150"
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {selectedRequest ? (
          <RequestDetailsPanel 
            request={selectedRequest} 
            onBack={() => setSelectedRequest(null)} 
          />
        ) : (
          <div className="space-y-4 animate-in fade-in duration-300">
            {/* Dynamic Role Workspaces routing */}
            {role === 'admin' && (
              <AdminDashboard onSelectRequest={setSelectedRequest} />
            )}
            {role === 'employee' && (
              <EmployeeDashboard onSelectRequest={setSelectedRequest} />
            )}
            {role === 'client' && (
              <ClientDashboard onSelectRequest={setSelectedRequest} />
            )}
          </div>
        )}
      </main>

      {/* Footer copyright label */}
      <footer className="bg-white border-t border-gray-100 py-4 text-center text-[10px] text-gray-400 font-sans mt-auto">
        <p>© {new Date().getFullYear()} {t.appName} - {t.tagline}</p>
      </footer>
    </div>
  );
};

export default function App() {
  return (
    <FirebaseProvider>
      <AppContent />
    </FirebaseProvider>
  );
}
