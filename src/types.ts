export type UserRole = 'admin' | 'employee' | 'client';
export type Locale = 'ar' | 'en';
export type UrgencyLevel = 'Low' | 'Medium' | 'High';

export interface UserProfile {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  company?: string;
  createdAt: string;
}

export type RequestStatus = 
  | 'New' 
  | 'Internal Task' 
  | 'Waiting for Client Payment' 
  | 'Waiting for Client Document' 
  | 'Waiting for Client Approval' 
  | 'Waiting for Nafath' 
  | 'In Progress' 
  | 'Completed' 
  | 'Closed';

export interface Attachment {
  name: string;
  url: string;
  type?: string;
  uploadedBy?: string;
  uploadedAt?: string;
}

export interface RequestDoc {
  requestId: string;
  title: string;
  description: string;
  status: RequestStatus;
  clientId: string;
  clientName: string;
  assignedEmployeeId: string;
  assignedEmployeeName: string;
  attachments: Attachment[];
  urgency: UrgencyLevel;
  templateId?: string;
  isArchived?: boolean;
  createdAt: string;
  updatedAt: string;
}

// Just in case any part uses GovRequest name as well
export type GovRequest = RequestDoc;

export interface TaskDoc {
  taskId: string;
  requestId: string;
  title: string;
  description?: string;
  assignedToId?: string;
  assignedToName?: string;
  dueDate?: string;
  status: 'Pending' | 'Completed';
  createdAt: string;
}

// Just in case any part uses Task name as well
export type Task = TaskDoc;

export interface CommentDoc {
  commentId: string;
  requestId: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  content: string;
  attachments?: Attachment[];
  createdAt: string;
}

export interface VaultItem {
  vaultId: string;
  clientId: string;
  platformName: string;
  username: string;
  password: string;
  notes?: string;
  updatedAt: string;
  updatedBy: string;
}

export interface Notification {
  notificationId: string;
  userId: string;
  message: string;
  type: 'task_assigned' | 'payment_required' | 'document_required' | 'approval_required' | 'status_changed' | 'comment_added';
  isRead: boolean;
  createdAt: string;
}

export interface WorkflowStep {
  stepId: string;
  order: number;
  title: string;
  description: string;
  type: 'internal' | 'client';
  action: 'upload' | 'approve' | 'pay' | 'notify';
}

export interface RequestTemplate {
  templateId: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  requiredDocs: string[];
  defaultMessages: string[];
  estimatedTime?: string;
}
