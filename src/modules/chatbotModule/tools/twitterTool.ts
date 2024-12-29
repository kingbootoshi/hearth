import { Client, TextChannel } from 'discord.js';
import pino from 'pino';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';
import fetch from 'node-fetch';
import FormData from 'form-data';

// Initialize logger
const logger = pino({
  name: 'twitterTool',
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Twitter API configuration
const TWITTER_API_KEY = process.env.TWITTER_API_KEY!;
const TWITTER_API_KEY_SECRET = process.env.TWITTER_API_KEY_SECRET!;
const TWITTER_ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN!;
const TWITTER_ACCESS_TOKEN_SECRET = process.env.TWITTER_ACCESS_TOKEN_SECRET!;

// Initialize OAuth 1.0a
const oauth = new OAuth({
  consumer: {
    key: TWITTER_API_KEY,
    secret: TWITTER_API_KEY_SECRET,
  },
  signature_method: 'HMAC-SHA1',
  hash_function(baseString: string, key: string) {
    return crypto
      .createHmac('sha1', key)
      .update(baseString)
      .digest('base64');
  },
});

interface TwitterPostArgs {
  text: string;
  image_url?: string;
  channelId: string;
}

interface TwitterMediaResponse {
  media_id_string: string;
}

interface TwitterTweetResponse {
  data: {
    id: string;
  };
}

/**
 * Posts a tweet with optional media
 */
async function postTweet(text: string, imageUrl?: string): Promise<string> {
  const tweetEndpoint = 'https://api.twitter.com/2/tweets';
  
  // Add signature
  const finalText = `${text} - Quest Boo`;
  
  let mediaId: string | undefined;
  
  // If image URL is provided, upload it first
  if (imageUrl) {
    try {
      logger.debug({ imageUrl }, 'Uploading media to Twitter');
      // Fetch the image
      const imageResponse = await fetch(imageUrl);
      
      logger.debug({ 
        status: imageResponse.status,
        statusText: imageResponse.statusText,
        headers: Object.fromEntries(imageResponse.headers),
        ok: imageResponse.ok,
        url: imageResponse.url
      }, 'Image fetch response details');

      if (!imageResponse.ok) {
        const errorText = await imageResponse.text();
        logger.error({ 
          status: imageResponse.status,
          response: errorText,
          headers: Object.fromEntries(imageResponse.headers)
        }, 'Image fetch failed');
        throw new Error(`Failed to fetch image: ${errorText}`);
      }

      const imageBuffer = await imageResponse.buffer();
      
      logger.debug({ 
        imageBufferSize: imageBuffer.length,
        contentType: imageResponse.headers.get('content-type'),
        bufferType: typeof imageBuffer,
        isBuffer: Buffer.isBuffer(imageBuffer)
      }, 'Image fetched and buffered');

      // Validate image buffer size
      if (imageBuffer.length < 1000) {
        logger.error({ imageBufferSize: imageBuffer.length }, 'Image buffer too small, likely invalid');
        throw new Error('Invalid image buffer: size too small');
      }
      
      // Upload to Twitter media endpoint
      const mediaEndpoint = 'https://upload.twitter.com/1.1/media/upload.json';
      
      // Convert buffer to base64
      const base64Data = imageBuffer.toString('base64');
      const params = new URLSearchParams();
      params.append('media_data', base64Data);
      
      logger.debug({ 
        mediaEndpoint,
        contentType: imageResponse.headers.get('content-type'),
        base64Length: base64Data.length,
        originalBufferSize: imageBuffer.length
      }, 'Preparing media upload request');

      // Include the media_data in the OAuth signature
      const mediaAuthHeader = oauth.toHeader(oauth.authorize({
        url: mediaEndpoint,
        method: 'POST',
        data: {
          media_data: base64Data
        }
      }, {
        key: TWITTER_ACCESS_TOKEN,
        secret: TWITTER_ACCESS_TOKEN_SECRET,
      }));

      const requestHeaders = {
        ...mediaAuthHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      };

      logger.debug({
        finalHeaders: requestHeaders,
        paramsSize: params.toString().length,
        contentType: requestHeaders['Content-Type'],
        hasMediaData: !!base64Data
      }, 'Final request configuration');

      const mediaUploadResponse = await fetch(mediaEndpoint, {
        method: 'POST',
        headers: requestHeaders,
        body: params,
      });

      logger.debug({ 
        status: mediaUploadResponse.status,
        statusText: mediaUploadResponse.statusText,
        headers: Object.fromEntries(mediaUploadResponse.headers),
      }, 'Media upload response received');

      if (!mediaUploadResponse.ok) {
        const errorText = await mediaUploadResponse.text();
        logger.error({ 
          status: mediaUploadResponse.status,
          response: errorText,
          headers: Object.fromEntries(mediaUploadResponse.headers)
        }, 'Media upload failed with error response');
        throw new Error(`Failed to upload media: ${errorText}`);
      }

      const mediaData = await mediaUploadResponse.json() as TwitterMediaResponse;
      mediaId = mediaData.media_id_string;
      logger.debug({ mediaId }, 'Successfully uploaded media to Twitter');
    } catch (error) {
      logger.error({ error }, 'Failed to upload media to Twitter');
      throw error;
    }
  }

  // Prepare tweet data
  const tweetData = {
    text: finalText,
    ...(mediaId && { media: { media_ids: [mediaId] } }),
  };

  // Get OAuth header
  const authHeader = oauth.toHeader(oauth.authorize({
    url: tweetEndpoint,
    method: 'POST',
  }, {
    key: TWITTER_ACCESS_TOKEN,
    secret: TWITTER_ACCESS_TOKEN_SECRET,
  }));

  try {
    logger.debug({ tweetData }, 'Posting tweet');
    const response = await fetch(tweetEndpoint, {
      method: 'POST',
      headers: {
        ...authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tweetData),
    });

    if (!response.ok) {
      throw new Error(`Failed to post tweet: ${await response.text()}`);
    }

    const data = await response.json() as TwitterTweetResponse;
    logger.debug({ response: data }, 'Successfully posted tweet');
    return data.data.id;
  } catch (error) {
    logger.error({ error }, 'Failed to post tweet');
    throw error;
  }
}

/**
 * Handle Twitter post tool
 */
export async function handleTwitterPost(
  args: TwitterPostArgs,
  client: Client
): Promise<string> {
  logger.info({ args }, '[twitter_post] Tool invoked');

  try {
    // Get the Discord channel for confirmation message
    const channel = await client.channels.fetch(args.channelId) as TextChannel;
    if (!channel?.isTextBased()) {
      logger.error({ channelId: args.channelId }, 'Invalid channel or not a text channel');
      throw new Error('Invalid channel or not a text channel');
    }

    // Send initial message
    const loadingMsg = await channel.send("🐦 Posting to Twitter...");

    // Post the tweet
    const tweetId = await postTweet(args.text, args.image_url);
    
    // Update Discord message
    const tweetUrl = `https://twitter.com/x/status/${tweetId}`;
    await loadingMsg.edit(`✅ Posted to Twitter! View tweet: ${tweetUrl}`);

    logger.info({ tweetId }, 'Successfully posted to Twitter');
    return `Posted tweet: ${tweetUrl}`;
  } catch (error) {
    logger.error({ error }, 'Error in twitter_post tool');
    throw error;
  }
} 