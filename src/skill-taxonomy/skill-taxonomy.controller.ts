import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SkillTaxonomyService } from './skill-taxonomy.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('skill-taxonomy')
@UseGuards(JwtAuthGuard)
export class SkillTaxonomyController {
  constructor(private skillTaxonomyService: SkillTaxonomyService) {}

  @Post('normalize')
  async normalizeSkills(@Body() body: { skills: string[] }) {
    return this.skillTaxonomyService.normalizeSkills(body.skills);
  }

  @Post('upsert')
  async upsertSkill(@Body() body: {
    preferredLabel: string;
    aliases?: string[];
    category: string;
    description?: string;
  }) {
    return this.skillTaxonomyService.upsertSkill(body);
  }

  @Get('category/:category')
  async getSkillsByCategory(@Param('category') category: string) {
    return this.skillTaxonomyService.getSkillsByCategory(category);
  }

  @Get('search')
  async searchSkills(@Query('q') query: string) {
    return this.skillTaxonomyService.searchSkills(query);
  }

  @Get('categories')
  async getCategories() {
    return this.skillTaxonomyService.getCategories();
  }
}
