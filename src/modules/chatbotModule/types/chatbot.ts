export interface ChatMessage {
    user_id: string;
    username: string;
    content: string;
    timestamp: string;
    is_bot: boolean;
    images?: string[];
  }