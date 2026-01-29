import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SeniorityLevel, JobType, WorkMode } from '@prisma/client';

@Injectable()
export class RoleSpecsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new role specification in DRAFT status
   */
  async createRoleSpec(data: {
    title: string;
    department?: string;
    seniorityLevel: string | SeniorityLevel;
    location?: string;
    employmentType: string;
    workMode: string;
    jobDescription: string;
    mustHaveSkills: string[];
    niceToHaveSkills?: string[];
    clientId: string;
    source?: 'new' | 'template' | 'clone';
    templateId?: string;
    clonedFromId?: string;
    evaluationPolicyId?: string;
  }) {
    // Validate required fields
    if (!data.title || !data.jobDescription || data.mustHaveSkills.length === 0) {
      throw new BadRequestException('Title, description, and must-have skills are required');
    }

    return this.prisma.roleSpec.create({
      data: {
        title: data.title,
        department: data.department,
        seniorityLevel: data.seniorityLevel as SeniorityLevel,
        location: data.location,
        employmentType: data.employmentType as JobType,
        workMode: data.workMode as WorkMode,
        jobDescription: data.jobDescription,
        mustHaveSkills: data.mustHaveSkills,
        niceToHaveSkills: data.niceToHaveSkills,
        clientId: data.clientId,
        status: 'draft',
        source: data.source || 'new',
        templateId: data.templateId,
        clonedFromId: data.clonedFromId,
        evaluationPolicyId: data.evaluationPolicyId || undefined,
      },
      include: {
        client: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }

  /**
   * Update role specification (only if DRAFT)
   */
  async updateRoleSpec(id: string, updates: any, userId: string) {
    const roleSpec = await this.prisma.roleSpec.findUnique({ where: { id } });

    if (!roleSpec) {
      throw new BadRequestException('Role specification not found');
    }

    if (roleSpec.status !== 'draft') {
      throw new ForbiddenException('Cannot update locked or archived role specification');
    }

    if (roleSpec.clientId !== userId) {
      throw new ForbiddenException('You can only update your own role specifications');
    }

    return this.prisma.roleSpec.update({
      where: { id },
      data: {
        ...updates,
        version: roleSpec.version + 1,
      },
    });
  }

  /**
   * Validate role specification before locking
   */
  async validateRoleSpec(id: string): Promise<{ valid: boolean; errors: string[] }> {
    const roleSpec = await this.prisma.roleSpec.findUnique({ where: { id } });

    if (!roleSpec) {
      return { valid: false, errors: ['Role specification not found'] };
    }

    const errors: string[] = [];

    // Required field validation
    if (!roleSpec.title) errors.push('Title is required');
    if (!roleSpec.jobDescription) errors.push('Job description is required');
    if (roleSpec.mustHaveSkills.length === 0) {
      errors.push('At least one must-have skill is required');
    }
    if (!roleSpec.seniorityLevel) errors.push('Seniority level is required');
    if (!roleSpec.employmentType) errors.push('Employment type is required');
    if (!roleSpec.workMode) errors.push('Work mode is required');

    // Skill formatting validation
    const invalidSkills = [
      ...roleSpec.mustHaveSkills,
      ...roleSpec.niceToHaveSkills,
    ].filter((skill) => !skill || skill.trim().length === 0);

    if (invalidSkills.length > 0) {
      errors.push('All skills must be non-empty strings');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Lock role specification (make it read-only)
   */
  async lockRoleSpec(id: string, userId: string) {
    const roleSpec = await this.prisma.roleSpec.findUnique({ where: { id } });

    if (!roleSpec) {
      throw new BadRequestException('Role specification not found');
    }

    if (roleSpec.status !== 'draft') {
      throw new BadRequestException('Only draft role specifications can be locked');
    }

    // Validate before locking
    const validation = await this.validateRoleSpec(id);
    if (!validation.valid) {
      throw new BadRequestException(`Validation failed: ${validation.errors.join(', ')}`);
    }

    return this.prisma.roleSpec.update({
      where: { id },
      data: {
        status: 'locked',
        lockedAt: new Date(),
        lockedBy: userId,
        validatedAt: new Date(),
      },
    });
  }

  /**
   * Clone role specification
   */
  async cloneRoleSpec(id: string, clientId: string, updates?: any) {
    const source = await this.prisma.roleSpec.findUnique({ where: { id } });

    if (!source) {
      throw new BadRequestException('Source role specification not found');
    }

    return this.createRoleSpec({
      title: updates?.title || `${source.title} (Copy)`,
      department: updates?.department || source.department,
      seniorityLevel: source.seniorityLevel,
      location: updates?.location || source.location,
      employmentType: source.employmentType,
      workMode: source.workMode,
      jobDescription: source.jobDescription,
      mustHaveSkills: [...source.mustHaveSkills],
      niceToHaveSkills: [...source.niceToHaveSkills],
      clientId,
      source: 'clone',
      clonedFromId: source.id,
      evaluationPolicyId: source.evaluationPolicyId ?? undefined,
    });
  }

  /**
   * Create from template
   */
  async createFromTemplate(templateId: string, clientId: string, updates?: any) {
    const template = await this.prisma.roleSpec.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new BadRequestException('Template not found');
    }

    return this.createRoleSpec({
      title: updates?.title || template.title,
      department: updates?.department || template.department,
      seniorityLevel: template.seniorityLevel,
      location: updates?.location || template.location,
      employmentType: template.employmentType,
      workMode: template.workMode,
      jobDescription: template.jobDescription,
      mustHaveSkills: [...template.mustHaveSkills],
      niceToHaveSkills: [...template.niceToHaveSkills],
      clientId,
      source: 'template',
      templateId: template.id,
      evaluationPolicyId: template.evaluationPolicyId ?? undefined,
    });
  }

  /**
   * Get role specifications
   */
  async getRoleSpecs(clientId: string, filters?: { status?: string; search?: string }) {
    const where: any = { clientId };

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { department: { contains: filters.search, mode: 'insensitive' } },
        { jobDescription: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.roleSpec.findMany({
      where,
      include: {
        client: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        lockedByUser: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        evaluationPolicy: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Get role specification by ID
   */
  async getRoleSpecById(id: string) {
    return this.prisma.roleSpec.findUnique({
      where: { id },
      include: {
        client: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        lockedByUser: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        template: true,
        clonedFrom: true,
        evaluationPolicy: true,
        jobs: {
          select: { id: true, title: true, status: true },
        },
      },
    });
  }
}
