import { generateCaption } from './captioner';
import { logger } from '../../utils/logger';
import * as dotenv from 'dotenv';

// Load environment variables
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