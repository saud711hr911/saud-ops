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
  where, 
  orderBy, 
  onSnapshot, 
  doc,
  updateDoc,
  serverTimestamp,
  or
} from 'firebase/firestore';
import { RequestDoc, RequestStatus, TaskDoc } from '../types';
import { 
  ClipboardList, 
  History, 
  Search, 
  Filter, 
  UserPlus, 
  CheckCircle, 
  Clock, 
  ShieldAlert, 
  ChevronRight,
  Flame
} from 'lucide-react';

interface EmployeeDashboardProps {
  onSelectRequest: (request: RequestDoc) => void;
}

export const EmployeeDashboard: React.FC<EmployeeDashboardProps> = ({ onSelectRequest }) => {
  const { user, profile, locale } = useAuth();
  const t = translations[locale];

  const [requests, setRequests] = useState<RequestDoc[]>([]);
  const [unassignedRequests, setUnassignedRequests] = useState<RequestDoc[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & search state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [activeTab, setActiveTab] = useState<'mine' | 'unassigned'>('mine');

  // Load employee specific requests
  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const requestsRef = collection(db, 'requests');
    const qMyRequests = query(
      requestsRef, 
      where('assignedEmployeeId', '==', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribeMy = onSnapshot(qMyRequests, (snapshot) => {
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
      console.error("Error loaded employee assigned tickets:", error);
      handleFirestoreError(error, OperationType.LIST, 'requests');
      setLoading(false);
    });

    return () => unsubscribeMy();
  }, [user]);

  // Load unassigned requests that the employee can "claim"
  useEffect(() => {
    const requestsRef = collection(db, 'requests');
    const qUnassigned = query(
      requestsRef,
      where('assignedEmployeeId', '==', ''),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeUnassigned = onSnapshot(qUnassigned, (snapshot) => {
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
      setUnassignedRequests(list);
    }, (error) => {
      console.error("Error loaded unassigned requests:", error);
    });

    return () => unsubscribeUnassigned();
  }, []);

  // Volunteer "claim" ticket
  const handleClaimRequest = async (e: React.MouseEvent, reqId: string) => {
    e.stopPropagation(); // prevent opening details panel during row click
    if (!user) return;

    try {
      const requestRef = doc(db, 'requests', reqId);
      await updateDoc(requestRef, {
        assignedEmployeeId: user.uid,
        assignedEmployeeName: profile?.name || user.displayName || user.email || 'Employee Agent',
        status: 'In Progress',
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `requests/${reqId}`);
    }
  };

  // Perform client side filtration
  const displayedRequests = (activeTab === 'mine' ? requests : unassignedRequests).filter(req => {
    const matchesSearch = req.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          req.clientName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || req.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      
      {/* Employee KPI Overview Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        
        <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{locale === 'ar' ? 'طلباتي النشطة' : 'My Active Tickets'}</p>
            <h4 className="text-xl font-mono font-extrabold text-blue-600 mt-1">
              {String(requests.filter(r => r.status !== 'Closed' && r.status !== 'Completed').length).padStart(2, '0')}
            </h4>
          </div>
          <Clock className="w-5 h-5 text-blue-500" />
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{locale === 'ar' ? 'بانتظار تدقيق الإجراء' : 'Waiting on Client'}</p>
            <h4 className="text-xl font-mono font-extrabold text-slate-800 mt-1">
              {String(requests.filter(r => r.status === 'Waiting for Client').length).padStart(2, '0')}
            </h4>
          </div>
          <ShieldAlert className="w-5 h-5 text-amber-500" />
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{locale === 'ar' ? 'طلب شاغر غير معين' : 'Unassigned Pool'}</p>
            <h4 className="text-xl font-mono font-extrabold text-rose-600 mt-1">
              {String(unassignedRequests.length).padStart(2, '0')}
            </h4>
          </div>
          <Flame className="w-5 h-5 text-rose-500 animate-pulse" />
        </div>

        <div className="bg-slate-900 border border-slate-950 p-4 rounded-xl flex items-center justify-between text-white shadow-md">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{locale === 'ar' ? 'الإنجاز الإجمالي' : 'Resolved Overall'}</p>
            <h4 className="text-xl font-mono font-extrabold text-emerald-400 mt-1">
              {String(requests.filter(r => r.status === 'Completed' || r.status === 'Closed').length).padStart(2, '0')}
            </h4>
          </div>
          <CheckCircle className="w-5 h-5 text-emerald-400" />
        </div>

      </div>

      {/* Tabs selectors for My list vs Public Pool list */}
      <div className="flex border-b border-slate-200 text-xs gap-6">
        <button
          onClick={() => { setActiveTab('mine'); setSearchTerm(''); }}
          className={`pb-3 font-bold transition-all border-b-2 outline-none cursor-pointer uppercase ${
            activeTab === 'mine' 
              ? 'border-blue-600 text-blue-600' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          {t.assignedRequests} ({requests.length})
        </button>
        <button
          onClick={() => { setActiveTab('unassigned'); setSearchTerm(''); }}
          className={`pb-3 font-bold transition-all border-b-2 outline-none cursor-pointer uppercase ${
            activeTab === 'unassigned' 
              ? 'border-rose-500 text-rose-500' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          {locale === 'ar' ? 'حوض الطلبات المعلقة العامة' : 'Public Requests Pool'} ({unassignedRequests.length})
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-xs font-bold text-slate-500 uppercase tracking-tight">
          {activeTab === 'mine' ? t.assignedRequests : (locale === 'ar' ? 'بإمكانك حجز وتعيين أي طلب عمليات لنفسك لتسريع المعالجة' : 'Pick one and start working')}
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-2 rtl:space-x-reverse bg-white p-1 rounded border border-slate-200/90">
          <div className="flex items-center px-2.5 text-gray-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="text-xs outline-none py-1.5 focus:ring-0 text-slate-700 w-44 sm:w-60"
          />
          {activeTab === 'mine' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs font-bold bg-slate-50 border border-slate-200 text-slate-700 rounded px-2.5 py-1 outline-none ml-1 focus:border-blue-500"
            >
              <option value="All">{locale === 'ar' ? 'جميع الحالات' : 'All Statuses'}</option>
              <option value="New">{t.newStatus}</option>
              <option value="In Progress">{t.inProgressStatus}</option>
              <option value="Waiting for Client">{t.waitingClientStatus}</option>
              <option value="Completed">{t.completedStatus}</option>
              <option value="Closed">{t.closedStatus}</option>
            </select>
          )}
        </div>
      </div>

      {/* Main Table database display */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-200">
        {loading ? (
          <p className="text-center py-10 text-gray-400 text-xs font-sans font-medium">{t.loading}</p>
        ) : displayedRequests.length === 0 ? (
          <div className="text-center py-12">
            <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm italic">{t.noRequests}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right rtl:text-right ltr:text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50/60 text-xs font-bold text-slate-450 uppercase border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3">{t.requestSubject}</th>
                  <th className="px-6 py-3">{locale === 'ar' ? 'الجهة الطالبة (العميل)' : 'Client Account'}</th>
                  <th className="px-6 py-3">{t.urgency}</th>
                  <th className="px-6 py-3">{t.status}</th>
                  <th className="px-6 py-3">{t.updatedAt}</th>
                  <th className="px-6 py-3 text-center">{locale === 'ar' ? 'الإجراء التفصيلي' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedRequests.map((req) => (
                  <tr
                    key={req.requestId}
                    onClick={() => onSelectRequest(req)}
                    className="hover:bg-slate-50/60 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 truncate max-w-[240px]">{req.title}</div>
                      <div className="text-xs text-slate-400 truncate max-w-[240px]">{req.description}</div>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-700">
                      {req.clientName}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                        req.urgency === 'High' ? 'bg-red-50 text-red-650' :
                        req.urgency === 'Medium' ? 'bg-amber-50 text-amber-650' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {req.urgency === 'High' ? t.high : req.urgency === 'Medium' ? t.medium : t.low}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${
                        req.status === 'New' ? 'bg-blue-50 text-blue-700' :
                        req.status === 'In Progress' ? 'bg-emerald-50 text-emerald-700' :
                        req.status === 'Waiting for Client' ? 'bg-amber-50 text-amber-700' :
                        req.status === 'Completed' ? 'bg-emerald-50 text-emerald-800' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {req.status === 'New' ? t.newStatus :
                         req.status === 'In Progress' ? t.inProgressStatus :
                         req.status === 'Waiting for Client' ? t.waitingClientStatus :
                         req.status === 'Completed' ? t.completedStatus : t.closedStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-slate-405">
                      {req.updatedAt ? new Date(req.updatedAt).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US') : ''}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {req.assignedEmployeeId === '' ? (
                        <button
                          onClick={(e) => handleClaimRequest(e, req.requestId)}
                          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1 mx-auto"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>{locale === 'ar' ? 'استلام الطلب' : 'Assign to Me'}</span>
                        </button>
                      ) : (
                        <div className="text-slate-400 hover:text-blue-600 transition-colors flex items-center justify-center">
                          <ChevronRight className="w-5 h-5 rtl:rotate-180" />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
