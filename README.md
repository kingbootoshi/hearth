# 🤖 Hearth - Your AI Discord Community Keeper

<div align="center">

![Quest Boo Banner](https://github.com/user-attachments/assets/0bd089bd-02f5-409d-b957-45fbb310bdcb)

[![Made with Bun](https://img.shields.io/badge/Made%20with-Bun-orange.svg)](https://bun.sh)
[![Discord](https://img.shields.io/badge/Discord-Add%20to%20Server-7289DA.svg)](https://discord.gg/bitcoinboos)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

Your discord is your home. Hearth is the AI that keeps your community warm!

## 🌟 Features

- 🤖 **Advanced AI Conversations**: Engage in natural, context-aware conversations
- 🎮 **Modular Command System**: Easily extend functionality with custom commands
- ⚙️ **Highly Customizable**: Tailor the bot's personality and behavior to your server
- 🔌 **Plugin Architecture**: Add new features without touching the core code

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.0.29 or higher
- Discord Bot Token
- Node.js 16.x or higher

### Installation

1. Setting up the codebase
```bash
# Clone the repository
git clone https://github.com/yourusername/quest-boo-discord-bot.git

# Navigate to the project directory
cd quest-boo-discord-bot

# Install dependencies
bun install

# Configure your environment variables
cp .env.example .env
# Edit .env with your Discord token and other settings
```

2. Setting up Supabase:
You **MUST** set up a supabase table with the database.sql file for the bot to work! Simply copy and paste the contents of database.sql into your supabase database's SQL Editor.

Then, go to Storage, and create two PUBLIC buckets: 
- good_images
- bad_images

3. Setting up the memory server
Use https://github.com/kingbootoshi/cloud-memories to set up a memory server. Whatever API your server is (if not localhost) set that in the config chatbot.yaml file!

4. Configure your AI's name and personality in the config folder. Check out chatbot, imageGen, and summary .yaml files!

Once your pleased with your setup, now you can run the bot!

### Running the Bot

```bash
# Start the bot
bun run src/index.js
```

## 🛠️ Customization

Quest Boo is designed to be highly customizable:

- **Commands**: Add new commands in the `commands/` directory. Automatically registers to the discord bot in your server.
- **Modules**: Add new modules in the `src/modules/` directory.
- **Config**: Add new config files in the `config/` directory. This is where we can customize modules with ease.

Current modules:

- AI chatbot module with advanced memory and function calling
- Daily/hourly channel summarization module
- Image generation module