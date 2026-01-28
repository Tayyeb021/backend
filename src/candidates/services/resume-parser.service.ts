import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';

export interface ParsedResumeData {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  location?: string;
  skills?: string[];
  experienceYears?: number;
  education?: Array<{
    school: string;
    degree: string;
    field: string;
    startDate?: string;
    endDate?: string;
  }>;
  workHistory?: Array<{
    company: string;
    title: string;
    description?: string;
    startDate?: string;
    endDate?: string;
    location?: string;
  }>;
  summary?: string;
  certifications?: string[];
  languages?: string[];
}

@Injectable()
export class ResumeParserService {
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  /**
   * Extract text from resume file based on MIME type
   */
  async extractTextFromResume(buffer: Buffer, mimeType: string): Promise<string> {
    try {
      if (mimeType === 'application/pdf') {
        const pdfData = await pdfParse(buffer);
        return pdfData.text;
      } else if (
        mimeType.includes('wordprocessingml') ||
        mimeType.includes('msword') ||
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword'
      ) {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
      } else if (mimeType === 'text/plain') {
        return buffer.toString('utf-8');
      } else {
        throw new Error(`Unsupported file type: ${mimeType}`);
      }
    } catch (error: any) {
      throw new Error(`Failed to extract text from resume: ${error.message}`);
    }
  }

  /**
   * Parse resume text using AI to extract structured data
   */
  async parseResume(text: string): Promise<ParsedResumeData> {
    if (!this.genAI) {
      // Fallback to basic parsing if Gemini is not available
      return this.basicParseResume(text);
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
      const prompt = `Extract structured data from this resume text. Return a JSON object with the following fields:

{
  "firstName": string (first name),
  "lastName": string (last name),
  "email": string (email address),
  "phone": string (phone number in international format),
  "location": string (city, country),
  "skills": string[] (list of technical and professional skills),
  "experienceYears": number (total years of professional experience),
  "education": [
    {
      "school": string,
      "degree": string,
      "field": string,
      "startDate": string (YYYY-MM format),
      "endDate": string (YYYY-MM format or "present")
    }
  ],
  "workHistory": [
    {
      "company": string,
      "title": string,
      "description": string (brief job description),
      "startDate": string (YYYY-MM format),
      "endDate": string (YYYY-MM format or "present"),
      "location": string
    }
  ],
  "summary": string (professional summary or objective),
  "certifications": string[] (list of certifications),
  "languages": string[] (list of languages spoken)
}

Resume Text:
${text}

Return only valid JSON, no markdown formatting. If a field is not found, use null or empty array.`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const responseText = response.text();

      // Clean JSON response
      const jsonText = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const parsedData: ParsedResumeData = JSON.parse(jsonText);

      // Calculate experience years from work history if not provided
      if (!parsedData.experienceYears && parsedData.workHistory) {
        parsedData.experienceYears = this.calculateExperienceYears(parsedData.workHistory);
      }

      return parsedData;
    } catch (error: any) {
      console.error('AI resume parsing failed, using basic parser:', error);
      return this.basicParseResume(text);
    }
  }

  /**
   * Basic resume parsing without AI (fallback)
   */
  private basicParseResume(text: string): ParsedResumeData {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    const data: ParsedResumeData = {
      skills: [],
      education: [],
      workHistory: [],
      certifications: [],
      languages: [],
    };

    // Extract email
    const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
    if (emailMatch) {
      data.email = emailMatch[0];
    }

    // Extract phone
    const phoneMatch = text.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    if (phoneMatch) {
      data.phone = phoneMatch[0];
    }

    // Extract name (first two lines usually)
    if (lines.length > 0) {
      const nameParts = lines[0].split(/\s+/);
      if (nameParts.length >= 2) {
        data.firstName = nameParts[0];
        data.lastName = nameParts.slice(1).join(' ');
      } else {
        data.firstName = nameParts[0];
      }
    }

    // Extract skills (look for common skill keywords)
    const skillKeywords = [
      'JavaScript', 'Python', 'Java', 'React', 'Node.js', 'SQL', 'AWS',
      'Docker', 'Kubernetes', 'Git', 'TypeScript', 'Angular', 'Vue',
      'MongoDB', 'PostgreSQL', 'Redis', 'GraphQL', 'REST', 'API',
    ];
    
    const foundSkills = skillKeywords.filter(skill =>
      text.toLowerCase().includes(skill.toLowerCase())
    );
    data.skills = foundSkills;

    return data;
  }

  /**
   * Calculate total years of experience from work history
   */
  private calculateExperienceYears(workHistory: Array<{ startDate?: string; endDate?: string }>): number {
    if (!workHistory || workHistory.length === 0) return 0;

    let totalMonths = 0;
    const now = new Date();

    for (const job of workHistory) {
      if (!job.startDate) continue;

      const startDate = this.parseDate(job.startDate);
      if (!startDate) continue;

      const endDate = job.endDate && job.endDate.toLowerCase() !== 'present'
        ? this.parseDate(job.endDate)
        : now;

      if (endDate && endDate > startDate) {
        const months = (endDate.getFullYear() - startDate.getFullYear()) * 12 +
          (endDate.getMonth() - startDate.getMonth());
        totalMonths += Math.max(0, months);
      }
    }

    return Math.round(totalMonths / 12);
  }

  /**
   * Parse date string (YYYY-MM format)
   */
  private parseDate(dateStr: string): Date | null {
    try {
      // Handle YYYY-MM format
      if (/^\d{4}-\d{2}$/.test(dateStr)) {
        return new Date(dateStr + '-01');
      }
      // Handle YYYY format
      if (/^\d{4}$/.test(dateStr)) {
        return new Date(dateStr + '-01-01');
      }
      // Try standard date parsing
      return new Date(dateStr);
    } catch {
      return null;
    }
  }
}
