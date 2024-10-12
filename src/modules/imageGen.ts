// Import necessary modules
import Groq from 'groq-sdk'
import { enhancePrompt } from '../utils/enhancePrompt' // Ensure enhancePrompt is imported if used internally

// Create an instance of Groq with your API key
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

// RunPod configuration
const runpodApiKey = process.env.RUNPOD_API_KEY!
const runpodPodId = process.env.RUNPOD_ID!
const loraName = process.env.LORA_NAME!
const defaultDenoise = 1

// Interface for workflow nodes
interface WorkflowNode {
  inputs: Record<string, any>
}

// Interface for the workflow
interface Workflow {
  [key: string]: WorkflowNode
}

// Submit the image generation job to RunPod
export async function submitImageJob(prompt: string): Promise<string> {
  try {
    // Load and prepare the workflow
    const workflow: Workflow = require('../utils/workflow_api.json')
    updateWorkflowWithPrompt(workflow, prompt)

    // Use fetch for the POST request
    const response = await fetch(`https://api.runpod.ai/v2/${runpodPodId}/run`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${runpodApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: { workflow },
      }),
    })

    if (!response.ok) {
      throw new Error(`RunPod API error: ${response.statusText}`)
    }

    const data = await response.json()
    const jobId = data.id
    if (!jobId) {
      throw new Error('Failed to retrieve job ID from RunPod.')
    }

    console.log(`Job submitted successfully. Job ID: ${jobId}`)
    return jobId
  } catch (error) {
    console.error('Error submitting job:', error)
    throw error
  }
}

// Poll the job status until completion and retrieve the image
export async function getGeneratedImage(jobId: string): Promise<string> {
  const statusEndpoint = `https://api.runpod.ai/v2/${runpodPodId}/status/${jobId}`

  const pollingInterval = 5000 // 5 seconds
  const timeout = 300000 // 5 minutes
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    try {
      // Use fetch for the GET request
      const statusResponse = await fetch(statusEndpoint, {
        headers: {
          'Authorization': `Bearer ${runpodApiKey}`,
          'Content-Type': 'application/json',
        },
      })

      if (!statusResponse.ok) {
        throw new Error(`RunPod status API error: ${statusResponse.statusText}`)
      }

      const statusData = await statusResponse.json()
      const jobStatus = statusData.status
      console.log(`Job ${jobId} status: ${jobStatus}`)

      if (jobStatus === 'COMPLETED') {
        const output = statusData.output.message
        if (!output) {
          throw new Error('No output in job completion response')
        }
        return output
      } else if (jobStatus === 'FAILED') {
        throw new Error('Job failed on RunPod')
      }

      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, pollingInterval))
    } catch (error) {
      console.error(`Error polling job status:`, error)
      throw error
    }
  }

  throw new Error('Job polling timed out')
}

// Update the workflow with the prompt and LoRA name
function updateWorkflowWithPrompt(workflow: Workflow, prompt: string): void {
  const fullPrompt = `${prompt}`
  console.log('Updating workflow with prompt and LoRA name')

  // Update the prompt in the workflow node
  if ("57" in workflow) {
    workflow["57"]["inputs"]["text"] = fullPrompt
    console.log(`Updated prompt: ${fullPrompt}`)
  } else {
    console.error("Error: Key '57' not found in workflow data")
  }

  // Update the LoRA name in the workflow node
  if ("40" in workflow) {
    workflow["40"]["inputs"]["lora_name"] = `BTCBOO.safetensors`
    console.log(`Updated LoRA name: BTCBOO.safetensors`)
  } else {
    console.error("Error: Key '40' not found in workflow data")
  }

  // Set a random noise seed in the workflow node
  if ("25" in workflow) {
    const noiseSeed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
    workflow["25"]["inputs"]["noise_seed"] = noiseSeed
    console.log(`Generated noise seed: ${noiseSeed}`)
  } else {
    console.error("Error: Key '25' not found in workflow data")
  }
}
