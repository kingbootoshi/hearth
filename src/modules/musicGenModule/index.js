const { Client, GatewayIntentBits, REST, Routes, AttachmentBuilder, ApplicationCommandOptionType } = require('discord.js');
require('dotenv').config();

// Import required modules for SunoApi
const axios = require('axios');
const UserAgent = require('user-agents');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const pino = require('pino');

// Initialize logger
const logger = pino();

// Initialize Discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  {
    name: 'genmusic',
    description: 'Generate chiptune music based on a prompt',
    options: [
      {
        name: 'musicprompt',
        type: ApplicationCommandOptionType.String,
        description: 'The prompt for generating chiptune music',
        required: true,
      },
    ],
  },
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Update the command registration to use guild commands for faster updates during development
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error refreshing commands:', error);
  }
});

// Define SunoApi class converted from SunoApi.ts
class SunoApi {
  constructor(cookie) {
    this.BASE_URL = 'https://studio-api.suno.ai';
    this.CLERK_BASE_URL = 'https://clerk.suno.com';
    this.cookie = cookie;
    this.currentToken = null;
    const cookieJar = new CookieJar();
    const randomUserAgent = new UserAgent(/Chrome/).random().toString();
    this.client = wrapper(axios.create({
      jar: cookieJar,
      withCredentials: true,
      headers: {
        'User-Agent': randomUserAgent,
        'Cookie': cookie
      }
    }));
    this.client.interceptors.request.use((config) => {
      if (this.currentToken) {
        config.headers['Authorization'] = `Bearer ${this.currentToken}`;
      }
      return config;
    });
  }

  async init() {
    await this.getAuthToken();
    await this.keepAlive();
    return this;
  }

  async getAuthToken() {
    const getSessionUrl = `${this.CLERK_BASE_URL}/v1/client?_clerk_js_version=4.73.4`;
    const sessionResponse = await this.client.get(getSessionUrl);
    if (!sessionResponse?.data?.response?.['last_active_session_id']) {
      throw new Error("Failed to get session id, you may need to update the SUNO_COOKIE");
    }
    this.sid = sessionResponse.data.response['last_active_session_id'];
  }

  async keepAlive(isWait) {
    if (!this.sid) {
      throw new Error("Session ID is not set. Cannot renew token.");
    }
    const renewUrl = `${this.CLERK_BASE_URL}/v1/client/sessions/${this.sid}/tokens?_clerk_js_version=4.73.4`;
    const renewResponse = await this.client.post(renewUrl);
    logger.info("KeepAlive...");
    if (isWait) {
      await this.sleep(1, 2);
    }
    const newToken = renewResponse.data['jwt'];
    this.currentToken = newToken;
  }

  async generate(prompt, make_instrumental = false, model, wait_audio = false) {
    await this.keepAlive(false);
    const startTime = Date.now();
    const audios = await this.generateSongs(prompt, false, undefined, undefined, make_instrumental, model, wait_audio);
    const costTime = Date.now() - startTime;
    logger.info("Generate Response:\n" + JSON.stringify(audios, null, 2));
    logger.info("Cost time: " + costTime);
    return audios;
  }

  async generateSongs(prompt, isCustom, tags, title, make_instrumental, model, wait_audio) {
    await this.keepAlive(false);
    const payload = {
      make_instrumental: make_instrumental === true,
      mv: model || 'chirp-v3-5',
      prompt: ""
    };
    if (isCustom) {
      payload.tags = tags;
      payload.title = title;
      payload.prompt = prompt;
    } else {
      payload.gpt_description_prompt = prompt;
    }
    logger.info("generateSongs payload:\n" + JSON.stringify({
      prompt: prompt,
      isCustom: isCustom,
      tags: tags,
      title: title,
      make_instrumental: make_instrumental,
      wait_audio: wait_audio,
      payload: payload,
    }, null, 2));
    const response = await this.client.post(
      `${this.BASE_URL}/api/generate/v2/`,
      payload,
      { timeout: 10000 }
    );
    logger.info("generateSongs Response:\n" + JSON.stringify(response.data, null, 2));
    if (response.status !== 200) {
      throw new Error("Error response:" + response.statusText);
    }
    const songIds = response.data['clips'].map((audio) => audio.id);
    if (wait_audio) {
      const startTime = Date.now();
      let lastResponse = [];
      await this.sleep(5, 5);
      while (Date.now() - startTime < 100000) {
        const response = await this.get(songIds);
        const allCompleted = response.every(
          audio => audio.status === 'streaming' || audio.status === 'complete'
        );
        const allError = response.every(
          audio => audio.status === 'error'
        );
        if (allCompleted || allError) {
          return response;
        }
        lastResponse = response;
        await this.sleep(3, 6);
        await this.keepAlive(true);
      }
      return lastResponse;
    } else {
      await this.keepAlive(true);
      return response.data['clips'].map((audio) => ({
        id: audio.id,
        title: audio.title,
        image_url: audio.image_url,
        lyric: audio.metadata.prompt,
        audio_url: audio.audio_url,
        video_url: audio.video_url,
        created_at: audio.created_at,
        model_name: audio.model_name,
        status: audio.status,
        gpt_description_prompt: audio.metadata.gpt_description_prompt,
        prompt: audio.metadata.prompt,
        type: audio.metadata.type,
        tags: audio.metadata.tags,
        duration: audio.metadata.duration,
      }));
    }
  }

  async get(songIds) {
    await this.keepAlive(false);
    let url = `${this.BASE_URL}/api/feed/`;
    if (songIds) {
      url = `${url}?ids=${songIds.join(',')}`;
    }
    logger.info("Get audio status: " + url);
    const response = await this.client.get(url, { timeout: 3000 });
    const audios = response.data;
    return audios.map((audio) => ({
      id: audio.id,
      title: audio.title,
      image_url: audio.image_url,
      lyric: audio.metadata.prompt ? this.parseLyrics(audio.metadata.prompt) : "",
      audio_url: audio.audio_url,
      video_url: audio.video_url,
      created_at: audio.created_at,
      model_name: audio.model_name,
      status: audio.status,
      gpt_description_prompt: audio.metadata.gpt_description_prompt,
      prompt: audio.metadata.prompt,
      type: audio.metadata.type,
      tags: audio.metadata.tags,
      duration: audio.metadata.duration,  
      error_message: audio.metadata.error_message,
    }));
  }

  parseLyrics(prompt) {
    const lines = prompt.split('\n').filter(line => line.trim() !== '');
    return lines.join('\n');
  }

  sleep(x, y) {
    let timeout = x * 1000;
    if (y !== undefined && y !== x) {
      const min = Math.min(x, y);
      const max = Math.max(x, y);
      timeout = Math.floor(Math.random() * (max - min + 1) + min) * 1000;
    }
    logger.info(`Sleeping for ${timeout / 1000} seconds`);
    return new Promise(resolve => setTimeout(resolve, timeout));
  }
}

// Initialize SunoApi instance
const sunoApiCookie = process.env.SUNO_COOKIE || '';
const sunoApi = new SunoApi(sunoApiCookie);
sunoApi.init();

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'genmusic') {
    await handleGenMusicCommand(interaction);
  }
});

async function handleGenMusicCommand(interaction) {
  console.log('Received /genmusic command');
  await interaction.deferReply();

  const userPrompt = interaction.options.getString('musicprompt');
  const musicPrompt = `chiptune ${userPrompt}`;
  console.log(`Music prompt: ${musicPrompt}`);

  try {
    console.log('Generating music using SunoApi');
    const generatedTracks = await sunoApi.generate(
      musicPrompt,
      true, // make_instrumental
      'chirp-v3-chirp-v3-0', // model
      true // wait_audio
    );

    console.log(`Number of tracks generated: ${generatedTracks.length}`);

    for (const track of generatedTracks) {
      console.log(`Processing track: ${track.title}`);
      console.log(`Audio URL: ${track.audio_url}`);
      
      try {
        const attachment = new AttachmentBuilder(track.audio_url, { name: `${track.title}.mp3` });
        console.log('Created AttachmentBuilder');
        
        await interaction.followUp({
          content: `Generated track: ${track.title}`,
          files: [attachment]
        });
        console.log(`Sent track: ${track.title}`);
      } catch (attachmentError) {
        console.error(`Error sending attachment for ${track.title}:`, attachmentError);
        await interaction.followUp(`Error sending track: ${track.title}. Audio URL: ${track.audio_url}`);
      }
    }

    console.log('Finished processing all tracks');
  } catch (error) {
    console.error('Error generating music:', error);
    await interaction.followUp('Sorry, there was an error generating the music. Please try again later.');
  }
}

client.login(process.env.DISCORD_TOKEN);