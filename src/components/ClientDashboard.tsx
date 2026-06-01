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
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';
import { RequestDoc, RequestStatus, UrgencyLevel, Attachment } from '../types';
import { 
  Plus, 
  FileText, 
  Search, 
  Filter, 
  AlertCircle, 
  Upload, 
  Clock, 
  Send, 
  Sparkles,
  Paperclip
} from 'lucide-react';

interface ClientDashboardProps {
  onSelectRequest: (request: RequestDoc) => void;
}

export const ClientDashboard: React.FC<ClientDashboardProps> = ({ onSelectRequest }) => {
  const { user, profile, locale } = useAuth();
  const t = translations[locale];

  const [requests, setRequests] = useState<RequestDoc[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  // New Request Form states
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState<UrgencyLevel>('Medium');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [uploadProgress, setUploadProgress] = useState(false);

  // Fetch client requests in real-time
  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const requestsRef = collection(db, 'requests');
    // Fetch only this client's tickets (Pillar 8: Secure list queries enforcer!)
    const q = query(
      requestsRef, 
      where('clientId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

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
      // Gracefully handle standard permission blocks or missing indexes
      console.error("Firestore fetching failed:", error);
      handleFirestoreError(error, OperationType.LIST, 'requests');
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  // Handle support uploads conversions
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setFormError('');
    setUploadProgress(true);

    const file = files[0];

    // Restrict size to 500KB to stay within Firestore Limits
    if (file.size > 500 * 1024) {
      setFormError(locale === 'ar' ? "الحد الأقصى لحجم الملف هو 500 كيلوبايت لضمان سرعة التزامن." : "Max file size is 500KB for real-time document transfers.");
      setUploadProgress(false);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const attachment: Attachment = {
        name: file.name,
        url: reader.result as string,
        type: file.type
      };
      setAttachments(prev => [...prev, attachment]);
      setUploadProgress(false);
    };
    reader.onerror = () => {
      setFormError("Error reading uploaded file.");
      setUploadProgress(false);
    };
    reader.readAsDataURL(file);
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!title.trim() || !description.trim()) {
      setFormError(locale === 'ar' ? 'الرجاء تعبئة كافة الحقول المطلوبة لتقديم طلبك.' : 'Please enter all required fields.');
      return;
    }

    try {
      const requestsRef = collection(db, 'requests');
      await addDoc(requestsRef, {
        title: title.trim(),
        description: description.trim(),
        status: 'New',
        urgency: urgency,
        clientId: user?.uid || '',
        clientName: profile?.name || user?.displayName || user?.email || 'Anonymous Client',
        assignedEmployeeId: '',
        assignedEmployeeName: '',
        attachments: attachments,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Clear Form state
      setTitle('');
      setDescription('');
      setUrgency('Medium');
      setAttachments([]);
      setFormSuccess(t.successRequestCreated);
      setTimeout(() => {
        setShowForm(false);
        setFormSuccess('');
      }, 2500);

    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'requests');
    }
  };

  // Filter application list based on search keywords and status selectors
  const filteredRequests = requests.filter(req => {
    const matchesSearch = req.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          req.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || req.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      
      {/* Client Overview Statistics Board */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        <div className="bg-white p-4 border border-slate-200 rounded-xl flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center font-extrabold text-lg mt-0.5 font-mono">
            {String(requests.filter(r => r.status !== 'Closed' && r.status !== 'Completed').length).padStart(2, '0')}
          </div>
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t.activeRequests}</div>
            <div className="text-sm font-extrabold text-slate-800">{locale === 'ar' ? 'قيد المعالجة' : 'In Service'}</div>
          </div>
        </div>

        <div className="bg-white p-4 border border-slate-200 rounded-xl flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center font-extrabold text-lg mt-0.5 font-mono">
            {String(requests.filter(r => r.status === 'Completed' || r.status === 'Closed').length).padStart(2, '0')}
          </div>
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t.completedRequests}</div>
            <div className="text-sm font-extrabold text-slate-800">{locale === 'ar' ? 'مكتملة ومغلقة' : 'Fully Cleared'}</div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-950 p-4 rounded-xl flex items-center justify-between text-white shadow-md">
          <div className="overflow-hidden">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{locale === 'ar' ? 'الجهة المتعاقدة' : 'Active Account Office'}</p>
            <h4 className="text-xs font-extrabold mt-1 text-blue-400 truncate max-w-[140px]">
              {profile?.company || 'Standard Enterprise'}
            </h4>
          </div>
          <div className="w-8 h-8 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-white uppercase font-mono flex-shrink-0">
            {profile?.company ? profile.company.slice(0, 2).toUpperCase() : 'SE'}
          </div>
        </div>

      </div>

      {/* Primary Actions area */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center space-x-2 rtl:space-x-reverse bg-blue-600 hover:bg-blue-705 text-white font-bold text-xs px-5 py-3 rounded shadow-sm transition-all cursor-pointer uppercase tracking-tight"
        >
          <Plus className="w-4 h-4" />
          <span>{t.newRequest}</span>
        </button>

        {/* Filters and search box */}
        <div className="flex items-center space-x-2 rtl:space-x-reverse bg-white p-1 rounded border border-slate-200">
          <div className="flex items-center px-2.5 text-gray-405">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="text-xs outline-none py-1.5 focus:ring-0 text-slate-700 w-44 sm:w-60"
          />
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
        </div>
      </div>

      {/* Create New Request Sliding Form */}
      {showForm && (
        <form onSubmit={handleCreateRequest} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <h3 className="text-base font-bold text-slate-900 border-b border-slate-50 pb-2">
            {t.createRequestTitle}
          </h3>

          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-xs font-semibold text-red-600 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" />
              <span>{formError}</span>
            </div>
          )}

          {formSuccess && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-xs font-semibold text-emerald-600 flex items-center gap-1.5 animate-bounce">
              <Sparkles className="w-4 h-4" />
              <span>{formSuccess}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Subject Input */}
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-slate-500">{t.requestSubject} <span className="text-rose-500">*</span></label>
              <input
                type="text"
                placeholder="تجديد السجلات، طلب صيانة، الخ..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-colors"
                required
              />
            </div>

            {/* Urgency Tuning */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500">{t.urgency}</label>
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value as UrgencyLevel)}
                className="w-full text-sm border border-slate-205 rounded px-3 py-2.5 outline-none focus:border-blue-500 bg-white"
              >
                <option value="Low">{t.low}</option>
                <option value="Medium">{t.medium}</option>
                <option value="High">{t.high}</option>
              </select>
            </div>

            {/* Description Details */}
            <div className="md:col-span-3 space-y-1.5">
              <label className="text-xs font-bold text-slate-500">{t.requestDescription} <span className="text-rose-500">*</span></label>
              <textarea
                placeholder="اكتب كامل الإرشادات والمتطلبات هنا..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full text-sm border border-slate-205 rounded px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-105 transition-colors bg-white"
                required
              />
            </div>

            {/* File Drag-Drop & Attachments */}
            <div className="md:col-span-3 space-y-1.5">
              <label className="text-xs font-bold text-slate-500">{t.attachments}</label>
              <div className="border-2 border-dashed border-slate-200 hover:border-blue-300 rounded p-4 transition-colors flex flex-col items-center justify-center relative bg-slate-50">
                <Upload className="w-5 h-5 text-slate-400 mb-2" />
                <span className="text-xs font-bold text-slate-500 mb-1">{t.dragDropOrClick}</span>
                <span className="text-[10px] text-slate-400 font-mono">(Max size: 500KB)</span>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  accept=".pdf,.xlsx,.xls,.doc,.docx,image/*"
                  disabled={uploadProgress}
                />
              </div>

              {/* Pending Upload Progress Indicators */}
              {uploadProgress && (
                <p className="text-xs text-blue-600 font-semibold mt-1">Uploading...</p>
              )}

              {/* Uploaded attachments cards preview */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {attachments.map((file, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded text-xs font-semibold text-slate-705">
                      <Paperclip className="w-3.5 h-3.5 text-blue-500" />
                      <span className="truncate max-w-[150px]">{file.name}</span>
                      <button 
                        type="button" 
                        onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                        className="text-red-400 hover:text-red-650 font-bold ml-1 cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

          </div>

          <div className="flex justify-end space-x-2 rtl:space-x-reverse pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-xs font-bold text-slate-400 hover:text-slate-600 px-4 py-2 cursor-pointer"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-2 rounded cursor-pointer shadow-sm flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{t.submit}</span>
            </button>
          </div>
        </form>
      )}

      {/* Requests History table layout */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-extrabold text-slate-900">{t.requestDetails}</h3>
        </div>

        {loading ? (
          <p className="text-center py-10 text-slate-400 text-sm tracking-tight">{t.loading}</p>
        ) : filteredRequests.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-400 text-sm italic">{t.noRequests}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right rtl:text-right ltr:text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50/60 text-xs font-bold text-slate-400 uppercase border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3">{t.requestSubject}</th>
                  <th className="px-6 py-3">{t.urgency}</th>
                  <th className="px-6 py-3">{t.status}</th>
                  <th className="px-6 py-3">{t.assignedTo}</th>
                  <th className="px-6 py-3">{t.createdAt}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRequests.map((req) => (
                  <tr
                    key={req.requestId}
                    onClick={() => onSelectRequest(req)}
                    className="hover:bg-slate-50/50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-950 truncate max-w-[240px]">{req.title}</div>
                      <div className="text-xs text-slate-400 truncate max-w-[240px]">{req.description}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                        req.urgency === 'High' ? 'bg-red-50 text-red-600' :
                        req.urgency === 'Medium' ? 'bg-amber-50 text-amber-600' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {req.urgency === 'High' ? t.high : req.urgency === 'Medium' ? t.medium : t.low}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${
                        req.status === 'New' ? 'bg-blue-50 text-blue-700' :
                        req.status === 'In Progress' ? 'bg-emerald-50 text-emerald-700' :
                        req.status === 'Waiting for Client' ? 'bg-blue-50 text-blue-700' :
                        req.status === 'Completed' ? 'bg-amber-50 text-amber-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {req.status === 'New' ? t.newStatus :
                         req.status === 'In Progress' ? t.inProgressStatus :
                         req.status === 'Waiting for Client' ? t.waitingClientStatus :
                         req.status === 'Completed' ? t.completedStatus : t.closedStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-semibold text-slate-500">
                      {req.assignedEmployeeName || t.unassigned}
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-slate-400">
                      {req.createdAt ? new Date(req.createdAt).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US') : ''}
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
