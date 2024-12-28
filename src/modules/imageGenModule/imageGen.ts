import * as path from 'path'
import pino from 'pino'
import { imageGenConfig } from '../../config'
import { fal } from "@fal-ai/client"

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
})

// Configure fal client with API key
fal.config({
  credentials: process.env.FAL_API_KEY
})

export async function submitImageJob(prompt: string): Promise<string> {
  logger.info('Submitting image generation job to FAL.ai')
  
  try {
    // Prepare the FAL request with our configuration
    const result = await fal.subscribe("fal-ai/flux-lora", {
      input: {
        prompt: prompt,
        loras: [
          {
            path: imageGenConfig.loraModelPath,
            scale: 1
          }
        ],
        image_size: "square_hd",
        num_images: 1,
        output_format: "jpeg",
        guidance_scale: 3.5,
        num_inference_steps: 28,
        enable_safety_checker: false
      }
    })

    logger.debug({ result }, 'Received response from FAL.ai')

    // Extract the image URL from the response
    const imageUrl = result.data.images[0].url
    if (!imageUrl) {
      throw new Error('No image URL in FAL.ai response')
    }

    logger.info('Image generated successfully')
    return imageUrl

  } catch (error) {
    logger.error({ err: error }, 'Error submitting job to FAL.ai')
    throw error
  }
}

// This function is now just a pass-through since FAL returns the URL directly
export async function getGeneratedImage(imageUrl: string): Promise<string> {
  logger.info('Returning generated image URL')
  return imageUrl
}