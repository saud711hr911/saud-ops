/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from './FirebaseProvider';
import { translations } from '../translations';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  doc, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  serverTimestamp, 
  query, 
  orderBy,
  arrayUnion,
  increment
} from 'firebase/firestore';
import { RequestDoc, CommentDoc, TaskDoc, RequestStatus, UrgencyLevel, Attachment } from '../types';
import { 
  MessageSquare, 
  CheckSquare, 
  Paperclip, 
  Clock, 
  User, 
  Tag, 
  ArrowLeft, 
  Send, 
  Plus, 
  FileText, 
  Check, 
  FileImage, 
  FileSpreadsheet, 
  AlertCircle 
} from 'lucide-react';

interface RequestDetailsPanelProps {
  request: RequestDoc;
  onBack: () => void;
}

export const RequestDetailsPanel: React.FC<RequestDetailsPanelProps> = ({ request, onBack }) => {
  const { role, user, locale } = useAuth();
  const t = translations[locale];

  const [comments, setComments] = useState<CommentDoc[]>([]);
  const [tasks, setTasks] = useState<TaskDoc[]>([]);
  
  // Input fields state
  const [newComment, setNewComment] = useState('');
  const [commentAttachments, setCommentAttachments] = useState<Attachment[]>([]);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskDesc, setTaskDesc] = useState('');

  // UI States
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [uploadProgress, setUploadProgress] = useState(false);
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load team users for administrator assignments helper
  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersList: { id: string; name: string; role: string }[] = [];
      snapshot.forEach(doc => {
        const u = doc.data();
        usersList.push({ id: doc.id, name: u.name, role: u.role });
      });
      // Filter employees & admins who can be assigned targets
      const assignable = usersList
        .filter(u => u.role === 'employee' || u.role === 'admin')
        .map(u => ({ id: u.id, name: u.name }));
      setEmployees(assignable);
    }, (error) => {
      console.error("Error loaded users for assignment:", error);
    });
    return () => unsubscribe();
  }, []);

  // Fetch comments in real-time
  useEffect(() => {
    const commentsRef = collection(db, 'requests', request.requestId, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'asc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: CommentDoc[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          commentId: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt
        } as CommentDoc);
      });
      setComments(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `requests/${request.requestId}/comments`);
    });

    return () => unsubscribe();
  }, [request.requestId]);

  // Fetch tasks in real-time
  useEffect(() => {
    const tasksRef = collection(db, 'requests', request.requestId, 'tasks');
    const q = query(tasksRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: TaskDoc[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          taskId: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt
        } as TaskDoc);
      });
      setTasks(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `requests/${request.requestId}/tasks`);
    });

    return () => unsubscribe();
  }, [request.requestId]);

  // Handle request-level updates (Admin/Employee status adjustments)
  const handleStatusChange = async (newStatus: RequestStatus) => {
    try {
      const requestRef = doc(db, 'requests', request.requestId);
      await updateDoc(requestRef, {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `requests/${request.requestId}`);
    }
  };

  const handleAssignmentChange = async (employeeId: string) => {
    const emp = employees.find(e => e.id === employeeId);
    try {
      const requestRef = doc(db, 'requests', request.requestId);
      await updateDoc(requestRef, {
        assignedEmployeeId: employeeId,
        assignedEmployeeName: emp ? emp.name : t.unassigned,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `requests/${request.requestId}`);
    }
  };

  const handleUrgencyChange = async (level: UrgencyLevel) => {
    try {
      const requestRef = doc(db, 'requests', request.requestId);
      await updateDoc(requestRef, {
        urgency: level,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `requests/${request.requestId}`);
    }
  };

  // Convert files to Base64 data urls to persist in Firestore
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setFileError('');
    setUploadProgress(true);

    const file = files[0];

    // Restrict size to 500KB to prevent overloading Firestore document limits
    if (file.size > 500 * 1024) {
      setFileError(locale === 'ar' ? "الحد الأقصى لحجم الملف هو 500 كيلوبايت لضمان سرعة التزامن." : "Max file size is 500KB for real-time document transfers.");
      setUploadProgress(false);
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const attachment: Attachment = {
        name: file.name,
        url: reader.result as string,
        type: file.type
      };

      try {
        if (newComment !== '' || commentAttachments.length > 0) {
          // Pre-add to active comment composition box
          setCommentAttachments(prev => [...prev, attachment]);
        } else {
          // Add directly to Request documents attachments
          const requestRef = doc(db, 'requests', request.requestId);
          await updateDoc(requestRef, {
            attachments: arrayUnion(attachment),
            updatedAt: serverTimestamp()
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `requests/${request.requestId}`);
      } finally {
        setUploadProgress(false);
      }
    };
    reader.onerror = () => {
      setFileError("Error reading file.");
      setUploadProgress(false);
    };
    reader.readAsDataURL(file);
  };

  // Create subtask (Admins only)
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;

    try {
      const tasksRef = collection(db, 'requests', request.requestId, 'tasks');
      await addDoc(tasksRef, {
        requestId: request.requestId,
        title: taskTitle.trim(),
        description: taskDesc.trim(),
        status: 'Pending',
        dueDate: taskDueDate || 'No Due Date',
        createdAt: serverTimestamp()
      });

      // Clear form
      setTaskTitle('');
      setTaskDesc('');
      setTaskDueDate('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `requests/${request.requestId}/tasks`);
    }
  };

  // Complete/Toggle task checklists
  const toggleTaskStatus = async (taskId: string, currentStatus: 'Pending' | 'Completed') => {
    try {
      const taskRef = doc(db, 'requests', request.requestId, 'tasks', taskId);
      await updateDoc(taskRef, {
        status: currentStatus === 'Pending' ? 'Completed' : 'Pending'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `requests/${request.requestId}/tasks/${taskId}`);
    }
  };

  // Add Comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() && commentAttachments.length === 0) return;

    try {
      const commentsRef = collection(db, 'requests', request.requestId, 'comments');
      await addDoc(commentsRef, {
        requestId: request.requestId,
        authorId: user?.uid || 'anonymous',
        authorName: user?.displayName || user?.email || 'User',
        authorRole: role,
        content: newComment.trim(),
        attachments: commentAttachments,
        createdAt: serverTimestamp()
      });

      // Clean comment form
      setNewComment('');
      setCommentAttachments([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `requests/${request.requestId}/comments`);
    }
  };

  // Render file attachment card helper
  const getFileIcon = (type: string) => {
    if (type.includes('image')) return <FileImage className="w-5 h-5 text-emerald-500" />;
    if (type.includes('excel') || type.includes('spreadsheet') || type.includes('xlsx')) return <FileSpreadsheet className="w-5 h-5 text-green-600" />;
    return <FileText className="w-5 h-5 text-indigo-500" />;
  };

  return (
    <div className="bg-slate-50 min-h-screen py-6 rounded-2xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        
        {/* Navigation Action */}
        <button
          onClick={onBack}
          className="flex items-center space-x-2 rtl:space-x-reverse text-blue-600 hover:text-blue-800 font-bold text-xs tracking-tight uppercase transition-colors cursor-pointer bg-white px-4 py-2.5 rounded border border-slate-200"
        >
          <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
          <span>{t.back}</span>
        </button>

        {/* Dashboard grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Left Columns (Post Details + support chats) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Core Request Card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <div className="flex flex-wrap justify-between items-start gap-2">
                <div>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                    request.urgency === 'High' ? 'bg-red-50 text-red-700 border border-red-100' :
                    request.urgency === 'Medium' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                    'bg-slate-50 text-slate-700 border border-slate-100'
                  }`}>
                    {request.urgency === 'High' ? t.high : request.urgency === 'Medium' ? t.medium : t.low}
                  </span>
                  <h2 className="text-xl font-bold text-gray-900 mt-2 tracking-tight">
                    {request.title}
                  </h2>
                </div>
                
                {/* Visual Status Tag */}
                <span className={`inline-flex items-center px-3 py-1.5 rounded text-xs font-bold border ${
                  request.status === 'New' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                  request.status === 'In Progress' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  request.status === 'Waiting for Client' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                  request.status === 'Completed' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                  'bg-slate-100 text-slate-600 border-slate-200'
                }`}>
                  <Clock className="w-3.5 h-3.5 mr-1.5 rtl:mr-0 rtl:ml-1.5" />
                  {request.status === 'New' ? t.newStatus :
                   request.status === 'In Progress' ? t.inProgressStatus :
                   request.status === 'Waiting for Client' ? t.waitingClientStatus :
                   request.status === 'Completed' ? t.completedStatus : t.closedStatus}
                </span>
              </div>

              {/* Description body */}
              <div className="p-4 bg-slate-50 rounded-xl text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
                {request.description}
              </div>

              {/* Meta information lines */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-2 border-t border-gray-50 text-xs text-gray-400">
                <div className="flex items-center space-x-1.5 rtl:space-x-reverse">
                  <User className="w-4 h-4 text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-500">{request.clientName}</p>
                    <p className="text-[10px]">Client Participant</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-1.5 rtl:space-x-reverse">
                  <User className="w-4 h-4 text-emerald-500/80" />
                  <div>
                    <p className="font-semibold text-gray-700">
                      {request.assignedEmployeeName || t.unassigned}
                    </p>
                    <p className="text-[10px]">{t.assignedTo}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5 rtl:space-x-reverse col-span-2 md:col-span-1">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <div>
                    <p className="font-medium text-gray-500">
                      {request.createdAt ? new Date(request.createdAt).toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-US') : ''}
                    </p>
                    <p className="text-[10px]">{t.createdAt}</p>
                  </div>
                </div>
              </div>

              {/* Global request attachments section */}
              {request.attachments && request.attachments.length > 0 && (
                <div className="space-y-2 pt-4 border-t border-gray-100">
                  <h3 className="text-xs font-bold text-gray-500 flex items-center space-x-1.5 rtl:space-x-reverse">
                    <Paperclip className="w-3.5 h-3.5" />
                    <span>{t.attachments} ({request.attachments.length})</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {request.attachments.map((file, idx) => (
                      <a
                        key={idx}
                        href={file.url}
                        download={file.name}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center space-x-2.5 rtl:space-x-reverse p-2.5 rounded border border-slate-200 hover:border-blue-200 hover:bg-slate-50 transition-colors"
                      >
                        {getFileIcon(file.type)}
                        <span className="text-xs font-semibold text-gray-700 truncate flex-1">{file.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Conversation support chat */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4 shadow-sm">
              <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2 rtl:space-x-reverse border-b border-slate-100 pb-3">
                <MessageSquare className="w-5 h-5 text-blue-500" />
                <span>{t.comments}</span>
              </h3>

              {/* Comments Scroller */}
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                {comments.length === 0 ? (
                  <p className="text-center py-6 text-gray-400 text-sm tracking-tight">{t.emptyComments}</p>
                ) : (
                  comments.map((c) => {
                    const isCurrentUser = c.authorId === user?.uid;
                    return (
                      <div 
                        key={c.commentId} 
                        className={`flex flex-col max-w-[85%] ${
                          isCurrentUser ? 'mr-auto rtl:mr-0 rtl:ml-auto items-end rtl:items-start' : 'ml-auto rtl:ml-0 rtl:mr-auto items-start rtl:items-end'
                        }`}
                      >
                        <div className="flex items-center gap-1 text-[11px] text-gray-400 mb-1">
                          <span className="font-bold text-gray-600">{c.authorName}</span>
                          <span className={`px-1 rounded text-[9px] font-semibold ${
                            c.authorRole === 'admin' ? 'bg-amber-50 text-amber-600/95' :
                            c.authorRole === 'employee' ? 'bg-emerald-50 text-emerald-600/95' :
                            'bg-blue-50 text-blue-600/95'
                          }`}>
                            {c.authorRole === 'admin' ? t.adminRole : c.authorRole === 'employee' ? t.employeeRole : t.clientRole}
                          </span>
                        </div>
                        
                        <div className={`p-3.5 rounded-xl text-sm ${
                          isCurrentUser 
                            ? 'bg-blue-600 text-white rounded-br-none rtl:rounded-br-xl rtl:rounded-bl-none' 
                            : 'bg-slate-100 text-gray-850 rounded-bl-none rtl:rounded-bl-xl rtl:rounded-br-none'
                        }`}>
                          <p className="leading-relaxed whitespace-pre-wrap">{c.content}</p>

                          {/* Comment nested attachments */}
                          {c.attachments && c.attachments.length > 0 && (
                            <div className="mt-2.5 pt-2 border-t border-white/20 grid grid-cols-1 gap-1">
                              {c.attachments.map((file, fIdx) => (
                                <a
                                  key={fIdx}
                                  href={file.url}
                                  download={file.name}
                                  target="_blank"
                                  referrerPolicy="no-referrer"
                                  className="flex items-center gap-2 text-xs font-medium hover:underline text-white/90 truncate"
                                >
                                  <Paperclip className="w-3 h-3 flex-shrink-0" />
                                  <span>{file.name}</span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-400 mt-1">
                          {c.createdAt ? new Date(c.createdAt).toLocaleTimeString(locale === 'ar' ? 'ar-SA' : 'en-US', {hour: '2-digit', minute:'2-digit'}) : ''}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Comment Writer Box */}
              <form onSubmit={handleAddComment} className="pt-4 border-t border-gray-100 space-y-3">
                {/* Temporary pending attachments list */}
                {commentAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 rounded-xl">
                    {commentAttachments.map((file, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 bg-white border border-gray-200 px-2.5 py-1 rounded-lg text-xs font-semibold text-gray-600">
                        <Paperclip className="w-3 h-3 text-indigo-500" />
                        <span className="truncate max-w-[120px]">{file.name}</span>
                        <button 
                          type="button" 
                          onClick={() => setCommentAttachments(prev => prev.filter((_, i) => i !== idx))}
                          className="text-red-400 hover:text-red-600 font-bold ml-1"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {fileError && (
                  <div className="text-xs font-medium text-red-500 flex items-center gap-1 bg-red-50 p-2.5 rounded-lg border border-red-100">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{fileError}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder={t.writeComment}
                    rows={1}
                    className="flex-1 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-150 rounded px-3.5 py-2 text-sm outline-none resize-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAddComment(e);
                      }
                    }}
                  />
                  
                  {/* File Pick button */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                    accept=".pdf,.xlsx,.xls,.doc,.docx,image/*"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadProgress}
                    className="p-2.5 text-slate-500 hover:text-blue-600 hover:bg-slate-55 border border-slate-200 rounded cursor-pointer transition-colors"
                    title={t.addAttachment}
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>

                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded cursor-pointer transition-colors flex items-center justify-center shadow-sm"
                  >
                    <Send className="w-4 h-4 shadow-xs" />
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Sidebar Area (Operations Controls, checklists, and assign details) */}
          <div className="space-y-6">
            
            {/* Action Panel for Status & Assign (Admin and Employee Only) */}
            {(role === 'admin' || role === 'employee') && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 uppercase tracking-wide">
                  {locale === 'ar' ? 'لوحة التحكم والتحضير' : 'Operational Steering'}
                </h3>

                {/* Status Dropdown */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-450 uppercase tracking-tight">{t.status}</label>
                  <select
                    value={request.status}
                    onChange={(e) => handleStatusChange(e.target.value as RequestStatus)}
                    className="w-full text-sm border border-slate-200 rounded px-3 py-2 outline-none focus:border-blue-500 font-medium"
                  >
                    <option value="New">{t.newStatus}</option>
                    <option value="In Progress">{t.inProgressStatus}</option>
                    <option value="Waiting for Client">{t.waitingClientStatus}</option>
                    <option value="Completed">{t.completedStatus}</option>
                    <option value="Closed">{t.closedStatus}</option>
                  </select>
                </div>

                {/* Assigned Employee Select (Admin Only) */}
                {role === 'admin' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-450 uppercase tracking-tight">{t.assignedTo}</label>
                    <select
                      value={request.assignedEmployeeId || ''}
                      onChange={(e) => handleAssignmentChange(e.target.value)}
                      className="w-full text-sm border border-slate-200 rounded px-3 py-2 outline-none focus:border-blue-500 font-medium"
                    >
                      <option value="">{t.unassigned}</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Urgency Tuning (Admin Only) */}
                {role === 'admin' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-450 uppercase tracking-tight">{t.urgency}</label>
                    <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-50 border border-slate-200/90 rounded">
                      {(['Low', 'Medium', 'High'] as UrgencyLevel[]).map((level) => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => handleUrgencyChange(level)}
                          className={`text-[11px] font-bold py-1.5 rounded transition-all cursor-pointer ${
                            request.urgency === level 
                              ? 'bg-slate-900 text-white shadow-xs' 
                              : 'text-slate-400 hover:text-slate-600'
                          }`}
                        >
                          {level === 'High' ? t.high : level === 'Medium' ? t.medium : t.low}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Checklist Tasks Widget */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
              <h3 className="text-sm font-bold text-gray-900 flex items-center space-x-1.5 rtl:space-x-reverse border-b border-gray-50 pb-2">
                <CheckSquare className="w-4 h-4 text-emerald-500" />
                <span>{t.tasksList}</span>
              </h3>

              {/* Checkbox tasks scroller */}
              <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                {tasks.length === 0 ? (
                  <p className="text-xs text-center py-4 text-gray-400 italic">{t.noTasks}</p>
                ) : (
                  tasks.map((task) => {
                    const isChecked = task.status === 'Completed';
                    const canToggle = role === 'admin' || role === 'employee';
                    return (
                      <div 
                        key={task.taskId} 
                        className={`flex items-start space-x-2.5 rtl:space-x-reverse p-2.5 rounded-xl transition-all border ${
                          isChecked 
                            ? 'bg-emerald-50/50 border-emerald-100' 
                            : 'bg-slate-50/60 border-slate-100'
                        }`}
                      >
                        <button
                          disabled={!canToggle}
                          onClick={() => toggleTaskStatus(task.taskId, task.status)}
                          className={`mt-0.5 rounded w-4 h-4 flex items-center justify-center border transition-all ${
                            isChecked 
                              ? 'bg-blue-600 border-blue-600 text-white' 
                              : canToggle 
                                ? 'border-slate-300 hover:border-blue-500 cursor-pointer' 
                                : 'border-slate-200 bg-slate-100'
                          }`}
                        >
                          {isChecked && <Check className="w-3 h-3 stroke-[3px]" />}
                        </button>
                        
                        <div className="flex-1 overflow-hidden">
                          <p className={`text-xs font-bold leading-tight ${isChecked ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                            {task.title}
                          </p>
                          {task.description && (
                            <p className="text-[10px] text-slate-404 truncate mt-0.5">{task.description}</p>
                          )}
                          <p className="text-[9px] font-bold text-blue-600 mt-1 uppercase tracking-tight">🕒 {task.dueDate}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Subtask additions (Admins Only) */}
              {role === 'admin' && (
                <form onSubmit={handleCreateTask} className="pt-3 border-t border-slate-100 space-y-3">
                  <input
                    type="text"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder={t.taskTitle}
                    className="w-full text-xs border border-slate-200 rounded px-2.5 py-1.5 focus:border-blue-500 outline-none"
                    required
                  />
                  
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <input
                      type="date"
                      value={taskDueDate}
                      onChange={(e) => setTaskDueDate(e.target.value)}
                      className="border border-slate-200 rounded px-2 py-1 outline-none text-[11px]"
                      title={t.dueDate}
                    />
                    <button
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-[11px] px-2 py-1 flex items-center justify-center cursor-pointer transition-colors"
                    >
                      <Plus className="w-3 h-3 mr-1 rtl:mr-0 rtl:ml-1" />
                      <span>{t.addTask}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* General Help & Operations Quick Policy Info */}
            <div className="bg-slate-900 border border-slate-950 rounded-xl p-6 text-white shadow-md relative overflow-hidden">
              <div className="absolute -right-12 -top-12 w-32 h-32 rounded bg-blue-500/10 animate-pulse" />
              <h3 className="text-sm font-bold tracking-tight mb-2 flex items-center gap-1 uppercase">
                <AlertCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>{locale === 'ar' ? 'إرشادات الإجراءات والنزاهة' : 'Ethics & Guidelines'}</span>
              </h3>
              <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                {locale === 'ar' 
                  ? 'هذه المنصة مخصصة للتنسيق الفوري. يتم تسجيل كافة التحديثات في سجل التدقيق التاريخي للطلب لحفظ حقوق كافة المشتركين وضمان مستويات جودة الخدمة SLA.'
                  : 'This environment manages high-trust operational tasks. Every update is tracked with structural transaction limits to satisfy service SLAs across employee teams.'}
              </p>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
