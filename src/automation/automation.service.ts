import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';

interface AutomationContext {
  candidateId?: string;
  candidateEmail?: string;
  candidateName?: string;
  interviewId?: string;
  jobId?: string;
  jobTitle?: string;
  userId?: string;
  [key: string]: any;
}

@Injectable()
export class AutomationService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => EmailService))
    private emailService: EmailService,
    private notificationsGateway: NotificationsGateway,
  ) {}

  /**
   * Execute automation rules for a given trigger
   */
  async executeAutomation(
    trigger: string,
    context: AutomationContext,
  ): Promise<void> {
    // Get all active automation rules for this trigger
    const rules = await this.prisma.automationRule.findMany({
      where: {
        trigger,
        isActive: true,
      },
    });

    for (const rule of rules) {
      try {
        // Check if conditions are met
        if (this.evaluateConditions(rule.conditions as any, context)) {
          // Execute actions
          await this.executeActions(rule.actions as any, context);
        }
      } catch (error) {
        console.error(`Error executing automation rule ${rule.id}:`, error);
        // Continue with other rules even if one fails
      }
    }
  }

  /**
   * Evaluate if conditions are met
   */
  private evaluateConditions(
    conditions: any,
    context: AutomationContext,
  ): boolean {
    if (!conditions || Object.keys(conditions).length === 0) {
      return true; // No conditions means always execute
    }

    // Simple condition evaluation
    // Supports: { field: value } or { field: { operator: value } }
    for (const [field, condition] of Object.entries(conditions)) {
      const contextValue = context[field];

      if (typeof condition === 'object' && condition !== null) {
        // Complex condition with operator
        const conditionObj = condition as { operator?: string; value?: any };
        if (conditionObj.operator === 'equals' && contextValue !== conditionObj.value) {
          return false;
        }
        if (conditionObj.operator === 'not_equals' && contextValue === conditionObj.value) {
          return false;
        }
        if (conditionObj.operator === 'greater_than' && contextValue <= conditionObj.value) {
          return false;
        }
        if (conditionObj.operator === 'less_than' && contextValue >= conditionObj.value) {
          return false;
        }
        if (conditionObj.operator === 'contains' && !String(contextValue).includes(conditionObj.value)) {
          return false;
        }
      } else {
        // Simple equality check
        if (contextValue !== condition) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Execute automation actions
   */
  private async executeActions(
    actions: any[],
    context: AutomationContext,
  ): Promise<void> {
    for (const action of actions) {
      switch (action.type) {
        case 'update_status':
          if (context.candidateId && action.status) {
            await this.prisma.candidate.update({
              where: { id: context.candidateId },
              data: { status: action.status },
            });
          }
          break;

        case 'send_email':
          if (context.candidateEmail) {
            const subject = action.subject || 'Update from Falcon AI Recruiter';
            const html = action.html || action.template
              ? this.renderTemplate(action.template, context)
              : action.body || 'You have an update from Falcon AI Recruiter.';

            await this.emailService.sendEmail(
              context.candidateEmail,
              subject,
              html,
            );
          }
          break;

        case 'notify_user':
          if (context.userId) {
            this.notificationsGateway.notifyUser(context.userId, {
              title: action.title || 'Notification',
              description: action.description || '',
              type: action.notificationType || 'info',
              href: action.href,
            });
          }
          break;

        case 'create_activity_log':
          if (context.candidateId && context.userId) {
            await this.prisma.activityLog.create({
              data: {
                candidateId: context.candidateId,
                userId: context.userId,
                action: action.action || 'automated_action',
                details: action.details || {},
              },
            });
          }
          break;

        default:
          console.warn(`Unknown action type: ${action.type}`);
      }
    }
  }

  /**
   * Render email template with context variables
   */
  private renderTemplate(template: string, context: AutomationContext): string {
    let rendered = template;
    for (const [key, value] of Object.entries(context)) {
      rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), String(value || ''));
    }
    return rendered;
  }

  /**
   * Create a new automation rule
   */
  async createRule(data: {
    name: string;
    description?: string;
    trigger: string;
    conditions: any;
    actions: any[];
    organizationId?: string;
  }) {
    return this.prisma.automationRule.create({
      data: {
        name: data.name,
        description: data.description,
        trigger: data.trigger,
        conditions: data.conditions,
        actions: data.actions,
        organizationId: data.organizationId,
        isActive: true,
      },
    });
  }

  /**
   * Get all automation rules
   */
  async getRules(organizationId?: string) {
    const where: any = {};
    if (organizationId) {
      where.organizationId = organizationId;
    }

    return this.prisma.automationRule.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Update automation rule
   */
  async updateRule(id: string, data: Partial<{
    name: string;
    description: string;
    trigger: string;
    conditions: any;
    actions: any[];
    isActive: boolean;
  }>) {
    return this.prisma.automationRule.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete automation rule
   */
  async deleteRule(id: string) {
    return this.prisma.automationRule.delete({
      where: { id },
    });
  }
}
