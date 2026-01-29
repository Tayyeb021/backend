import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SkillTaxonomyService {
  constructor(private prisma: PrismaService) {}

  /**
   * Normalize skill name using taxonomy
   */
  async normalizeSkill(skillName: string): Promise<string> {
    const normalized = skillName.trim().toLowerCase();

    // Find skill in taxonomy by preferred label or alias
    const skill = await this.prisma.skillTaxonomy.findFirst({
      where: {
        OR: [
          { preferredLabel: { equals: normalized, mode: 'insensitive' } },
          { aliases: { has: normalized } },
        ],
        isActive: true,
      },
    });

    return skill ? skill.preferredLabel : normalized;
  }

  /**
   * Normalize array of skills
   */
  async normalizeSkills(skills: string[]): Promise<string[]> {
    const normalized = await Promise.all(
      skills.map((skill) => this.normalizeSkill(skill)),
    );
    // Remove duplicates
    return [...new Set(normalized)];
  }

  /**
   * Create or update skill in taxonomy
   */
  async upsertSkill(data: {
    preferredLabel: string;
    aliases?: string[];
    category: string;
    description?: string;
  }) {
    const normalizedLabel = data.preferredLabel.trim().toLowerCase();

    return this.prisma.skillTaxonomy.upsert({
      where: { preferredLabel: normalizedLabel },
      update: {
        aliases: data.aliases || [],
        category: data.category,
        description: data.description,
      },
      create: {
        preferredLabel: normalizedLabel,
        aliases: data.aliases || [],
        category: data.category,
        description: data.description,
      },
    });
  }

  /**
   * Get skills by category
   */
  async getSkillsByCategory(category: string) {
    return this.prisma.skillTaxonomy.findMany({
      where: {
        category,
        isActive: true,
      },
      orderBy: { preferredLabel: 'asc' },
    });
  }

  /**
   * Search skills
   */
  async searchSkills(query: string) {
    return this.prisma.skillTaxonomy.findMany({
      where: {
        OR: [
          { preferredLabel: { contains: query, mode: 'insensitive' } },
          { aliases: { has: query } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
        isActive: true,
      },
      orderBy: { preferredLabel: 'asc' },
    });
  }

  /**
   * Get all categories
   */
  async getCategories() {
    const skills = await this.prisma.skillTaxonomy.findMany({
      where: { isActive: true },
      select: { category: true },
      distinct: ['category'],
    });

    return skills.map((s) => s.category);
  }
}
