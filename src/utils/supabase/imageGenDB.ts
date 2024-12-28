import { supabase } from './client';
import { Buffer } from 'buffer';

/**
 * Saves image data and feedback to Supabase database and storage.
 * @param userPrompt The original user prompt.
 * @param enhancedPrompt The AI-enhanced prompt.
 * @param imageUrl The image URL.
 * @param feedback User feedback ('good' or 'bad').
 */
export async function saveImageData(
  userPrompt: string,
  enhancedPrompt: string,
  imageUrl: string,
  feedback: 'good' | 'bad'
): Promise<void> {
  try {
    // Save the data to Supabase
    const { error } = await supabase
      .from('image_generations')
      .insert([
        {
          user_prompt: userPrompt,
          enhanced_prompt: enhancedPrompt,
          image_url: imageUrl,
          feedback: feedback,
          created_at: new Date().toISOString()
        }
      ]);

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error saving image data:', error);
    throw error;
  }
}
