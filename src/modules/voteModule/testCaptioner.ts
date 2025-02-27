import { generateCaption } from './captioner';
import { logger } from '../../utils/logger';
import * as dotenv from 'dotenv';
import { config } from 'process';

// Force set the environment variable
process.env.OPENAI_API_KEY = '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';

// Then load any other environment variables
dotenv.config();

async function testCaptioner() {
  try {
    const imageUrl = 'https://pbs.twimg.com/media/Gio-BYxbYAAPecK?format=jpg&name=medium';
    logger.info({ imageUrl }, 'Testing captioner with Twitter image');
    
    const caption = await generateCaption(imageUrl);
    logger.info({ caption }, 'Generated caption');
    
    // Display the final caption prominently in the terminal
    console.log('\n');
    console.log('='.repeat(80));
    console.log('FINAL SELECTED CAPTION:');
    console.log('-'.repeat(80));
    console.log(caption);
    console.log('='.repeat(80));
    console.log('\n');
  } catch (error) {
    logger.error({ err: error }, 'Error in test');
  }
}

// Run the test
testCaptioner()
  .then(() => console.log('Test completed'))
  .catch(err => console.error('Test failed:', err)); 