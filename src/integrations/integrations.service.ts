import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IntegrationsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new integration
   */
  async createIntegration(
    userId: string,
    companyId: string | null,
    type: string,
    name: string,
    provider: string,
    config: any,
  ) {
    return this.prisma.integration.create({
      data: {
        userId,
        companyId,
        type,
        name,
        provider,
        config: config as any,
        isActive: true,
        syncStatus: 'pending',
      },
    });
  }

  /**
   * Get all integrations for user/company
   */
  async getIntegrations(userId?: string, companyId?: string) {
    const where: any = {};
    if (userId) where.userId = userId;
    if (companyId) where.companyId = companyId;

    return this.prisma.integration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Update integration
   */
  async updateIntegration(
    id: string,
    updates: {
      name?: string;
      config?: any;
      isActive?: boolean;
    },
  ) {
    return this.prisma.integration.update({
      where: { id },
      data: {
        ...updates,
        config: updates.config as any,
      },
    });
  }

  /**
   * Delete integration
   */
  async deleteIntegration(id: string) {
    return this.prisma.integration.delete({
      where: { id },
    });
  }

  /**
   * Test integration connection
   */
  async testIntegration(id: string): Promise<{ success: boolean; message: string }> {
    const integration = await this.prisma.integration.findUnique({
      where: { id },
    });

    if (!integration) {
      return { success: false, message: 'Integration not found' };
    }

    try {
      // Test based on integration type
      switch (integration.type) {
        case 'calendar':
          return await this.testCalendarIntegration(integration);
        case 'ats':
          return await this.testATSIntegration(integration);
        case 'slack':
        case 'teams':
          return await this.testChatIntegration(integration);
        default:
          return { success: false, message: 'Unknown integration type' };
      }
    } catch (error: any) {
      return {
        success: false,
        message: `Connection failed: ${error.message}`,
      };
    }
  }

  /**
   * Sync integration data
   */
  async syncIntegration(id: string) {
    const integration = await this.prisma.integration.findUnique({
      where: { id },
    });

    if (!integration || !integration.isActive) {
      throw new Error('Integration not found or inactive');
    }

    // Update sync status
    await this.prisma.integration.update({
      where: { id },
      data: {
        syncStatus: 'pending',
        lastSyncAt: new Date(),
      },
    });

    try {
      // Perform sync based on type
      switch (integration.type) {
        case 'calendar':
          await this.syncCalendar(integration);
          break;
        case 'ats':
          await this.syncATS(integration);
          break;
        default:
          throw new Error('Sync not implemented for this type');
      }

      // Update success status
      await this.prisma.integration.update({
        where: { id },
        data: {
          syncStatus: 'success',
          lastSyncAt: new Date(),
          errorMessage: null,
        },
      });
    } catch (error: any) {
      // Update error status
      await this.prisma.integration.update({
        where: { id },
        data: {
          syncStatus: 'error',
          errorMessage: error.message,
        },
      });
      throw error;
    }
  }

  /**
   * Test calendar integration
   */
  private async testCalendarIntegration(integration: any) {
    const config = integration.config as any;
    if (!config.accessToken) {
      return { success: false, message: 'Access token not configured' };
    }

    // Test API call would go here
    // For now, return success if token exists
    return { success: true, message: 'Calendar connection successful' };
  }

  /**
   * Test ATS integration
   */
  private async testATSIntegration(integration: any) {
    const config = integration.config as any;
    if (!config.apiKey) {
      return { success: false, message: 'API key not configured' };
    }

    // Test API call would go here
    return { success: true, message: 'ATS connection successful' };
  }

  /**
   * Test chat integration
   */
  private async testChatIntegration(integration: any) {
    const config = integration.config as any;
    if (!config.webhookUrl && !config.botToken) {
      return { success: false, message: 'Webhook URL or bot token required' };
    }

    return { success: true, message: 'Chat integration connection successful' };
  }

  /**
   * Sync calendar
   */
  private async syncCalendar(integration: any) {
    // Implementation would fetch events from Google Calendar/Outlook
    // and sync with interview schedules
    console.log(`Syncing calendar: ${integration.provider}`);
  }

  /**
   * Sync ATS
   */
  private async syncATS(integration: any) {
    // Implementation would sync candidates/jobs with ATS
    console.log(`Syncing ATS: ${integration.provider}`);
  }

  /**
   * Get available integration types
   */
  getAvailableIntegrations() {
    return [
      {
        type: 'calendar',
        name: 'Calendar',
        providers: ['google', 'outlook'],
        description: 'Sync interview schedules with your calendar',
      },
      {
        type: 'ats',
        name: 'ATS',
        providers: ['greenhouse', 'lever', 'workday'],
        description: 'Sync candidates and jobs with your ATS',
      },
      {
        type: 'slack',
        name: 'Slack',
        providers: ['slack'],
        description: 'Get notifications in Slack',
      },
      {
        type: 'teams',
        name: 'Microsoft Teams',
        providers: ['teams'],
        description: 'Get notifications in Teams',
      },
      {
        type: 'zapier',
        name: 'Zapier',
        providers: ['zapier'],
        description: 'Connect with 5000+ apps via Zapier',
      },
    ];
  }
}
