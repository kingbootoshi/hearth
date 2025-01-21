# Vote Module

A Discord.js module that manages interactive voting sessions for AI-generated images with real-time vote tracking and Twitter integration.

## Structure
```
voteModule/
├── handlers/         # Button interaction handlers
├── commands/        # Command implementations
├── voteManager.ts   # Core voting logic
├── index.ts         # Module exports
└── README.md        # Documentation
```

## Core Features
- Real-time vote tracking with toggle functionality
- Timed voting sessions
- Automatic winner determination
- Twitter integration for winning images
- Role-based permissions for tweet actions

## Implementation

### VoteManager
Manages active votes using a channel-based system:
```typescript
interface VoteEntry {
  imageUrl: string;
  prompt: string;
  caption: string;
  votes: Set<string>;
  number: number;
}

interface VoteData {
  entries: VoteEntry[];
  endTime: number;
  messageId: string;
  currentIndex: number;
}
```

### Button Handlers
- `voteButtonHandler`: Manages vote toggling and updates
- `tweetButtonHandler`: Handles winner tweet functionality

## Usage Example
```typescript
import { setActiveVote, removeActiveVote, getActiveVote } from './voteManager';

// Start a vote
setActiveVote(channelId, {
  entries: [...],
  endTime: Date.now() + duration,
  messageId: message.id,
  currentIndex: 0
});

// Get active vote
const vote = getActiveVote(channelId);

// End vote
removeActiveVote(channelId);
```

## Permissions
Tweet functionality requires one of the following roles:
- Admin
- Moderator 