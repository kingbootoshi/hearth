import * as fs from 'fs';
import * as path from 'path';

// Fix the path resolution to find questBooPrompt.md
// Using __dirname to get the current directory and navigate to the correct location
const promptFilePath = path.join(__dirname, 'questBooPrompt.md');
const corePrompt = fs.readFileSync(promptFilePath, 'utf-8');

export function getSystemPrompt(context: string, memory: string): string {
    return `${corePrompt}\n\nContext from recent messages:\n${context}\n\nChat Memory:\n${memory}`;
}