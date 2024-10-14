import { createClient } from '@supabase/supabase-js';
import { Buffer } from 'buffer';

// Import your Supabase URL and Anon Key from environment variables or configuration
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

// Initialize the Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Saves image data and feedback to Supabase database and storage.
 * @param originalPrompt The original user prompt.
 * @param enhancedPrompt The AI-enhanced prompt.
 * @param imageBuffer The image data as a Buffer.
 * @param feedback User feedback ('good' or 'bad').
 */
export async function saveImageData(
  originalPrompt: string,
  enhancedPrompt: string,
  imageBuffer: Buffer,
  feedback: string
): Promise<void> {
  try {
    // Determine the storage bucket based on feedback
    const bucketName = feedback === 'good' ? 'good_boo_images' : 'bad_boo_images';

    // Generate a unique filename for the image
    const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.png`;

    // Save the image to Supabase Storage
    const { data: storageData, error: storageError } = await supabase.storage
      .from(bucketName)
      .upload(filename, imageBuffer, {
        contentType: 'image/png',
        cacheControl: '3600',
        upsert: false,
      });

    if (storageError) {
      console.error('Error uploading image to Supabase Storage:', storageError);
      return;
    }

    console.log('Image uploaded to Supabase Storage:', storageData);

    // Get the public URL of the uploaded image
    const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(filename);
    const imageUrl = publicUrlData.publicUrl;

    // Insert a new record into the 'image_feedback' table
    const { data, error } = await supabase.from('image_feedback').insert([
      {
        original_prompt: originalPrompt,
        enhanced_prompt: enhancedPrompt,
        image_url: imageUrl,
        feedback: feedback,
      },
    ]);

    if (error) {
      console.error('Error inserting record into Supabase Database:', error);
    } else {
      console.log('Record inserted into Supabase Database:', data);
    }
  } catch (error) {
    console.error('Error in saveImageData:', error);
  }
}