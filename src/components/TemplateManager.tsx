import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  addDoc
} from 'firebase/firestore';
import { RequestTemplate, WorkflowStep } from '../types';
import { useAuth } from './FirebaseProvider';
import { translations } from '../translations';
import { 
  Plus, 
  Trash2, 
  Copy, 
  Edit3, 
  CheckCircle, 
  X, 
  Save, 
  ArrowUp, 
  ArrowDown, 
  Folder, 
  Sparkles, 
  BookOpen, 
  Clock, 
  AlertCircle 
} from 'lucide-react';

export const TemplateManager: React.FC = () => {
  const { locale } = useAuth();
  const t = translations[locale];

  const [templates, setTemplates] = useState<RequestTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<Partial<RequestTemplate> | null>(null);
  const [activeTab, setActiveTab] = useState<'list' | 'editor'>('list');

  // New Step Input Form
  const [stepTitle, setStepTitle] = useState('');
  const [stepDesc, setStepDesc] = useState('');
  const [stepType, setStepType] = useState<'internal' | 'client'>('internal');
  const [stepAction, setStepAction] = useState<'upload' | 'approve' | 'pay' | 'notify'>('notify');

  // Input lists
  const [newRequiredDoc, setNewRequiredDoc] = useState('');
  const [newDefaultMsg, setNewDefaultMsg] = useState('');

  // Fetch templates from Firestore
  useEffect(() => {
    const q = query(collection(db, 'requestTemplates'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: RequestTemplate[] = [];
      snapshot.forEach((doc) => {
        list.push({ templateId: doc.id, ...doc.data() } as RequestTemplate);
      });
      setTemplates(list);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Seed default templates helper if library is empty
  const handleSeedTemplates = async () => {
    const defaultTemplates: RequestTemplate[] = [
      {
        templateId: 'iqama_renewal_default',
         name: locale === 'ar' ? 'تجديد الإقامة الحكومية' : 'Iqama Renewal Service',
        description: locale === 'ar' ? 'نموذج الإجراءات المتكامل لتجديد الإقامة متضمناً منصة قوى والمدفوعات ومقيم.' : 'Step-by-step Gov renewal workflow with Qiwa, payments, & Muqeem.',
        steps: [
          {
            stepId: 'step_1',
            order: 1,
            title: locale === 'ar' ? 'أصدار رخصة عمل قوى (3 أشهر)' : 'Issue Qiwa work permit (3 months)',
            description: locale === 'ar' ? 'إصدار فاتورة رخصة العمل من حساب المنشأة في قوى' : 'Issue the Qiwa work permit fee payment invoice.',
            type: 'internal',
            action: 'upload'
          },
          {
            stepId: 'step_2',
            order: 2,
            title: locale === 'ar' ? 'طلب سداد رسوم رخصة العمل' : 'Request Qiwa work permit payment',
            description: locale === 'ar' ? 'إرسال فاتورة السداد للعميل وملاحظات السداد' : 'Notify client to upload Qiwa payment slip.',
            type: 'client',
            action: 'pay'
          },
          {
            stepId: 'step_3',
            order: 3,
            title: locale === 'ar' ? 'التحقق من الرسوم وبقية المرفقات' : 'Verify jawazat government fee & insurance',
            description: locale === 'ar' ? 'التحقق من سداد رسوم الجوازات والتأمين الطبي للعميل' : 'Verify medical insurance and Gov fees are cleared.',
            type: 'internal',
            action: 'approve'
          },
          {
            stepId: 'step_4',
            order: 4,
            title: locale === 'ar' ? 'إتمام الإجراء النهائي - مقيم' : 'Complete Renewal in Muqeem / Absher',
            description: locale === 'ar' ? 'إتمام التجديد النهائي وتنزيل نسخة الإقامة الرقمية' : 'Execute renewal in Muqeem and upload final digital proof.',
            type: 'internal',
            action: 'upload'
          }
        ],
        requiredDocs: [
          locale === 'ar' ? 'جواز السفر الحالي' : 'Current Passport',
          locale === 'ar' ? 'التأمين الطبي الساري' : 'Active Medical Insurance'
        ],
        defaultMessages: [
          'جاري التنفيذ',
          'الطلب بانتظار العميل',
          'نحتاج سداد الرسوم',
          'تم الانتهاء من الإجراء'
        ],
        estimatedTime: '3-5 Days'
      },
      {
        templateId: 'cr_renewal_default',
        name: locale === 'ar' ? 'تجديد السجل التجاري' : 'Commercial Registration Renewal',
        description: locale === 'ar' ? 'تحديث وتجديد السجل التجاري لدى وزارة التجارة شاملاً رسوم الغرفة التجارية.' : 'Gov workflow for Ministry of Commerce Renewal & Chamber feed.',
        steps: [
          {
            stepId: 'cr_step_1',
            order: 1,
            title: locale === 'ar' ? 'فحص حالة السجل المالي والالتزام' : 'Check CR financials compliance',
            description: locale === 'ar' ? 'التأكد من خلو المنشأة من المخالفات الجاهزة' : 'Verify blockages or fines on Ministry database.',
            type: 'internal',
            action: 'notify'
          },
          {
            stepId: 'cr_step_2',
            order: 2,
            title: locale === 'ar' ? 'طلب سداد رسوم وزارة التجارة والغرفة' : 'Chamber & Gov Fee invoice request',
            description: locale === 'ar' ? 'مطالبة المشترك بسداد الرسوم والاشتراك السنوي' : 'Request payment for commerce license bills.',
            type: 'client',
            action: 'pay'
          },
          {
            stepId: 'cr_step_3',
            order: 3,
            title: locale === 'ar' ? 'استخراج السجل الجديد وتسليمه' : 'Print & deliver updated CR register',
            description: locale === 'ar' ? 'تحميل نسخة السجل التجاري المصقول بعد السداد' : 'Download and dispatch pristine new CR file.',
            type: 'internal',
            action: 'upload'
          }
        ],
        requiredDocs: [
          locale === 'ar' ? 'صورة البيع أو شهادة الغرفة' : 'Chamber of Commerce Certificate'
        ],
        defaultMessages: [
          'جاري تنفيذ طلب السجل التجاري',
          'تم استلام طلب السداد',
          'الرجاء فتح نفاذ'
        ],
        estimatedTime: '1-2 Days'
      }
    ];

    try {
      for (const tpl of defaultTemplates) {
        await setDoc(doc(db, 'requestTemplates', tpl.templateId), tpl);
      }
    } catch (error) {
      console.error('Error seeding templates:', error);
    }
  };

  const handleCreateNew = () => {
    setEditingTemplate({
      name: '',
      description: '',
      steps: [],
      requiredDocs: [],
      defaultMessages: [],
      estimatedTime: '2 Days',
    });
    setActiveTab('editor');
  };

  const handleEdit = (tpl: RequestTemplate) => {
    setEditingTemplate({ ...tpl });
    setActiveTab('editor');
  };

  const handleDelete = async (templateId: string) => {
    if (!window.confirm(t.confirmDelete)) return;
    try {
      await deleteDoc(doc(db, 'requestTemplates', templateId));
    } catch (error) {
      console.error('Error deleting template:', error);
    }
  };

  const handleDuplicate = async (tpl: RequestTemplate) => {
    try {
      const newId = 'tpl_' + Math.random().toString(36).substr(2, 9);
      const duplicated: RequestTemplate = {
        ...tpl,
        templateId: newId,
        name: `${tpl.name} (${locale === 'ar' ? 'نسخة مكررة' : 'Copy'})`,
      };
      await setDoc(doc(db, 'requestTemplates', newId), duplicated);
    } catch (error) {
      console.error('Error duplicating template:', error);
    }
  };

  // Steps handling inside editing template
  const handleAddStep = () => {
    if (!stepTitle.trim()) return;
    if (!editingTemplate) return;

    const currentSteps = editingTemplate.steps || [];
    const newStep: WorkflowStep = {
      stepId: 'step_' + Math.random().toString(36).substr(2, 9),
      order: currentSteps.length + 1,
      title: stepTitle.trim(),
      description: stepDesc.trim(),
      type: stepType,
      action: stepAction
    };

    setEditingTemplate({
      ...editingTemplate,
      steps: [...currentSteps, newStep]
    });

    setStepTitle('');
    setStepDesc('');
  };

  const handleRemoveStep = (stepId: string) => {
    if (!editingTemplate || !editingTemplate.steps) return;
    const reordered = editingTemplate.steps
      .filter(s => s.stepId !== stepId)
      .map((s, idx) => ({ ...s, order: idx + 1 }));
    setEditingTemplate({ ...editingTemplate, steps: reordered });
  };

  const handleMoveStep = (idx: number, direction: 'up' | 'down') => {
    if (!editingTemplate || !editingTemplate.steps) return;
    const steps = [...editingTemplate.steps];
    
    if (direction === 'up' && idx > 0) {
      const temp = steps[idx];
      steps[idx] = steps[idx - 1];
      steps[idx - 1] = temp;
    } else if (direction === 'down' && idx < steps.length - 1) {
      const temp = steps[idx];
      steps[idx] = steps[idx + 1];
      steps[idx + 1] = temp;
    }

    // Update orders
    const updated = steps.map((s, i) => ({ ...s, order: i + 1 }));
    setEditingTemplate({ ...editingTemplate, steps: updated });
  };

  // Required docs list
  const handleAddDoc = () => {
    if (!newRequiredDoc.trim() || !editingTemplate) return;
    const list = editingTemplate.requiredDocs || [];
    setEditingTemplate({
      ...editingTemplate,
      requiredDocs: [...list, newRequiredDoc.trim()]
    });
    setNewRequiredDoc('');
  };

  const handleRemoveDoc = (val: string) => {
    if (!editingTemplate || !editingTemplate.requiredDocs) return;
    setEditingTemplate({
      ...editingTemplate,
      requiredDocs: editingTemplate.requiredDocs.filter(d => d !== val)
    });
  };

  // Default messages list
  const handleAddMsg = () => {
    if (!newDefaultMsg.trim() || !editingTemplate) return;
    const list = editingTemplate.defaultMessages || [];
    setEditingTemplate({
      ...editingTemplate,
      defaultMessages: [...list, newDefaultMsg.trim()]
    });
    setNewDefaultMsg('');
  };

  const handleRemoveMsg = (val: string) => {
    if (!editingTemplate || !editingTemplate.defaultMessages) return;
    setEditingTemplate({
      ...editingTemplate,
      defaultMessages: editingTemplate.defaultMessages.filter(m => m !== val)
    });
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate || !editingTemplate.name?.trim()) return;

    try {
      const id = editingTemplate.templateId || 'tpl_' + Math.random().toString(36).substr(2, 9);
      const readyToSave: RequestTemplate = {
        templateId: id,
        name: editingTemplate.name.trim(),
        description: editingTemplate.description?.trim() || '',
        steps: editingTemplate.steps || [],
        requiredDocs: editingTemplate.requiredDocs || [],
        defaultMessages: editingTemplate.defaultMessages || [],
        estimatedTime: editingTemplate.estimatedTime || '3 Days'
      };

      await setDoc(doc(db, 'requestTemplates', id), readyToSave);
      setEditingTemplate(null);
      setActiveTab('list');
    } catch (error) {
      console.error('Error saving template:', error);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
      <div className="bg-slate-900 px-6 py-5 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-extrabold text-base flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-400" />
            <span>{locale === 'ar' ? 'مكتبة نماذج الخدمات والمسارات الذكية' : 'Service Templates & Automations'}</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {locale === 'ar' 
              ? 'صمم الخطوات المسبقة، الإجراءات المطلوبة، والرسائل التلقائية لتسريع معالجة طلبات المشتركين.' 
              : 'Construct workflows, default messages and subtasks to assign on request dispatch.'}
          </p>
        </div>
        
        {activeTab === 'list' ? (
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={handleCreateNew}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer w-full sm:w-auto"
            >
              <Plus className="w-4 h-4" />
              <span>{locale === 'ar' ? 'إضافة نموذج جديد' : 'New Template'}</span>
            </button>
            {templates.length === 0 && (
              <button
                onClick={handleSeedTemplates}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-850 hover:bg-slate-800 text-blue-300 border border-slate-700 rounded-xl text-xs font-bold transition-all scroll-smooth cursor-pointer w-full sm:w-auto"
              >
                <Sparkles className="w-4 h-4" />
                <span>{locale === 'ar' ? 'تغذية بالنماذج القياسية' : 'Seed Defaults'}</span>
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={() => { setEditingTemplate(null); setActiveTab('list'); }}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
          >
            {locale === 'ar' ? 'خروج وإلغاء' : 'Close Editor'}
          </button>
        )}
      </div>

      <div className="p-6">
        {activeTab === 'list' ? (
          <div>
            {loading ? (
              <p className="text-center text-slate-400 py-10 text-xs font-sans">{t.loading}</p>
            ) : templates.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-gray-200 space-y-3">
                <Folder className="w-12 h-12 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-600">{locale === 'ar' ? 'لا توجد نماذج مضافة' : 'No templates created yet'}</p>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  {locale === 'ar' 
                    ? 'قم بإضافتها يدوياً أو اضغط على تغذية بالنماذج القياسية للحصول على نماذج مثل "تجديد الإقامة" و "تجديد السجل التجاري".' 
                    : 'Get started instantly by clicking on Seed Defaults to pre-populate common governmental templates.'}
                </p>
                <button
                  onClick={handleSeedTemplates}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-all cursor-pointer inline-flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{locale === 'ar' ? 'الحصول على النماذج القياسية فوراً' : 'Seed Standard Templates'}</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {templates.map((tpl) => (
                  <div key={tpl.templateId} className="border border-slate-100 bg-slate-50/40 hover:bg-slate-50 rounded-2xl p-5 flex flex-col justify-between transition-all space-y-4">
                    <div>
                      <div className="flex items-start justify-between">
                        <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                          <BookOpen className="w-4 h-4 text-slate-400" />
                          <span>{tpl.name}</span>
                        </h4>
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{tpl.estimatedTime || '3 Days'}</span>
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-2 leading-relaxed">{tpl.description}</p>
                      
                      <div className="mt-4 space-y-1">
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                          {locale === 'ar' ? 'الخطوات المبرمجة تلقائياً' : 'Programmed workflow steps'} ({tpl.steps?.length || 0})
                        </span>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {tpl.steps?.sort((a,b) => a.order - b.order).map((s, idx) => (
                            <span key={s.stepId || idx} className="inline-flex items-center text-[10px] font-semibold bg-white border border-slate-200 text-slate-705 px-2 py-0.5 rounded">
                              {idx+1}- {s.title}
                            </span>
                          ))}
                        </div>
                      </div>

                      {tpl.requiredDocs && tpl.requiredDocs.length > 0 && (
                        <div className="mt-3">
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                            {locale === 'ar' ? 'المستندات المطلوبة مسبقاً' : 'Required verification docs'}
                          </span>
                          <span className="text-xs text-slate-600 block truncate mt-1">
                            {tpl.requiredDocs.join(' | ')}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-1.5 pt-3 border-t border-slate-100/80">
                      <button
                        onClick={() => handleDuplicate(tpl)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all cursor-pointer"
                        title={locale === 'ar' ? 'تكرار ومضاعفة' : 'Duplicate template'}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      
                      <button
                        onClick={() => handleEdit(tpl)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all cursor-pointer"
                        title={locale === 'ar' ? 'تعديل الهيكل' : 'Edit structure'}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      
                      <button
                        onClick={() => handleDelete(tpl.templateId)}
                        className="p-1.5 text-slate-404 hover:text-rose-600 hover:bg-white rounded-lg transition-all cursor-pointer"
                        title={locale === 'ar' ? 'حذف النموذج' : 'Delete template'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* EDITOR PORTAL */
          <div className="space-y-6">
            <h4 className="font-extrabold text-sm text-slate-800 border-b border-gray-100 pb-3">
              {editingTemplate?.templateId ? (locale === 'ar' ? 'تحديث قالب خدمات قائم' : 'Editing Support Template') : (locale === 'ar' ? 'تصميم قالب خدمة ذكي جديد' : 'Architecting New Operational Template')}
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">{locale === 'ar' ? 'اسم ونوع القالب' : 'Template Name / Subject'}</label>
                <input
                  type="text"
                  value={editingTemplate?.name || ''}
                  onChange={e => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                  placeholder={locale === 'ar' ? 'مثال: تجديد رخصة البلدية' : 'Example: Municipality Renewals'}
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-lg outline-none focus:border-blue-300"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">{locale === 'ar' ? 'المدة المخططة للإنجاز' : 'Planned Estimated Duration'}</label>
                <input
                  type="text"
                  value={editingTemplate?.estimatedTime || ''}
                  onChange={e => setEditingTemplate({ ...editingTemplate, estimatedTime: e.target.value })}
                  placeholder={locale === 'ar' ? 'مثال: 3 أيام أو 24 ساعة' : 'Example: 3 Days or 24 Hrs'}
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-lg outline-none focus:border-blue-300"
                />
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-bold text-slate-500">{locale === 'ar' ? 'الوصف الإرشادي للطلب التابع' : 'Operational Description & Instructions'}</label>
                <textarea
                  value={editingTemplate?.description || ''}
                  rows={2}
                  onChange={e => setEditingTemplate({ ...editingTemplate, description: e.target.value })}
                  placeholder={locale === 'ar' ? 'إرشادات تظهر للموظف والمستفيد عند تشغيل قالب هذه الخدمة...' : 'Guidelines shown to staff and subscription clients on launch...'}
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-lg outline-none focus:border-blue-300 resize-none"
                />
              </div>
            </div>

            {/* FLOW BUILDER WORKFLOW STEPS */}
            <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-200/60 space-y-4">
              <h5 className="font-extrabold text-xs text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span>{locale === 'ar' ? 'مسار الإجراءات والخطوات المحددة' : 'Programmed sequence of actions'}</span>
                <span className="font-mono text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded">
                  {editingTemplate?.steps?.length || 0} {locale === 'ar' ? 'إجراءات مضافة' : 'Actions'}
                </span>
              </h5>

              {/* Add step form */}
              <div className="bg-white p-4 border border-slate-200/60 rounded-xl space-y-3 shadow-xs">
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">{locale === 'ar' ? 'تخطيط خطوة جديدة في المسار' : 'Append actionable step to flow'}</p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="space-y-0.5">
                    <input
                      type="text"
                      placeholder={locale === 'ar' ? 'مثال: إصدار فاتورة قوى' : 'Step Title'}
                      value={stepTitle}
                      onChange={e => setStepTitle(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-200 rounded outline-none"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <input
                      type="text"
                      placeholder={locale === 'ar' ? 'ملاحظة الخطوة للمنفذ...' : 'Step description...'}
                      value={stepDesc}
                      onChange={e => setStepDesc(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-200 rounded outline-none"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <select
                      value={stepType}
                      onChange={e => setStepType(e.target.value as 'internal' | 'client')}
                      className="w-full text-xs p-2 border border-slate-200 rounded outline-none bg-white font-semibold"
                    >
                      <option value="internal">🛑 {locale === 'ar' ? 'مهمة داخلية (فريقنا)' : 'Internal (Our Staff)'}</option>
                      <option value="client">👤 {locale === 'ar' ? 'طلب من العميل' : 'Client Request'}</option>
                    </select>
                  </div>
                  <div className="space-y-0.5 flex gap-1">
                    <select
                      value={stepAction}
                      onChange={e => setStepAction(e.target.value as any)}
                      className="w-full text-xs p-2 border border-slate-200 rounded outline-none bg-white font-semibold"
                    >
                      <option value="notify">📢 {locale === 'ar' ? 'ملاحظة وتنبيه فقط' : 'Message Notification'}</option>
                      <option value="upload">📤 {locale === 'ar' ? 'إرفاق مستند/إثبات' : 'Upload Document'}</option>
                      <option value="pay">💳 {locale === 'ar' ? 'إرفاق إيصال دفع' : 'Pay fee invoice'}</option>
                      <option value="approve">📝 {locale === 'ar' ? 'طلب توثيق/موافقة' : 'Sign approvals'}</option>
                    </select>
                    
                    <button
                      type="button"
                      onClick={handleAddStep}
                      className="px-3 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-xs cursor-pointer"
                    >
                      {locale === 'ar' ? 'أضف' : 'Add'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Steps display */}
              <div className="space-y-2">
                {editingTemplate?.steps?.sort((a,b) => a.order - b.order).map((step, idx) => (
                  <div key={step.stepId} className="bg-white px-4 py-3 border border-slate-200/80 rounded-xl flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="w-5 h-5 bg-slate-100 text-slate-600 border border-slate-200 rounded-full flex items-center justify-center font-bold text-[10px] font-mono">
                        {step.order}
                      </span>
                      <div>
                        <div className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                          <span>{step.title}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                            step.type === 'client' ? 'bg-indigo-50 text-indigo-700' : 'bg-rose-50 text-rose-700'
                          }`}>
                            {step.type === 'client' ? (locale === 'ar' ? 'طلب عميل' : 'Client Action') : (locale === 'ar' ? 'موظف داخلي' : 'Internal Task')}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-slate-100 text-slate-600 uppercase font-mono">
                            {step.action}
                          </span>
                        </div>
                        {step.description && <p className="text-[10px] text-slate-400 mt-0.5">{step.description}</p>}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleMoveStep(idx, 'up')}
                        disabled={idx === 0}
                        className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveStep(idx, 'down')}
                        disabled={idx === (editingTemplate.steps?.length || 1) - 1}
                        className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveStep(step.stepId)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded ml-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}

                {(!editingTemplate?.steps || editingTemplate.steps.length === 0) && (
                  <p className="text-center italic text-slate-400 text-xs py-4">{locale === 'ar' ? 'لم يتم إدراج خطوات لإجراء العمليات بعد.' : 'No programmed workflow sequence defined yet.'}</p>
                )}
              </div>
            </div>

            {/* BENTO GRID OF REQ DOCS AND QUICK REPLIES */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Required Documents */}
              <div className="border border-slate-200/70 p-4 rounded-xl space-y-3">
                <span className="text-xs font-bold text-slate-700 block">{locale === 'ar' ? 'المستندات الإرشادية المطلوبة' : 'Mandatory Support & Verification Docs'}</span>
                
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newRequiredDoc}
                    onChange={e => setNewRequiredDoc(e.target.value)}
                    placeholder={locale === 'ar' ? 'اسم المستند (مثال: كشف طبي)' : 'Document name (e.g. Health status)'}
                    className="w-full text-xs p-2 border border-slate-200 rounded outline-none"
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddDoc())}
                  />
                  <button
                    type="button"
                    onClick={handleAddDoc}
                    className="p-2 bg-slate-800 text-white font-bold text-xs rounded hover:bg-slate-700"
                  >
                    {locale === 'ar' ? 'أضف' : 'Add'}
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {editingTemplate?.requiredDocs?.map((docName, idx) => (
                    <span key={idx} className="inline-flex items-center text-xs font-semibold bg-blue-50 text-blue-800 border-blue-100 px-2 py-1 rounded-lg gap-1">
                      <span>{docName}</span>
                      <X className="w-3 h-3 text-blue-500 hover:text-blue-700 cursor-pointer" onClick={() => handleRemoveDoc(docName)} />
                    </span>
                  ))}
                  {(!editingTemplate?.requiredDocs || editingTemplate.requiredDocs.length === 0) && (
                    <span className="text-[10px] text-slate-400 italic font-sans">{locale === 'ar' ? 'لم يحدد مستندات لازمة.' : 'No required docs.'}</span>
                  )}
                </div>
              </div>

              {/* Quick messages */}
              <div className="border border-slate-200/70 p-4 rounded-xl space-y-3">
                <span className="text-xs font-bold text-slate-700 block">{locale === 'ar' ? 'رسائل ومسودات الرد السريع المفضلة' : 'Assigned Quick-Reply Auto Phrases'}</span>
                
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newDefaultMsg}
                    onChange={e => setNewDefaultMsg(e.target.value)}
                    placeholder={locale === 'ar' ? 'مثال: الطلب بانتظار نفاذ' : 'Phrases (e.g. Waiting for Client)'}
                    className="w-full text-xs p-2 border border-slate-200 rounded outline-none"
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddMsg())}
                  />
                  <button
                    type="button"
                    onClick={handleAddMsg}
                    className="p-2 bg-slate-800 text-white font-bold text-xs rounded hover:bg-slate-700"
                  >
                    {locale === 'ar' ? 'أضف' : 'Add'}
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {editingTemplate?.defaultMessages?.map((phrase, idx) => (
                    <span key={idx} className="inline-flex items-center text-xs font-medium bg-emerald-50 text-emerald-800 border-emerald-100 px-1.5 py-1 rounded-lg gap-1">
                      <span>{phrase}</span>
                      <X className="w-3 h-3 text-emerald-500 hover:text-emerald-700 cursor-pointer" onClick={() => handleRemoveMsg(phrase)} />
                    </span>
                  ))}
                  {(!editingTemplate?.defaultMessages || editingTemplate.defaultMessages.length === 0) && (
                    <span className="text-[10px] text-slate-400 italic font-sans">{locale === 'ar' ? 'لم يحدد رسائل قياسية.' : 'No quick replies.'}</span>
                  )}
                </div>
              </div>

            </div>

            {/* SAVE ACTION & CONTROL BOARD */}
            <div className="border-t border-slate-150 pt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setEditingTemplate(null); setActiveTab('list'); }}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                {locale === 'ar' ? 'إلغاء التعديلات' : 'Discard draft'}
              </button>
              
              <button
                type="button"
                onClick={handleSaveTemplate}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm cursor-pointer flex items-center gap-1"
              >
                <Save className="w-4 h-4" />
                <span>{locale === 'ar' ? 'تخزين واعتماد القالب للتشغيل' : 'Authorize & Store Template'}</span>
              </button>
            </div>
            
          </div>
        )}
      </div>
    </div>
  );
};
