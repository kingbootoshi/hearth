// Utility for generating random seed phrases using random-word-api
import axios from 'axios';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Cache for words to avoid repeated API calls
let wordCache: string[] = [];

/**
 * Fetches the word list from random-word-api and caches it
 * @returns Array of all available words
 */
async function fetchWordList(): Promise<string[]> {
  try {
    const response = await axios.get<string[]>('https://random-word-api.herokuapp.com/all');
    wordCache = response.data;
    logger.info(`Fetched and cached ${wordCache.length} words from random-word-api`);
    return wordCache;
  } catch (error) {
    logger.error({ error }, 'Failed to fetch words from random-word-api');
    throw error;
  }
}

/**
 * Generates a random seed phrase with specified number of words
 * @param wordCount Number of words in the seed phrase (default: 24)
 * @returns Space-separated string of random words
 */
export async function generateSeedPhrase(wordCount: number = 24): Promise<string> {
  logger.info(`Generating seed phrase with ${wordCount} words`);

  try {
    // Fetch words if cache is empty
    if (wordCache.length === 0) {
      await fetchWordList();
    }

    // Select random words
    const selectedWords: string[] = [];
    for (let i = 0; i < wordCount; i++) {
      const randomIndex = Math.floor(Math.random() * wordCache.length);
      selectedWords.push(wordCache[randomIndex]);
    }

    const seedPhrase = selectedWords.join(' ');
    logger.debug({ seedPhrase }, 'Generated seed phrase');
    
    return seedPhrase;
  } catch (error) {
    logger.error({ error }, 'Failed to generate seed phrase');
    throw error;
  }
}
