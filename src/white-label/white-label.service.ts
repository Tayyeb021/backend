import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WhiteLabelService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get white-label config for company
   */
  async getWhiteLabelConfig(companyId: string) {
    let config = await this.prisma.whiteLabelConfig.findUnique({
      where: { companyId },
    });

    // Create default if doesn't exist
    if (!config) {
      config = await this.createDefaultConfig(companyId);
    }

    return config;
  }

  /**
   * Update white-label config
   */
  async updateWhiteLabelConfig(
    companyId: string,
    updates: {
      logoUrl?: string;
      primaryColor?: string;
      secondaryColor?: string;
      companyName?: string;
      domain?: string;
      customCss?: string;
      isActive?: boolean;
    },
  ) {
    return this.prisma.whiteLabelConfig.upsert({
      where: { companyId },
      create: {
        companyId,
        ...updates,
      },
      update: updates,
    });
  }

  /**
   * Create default config
   */
  private async createDefaultConfig(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });

    return this.prisma.whiteLabelConfig.create({
      data: {
        companyId,
        companyName: company?.name,
        primaryColor: '#2563eb', // Default blue
        secondaryColor: '#0ea5e9', // Default sky blue
        isActive: false,
      },
    });
  }

  /**
   * Validate domain
   */
  async validateDomain(domain: string): Promise<boolean> {
    // Check if domain is already taken
    const existing = await this.prisma.whiteLabelConfig.findUnique({
      where: { domain },
    });

    if (existing) {
      return false;
    }

    // Basic domain validation
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return domainRegex.test(domain);
  }

  /**
   * Get white-label config by domain
   */
  async getConfigByDomain(domain: string) {
    return this.prisma.whiteLabelConfig.findUnique({
      where: { domain },
      include: {
        company: true,
      },
    });
  }
}
