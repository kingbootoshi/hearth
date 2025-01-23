import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';

export interface VoteConfig {
  enabled: boolean;
  voteChannelId: string;
}

export function loadVoteConfig(): VoteConfig {
  const configPath = path.join(process.cwd(), 'config', 'vote.yaml');
  if (!fs.existsSync(configPath)) {
    throw new Error(`vote.yaml config file not found at: ${configPath}`);
  }

  const raw = yaml.load(fs.readFileSync(configPath, 'utf8')) as Partial<VoteConfig>;
  const enabled = raw.enabled !== undefined ? raw.enabled : false;
  const voteChannelId = raw.voteChannelId || '';

  return {
    enabled,
    voteChannelId,
  };
}

export const voteConfig = loadVoteConfig();