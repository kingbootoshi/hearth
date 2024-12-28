import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';

export interface ImageGenConfig {
  enabled: boolean;
  openRouterModel: string;         // e.g. "openai/gpt-4o"
  enhanceSystemPrompt: string;     // prompt used for enhancePrompt
  randomGenSystemPrompt: string;   // prompt used for randomPrompt
  loraModelPath: string;           // replaces the "BTCBOO.safetensors"
}

// By default, read config/imageGen.yaml
export function loadImageGenConfig(): ImageGenConfig {
  const configPath = path.join(process.cwd(), 'config', 'imageGen.yaml');
  if (!fs.existsSync(configPath)) {
    throw new Error(`imageGen.yaml config file not found at: ${configPath}`);
  }

  const raw = yaml.load(fs.readFileSync(configPath, 'utf8')) as Partial<ImageGenConfig>;
  const enabled = raw.enabled !== undefined ? raw.enabled : true;

  const finalConfig: ImageGenConfig = {
    enabled,
    openRouterModel: raw.openRouterModel || 'openai/gpt-4o',
    enhanceSystemPrompt: raw.enhanceSystemPrompt || 'You are an expert image prompt engineer...',
    randomGenSystemPrompt: raw.randomGenSystemPrompt || 'You are modeling the mind of the Boo...',
    loraModelPath: raw.loraModelPath || 'Bootoshi/booLorav1',
  };

  return finalConfig;
}