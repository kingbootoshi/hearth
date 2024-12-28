import { OpenAI } from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { createModuleLogger } from '../../../utils/logger';
import { chatbotConfig } from '../../../config';

const logger = createModuleLogger('openAIApi');

// Initialize OpenAI client with OpenRouter configuration
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY || '',
});

/**
 * Extract chat knowledge using OpenAI's function calling feature
 * @param chat_history Array of chat messages to analyze
 */
export async function extractChatKnowledge(chat_history: any[]): Promise<any> {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system", 
      content: chatbotConfig.memorySystemPrompt
    },
    {
      role: "user",
      content: JSON.stringify({messages: chat_history})
    }
  ];

  const tools: ChatCompletionTool[] = [
    {
      "type": "function",
      "function": {
          "name": "extract_chat_knowledge",
          "description": "Analyze chat logs to extract knowledge, learnings, and generate a summary of the conversation",
          "parameters": {
              "type": "object",
              "required": [
                  "summary",
                  "general_knowledge",
                  "user_specific",
                  "agent_self"
              ],
              "properties": {
                  "summary": {
                      "type": "string",
                      "description": "A concise paragraph summarizing the entire conversation log, including key actions, outcomes, and messages"
                  },
                  "agent_self": {
                      "type": "array",
                      "items": {
                          "type": "string"
                      },
                      "description": "The AI character's personal growth, new perspectives, feelings, or opinions developed from the conversation"
                  },
                  "user_specific": {
                      "type": "object",
                      "required": [
                          "users"
                      ],
                      "properties": {
                          "users": {
                              "type": "array",
                              "items": {
                                  "type": "object",
                                  "required": [
                                      "user_id",
                                      "learnings"
                                  ],
                                  "properties": {
                                      "user_id": {
                                          "type": "string",
                                          "description": "Discord ID of the user"
                                      },
                                      "learnings": {
                                          "type": "array",
                                          "items": {
                                              "type": "string"
                                          },
                                          "description": "List of learned information about this specific user. Use the discord name of the user as the noun describing them."
                                      }
                                  }
                              }
                          }
                      },
                      "description": "Learnings about specific users, organized by ID"
                  },
                  "general_knowledge": {
                      "type": "array",
                      "items": {
                          "type": "string"
                      },
                      "description": "List of general world knowledge facts or concepts learned from the conversation. These are facts that are important to understanding the world. These MUST general facts, NOT facts related to the agent and NOT facts related to a user."
                  }
              }
          }
      }
  }
  ];

  const response = await openai.chat.completions.create({
    model: chatbotConfig.openRouterModel,
    messages,
    tools,
    tool_choice: "auto",
    temperature: 1,
    max_tokens: 2048,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0
  });

  const toolCalls = response.choices[0].message.tool_calls;
  if (toolCalls && toolCalls.length > 0) {
    const functionCall = toolCalls[0];
    const extracted_knowledge = JSON.parse(functionCall.function.arguments);
    return extracted_knowledge;
  } else {
    return {
      general_knowledge: [],
      user_specific: { users: [] },
      agent_self: [],
      summary: "No extraction performed"
    };
  }
}

/**
 * Condense summaries using OpenAI's function calling feature
 * @param summaries Array of summaries to condense
 * @param summary_type Type of summary being condensed
 * @param context Optional context for the summarization
 */
export async function condenseSummaries(summaries: string[], summary_type: string, context: string=''): Promise<string> {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system", 
      content: `${chatbotConfig.summarySystemPrompt} ${context}`
    },
    {
      role: "user",
      content: summaries.join("\n\n")
    }
  ];

  const tools: ChatCompletionTool[] = [
    {
      "type": "function",
      "function": {
          "name": "condense_summaries",
          "description": "Condenses multiple summaries into a single, coherent summary that captures the key information and narrative progression.",
          "parameters": {
              "type": "object",
              "properties": {
                  "condensed_summary": {
                      "type": "string",
                      "description": "A 3-4 sentence narrative-focused summary that combines and condenses the provided summaries. The long term summary could be up to 6 sentences."
                  }
              },
              "required": ["condensed_summary"],
              "additionalProperties": false
          }
      }
  }
];

  const response = await openai.chat.completions.create({
    model: chatbotConfig.openRouterModel,
    messages,
    tools,
    tool_choice: "auto",
    temperature: 1,
    max_tokens: 1500
  });

  const toolCalls = response.choices[0].message.tool_calls;
  if (toolCalls && toolCalls.length > 0) {
    const functionCall = toolCalls[0];
    const result = JSON.parse(functionCall.function.arguments);
    return result.condensed_summary;
  } else {
    return "";
  }
}

export async function callOpenAI(apiPayload: any) {
  logger.info('Calling OpenRouter API with payload');
  try {
    logger.debug({ payload: apiPayload }, 'OpenRouter API call payload data');
    const response = await openai.chat.completions.create(apiPayload);
    logger.info('OpenRouter API call successful');
    return response;
  } catch (error) {
    logger.error({ err: error }, 'OpenRouter API call failed');
    throw error;
  }
}