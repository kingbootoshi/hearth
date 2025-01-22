// Import local word list and logger
import pino from 'pino';
const words: string[] = require('./words.json');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Generates a random seed phrase with specified number of words
 * @param wordCount Number of words in the seed phrase (default: 24)
 * @returns Space-separated string of random words
 */
export function generateSeedPhrase(wordCount: number = 24): string {
  logger.info(`Generating seed phrase with ${wordCount} words`);

  try {
    // Create a copy of the words array to avoid modifying the original
    const wordsCopy = [...words];
    const selectedWords: string[] = [];
    
    // Select random words
    for (let i = 0; i < wordCount; i++) {
      // Generate a random index
      const randomIndex = Math.floor(Math.random() * wordsCopy.length);
      // Add the word to our selection and remove it from the copy to avoid duplicates
      selectedWords.push(wordsCopy[randomIndex]);
      wordsCopy.splice(randomIndex, 1);
    }

    const seedPhrase = selectedWords.join(' ');
    logger.debug({ seedPhrase }, 'Generated seed phrase');
    
    return seedPhrase;
  } catch (error) {
    logger.error({ error }, 'Failed to generate seed phrase');
    throw error;
  }
}
