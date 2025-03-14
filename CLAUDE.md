# HEARTH DISCORD BOT - DEVELOPMENT GUIDE

## Build & Run Commands
- `bun run build` - Compile TypeScript
- `bun run start` - Run bot in production mode
- `bun run dev` - Run bot in development mode with file watching

## Code Style Guidelines
- **Files**: camelCase (e.g., `imageGenCommand.ts`)
- **Classes/Interfaces**: PascalCase
- **Functions/Variables**: camelCase
- **Imports**: External dependencies first, then internal modules
- **Error Handling**: Use try-catch with proper logging via Pino logger
  - `logger.info()` - Program flow
  - `logger.debug()` - Detailed outputs
  - `logger.error()` - Error conditions

## Module & Command Structure
- Create new modules in `src/modules/`
- Add commands in `src/commands/` (auto-loaded)
- Commands export `data` and `execute` functions, optional `handleButtonInteraction`
- Follow Discord.js SlashCommandBuilder pattern for commands
- Use TypeScript interfaces for all complex objects
- Button handlers must be registered in CommandHandler.ts

See `.cursorrules` for detailed guides on adding commands and creating chatbot tools