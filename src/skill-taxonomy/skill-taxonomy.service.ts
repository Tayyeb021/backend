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
   * Parse job description and extract skills using AI
   */
  async parseJobDescription(jobDescription: string): Promise<{
    extractedSkills: string[];
    normalizedSkills: string[];
    suggestedSkills: string[];
  }> {
    // Use Gemini AI to extract skills from job description
    // For now, use a simple keyword-based approach
    // In production, this would use Gemini AI
    
    const allSkills = await this.prisma.skillTaxonomy.findMany({
      where: { isActive: true },
      select: { preferredLabel: true, aliases: true },
    });

    const extractedSkills: string[] = [];
    const jobDescLower = jobDescription.toLowerCase();

    // Extract skills by matching against taxonomy
    for (const skill of allSkills) {
      const skillLower = skill.preferredLabel.toLowerCase();
      if (jobDescLower.includes(skillLower)) {
        extractedSkills.push(skill.preferredLabel);
      } else {
        // Check aliases
        for (const alias of skill.aliases || []) {
          if (jobDescLower.includes(alias.toLowerCase())) {
            extractedSkills.push(skill.preferredLabel);
            break;
          }
        }
      }
    }

    // Normalize extracted skills
    const normalizedSkills = await this.normalizeSkills(extractedSkills);

    // Get suggested skills based on extracted skills (skills in same categories)
    const suggestedSkills = await this.getSuggestedSkills(normalizedSkills);

    return {
      extractedSkills: [...new Set(extractedSkills)],
      normalizedSkills,
      suggestedSkills,
    };
  }

  /**
   * Get suggested skills based on existing skills
   */
  async getSuggestedSkills(existingSkills: string[], limit = 10): Promise<string[]> {
    if (existingSkills.length === 0) return [];

    // Get categories of existing skills
    const skills = await this.prisma.skillTaxonomy.findMany({
      where: {
        preferredLabel: { in: existingSkills },
        isActive: true,
      },
      select: { category: true },
    });

    const categories = [...new Set(skills.map((s) => s.category))];

    // Get other skills from same categories
    const suggested = await this.prisma.skillTaxonomy.findMany({
      where: {
        category: { in: categories },
        preferredLabel: { notIn: existingSkills },
        isActive: true,
      },
      take: limit,
      orderBy: { preferredLabel: 'asc' },
    });

    return suggested.map((s) => s.preferredLabel);
  }

  /**
   * Suggest similar skills if a skill is not in taxonomy
   */
  async suggestSimilarSkills(skillName: string, limit = 5): Promise<string[]> {
    const normalized = skillName.trim().toLowerCase();

    // Search for similar skills
    const similar = await this.prisma.skillTaxonomy.findMany({
      where: {
        OR: [
          { preferredLabel: { contains: normalized, mode: 'insensitive' } },
          { aliases: { has: normalized } },
        ],
        isActive: true,
      },
      take: limit,
      orderBy: { preferredLabel: 'asc' },
    });

    return similar.map((s) => s.preferredLabel);
  }

  /**
   * Get skills suggestions based on role category
   */
  async getSkillsByRoleCategory(roleCategory: string): Promise<string[]> {
    // Map role categories to skill categories
    const categoryMapping: Record<string, string[]> = {
      'software_engineering': ['Programming Languages', 'Frameworks', 'Tools', 'Databases'],
      'data_science': ['Programming Languages', 'Data Analysis', 'Machine Learning', 'Databases'],
      'product_management': ['Product Management', 'Agile', 'Tools'],
      'design': ['Design Tools', 'UI/UX', 'Graphics'],
      'marketing': ['Marketing', 'Analytics', 'Tools'],
      'sales': ['Sales', 'CRM', 'Communication'],
    };

    const skillCategories = categoryMapping[roleCategory.toLowerCase()] || [];

    if (skillCategories.length === 0) return [];

    const skills = await this.prisma.skillTaxonomy.findMany({
      where: {
        category: { in: skillCategories },
        isActive: true,
      },
      orderBy: { preferredLabel: 'asc' },
    });

    return skills.map((s) => s.preferredLabel);
  }

  /**
   * Auto-match skills against taxonomy when creating role spec
   */
  async autoMatchSkills(skills: string[]): Promise<{
    matched: string[];
    unmatched: string[];
    suggestions: Record<string, string[]>;
  }> {
    const matched: string[] = [];
    const unmatched: string[] = [];
    const suggestions: Record<string, string[]> = {};

    for (const skill of skills) {
      const normalized = await this.normalizeSkill(skill);
      
      // Check if skill exists in taxonomy
      const exists = await this.prisma.skillTaxonomy.findFirst({
        where: {
          preferredLabel: { equals: normalized, mode: 'insensitive' },
          isActive: true,
        },
      });

      if (exists) {
        matched.push(exists.preferredLabel);
      } else {
        unmatched.push(skill);
        // Get suggestions for unmatched skills
        const similar = await this.suggestSimilarSkills(skill, 3);
        if (similar.length > 0) {
          suggestions[skill] = similar;
        }
      }
    }

    return { matched, unmatched, suggestions };
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
