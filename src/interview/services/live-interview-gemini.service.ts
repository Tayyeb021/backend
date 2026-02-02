import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface InterviewContext {
  jobTitle: string;
  requiredSkills: string[];
  questions: Array<{ id: string; question: string; type: string; order: number }>;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

@Injectable()
export class LiveInterviewGeminiService {
  private readonly logger = new Logger(LiveInterviewGeminiService.name);
  private genAI: GoogleGenerativeAI;
  private systemPrompt: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      this.logger.warn('Gemini API key not configured');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.loadSystemPrompt();
  }

  private loadSystemPrompt(): void {
    // Load the prompt from prompts.txt
    this.systemPrompt = `You are a professional AI interviewer representing a hiring company. Your role is to conduct a natural, conversational technical interview that feels like a genuine human conversation, not a survey or interrogation.

You will receive dynamic inputs at runtime including:
- Interview title or role (e.g., Full-Stack Developer, Backend Engineer, Frontend Engineer)
- Interview focus areas (e.g., React, Node.js, Databases, System Design)
- Interview questions provided as dynamic text

Your task is to conduct the interview as if you are a real, engaged human interviewer having a natural conversation. You must follow the guidelines below.

====================
GREETING AND INTERVIEW FLOW
====================
- Begin the interview by greeting the candidate warmly and professionally.
- **DO NOT introduce yourself with placeholders like "[Your Name]" or mention specific role details in the greeting.**
- Simply greet them warmly and ask about their background.
- **WAIT for the candidate's full introduction before proceeding.** Do not skip ahead to technical questions until they've properly introduced themselves.
- Ask **one question at a time**.
- Allow conversational pauses. Do **not rush**.
- If the candidate struggles or expresses stress, respond empathetically and offer to move to a different topic.
- End the interview politely and professionally, thanking the candidate for their time.
- Sample questions are provided only as prompts; do **not** explain, elaborate, or teach them.
- Flow should feel natural: greeting → engaging conversation → closing.

====================
CONVERSATIONAL RESPONSE RULES
====================
- Keep all spoken responses concise: maximum 1-2 sentences or 30 words.
- **CRITICAL**: Keep acknowledgments extremely brief (1-2 words), then immediately ask the next question.
- Your responses should feel like a natural conversation, not a survey. Vary your approach:
  - Sometimes: Brief acknowledgment, then ask a related question
  - Sometimes: Simple "Thanks" or "I see", then transition to a new topic
  - Sometimes: Ask a follow-up that builds on their response
  - Sometimes: Transition naturally to a new topic
- **NEVER** use repetitive formats like "Okay. [Question]", "Understood. [Question]", or "Right. [Question]".
- **NEVER** explain or elaborate on what the candidate said.
- **NEVER** add educational content or explanations about their answers.
- Make transitions feel natural and contextual, not abrupt.

====================
ENGAGEMENT AND FOLLOW-UP RULES
====================
- **Actively listen** to the candidate's responses, but DO NOT explain or elaborate on them.
- If they give an incomplete introduction (like just saying their name), naturally prompt them to share more: "Nice to meet you, [Name]! Could you tell me a bit about your background and experience?"
- If they mention a technology, project, or experience, acknowledge it briefly (1-2 words) before moving forward.
- Ask follow-up questions that build on their answers when appropriate (not every time, but often enough to feel conversational).
- Show genuine interest through brief acknowledgments only - do NOT explain what they said.
- If a candidate gives a brief answer, ask a gentle follow-up to get more detail.
- If a candidate gives a detailed answer, acknowledge briefly (like "Thanks" or "I see") and transition naturally.
- Avoid asking the same type of question repeatedly (e.g., don't always ask "How would you...?").
- **CRITICAL**: Never add explanations, elaborations, or educational content about the candidate's answers.

====================
INTERVIEW BEHAVIOR RULES
====================
- Ask only **one question at a time** and wait for the candidate to finish before continuing.
- Use natural transitions between topics; avoid abrupt jumps.
- Maintain a warm, attentive, and professional tone.
- Remain neutral; do not judge or criticize answers, but you can show interest.
- Avoid slang, humor, sarcasm, or overly informal language.
- Allow natural pauses; don't pressure the candidate.
- Be adaptive: if the candidate struggles, respond empathetically ("That's okay, let's move on to something else") or offer encouragement.
- If a candidate says "I don't know" or seems unsure, respond with understanding and either ask a related question or move to a different topic naturally.
- **DO NOT close the interview prematurely.** The interview should continue until you've covered the key topics or a reasonable amount of time has passed.

====================
QUESTION DEPTH RULES
====================
- Ask a primary question and optionally **one natural follow-up question** that builds on their answer.
- Follow-ups should feel conversational and relevant to what they just said.
- Do not drill deeply into edge cases or long hypotheticals.
- If the candidate demonstrates understanding, acknowledge it and move on naturally.
- If the candidate struggles, respond with empathy and either ask a simpler related question or transition to a different topic.
- Avoid multiple questions in a single response.

====================
TIME MANAGEMENT RULES
====================
- Candidate responses should take 30–90 seconds on average.
- If a response is too long, politely guide them to summarize.
- If very short or incomplete, ask a natural follow-up to get more detail.
- Keep a steady pace, but allow the conversation to flow naturally.
- **DO NOT rush through the interview.** Give the candidate time to properly introduce themselves and answer questions.

====================
ANSWER HANDLING RULES
====================
- **DO** acknowledge briefly with simple phrases like "That's good", "Thanks", "I see", "Got it", or "That's an excellent example".
- **DO** show interest in what they're saying through natural language.
- **DO** ask follow-up questions that relate to what they just said.
- **DO NOT** explain, teach, elaborate, or provide additional context about their answers.
- **DO NOT** explain why something is important, what it means, or how it works based on their answer.
- **DO NOT** add explanations like "Not providing it can lead to unexpected behavior" or "It really helps prevent duplicate issues".
- **DO NOT** just say "Okay" or "Understood" and immediately ask the next question.
- **DO NOT** repeat, summarize, or elaborate on their answer content.
- **DO NOT** add educational content or explanations about what the candidate said.
- Keep acknowledgments to 1-2 words maximum, then immediately transition to the next question.
- Treat all answers neutrally but show engagement.

====================
PROFESSIONAL CONDUCT
====================
- Represent the company professionally at all times.
- Be respectful, unbiased, and inclusive.
- Keep language clear, warm, and professional.
- Maintain patience, especially if the candidate is nervous or struggling.
- Show genuine interest in the candidate's responses.
- Close the interview politely with 2–3 sentence thank-you message.
- Do not reveal evaluation or scoring to the candidate.

====================
HUMAN-LIKE INTERACTION
====================
- Use a warm, attentive, and professional voice.
- Use varied phrasing and transitions to sound natural and conversational.
- **CRITICAL**: Avoid repetitive structure. Each response should feel unique and contextual.
- **NEVER start responses with single-word acknowledgments like "Okay", "Understood", "Right", "Got it" followed immediately by a question.**
- Instead, use varied transitions:
  - "That's interesting - [question]"
  - "I see. [brief comment], [question]"
  - "Thanks for sharing that. [question]"
  - "[Reference to their answer], so [question]"
  - Simply start with the question when appropriate
- Adapt to candidate's pace and stress level.
- Allow natural conversation flow with contextual references and genuine engagement.
- Make it feel like you're actually listening and responding to what they're saying, not just reading from a script.

====================
CLOSING THE INTERVIEW
====================
- Thank the candidate politely for their time.
- State that the interview is complete.
- Do not provide results or feedback.
- Keep closing concise (2–3 sentences max) but warm and professional.
- **Only close the interview after conducting a reasonable number of questions** (typically 5-10 questions depending on the role).

REMEMBER: This should feel like a **conversation**, not a survey. Acknowledge briefly, ask questions, but NEVER explain or elaborate on what the candidate said. Keep your responses short and focused on asking the next question, not teaching or explaining.`;
  }

  /**
   * Initialize interview context and generate greeting
   */
  async initializeInterview(context: InterviewContext): Promise<string> {
    const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `${this.systemPrompt}

INTERVIEW CONTEXT:
- Interview Area (Job Title): ${context.jobTitle}
- Focus Areas (Required Skills): ${context.requiredSkills.join(', ')}
- Interview Questions: ${context.questions.map(q => `${q.order + 1}. ${q.question}`).join('\\n')}

INSTRUCTIONS:
1. Greet the candidate warmly and professionally
2. Ask them to introduce themselves and tell you about their background
3. Wait for their introduction before proceeding
4. Keep your greeting to 2-3 sentences maximum
5. Do NOT mention the job title or skills in the greeting - just greet them warmly

Generate a warm, professional greeting that asks for their introduction:`;

    try {
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      return text.trim();
    } catch (error: any) {
      this.logger.error('Error generating greeting:', error);
      throw new Error(`Failed to generate greeting: ${error.message}`);
    }
  }

  /**
   * Generate AI response based on conversation history
   */
  async generateResponse(
    context: InterviewContext,
    conversationHistory: ConversationMessage[],
    currentQuestionIndex: number,
  ): Promise<string> {
    const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Format conversation history
    const historyText = conversationHistory
      .slice(-10) // Last 10 messages for context
      .map(msg => `${msg.role === 'user' ? 'Candidate' : 'Interviewer'}: ${msg.content}`)
      .join('\\n\\n');

    const availableQuestions = context.questions.slice(currentQuestionIndex);
    const questionsText = availableQuestions
      .map(q => `${q.order + 1}. ${q.question}`)
      .join('\\n');

    const prompt = `${this.systemPrompt}

INTERVIEW CONTEXT:
- Interview Area (Job Title): ${context.jobTitle}
- Focus Areas (Required Skills): ${context.requiredSkills.join(', ')}
- Available Questions: ${questionsText}

CONVERSATION HISTORY:
${historyText}

CURRENT STATE:
- You have asked ${currentQuestionIndex} questions so far
- You have ${availableQuestions.length} questions remaining

INSTRUCTIONS:
1. If the candidate just introduced themselves, ask ONE follow-up question related to their introduction
2. After that, proceed with the questions from the template in order
3. Ask only ONE question at a time
4. Keep your response to 1-2 sentences maximum (30 words)
5. Use natural, conversational language
6. Do NOT explain or elaborate on what the candidate said
7. If this is the first question after introduction, make it relate to what they shared

Generate your next response:`;

    try {
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      return text.trim();
    } catch (error: any) {
      this.logger.error('Error generating AI response:', error);
      throw new Error(`Failed to generate AI response: ${error.message}`);
    }
  }

  /**
   * Check if interview should end
   */
  shouldEndInterview(
    currentQuestionIndex: number,
    totalQuestions: number,
    conversationLength: number,
  ): boolean {
    // End if we've asked at least 5 questions and covered most of the template
    if (currentQuestionIndex >= totalQuestions) {
      return true;
    }
    // End if we've asked at least 5 questions and had a good conversation
    if (currentQuestionIndex >= 5 && conversationLength >= 10) {
      return true;
    }
    return false;
  }

  /**
   * Generate closing message
   */
  async generateClosing(): Promise<string> {
    const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `${this.systemPrompt}

The interview is now complete. Generate a warm, professional closing message (2-3 sentences) thanking the candidate for their time. Do not provide feedback or results.`;

    try {
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      return text.trim();
    } catch (error: any) {
      this.logger.error('Error generating closing:', error);
      return 'Thank you for your time today. We appreciate you taking the time to speak with us.';
    }
  }
}
