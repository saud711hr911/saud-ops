/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from './FirebaseProvider';
import { translations } from '../translations';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  getDocs
} from 'firebase/firestore';
import { RequestDoc, UserProfile, UserRole, RequestStatus, UrgencyLevel } from '../types';
import { 
  TrendingUp, 
  UserPlus, 
  Users, 
  FolderLock, 
  Clock, 
  Search, 
  Trash2, 
  Plus, 
  AlertCircle,
  Building,
  CheckCircle,
  Star,
  Activity,
  Award
} from 'lucide-react';
import { ClientVaultManager } from './ClientVaultManager';
import { TemplateManager } from './TemplateManager';

interface AdminDashboardProps {
  onSelectRequest: (request: RequestDoc) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onSelectRequest }) => {
  const { user, locale } = useAuth();
  const t = translations[locale];

  // Loaded database states
  const [requests, setRequests] = useState<RequestDoc[]>([]);
  const [teamProfiles, setTeamProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Client registration form state
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientCompany, setClientCompany] = useState('');
  const [onboardSuccess, setOnboardSuccess] = useState('');
  const [onboardError, setOnboardError] = useState('');
  const [showClientForm, setShowClientForm] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editingClientName, setEditingClientName] = useState('');

  // Search & Filtration tools
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dashboardTab, setDashboardTab] = useState<'requests' | 'performance' | 'clients' | 'templates'>('requests');

  // Load all requests dynamically
  useEffect(() => {
    setLoading(true);
    const requestsRef = collection(db, 'requests');
    const q = query(requestsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: RequestDoc[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          requestId: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
        } as RequestDoc);
      });
      setRequests(list);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching admin requests:", error);
      handleFirestoreError(error, OperationType.LIST, 'requests');
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Load registered users (Employees, Admins, Clients)
  useEffect(() => {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: UserProfile[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          userId: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt
        } as UserProfile);
      });
      setTeamProfiles(list);
    }, (error) => {
      console.error("Error reading systemic user rosters:", error);
    });

    return unsubscribe;
  }, []);

  // Onboard new client account profile directly in users collection
  const handleOnboardClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setOnboardError('');
    setOnboardSuccess('');

    if (!clientName.trim() || !clientEmail.trim() || !clientCompany.trim()) {
      setOnboardError(locale === 'ar' ? 'الرجاء ملء حقول نموذج إضافة المشترك بالكامل.' : 'Please enter all details.');
      return;
    }

    try {
      // Simulate/Generate a unique UID for client onboarding
      const mockUid = 'client_' + Math.random().toString(36).substr(2, 9);
      const userRef = doc(db, 'users', mockUid);
      
      const newClientProfile: UserProfile = {
        userId: mockUid,
        name: clientName.trim(),
        email: clientEmail.trim().toLowerCase(),
        role: 'client',
        company: clientCompany.trim(),
        createdAt: new Date().toISOString()
      };

      await setDoc(userRef, {
        ...newClientProfile,
        createdAt: serverTimestamp()
      });

      setClientName('');
      setClientEmail('');
      setClientCompany('');
      setOnboardSuccess(locale === 'ar' ? 'تم تسجيل بيانات وهيكل المنشأة للعميل الجديد بنجاح.' : 'Client onboarding profile provisioned successfully.');
      setTimeout(() => {
        setOnboardSuccess('');
        setShowClientForm(false);
      }, 2500);

    } catch (error) {
      setOnboardError("Failed saving client structure.");
    }
  };

  // Safe delete ticket (Administrator restricted bypass)
  const handleDeleteRequest = async (e: React.MouseEvent, reqId: string) => {
    e.stopPropagation(); // prevent panel click navigation triggers
    if (!window.confirm(t.confirmDelete)) return;

    try {
      const requestRef = doc(db, 'requests', reqId);
      await deleteDoc(requestRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `requests/${reqId}`);
    }
  };

  // Perform client side search and status filtration
  const filteredRequests = requests.filter(req => {
    const matchesSearch = req.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          req.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (req.assignedEmployeeName && req.assignedEmployeeName.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === 'All' || req.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // KPI Math helpers:
  const totalTickets = requests.length;
  const inProgressTickets = requests.filter(r => r.status === 'In Progress').length;
  const completedTickets = requests.filter(r => r.status === 'Completed' || r.status === 'Closed').length;
  const unassignedCount = requests.filter(r => r.assignedEmployeeId === "").length;
  
  // Resolution Index percentage
  const successPercentage = totalTickets > 0 ? Math.round((completedTickets / totalTickets) * 100) : 0;

  // Build employee performance loads (Count requests & completed tasks per employee)
  const employeesList = teamProfiles.filter(u => u.role === 'employee' || u.role === 'admin');
  const employeeLoads = employeesList.map(emp => {
    const assigned = requests.filter(r => r.assignedEmployeeId === emp.userId);
    const activeLoad = assigned.filter(r => r.status !== 'Closed' && r.status !== 'Completed').length;
    const completedLoad = assigned.filter(r => r.status === 'Completed' || r.status === 'Closed').length;
    const satisfactionSLA = assigned.length > 0 ? Math.round((completedLoad / assigned.length) * 100) : 100;

    return {
      ...emp,
      assignedCount: assigned.length,
      activeLoad,
      completedLoad,
      satisfactionSLA
    };
  });

  return (
    <div className="space-y-6">
      
      {/* Dynamic Statistics Board */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
        
        <div className="bg-white p-4 border border-slate-200 rounded-xl flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 bg-blue-105/90 text-blue-600 rounded-lg flex items-center justify-center font-extrabold text-lg mt-0.5 font-mono">
            {String(totalTickets).padStart(2, '0')}
          </div>
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">{locale === 'ar' ? 'إجمالي الطلبات' : 'Total Requests'}</div>
            <div className="text-sm font-extrabold text-slate-800">{locale === 'ar' ? 'مسجلة' : 'Registered'}</div>
          </div>
        </div>

        <div className="bg-white p-4 border border-slate-200 rounded-xl flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center font-extrabold text-lg mt-0.5 font-mono">
            {String(inProgressTickets).padStart(2, '0')}
          </div>
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">{locale === 'ar' ? 'طلبات قيد الإجراء' : 'In Progress'}</div>
            <div className="text-sm font-extrabold text-slate-800">{locale === 'ar' ? 'جاري العمل' : 'Active Work'}</div>
          </div>
        </div>

        <div className="bg-white p-4 border border-slate-200 rounded-xl flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-lg flex items-center justify-center font-extrabold text-lg mt-0.5 font-mono">
            {String(unassignedCount).padStart(2, '0')}
          </div>
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t.unassignedRequestsCount}</div>
            <div className="text-sm font-extrabold text-rose-600">{locale === 'ar' ? 'طلب شاغر' : 'Needs Action'}</div>
          </div>
        </div>

        <div className="bg-white p-4 border border-slate-200 rounded-xl flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center font-extrabold text-lg mt-0.5 font-mono">
            {String(completedTickets).padStart(2, '0')}
          </div>
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">{locale === 'ar' ? 'طلبات منفذة' : 'Resolved'}</div>
            <div className="text-sm font-extrabold text-slate-800">{locale === 'ar' ? 'إنجاز منتهي' : 'Completed Rate'}</div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-950 p-4 rounded-xl flex items-center justify-between text-white shadow-md col-span-1 sm:col-span-2 md:col-span-1 transition-all">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t.performanceRatio}</p>
            <h4 className="text-2xl font-black mt-0.5 text-blue-400">{successPercentage}%</h4>
            <p className="text-[9px] text-slate-400 truncate max-w-[124px]">{t.performanceRatioDesc}</p>
          </div>
          <TrendingUp className="w-8 h-8 text-blue-400" />
        </div>

      </div>

      {/* Segment tabs */}
      <div className="flex border-b border-slate-200 text-sm gap-4">
        <button
          onClick={() => setDashboardTab('requests')}
          className={`pb-2.5 font-bold transition-all border-b-2 outline-none cursor-pointer ${
            dashboardTab === 'requests' 
              ? 'border-blue-600 text-blue-600' 
              : 'border-transparent text-slate-400 hover:text-slate-650'
          }`}
        >
          {locale === 'ar' ? 'متابعة وتفتيش الطلبات' : 'Inspection Board'} ({requests.length})
        </button>

        <button
          onClick={() => setDashboardTab('performance')}
          className={`pb-2.5 font-bold transition-all border-b-2 outline-none cursor-pointer ${
            dashboardTab === 'performance' 
              ? 'border-blue-600 text-blue-600' 
              : 'border-transparent text-slate-400 hover:text-slate-650'
          }`}
        >
          {locale === 'ar' ? 'لوحة تتبع الموظفين والكفاءة' : 'KPI Track Reports'} ({employeesList.length})
        </button>

        <button
          onClick={() => setDashboardTab('clients')}
          className={`pb-2.5 font-bold transition-all border-b-2 outline-none cursor-pointer ${
            dashboardTab === 'clients' 
              ? 'border-blue-600 text-blue-600' 
              : 'border-transparent text-slate-400 hover:text-slate-650'
          }`}
        >
          {locale === 'ar' ? 'سجل المشتركين (العملاء)' : 'Partners & Clients'} ({teamProfiles.filter(u => u.role === 'client').length})
        </button>

        <button
          onClick={() => setDashboardTab('templates')}
          className={`pb-2.5 font-bold transition-all border-b-2 outline-none cursor-pointer ${
            dashboardTab === 'templates' 
              ? 'border-blue-600 text-blue-600' 
              : 'border-transparent text-slate-400 hover:text-slate-650'
          }`}
        >
          {locale === 'ar' ? 'مكتبة نماذج ومسارات الخدمات' : 'Templates Library'}
        </button>
      </div>

      {/* DASHBOARD CARD 1: GLOBAL REQUESTS MONITOR */}
      {dashboardTab === 'requests' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h3 className="font-extrabold text-gray-800 text-base">{locale === 'ar' ? 'لوحة فحص الطلبات وتوزيع الأعباء' : 'Steer Master Board'}</h3>
            
            {/* Filters */}
            <div className="flex items-center space-x-2 rtl:space-x-reverse bg-white p-1 rounded-xl border border-gray-200/80">
              <div className="flex items-center px-2.5 text-gray-400 font-sans">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder={t.searchPlaceholder}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="text-xs outline-none py-1.5 focus:ring-0 text-gray-700 w-44 sm:w-60"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs font-semibold bg-gray-50 border border-gray-200/50 text-gray-600 rounded-lg px-2 py-1 outline-none ml-1"
              >
                <option value="All">{locale === 'ar' ? 'جميع الحالات' : 'All Statuses'}</option>
                <option value="New">{t.newStatus}</option>
                <option value="In Progress">{t.inProgressStatus}</option>
                <option value="Waiting for Client">{t.waitingClientStatus}</option>
                <option value="Completed">{t.completedStatus}</option>
                <option value="Closed">{t.closedStatus}</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {loading ? (
              <p className="text-center py-10 text-gray-400 text-xs">{t.loading}</p>
            ) : filteredRequests.length === 0 ? (
              <p className="text-center py-10 text-gray-400 text-xs italic">{t.noRequests}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right rtl:text-right ltr:text-left text-sm whitespace-nowrap">
                  <thead className="bg-gray-50/60 text-xs font-bold text-gray-400/90 uppercase border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-3">{t.requestSubject}</th>
                      <th className="px-6 py-3">{t.clientRole}</th>
                      <th className="px-6 py-3">{t.urgency}</th>
                      <th className="px-6 py-3">{t.status}</th>
                      <th className="px-6 py-3">{t.assignedTo}</th>
                      <th className="px-6 py-3">{t.createdAt}</th>
                      <th className="px-6 py-3 text-center">إدارة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredRequests.map((req) => (
                      <tr
                        key={req.requestId}
                        onClick={() => onSelectRequest(req)}
                        className="hover:bg-slate-50/50 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="font-extrabold text-gray-950 truncate max-w-[200px]">{req.title}</div>
                          <div className="text-xs text-gray-400 truncate max-w-[200px]">{req.description}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-800">{req.clientName}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            req.urgency === 'High' ? 'bg-red-50 text-red-600' :
                            req.urgency === 'Medium' ? 'bg-amber-50 text-amber-600' :
                            'bg-slate-100 text-slate-500'
                          }`}>
                            {req.urgency === 'High' ? t.high : req.urgency === 'Medium' ? t.medium : t.low}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                            req.status === 'New' ? 'bg-indigo-50 text-indigo-700' :
                            req.status === 'In Progress' ? 'bg-emerald-50 text-emerald-700' :
                            req.status === 'Waiting for Client' ? 'bg-blue-50 text-blue-700' :
                            req.status === 'Completed' ? 'bg-amber-50 text-amber-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {req.status === 'New' ? t.newStatus :
                             req.status === 'In Progress' ? t.inProgressStatus :
                             req.status === 'Waiting for Client' ? t.waitingClientStatus :
                             req.status === 'Completed' ? t.completedStatus : t.closedStatus}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-medium text-gray-500">
                          {req.assignedEmployeeName || (
                            <span className="text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded font-bold text-[10px]">
                              {t.unassigned}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs font-mono text-gray-400">
                          {req.createdAt ? new Date(req.createdAt).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US') : ''}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={(e) => handleDeleteRequest(e, req.requestId)}
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                            title="حذف الطلب"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DASHBOARD CARD 2: TEAM WORKLOADS & PERFORMANCE */}
      {dashboardTab === 'performance' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-gray-800 text-base">{t.teamPerformance}</h3>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-blue-50 text-blue-700 font-bold text-xs">
              <Award className="w-4 h-4" />
              <span>{locale === 'ar' ? 'تحديث تلقائي مستند للطلبات' : 'Real-time Derived KPIs'}</span>
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <p className="text-xs text-gray-400 mb-6 font-sans">
              {locale === 'ar' 
                ? 'مستويات الأداء والمساءلة يتم احتسابها دورياً للتحقق من سرعة تسوية بطاقات الخدمة SLA وتجنب تراكم الطلبات غير المعينة.'
                : 'Performance indexes represent completed task tickets over assigned quotas. Use instructions to correct team backlogs.'}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {employeeLoads.map(emp => (
                <div key={emp.userId} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-sm">{emp.name}</h4>
                      <p className="text-[10px] text-gray-400">{emp.email}</p>
                    </div>
                    <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700">
                      {emp.role.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center pt-2">
                    <div className="p-2.5 bg-white rounded-xl border border-gray-150">
                      <p className="text-[10px] text-gray-400">{locale === 'ar' ? 'المجموع' : 'Total Assigned'}</p>
                      <p className="text-lg font-bold text-slate-800 mt-1">{emp.assignedCount}</p>
                    </div>
                    <div className="p-2.5 bg-white rounded-xl border border-gray-150">
                      <p className="text-[10px] text-gray-400">{locale === 'ar' ? 'قيد العمل' : 'Active Load'}</p>
                      <p className="text-lg font-bold text-blue-600 mt-1">{emp.activeLoad}</p>
                    </div>
                    <div className="p-2.5 bg-white rounded-xl border border-gray-150">
                      <p className="text-[10px] text-gray-400">{locale === 'ar' ? 'تمت التسوية' : 'Closed Rate'}</p>
                      <p className="text-lg font-bold text-emerald-600 mt-1">{emp.completedLoad}</p>
                    </div>
                  </div>

                  {/* Tailwind native completion progress bar (No complex libraries required) */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold text-gray-500">
                      <span>{locale === 'ar' ? 'نسبة تسوية الطلبات' : 'Ticket Success Ratio'}</span>
                      <span>{emp.satisfactionSLA}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-500 ${
                          emp.satisfactionSLA >= 80 ? 'bg-emerald-500' :
                          emp.satisfactionSLA >= 50 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${emp.satisfactionSLA}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* DASHBOARD CARD 3: CLIENT & PARTNER MANAGE PORTAL */}
      {dashboardTab === 'clients' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-extrabold text-gray-800 text-base">{t.clientManagement}</h3>
            <button
              onClick={() => setShowClientForm(!showClientForm)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-xs"
            >
              {showClientForm ? t.cancel : t.addClient}
            </button>
          </div>

          {/* New Register Form */}
          {showClientForm && (
            <form onSubmit={handleOnboardClient} className="bg-white rounded-2xl border border-slate-205 p-6 shadow-sm space-y-4 max-w-2xl animate-in fade-in slide-in-from-top-3">
              <h4 className="text-sm font-bold text-gray-800">{locale === 'ar' ? 'تسجيل بيانات وهيكل منشأة العميل الجديد' : 'Register New Partner Roster'}</h4>
              
              {onboardError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-100 text-xs font-semibold text-red-600 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{onboardError}</span>
                </div>
              )}

              {onboardSuccess && (
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-xs font-semibold text-emerald-600 flex items-center gap-1.5 animate-pulse">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>{onboardSuccess}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500">{t.clientName}</label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="مثال: علي منصور العتيبي"
                    className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 outline-none focus:border-blue-100"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500">{t.clientEmail}</label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="rep@company.com"
                    className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 outline-none focus:border-blue-100"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500">{t.clientCompany}</label>
                  <input
                    type="text"
                    value={clientCompany}
                    onChange={(e) => setClientCompany(e.target.value)}
                    placeholder="الشركة السعودية للتجارة"
                    className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 outline-none focus:border-blue-100"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-1.5 border-t border-gray-50 pt-3">
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-xs flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{locale === 'ar' ? 'متابعة وحفظ' : 'Register Account'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Registered Client List */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {teamProfiles.filter(u => u.role === 'client').map(client => (
                <div key={client.userId} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <div className="space-y-1 overflow-hidden">
                    <h5 className="text-xs font-extrabold text-slate-800 flex items-center gap-1">
                      <Building className="w-3.5 h-3.5 text-gray-400" />
                      <span className="truncate">{client.company || 'Standard Enterprise'}</span>
                    </h5>
                    <p className="text-[11px] font-medium text-gray-700 truncate">{client.name}</p>
                    <p className="text-[10px] text-gray-400 truncate">{client.email}</p>
                  </div>
                  <button
                    onClick={() => { setEditingClientId(client.userId); setEditingClientName(client.name); }}
                    className="p-2 rounded-lg hover:bg-white text-gray-400 hover:text-blue-600 transition-colors"
                  >
                    <FolderLock className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            
            {editingClientId && (
              <div className="mt-6">
                <ClientVaultManager clientId={editingClientId} clientName={editingClientName} />
              </div>
            )}
          </div>
        </div>
      )}

      {dashboardTab === 'templates' && (
        <TemplateManager />
      )}

    </div>
  );
};
