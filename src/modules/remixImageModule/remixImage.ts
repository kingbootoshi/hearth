import { Client } from 'discord.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { logger } from '../../utils/logger';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
// Add proper import for GoogleAIFileManager with require to avoid TypeScript errors
const { GoogleAIFileManager } = require('@google/generative-ai/server');

const streamPipeline = promisify(pipeline);

interface RemixImageOptions {
  prompt: string;
  imageUrl: string;
}

// Define interfaces for Gemini file type
interface GeminiFile {
  name: string;
  displayName: string;
  mimeType: string;
  uri: string;
}

interface FileDataPart {
  fileData: {
    mimeType: string;
    fileUri: string;
  };
}

interface TextPart {
  text: string;
}

type GeminiPart = FileDataPart | TextPart;

/**
 * Class to handle image remixing using Google Gemini AI
 */
export class RemixImageModule {
  private genAI: GoogleGenerativeAI;
  private fileManager: any; // Use any type for fileManager to avoid TypeScript errors
  private maxRetries: number = 3;
  
  constructor(private client: Client) {
    const apiKey = process.env.GOOGLE_GEMINI_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_GEMINI_KEY environment variable is not set');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.fileManager = new GoogleAIFileManager(apiKey);
    logger.info('RemixImageModule initialized');
  }
  
  /**
   * Download an image from a URL to a temporary file
   */
  private async downloadImage(url: string): Promise<string> {
    const tempDir = os.tmpdir();
    // Use png extension to ensure proper handling
    const tempFilePath = path.join(tempDir, `remix-image-${Date.now()}.png`);
    
    try {
      logger.debug({ url }, 'Attempting to download image');
      
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 10000, // 10 second timeout
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      // Log response details
      logger.debug({ 
        status: response.status, 
        contentType: response.headers['content-type'],
        contentLength: response.headers['content-length']
      }, 'Image download response received');
      
      // Check if response is valid
      if (response.status !== 200) {
        throw new Error(`Failed to download image: HTTP status ${response.status}`);
      }
      
      // Check if response is an image
      const contentType = response.headers['content-type'];
      if (!contentType || !contentType.startsWith('image/')) {
        throw new Error(`URL did not return an image: Content-Type is ${contentType}`);
      }
      
      // Write stream to file - cast to prevent type errors
      await streamPipeline(response.data as any, createWriteStream(tempFilePath));
      
      // Verify the file was created and has content
      const stats = await fs.promises.stat(tempFilePath);
      if (stats.size === 0) {
        throw new Error('Downloaded image is empty (0 bytes)');
      }
      
      logger.debug({ 
        tempFilePath, 
        fileSize: stats.size,
        fileSizeKB: Math.round(stats.size / 1024)
      }, 'Image downloaded successfully');
      
      return tempFilePath;
    } catch (error: any) { // Fix error type
      logger.error({ 
        error, 
        errorMessage: error.message,
        url
      }, 'Failed to download image');
      
      // Clean up if the file was created
      try {
        await fs.promises.unlink(tempFilePath);
      } catch (unlinkError) {
        // Ignore errors if the file doesn't exist
      }
      
      throw error;
    }
  }
  
  /**
   * Get MIME type from file path
   */
  private getMimeType(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();
    switch (extension) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.gif':
        return 'image/gif';
      case '.webp':
        return 'image/webp';
      default:
        return 'image/png'; // Default to PNG
    }
  }
  
  /**
   * Upload file to Gemini
   */
  private async uploadToGemini(filePath: string): Promise<GeminiFile> {
    try {
      const mimeType = this.getMimeType(filePath);
      logger.debug({ filePath, mimeType }, 'Uploading file to Gemini');
      
      const uploadResult = await this.fileManager.uploadFile(filePath, {
        mimeType,
        displayName: path.basename(filePath),
      });
      
      const file = uploadResult.file;
      logger.debug({ displayName: file.displayName, name: file.name }, 'File uploaded to Gemini');
      
      return file;
    } catch (error) {
      logger.error({ error, filePath }, 'Failed to upload file to Gemini');
      throw error;
    }
  }
  
  /**
   * Remix an image using Google Gemini AI
   */
  public async remixImage(options: RemixImageOptions): Promise<string> {
    const { prompt, imageUrl } = options;
    logger.info({ prompt, imageUrl }, 'Remixing image');
    
    if (!process.env.GOOGLE_GEMINI_KEY) {
      logger.error('GOOGLE_GEMINI_KEY environment variable is not set');
      throw new Error('GOOGLE_GEMINI_KEY environment variable is not set');
    }

    // Validate the imageUrl
    if (!imageUrl || !imageUrl.startsWith('http')) {
      logger.error({ imageUrl }, 'Invalid image URL');
      throw new Error('Invalid image URL. Must be a valid HTTP URL.');
    }
    
    // Download the image
    let imagePath;
    try {
      imagePath = await this.downloadImage(imageUrl);
    } catch (downloadError: any) { // Fix error type
      logger.error({ downloadError, imageUrl }, 'Failed to download image');
      throw new Error(`Failed to download image: ${downloadError.message}`);
    }
    
    // Initialize retry counter
    let attempt = 0;
    let lastError = null;
    
    try {
      while (attempt < this.maxRetries) {
        attempt++;
        logger.debug({ attempt }, 'Remixing image attempt');
        
        try {
          // Upload the image to Gemini instead of using base64
          const uploadedFile = await this.uploadToGemini(imagePath);
          
          // Initialize the Gemini model
          const model = this.genAI.getGenerativeModel({
            model: "gemini-2.0-flash-exp"
          });
          
          // Create generation config
          const generationConfig = {
            temperature: 1.0,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 8192,
            responseModalities: ["image", "text"],
          };
          
          // Instead of using chat, use generateContent directly
          logger.debug({
            promptLength: prompt.length,
            mimeType: uploadedFile.mimeType,
            model: "gemini-2.0-flash-exp"
          }, 'Sending generateContent request to Gemini');
          
          // Prepare content parts
          const contents = [{
            role: 'user',
            parts: [
              {
                fileData: {
                  mimeType: uploadedFile.mimeType,
                  fileUri: uploadedFile.uri,
                }
              },
              {
                text: `Edit this image: ${prompt}\n\nPlease modify the image according to these instructions and return the edited image.`
              }
            ]
          }];
          
          // Call generateContent directly
          const result = await model.generateContent({
            contents,
            generationConfig
          });
          
          // Log the full response structure for debugging
          logger.debug({ 
            responseStructure: JSON.stringify(result, null, 2)
          }, 'Raw response structure from Gemini');
          
          // Access the response
          const response = result.response;
          logger.debug({ response }, 'Response from Gemini');
          
          // Get the parts from the response
          const parts = response.candidates?.[0]?.content?.parts || [];
          
          // Log the types of parts we received for debugging
          logger.debug('Response parts types:', parts.map((part: any) => {
            if (part.text) return { type: 'text', length: part.text.length };
            if (part.inlineData) return { type: 'inlineData', mimeType: part.inlineData.mimeType };
            return { type: 'unknown', part: JSON.stringify(part) };
          }));
          
          // Find image part (inline data)
          const responseImagePart = parts.find((part: any) => part.inlineData);

          let dataUrl: string | null = null;
      
          if (responseImagePart && responseImagePart.inlineData) {
            // We successfully got an image back
            const imageData = responseImagePart.inlineData.data;
            // Force the type with non-null assertion since we've already checked it exists
            const mimeType: string = (responseImagePart.inlineData.mimeType as string) || 'image/png';
              
            // Return immediately if we have inline data
            logger.info('Successfully remixed image using Gemini (inline data)');
            dataUrl = `data:${mimeType};base64,${imageData}`;
            
            // Make sure dataUrl is not null before returning
            if (dataUrl) {
              return dataUrl;
            } else {
              throw new Error('Failed to generate image data URL');
            }
          } else {
            // If we don't have an image in the response, try to extract any text that might help debug
            let textContent = '';
            const textPart = parts.find((part: any) => part.text);
            if (textPart) {
              textContent = textPart.text;
            } else {
              textContent = 'No response text available';
            }
            
            // Extract model information safely using optional chaining and type casting
            const responseData = result.response as any; // Cast to any to access potential properties
            
            logger.warn({ 
              textContent,
              modelVersion: responseData?.modelVersion || "unknown",
              finishReason: responseData?.candidates?.[0]?.finishReason || 'unknown'
            }, 'No image returned from Gemini, got text instead');
            
            // Try to provide a helpful error message
            throw new Error(`No image was returned from Gemini. Response: ${textContent}`);
          }
        } catch (processingError: unknown) {
          const error = processingError as Error;
          lastError = error;
          logger.error({ 
            errorMessage: error.message,
            attempt,
            maxRetries: this.maxRetries,
            error
          }, 'Error processing image with Gemini');
          
          // If this is the last attempt, break and throw the error
          if (attempt >= this.maxRetries) {
            break;
          }
          
          // Wait before retrying with exponential backoff
          const waitTime = Math.pow(2, attempt) * 1000; // 2^n seconds
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
      
      // If we reached here, all attempts failed
      throw lastError || new Error('Failed to process image after multiple attempts');
    } finally {
      // Clean up temporary file
      if (imagePath) {
        try {
          await fs.promises.unlink(imagePath);
          logger.debug({ imagePath }, 'Temporary image file cleaned up');
        } catch (cleanupError) {
          logger.warn({ cleanupError, imagePath }, 'Failed to clean up temporary image file');
        }
      }
    }
  }
  
  /**
   * Initialize the module
   */
  async init(): Promise<void> {
    logger.info('Initializing RemixImageModule');
  }
  
  /**
   * Start the module
   */
  async start(): Promise<void> {
    logger.info('Starting RemixImageModule');
  }
  
  /**
   * Stop the module
   */
  async stop(): Promise<void> {
    logger.info('Stopping RemixImageModule');
  }
}

/**
 * Singleton instance handling
 */
let instance: RemixImageModule | null = null;

export function getRemixImageModule(client: Client): RemixImageModule {
  if (!instance) {
    instance = new RemixImageModule(client);
  }
  return instance;
}

/**
 * Submit a remix image job
 */
export async function submitRemixImageJob(options: RemixImageOptions): Promise<string> {
  if (!instance) {
    throw new Error('RemixImageModule not initialized');
  }
  
  try {
    return await instance.remixImage(options);
  } catch (error) {
    logger.error({ error, options }, 'Error in submitRemixImageJob');
    throw error;
  }
}