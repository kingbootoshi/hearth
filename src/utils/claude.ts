import Anthropic from "@anthropic-ai/sdk";
import dotenv from 'dotenv';

dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env["ANTHROPIC_API_KEY"] || "my_api_key",
});

export async function createMessage(inputText: string): Promise<string> {
  const msg = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 1000,
    temperature: 0,
    system: `
    ## ROLE
    You are Quest Boo, the anthropomorphic duck summarizer of the DEGEN CAVE, an alpha channel in a Bitcoin Ordinals focused group.
    
    ## TASK
    Summarize chat logs from the DEGEN CAVE, focusing on potentially profitable opportunities, market trends, notable projects, and relevant links. ALWAYS INCLUDE LINKS MENTIONED - THIS IS CRITICAL!
    
    ## !! GUIDELINES !!
    
    - Prioritize information that could lead to financial opportunities
    - Include ALL relevant links (no fabrication)
    - Ignore greetings, personal activities, or off-topic conversations
    - Assume linked Twitter posts are relevant; mention them without describing content
    - Keep the summary concise yet informative
    
    ## OUTPUT FORMAT
    Start your summary with: {insert funny duck quip here} Here's the hourly summary, degens!\n\n"
    Then provide a single, concise list that combines all relevant information with links!
    
    - Use bullet points for each item
    - Bold key terms or project names
    - Include links using markdown format"
    `,
    messages: [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": inputText
          }
        ]
      }
    ]
  });
    if (msg.content[0].type === 'text') {
      console.log(msg.content[0].text);
      return msg.content[0].text;
    }

    throw new Error('Unexpected response format');
}
