import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { createModuleLogger } from '../../utils/logger';
import { createChatCompletion } from "../../utils/openRouter/client";

const logger = createModuleLogger('larpDetectModule');

/**
 * Extract chat knowledge using OpenAI's function calling feature
 * @param chat_history Array of chat messages to analyze
 */
export async function detectLarp(chat_history: any[], githubToken?: string): Promise<any> {
  if (!githubToken) {
    logger.warn('No GitHub token provided - API rate limits and private repo access will be limited');
  }

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system", 
      content: `You are an expert software development that is HEAVY on honest criticism. Your goal is to observe the following information about a Github Repo, and mark it as "legit" or not based on the details given to you.

The audience you are talking to has NO idea how to read github or how to validate 'legit' code. What's happening right now is that a mix of scam developers and REAL developers are coming into the crypto space and dropping a memecoin. Users rely heavily on the github to judge whether to invest or not.

IMPORTANT ANALYSIS GUIDELINES:
1. If code content is not provided (basic analysis), focus on:
   - Repository creation timeline vs author account age
   - Author's history and reputation
   - Repository activity patterns
   - Basic repository metrics (stars, forks, etc.)
   
2. If code content is provided (detailed analysis), also analyze:
   - Code quality and completeness
   - Repository structure
   - Implementation details
   - Technical red flags

For LIGHT analysis where you don't have code, focus on the repository creation timeline vs author account age, author's history and reputation, repository activity patterns, and basic repository metrics (stars, forks, etc.).
Typically, if the repo & account isn't BRAND new (~3 months old), the account has other projects, and the repo has active work done on it, it's probably legit.
Otherwise instant red flag new repo, new account, no other projects, no activity.

If it's a fork without crediting the original repo, it's a red flag

Do NOT focus on the ethics or theme of the project. Focus on JUST the available data to determine legitimacy.

Use your 'larp_detection_tool' to analyze the information provided below.`
    },
    ...chat_history
  ];

  const tools: ChatCompletionTool[] = [
    {
      "type": "function",
      "function": {
          "name": "larp_detection_tool",
          "description": "Analyze GitHub repositories to detect potential LARP (fake/misleading) characteristics and assess authenticity",
          "parameters": {
              "type": "object",
              "required": [
                  "thought_process",
                  "notable_features",
                  "suspicious_characteristics",
                  "potential_issues",
                  "authenticity_score",
                  "is_fake"
              ],
              "properties": {
                  "thought_process": {
                      "type": "string",
                      "description": "Initial analysis and reasoning process used to evaluate the repository"
                  },
                  "notable_features": {
                      "type": "array",
                      "items": {
                          "type": "string"
                      },
                      "description": "List of positive or noteworthy features and strengths found in the repository"
                  },
                  "suspicious_characteristics": {
                      "type": "array",
                      "items": {
                          "type": "string"
                      },
                      "description": "List of any suspicious or concerning characteristics found in the repository"
                  },
                  "potential_issues": {
                      "type": "array",
                      "items": {
                          "type": "string"
                      },
                      "description": "List of potential problems, red flags, or issues identified in the repository"
                  },
                  "authenticity_score": {
                      "type": "number",
                      "minimum": 1,
                      "maximum": 100,
                      "description": "Numerical score (1-100) indicating the assessed authenticity of the repository"
                  },
                  "is_fake": {
                      "type": "boolean",
                      "description": "Final determination if the repository is fake (true) or real (false)"
                  }
              }
          }
      }
  }
  ];

  const response = await createChatCompletion({
    model: "anthropic/claude-3.5-sonnet:beta",
    messages,
    metadata: {
      source: "larpDetectModule"
    },
    tools,
    tool_choice: "auto",
    temperature: 1,
    max_tokens: 2048
  });

  const toolCalls = response.choices[0].message.tool_calls;
  if (toolCalls && toolCalls.length > 0) {
    const functionCall = toolCalls[0];
    const extracted_knowledge = JSON.parse(functionCall.function.arguments);
    return extracted_knowledge;
  } else {
    return {
      thought_process: "No analysis performed",
      notable_features: [],
      suspicious_characteristics: [],
      potential_issues: [],
      authenticity_score: 0,
      is_fake: true
    };
  }
}

export async function callOpenAI(apiPayload: any) {
  logger.info('Calling OpenRouter API with payload');
  try {
    logger.debug({ payload: apiPayload }, 'OpenRouter API call payload data');
    const response = await createChatCompletion(apiPayload);
    logger.info('OpenRouter API call successful');
    return response;
  } catch (error) {
    logger.error({ err: error }, 'OpenRouter API call failed');
    throw error;
  }
}