import fetch from 'node-fetch';
import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { createModuleLogger } from '../../../utils/logger';

const logger = createModuleLogger('memoryProcessor');

const AGENT_ID = "quest_boo";
const DEBUG_MODE = true;

function debugLog(message: string, data?: any) {
  if (DEBUG_MODE) {
    logger.debug({ ...data }, message);
  }
}

/**
 * Pings the memory server to ensure it's up and running before we attempt queries or additions.
 * @returns boolean indicating if server responded successfully
 */
async function pingMemoryServer(): Promise<boolean> {
  try {
    const res = await fetch("http://localhost:8000/ping");
    if (!res.ok) {
      logger.error({ status: res.status, statusText: res.statusText }, 'Ping to memory server failed');
      return false;
    }
    const body = await res.json();
    if (body.status === "ok") {
      logger.info('Memory server ping successful');
      return true;
    } else {
      logger.warn('Memory server ping responded but not OK');
      return false;
    }
  } catch (error) {
    logger.error({ error }, 'Error pinging memory server');
    return false;
  }
}

/**
 * Stores extracted knowledge in mem0, using run_id as the knowledge category and user_id only for user-specific knowledge.
 */
export async function storeKnowledgeInMem0(extracted_knowledge: any, client: Client) {
  const serverUp = await pingMemoryServer();
  if (!serverUp) {
    logger.error('Memory server is not reachable; skipping knowledge storage');
    return;
  }

  // general_knowledge -> run_id = "general_knowledge"
  if (Array.isArray(extracted_knowledge.general_knowledge) && extracted_knowledge.general_knowledge.length > 0) {
    const memoryString = formatForMem0(extracted_knowledge.general_knowledge);
    const result = await addMemoryToMem0({
      memories: memoryString,
      run_id: "general_knowledge",
      agent_id: AGENT_ID
    });
    await sendMemoryEmbed("General Knowledge", result, client);
  }

  // agent_self -> run_id = "self_knowledge"
  if (Array.isArray(extracted_knowledge.agent_self) && extracted_knowledge.agent_self.length > 0) {
    const memoryString = formatForMem0(extracted_knowledge.agent_self);
    const result = await addMemoryToMem0({
      memories: memoryString,
      run_id: "self_knowledge",
      agent_id: AGENT_ID
    });
    await sendMemoryEmbed("Quest Boo Self-Knowledge", result, client);
  }

  // user_specific -> run_id = "user_specific_knowledge", user_id = <Discord user>
  if (extracted_knowledge.user_specific && Array.isArray(extracted_knowledge.user_specific.users)) {
    for (const usr of extracted_knowledge.user_specific.users) {
      const learnings = usr.learnings || [];
      if (learnings.length > 0) {
        const memoryString = formatForMem0(learnings);
        const result = await addMemoryToMem0({
          memories: memoryString,
          run_id: "user_specific_knowledge",
          agent_id: AGENT_ID,
          user_id: usr.user_id  // At top level with run_id and agent_id
        });
        await sendMemoryEmbed(`User Knowledge - ${usr.user_id}`, result, client);
      }
    }
  }
}

/**
 * Prepares memory strings for storage by combining them into a single string
 * @param content array of content strings
 * @returns single combined string with memories separated by newlines
 */
function formatForMem0(content: string[]): string {
  // Join all memories with newlines into a single string
  return content.map(c => c.trim()).join('\n');
}

/**
 * Sends the combined memory string to the memory server
 */
async function addMemoryToMem0(params: {
  memories: string;
  run_id: string;
  agent_id: string;
  user_id?: string;
}) {
  const { memories, run_id, agent_id, user_id } = params;
  const serverUp = await pingMemoryServer();
  if (!serverUp) {
    logger.error('Memory server is not reachable; cannot add memory');
    return {};
  }

  try {
    const body = {
      memories,
      agent_id,
      run_id,
      user_id, // At top level
      metadata: { timestamp: new Date().toISOString() }
    };

    logger.debug({ requestBody: body }, 'Sending request to mem0');

    const response = await fetch("http://localhost:8000/add", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({
        status: response.status,
        statusText: response.statusText,
        body: body,
        error: errorText
      }, 'Memory API error');
      return {};
    }

    const result = await response.json();
    logger.debug({ result }, 'Memory API response');
    return result.result || {};

  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Error in addMemoryToMem0');
    return {};
  }
}

export async function sendMemoryEmbed(title: string, result: any, client: Client) {
  const CHANNEL_ID = "1306860990591406080"; //Channel where the bot's memories get posted
  const channel = client.channels.cache.get(CHANNEL_ID) as TextChannel;
  if (!channel) return;

  // Check if we have newly added memories
  const hasMemories = Array.isArray(result.results) && result.results.length > 0;

  // For relations, now we have an object like:
  //   "relations": {
  //       "deleted_entities": [],
  //       "added_entities": [ [...], [...], ... ]
  //   }
  // So we need to parse result.relations.added_entities
  const hasAddedEntities = result?.relations?.added_entities 
    && Array.isArray(result.relations.added_entities) 
    && result.relations.added_entities.length > 0;

  if (!hasMemories && !hasAddedEntities) return;

  // Extract user ID from title if it's user knowledge
  const userIdMatch = title.match(/User Knowledge - (\d+)/);
  let userId = userIdMatch ? userIdMatch[1] : null;
  let user = null;

  // If we have a user ID, try to fetch the user
  if (userId) {
    try {
      user = await client.users.fetch(userId);
      // Update title with username instead of ID
      title = `User Knowledge - ${user.username}`;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to fetch user info');
    }
  }

  let color = 0x0000ff;
  if (title.includes("General Knowledge")) color = 0x00ff00;
  else if (title.includes("User Knowledge")) color = 0x800080;
  else if (title.includes("Quest Boo Self-Knowledge")) color = 0xffd700;

  const embed = new EmbedBuilder()
    .setTitle(`New Memories Added: ${title}`)
    .setColor(color)
    .setTimestamp(new Date());

  if (hasMemories) {
    let memoriesText = "";
    for (const item of (result.results || [])) {
      let memory_content = item.memory;
      if (typeof memory_content === 'object') {
        memory_content = memory_content.memory || JSON.stringify(memory_content);
      }
      memoriesText += `• ${memory_content}\n`;
    }
    if (memoriesText.trim().length > 0) {
      embed.addFields({ name: "📝 Memories", value: memoriesText });
    }
  }

  if (hasAddedEntities) {
    let relationsText = "";
    // added_entities is an array of arrays
    // each sub-array can contain multiple relations
    const addedEntities = result.relations.added_entities;
    for (const relationGroup of addedEntities) {
      for (const rel of relationGroup) {
        const source = rel.source || '';
        const relationship = rel.relationship || '';
        const destination = rel.destination || '';
        relationsText += `• ${source} ${relationship} ${destination}\n`;
      }
    }

    if (relationsText.trim().length > 0) {
      embed.addFields({ name: "����� Relations", value: relationsText });
    }
  }

  // Set thumbnail based on type, using user avatar for user knowledge
  if (title.includes("General Knowledge")) {
    embed.setThumbnail("https://cdn.discordapp.com/attachments/1128943804825739347/1306860603117146133/Enchanted_Book.gif");
  } else if (title.includes("User Knowledge") && user) {
    embed.setThumbnail(user.displayAvatarURL({ size: 256 }));
  } else if (title.includes("Quest Boo Self-Knowledge")) {
    embed.setThumbnail("https://cdn.discordapp.com/attachments/1306860990591406080/1319849776229122138/questboo.png");
  }

  embed.setFooter({ text: "Memory System Update" });
  await channel.send({ embeds: [embed] });
}

/**
 * Queries all memory categories (general, self, user) and returns them plus any relations
 * in a unified string block. If no memories or relations are found, returns fallback text.
 */
export async function queryAllMemories(message: string, userId?: string): Promise<string> {
  const serverUp = await pingMemoryServer();
  if (!serverUp) {
    logger.error('Memory server not reachable; returning fallback message for memory queries');
    return "No relevant memories found (memory server unreachable).";
  }

  try {
    const [worldData, selfData, userData] = await Promise.all([
      queryMemoryCategory(message, "general_knowledge"),
      queryMemoryCategory(message, "self_knowledge"),
      queryMemoryCategory(message, "user_specific_knowledge", userId)
    ]);

    // Format memories into sections
    const sections: string[] = [];

    // Helper to format memory content
    function formatMemory(memory: any): string {
      if (typeof memory === 'string') return memory;
      return memory.memory || JSON.stringify(memory);
    }

    // Add world knowledge section
    if (worldData.memories.length > 0 || worldData.relations.length > 0) {
      sections.push("### World Knowledge Memories:");
      worldData.memories.forEach(m => sections.push(`• ${formatMemory(m)}`));
      
      if (worldData.relations.length > 0) {
        sections.push("### Relations:");
        worldData.relations.forEach(relGroup => {
          relGroup.forEach(rel => {
            sections.push(`• ${rel.source} ${rel.relationship} ${rel.destination}`);
          });
        });
      }
    }

    // Add self knowledge section
    if (selfData.memories.length > 0 || selfData.relations.length > 0) {
      sections.push("\n### Self Knowledge Memories:");
      selfData.memories.forEach(m => sections.push(`• ${formatMemory(m)}`));
      
      if (selfData.relations.length > 0) {
        sections.push("### Relations:");
        selfData.relations.forEach(relGroup => {
          relGroup.forEach(rel => {
            sections.push(`• ${rel.source} ${rel.relationship} ${rel.destination}`);
          });
        });
      }
    }

    // Add user knowledge section
    if (userData.memories.length > 0 || userData.relations.length > 0) {
      sections.push("\n### User Specific Knowledge Memories:");
      userData.memories.forEach(m => sections.push(`• ${formatMemory(m)}`));
      
      if (userData.relations.length > 0) {
        sections.push("### Relations:");
        userData.relations.forEach(relGroup => {
          relGroup.forEach(rel => {
            sections.push(`• ${rel.source} ${rel.relationship} ${rel.destination}`);
          });
        });
      }
    }

    return sections.length > 0 ? sections.join('\n') : "No relevant memories found.";
  } catch (error) {
    logger.error({ error }, "Error querying memories");
    return "Error accessing memory system.";
  }
}

/**
 * Queries a specific memory category with optional user filtering
 */
async function queryMemoryCategory(
  query: string, 
  run_id: string,
  userId?: string
): Promise<{memories: any[], relations: any[][]}> {
  try {
    const body = {
      query,
      agent_id: AGENT_ID,
      run_id,
      user_id: userId,
      limit: 5
    };

    logger.debug({ run_id, query: body, userId }, 'Querying memory category');

    const response = await fetch("http://localhost:8000/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      logger.error({
        status: response.status,
        statusText: response.statusText,
        run_id,
        query: body
      }, 'Memory query failed');
      return { memories: [], relations: [] };
    }

    const result = await response.json();
    logger.debug({ run_id, result }, 'Memory query response');

    if (result?.status === "success") {
      // Fix: Properly extract memories from nested structure
      const memories = result.results?.results || [];
      const relations = result.results?.relations || [];
      return { memories, relations };
    }

    logger.warn({ run_id }, 'No memories found');
    return { memories: [], relations: [] };
  } catch (error) {
    logger.error({
      run_id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Error querying memory category');
    return { memories: [], relations: [] };
  }
}

export function processMemoryForSummary(memoryData: any): any {
  logger.info('Beginning memory summary process');
  try {
    logger.debug({ memorySize: memoryData?.length }, 'Memory data size');
    logger.info('Memory summary process complete');
    return {};
  } catch (error) {
    logger.error({ err: error }, 'Error in memory summary process');
    throw error;
  }
}