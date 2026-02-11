import { IsEmail } from 'class-validator';

/**
 * Normalize email address
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Normalize phone number to international format
 */
export function normalizePhone(phone: string): string {
  if (!phone) return '';
  
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  
  if (digits.length === 0) return '';
  
  // If already starts with +, return as is
  if (phone.startsWith('+')) {
    return `+${digits}`;
  }
  
  // UAE country code handling
  if (digits.startsWith('971')) {
    return `+${digits}`;
  }
  
  // If starts with 0, replace with country code
  if (digits.startsWith('0')) {
    return `+971${digits.substring(1)}`;
  }
  
  // If 9 digits, assume UAE local number
  if (digits.length === 9) {
    return `+971${digits}`;
  }
  
  // Default: add + if not present
  return `+${digits}`;
}

/**
 * Normalize and deduplicate skills array
 */
export function normalizeSkills(skills: string[]): string[] {
  if (!skills || !Array.isArray(skills)) return [];
  
  return [...new Set(
    skills
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
  )];
}

/**
 * Calculate profile completeness score (0-100)
 */
export function calculateProfileCompleteness(candidate: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  resumeUrl?: string | null;
  skills?: string[] | null;
  experienceYears?: number | null;
  profileData?: any;
}): number {
  let score = 0;
  
  if (candidate.firstName) score += 10;
  if (candidate.lastName) score += 10;
  if (candidate.email) score += 15;
  if (candidate.phone) score += 10;
  if (candidate.location) score += 10;
  if (candidate.resumeUrl) score += 15;
  if (candidate.skills && candidate.skills.length > 0) score += 15;
  if (candidate.experienceYears !== null && candidate.experienceYears !== undefined) score += 10;
  if (candidate.profileData) score += 5;
  
  return score;
}

/**
 * Calculate similarity between two strings (0-1)
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

/**
 * Levenshtein distance algorithm
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Merge two skills arrays, removing duplicates
 */
export function mergeSkills(skills1: string[] | null | undefined, skills2: string[] | null | undefined): string[] {
  const allSkills = [
    ...(skills1 || []),
    ...(skills2 || []),
  ];
  
  return normalizeSkills(allSkills);
}
