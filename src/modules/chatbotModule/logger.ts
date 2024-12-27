import * as fs from 'fs';
import * as path from 'path';

export class Logger {
  private logDir: string;

  constructor() {
    // Create logs directory if it doesn't exist
    this.logDir = path.join(__dirname, '../../../logs');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir);
    }
  }

  // Log API calls with timestamp
  public logApiCall(systemPrompt: string, messages: any[], response: any) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = path.join(this.logDir, `api_call_${timestamp}.txt`);
    
    const content = `
=== API CALL LOG ===
Timestamp: ${new Date().toISOString()}

=== SYSTEM PROMPT ===
${systemPrompt}

=== CONTEXT AND MESSAGES ===
${messages.map(m => `
[${m.role.toUpperCase()}]
${m.content}
`).join('\n')}

=== RESPONSE ===
${JSON.stringify(response, null, 2)}
`;

    fs.writeFileSync(filename, content);
  }
} 