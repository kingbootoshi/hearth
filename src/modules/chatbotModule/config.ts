import * as fs from 'fs';
import * as path from 'path';

const promptFilePath = path.join(__dirname, 'questBooPrompt.md');
const corePrompt = fs.readFileSync(promptFilePath, 'utf-8');

/**
 * Insert summaries and memory context into Quest Boo's system prompt.
 * @param summaries The formatted summaries string (short, mid, long)
 * @param memoryContext Formatted memory strings
 * @param additionalContext (like channel info)
 * @returns Updated system prompt string
 */
export function getSystemPrompt(summaries: string, memoryContext: string, additionalContext: string): string {
    // Insert the summaries & memory into the prompt
    // You can define placeholders in questBooPrompt.md like:
    // {{SUMMARIES_HERE}}
    // {{MEMORIES_HERE}}
    // {{ADDITIONAL_CONTEXT_HERE}}
    //
    // Then replace them here.
    
    let finalPrompt = corePrompt;
    finalPrompt = finalPrompt.replace("{{SUMMARIES_HERE}}", summaries);
    finalPrompt = finalPrompt.replace("{{MEMORIES_HERE}}", memoryContext);
    finalPrompt = finalPrompt.replace("{{ADDITIONAL_CONTEXT_HERE}}", additionalContext);

    return finalPrompt;
}
