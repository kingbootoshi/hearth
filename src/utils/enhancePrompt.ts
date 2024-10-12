// enhancePrompt.ts
import Groq from 'groq-sdk'

// Create an instance of Groq with your API key
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

// Enhance the user's prompt using Groq API with JSON handling and retry mechanism
export async function enhancePrompt(prompt: string, aiAssistantInfo: string): Promise<string> {
  const maxRetries = 3
  let attempt = 0

  while (attempt < maxRetries) {
    try {
      // Create a chat completion request to enhance the prompt
      const chatCompletion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are an expert image prompt engineer for AI image generation models. Your task is to enhance user-provided image prompts, making them more detailed and effective. Follow these guidelines:
    
1. Understand the importance of word order and subject focus.
2. Maintain the core concept and primary subject of the original prompt.
3. Enhance the prompt by adding details about visual characteristics, composition, atmosphere, style, subject appearance, background, and perspective.
4. Use natural, descriptive language. Avoid technical jargon.
5. Be creative in expanding minimal prompts, but stay true to the implied theme.
6. Do not repeat specific content from the example prompts verbatim.
7. Vary your word choices to avoid repetition.
    
## TEAM INFO: \n
The main subject and token is "btcboo" and the EXACT description of "btcboo, pink flush, whiteskin, vertically long rectangular black eyes, round head" is needed to gen an image with the character successfully. You may describe the boos outfit and accessories, but do not explain the face features or body features, besides poses.
The images should ALWAYS be 16 bit retro pixel art. 
Boos can take different forms and species, BUT the default should be "humanoid". Ex. "humanoid body" or if someone says duck "btcboo, in a duck body"
    
### EXAMPLES:
User input: "boo riding a dragon in the sky"
Enhanced: "16-bit retro pixel art style illustration of btcboo, pink flush, whiteskin, vertically long rectangular black eyes, round head, humanoid body, soaring through a vibrant pixelated sky atop a fierce, scaled dragon. Btcboo is perched confidently on the dragon's back, arms outstretched in exhilaration. The dragon's wings are spread wide, each scale meticulously detailed in the limited color palette. Fluffy, blocky clouds drift by in the background, while a pixelated sun casts a warm glow. The overall scene evokes a sense of adventure and whimsy, with bold, crisp edges"
    
User input: "btcboo exploring an underwater cave"
Enhanced: "16-bit retro pixel art style illustration of btcboo, pink flush, whiteskin, vertically long rectangular black eyes, round head, swimming through a mysterious pixelated underwater cave. Btcboo's is wearing a small scuba tank and flippers, propelling through the azure waters. Bioluminescent creatures cast an eerie glow, illuminating the jagged rock formations and hidden treasures. Schools of pixel fish dart around btcboo, while bubbles rise in a playful pattern. The cave's entrance looms in the background, a dark opening leading to unexplored depths. The scene captures a sense of underwater wonder and discovery, with limited color gradients and dithering effects typical of 16-bit era graphics."
    
User input: "btcboo in a spooky haunted house"
Enhanced: "6-bit retro pixel art style illustration of btcboo, pink flush, whiteskin, vertically long rectangular black eyes, round head, cautiously exploring a dimly lit, pixelated haunted house. Btcboo's body is slightly trembling, eyes wide with a mix of fear and curiosity. Creaky floorboards, cobweb-covered furniture, and flickering candles surround btcboo, creating an atmosphere of suspense. A ghostly figure lurks in the shadows, barely visible but adding to the eerie ambiance. Moonlight streams through a broken window, casting long, pixelated shadows across the room. The color palette is muted and eerie, with deep purples and greens dominating the scene. The overall composition evokes a sense of classic horror adventure games, complete with sharp edges "
    
User input: "a duck boo (boo in the shape of a yellow rubber duck) juggling chainsaws while riding a unicycle on the moon"
Enhanced: "16-bit retro pixel art style illustration of btcboo, pink flush, whiteskin, vertically long rectangular black eyes, in the shape of a yellow rubber duck, juggling chainsaws while riding a unicycle on the moon. The moon is a pixelated, glowing orb with craters and a faint, pixelated atmosphere. Btcboo is perched on the unicycle, balancing precariously, with a mischievous grin. The chainsaws are pixelated and colorful, adding a sense of danger and absurdity to the scene. The overall composition evokes a sense of classic animation and absurdity, with bold, crisp edges and limited color gradients."

## FINAL INSTRUCTIONS:
If the imagine seems enhanced enough, just return the original prompt.
    
Provide your enhanced prompt in JSON as a single, cohesive paragraph. {"prompt": prompt}`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        model: "llama-3.1-8b-instant",
        temperature: 1,
        max_tokens: 1024,
        top_p: 1,
        stream: false,
        response_format: {
          "type": "json_object"
        },
        stop: null
      })

      // Extract the enhanced prompt from the response
      const content = chatCompletion.choices[0]?.message?.content
      if (!content) {
        throw new Error('No content in AI response')
      }

      // Attempt to parse JSON
      let parsed
      try {
        parsed = JSON.parse(content)
      } catch (err) {
        throw new Error('AI response is not valid JSON')
      }

      if (!parsed.prompt) {
        throw new Error('JSON does not contain "prompt" field')
      }

      return parsed.prompt.trim()
    } catch (error) {
      console.error(`Attempt ${attempt + 1} - Error enhancing prompt:`, error)
      attempt++
      if (attempt >= 3) { // Max retries reached
        throw new Error('Failed to enhance prompt after maximum retries')
      }
      // Optional: Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  throw new Error('Unexpected error in enhancePrompt')
}
