import { Injectable } from '@nestjs/common';

@Injectable()
export class InterviewOptimizerService {
  /**
   * Generate instant feedback based on scores
   */
  generateInstantFeedback(scores: {
    technical: number;
    communication: number;
    problemSolving: number;
    culturalFit: number;
    overall: number;
  }): string {
    const feedback: string[] = [];

    if (scores.technical >= 80) {
      feedback.push('Strong technical knowledge demonstrated');
    } else if (scores.technical >= 60) {
      feedback.push('Good technical foundation with room for growth');
    } else {
      feedback.push('Technical skills need further development');
    }

    if (scores.communication >= 80) {
      feedback.push('Excellent communication and clarity');
    } else if (scores.communication >= 60) {
      feedback.push('Clear communication with minor improvements needed');
    } else {
      feedback.push('Communication skills require enhancement');
    }

    if (scores.problemSolving >= 80) {
      feedback.push('Strong analytical and problem-solving abilities');
    } else if (scores.problemSolving >= 60) {
      feedback.push('Good problem-solving approach');
    } else {
      feedback.push('Problem-solving methodology needs refinement');
    }

    if (scores.culturalFit >= 80) {
      feedback.push('Excellent cultural alignment');
    } else if (scores.culturalFit >= 60) {
      feedback.push('Good cultural fit');
    } else {
      feedback.push('Cultural fit may need further assessment');
    }

    return feedback.join('. ') + '.';
  }
}
