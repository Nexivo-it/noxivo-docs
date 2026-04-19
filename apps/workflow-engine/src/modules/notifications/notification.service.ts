import { NotificationModel } from '@noxivo/database';

export type NotificationType = 
  | 'workflow_failure'
  | 'workflow_completed'
  | 'handoff_requested'
  | 'usage_limit_warning'
  | 'session_disconnected';

export type NotificationSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface CreateNotificationInput {
  agencyId: string;
  tenantId: string;
  type: NotificationType;
  title: string;
  message: string;
  severity?: NotificationSeverity;
  workflowId?: string;
  workflowName?: string;
  nodeId?: string;
  metadata?: Record<string, unknown>;
}

export class NotificationService {
  async create(input: CreateNotificationInput): Promise<void> {
    await NotificationModel.create({
      agencyId: input.agencyId,
      tenantId: input.tenantId,
      type: input.type,
      title: input.title,
      message: input.message,
      severity: input.severity || this.getSeverityForType(input.type),
      workflowId: input.workflowId || null,
      workflowName: input.workflowName || null,
      nodeId: input.nodeId || null,
      metadata: input.metadata || {},
      isRead: false,
      readAt: null
    });
  }

  async notifyWorkflowFailure(input: {
    agencyId: string;
    tenantId: string;
    workflowId: string;
    workflowName: string;
    nodeId: string;
    error: string;
  }): Promise<void> {
    await this.create({
      agencyId: input.agencyId,
      tenantId: input.tenantId,
      type: 'workflow_failure',
      title: 'Workflow Failed',
      message: `Workflow "${input.workflowName}" failed at node "${input.nodeId}": ${input.error}`,
      severity: 'error',
      workflowId: input.workflowId,
      workflowName: input.workflowName,
      nodeId: input.nodeId,
      metadata: { error: input.error }
    });
  }

  async notifyHandoffRequested(input: {
    agencyId: string;
    tenantId: string;
    workflowId: string;
    workflowName: string;
    conversationId: string;
    customerName?: string;
  }): Promise<void> {
    await this.create({
      agencyId: input.agencyId,
      tenantId: input.tenantId,
      type: 'handoff_requested',
      title: 'Human Handoff Required',
      message: input.customerName
        ? `Customer "${input.customerName}" needs human assistance in workflow "${input.workflowName}".`
        : `A customer needs human assistance in workflow "${input.workflowName}".`,
      severity: 'warning',
      workflowId: input.workflowId,
      workflowName: input.workflowName,
      metadata: { conversationId: input.conversationId, customerName: input.customerName }
    });
  }

  async notifyUsageLimitWarning(input: {
    agencyId: string;
    tenantId: string;
    metric: string;
    currentUsage: number;
    limit: number;
    percentage: number;
  }): Promise<void> {
    await this.create({
      agencyId: input.agencyId,
      tenantId: input.tenantId,
      type: 'usage_limit_warning',
      title: 'Usage Limit Warning',
      message: `${input.metric} usage is at ${input.percentage}% of your monthly limit (${input.currentUsage}/${input.limit}).`,
      severity: 'warning',
      metadata: { metric: input.metric, currentUsage: input.currentUsage, limit: input.limit }
    });
  }

  async notifySessionDisconnected(input: {
    agencyId: string;
    tenantId: string;
    sessionName: string;
    reason?: string;
  }): Promise<void> {
    await this.create({
      agencyId: input.agencyId,
      tenantId: input.tenantId,
      type: 'session_disconnected',
      title: 'WhatsApp Session Disconnected',
      message: input.reason
        ? `Session "${input.sessionName}" disconnected: ${input.reason}`
        : `Session "${input.sessionName}" has been disconnected.`,
      severity: 'critical',
      metadata: { sessionName: input.sessionName, reason: input.reason }
    });
  }

  async getUnreadCount(agencyId: string, tenantId: string): Promise<number> {
    return NotificationModel.countDocuments({
      agencyId,
      tenantId,
      isRead: false
    });
  }

  async markAsRead(agencyId: string, notificationId: string): Promise<void> {
    await NotificationModel.findOneAndUpdate(
      { _id: notificationId, agencyId },
      { isRead: true, readAt: new Date() }
    );
  }

  async markAllAsRead(agencyId: string, tenantId: string): Promise<void> {
    await NotificationModel.updateMany(
      { agencyId, tenantId, isRead: false },
      { isRead: true, readAt: new Date() }
    );
  }

  private getSeverityForType(type: NotificationType): NotificationSeverity {
    switch (type) {
      case 'workflow_failure':
        return 'error';
      case 'session_disconnected':
        return 'critical';
      case 'usage_limit_warning':
      case 'handoff_requested':
        return 'warning';
      case 'workflow_completed':
      default:
        return 'info';
    }
  }
}

export const notificationService = new NotificationService();
