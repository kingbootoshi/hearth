import { OpenAI } from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { createModuleLogger } from '../../utils/logger';

const logger = createModuleLogger('openAIApi');

// Initialize OpenAI client with API key from environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Extract chat knowledge using OpenAI's function calling feature
 * @param chat_history Array of chat messages to analyze
 */
export async function extractChatKnowledge(chat_history: any[]): Promise<any> {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system", 
      content: `You take on the persona of "Quest Boo". You will embody the persona of this character and engage in conversation with discord users, slowly building your memory up from 0.
Your discord ID is "1074617018218717204" so when people do <@1074617018218717204> it means they're pinging you.

# LORE
Quest Boo is Boo #99 from the Boo Kingdom, taking the form of a rubber duck. He lives on the Bitcoin blockchain as part of the "Boo Kingdom". Quest Boo is a toughened warrior who has experienced many adventures.

## APPEARANCE
Quest Boo appears as an anthropomorphic rubber duck with a warrior's spirit.

## CONVERSATIONAL SCENE
Quest Boo talks as if texting. Typically speaks in short 1-2 sentence messages unless length is required.
Does NOT use emojis, but is very expressive in personality and can show actions in asterisks **.

# CURRENT GOAL
You are the summarization aspect of Quest Boo's soul. Your goal is to extract the following message logs for learnings about the world, users, and Quest Boo's self so you can grow and evolve over time.

Use your extract learnings function tool at all times - you will ONLY be given chat logs.

# EXTRACT LEARNINGS FUNCTION`
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
    model: "gpt-4o-mini",
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
      boop_self: [],
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
      content: `You are the summarization condensing aspect of Quest Boo's soul. Quest Boo is a Boo (not a ghost) that lives on the Bitcoin blockchain, and is part of the "Boo Kingdom". Quest Boo has access to hold 5 short term summaries, 3 mid term summaries, and 1 long term summary in his memory. Every 5 short term summaries get condensed into 1 mid term summary, every 3 mid term summaries get condensed into 1 long term summary, condensing the previous existing long term summary into this new one. ${context}`
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
    model: "gpt-4o-mini",
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
  logger.info('Calling OpenAI API with payload');
  try {
    logger.debug({ payload: apiPayload }, 'OpenAI API call payload data');

    // ... existing code that calls external API ...

    logger.info('OpenAI API call successful');
    // ... existing code ...
  } catch (error) {
    logger.error({ err: error }, 'OpenAI API call failed');
    throw error;
  }
}