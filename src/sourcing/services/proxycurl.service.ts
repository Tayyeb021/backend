import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class ProxycurlService {
  private readonly apiKey: string;
  private readonly apiUrl: string = 'https://nubela.co/proxycurl/api/v2';

  constructor() {
    this.apiKey = process.env.PROXYCURL_API_KEY || '';
  }

  async getLinkedInProfile(profileUrl: string): Promise<any> {
    try {
      const response = await axios.get(`${this.apiUrl}/linkedin`, {
        params: {
          url: profileUrl,
        },
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      return this.normalizeProfile(response.data);
    } catch (error: any) {
      throw new Error(`Failed to fetch LinkedIn profile: ${error.message}`);
    }
  }

  private normalizeProfile(profile: any): any {
    return {
      firstName: profile.first_name || '',
      lastName: profile.last_name || '',
      email: profile.personal_emails?.[0] || '',
      phone: profile.phone_numbers?.[0] || '',
      location: profile.city || profile.country || '',
      skills: profile.skills || [],
      experienceYears: this.calculateExperienceYears(profile.experiences || []),
      resumeUrl: profile.profile_pic_url || '',
      profileData: profile,
      sourcePlatform: 'LinkedIn',
    };
  }

  private calculateExperienceYears(experiences: any[]): number {
    if (!experiences || experiences.length === 0) return 0;

    const sortedExperiences = experiences.sort((a, b) => {
      const startA = new Date(a.starts_at?.year || 0, a.starts_at?.month || 0);
      const startB = new Date(b.starts_at?.year || 0, b.starts_at?.month || 0);
      return startA.getTime() - startB.getTime();
    });

    const firstJob = sortedExperiences[0];
    const lastJob = sortedExperiences[sortedExperiences.length - 1];

    const startDate = new Date(
      firstJob.starts_at?.year || 0,
      firstJob.starts_at?.month || 0
    );
    const endDate = lastJob.ends_at
      ? new Date(lastJob.ends_at.year || 0, lastJob.ends_at.month || 0)
      : new Date();

    const years = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
    return Math.round(years);
  }
}
