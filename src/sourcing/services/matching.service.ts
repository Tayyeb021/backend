import { Injectable } from '@nestjs/common';
import { Job } from '@prisma/client';

@Injectable()
export class MatchingService {
  calculateMatchScore(candidateSkills: string[], job: Job): number {
    if (!candidateSkills || candidateSkills.length === 0) return 0;
    if (!job.requiredSkills || job.requiredSkills.length === 0) return 0;

    const candidateSkillsLower = candidateSkills.map((s) => s.toLowerCase());
    const requiredSkillsLower = job.requiredSkills.map((s) => s.toLowerCase());

    const matchingSkills = requiredSkillsLower.filter((skill) =>
      candidateSkillsLower.some(
        (cSkill) => cSkill.includes(skill) || skill.includes(cSkill),
      ),
    );

    const matchPercentage =
      (matchingSkills.length / requiredSkillsLower.length) * 100;
    return Math.round(matchPercentage);
  }

  shouldContact(matchScore: number, threshold: number = 70): boolean {
    return matchScore >= threshold;
  }
}
