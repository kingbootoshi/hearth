# 🤖 Quest Boo - Your AI-Powered Discord Companion

<div align="center">

![Quest Boo Banner](https://github.com/user-attachments/assets/0bd089bd-02f5-409d-b957-45fbb310bdcb)

[![Made with Bun](https://img.shields.io/badge/Made%20with-Bun-orange.svg)](https://bun.sh)
[![Discord](https://img.shields.io/badge/Discord-Add%20to%20Server-7289DA.svg)](https://discord.gg/bitcoinboos)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

## 🌟 Features

- 🤖 **Advanced AI Conversations**: Engage in natural, context-aware conversations
- 🎮 **Modular Command System**: Easily extend functionality with custom commands
- ⚙️ **Highly Customizable**: Tailor the bot's personality and behavior to your server
- 🔌 **Plugin Architecture**: Add new features without touching the core code
- 🛡️ **Smart Moderation**: AI-powered content filtering and user management

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.0.29 or higher
- Discord Bot Token
- Node.js 16.x or higher

### Installation

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

### Running the Bot

```bash
# Start the bot
bun run src/index.js
```

## 🛠️ Customization

Quest Boo is designed to be highly customizable:

- **Commands**: Add new commands in the `commands/` directory
- **Personalities**: Configure different chat personalities in `config/personalities.js`
- **Responses**: Customize response templates in `templates/`
- **Plugins**: Drop new plugins into the `plugins/` directory