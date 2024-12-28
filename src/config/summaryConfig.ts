import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';

export interface SummaryConfig {
  enabled: boolean;
  openRouterModel: string;        // e.g. "openai/gpt-4o"
  summarizerSystemPrompt: string; // replaced the old system prompt references
  watchChannelId: string;         // discord channel to read messages from
  summaryChannelId: string;       // discord channel to post summaries to
}

// By default, read config/summary.yaml
export function loadSummaryConfig(): SummaryConfig {
  const configPath = path.join(process.cwd(), 'config', 'summary.yaml');
  if (!fs.existsSync(configPath)) {
    throw new Error(`summary.yaml config file not found at: ${configPath}`);
  }

  const raw = yaml.load(fs.readFileSync(configPath, 'utf8')) as Partial<SummaryConfig>;
  const enabled = raw.enabled !== undefined ? raw.enabled : true;

  const finalConfig: SummaryConfig = {
    enabled,
    openRouterModel: raw.openRouterModel || 'openai/gpt-4o',
    summarizerSystemPrompt: raw.summarizerSystemPrompt || 'You are a summarizer of Boo logs...',
    watchChannelId: raw.watchChannelId || '',
    summaryChannelId: raw.summaryChannelId || '',
  };

  return finalConfig;
}