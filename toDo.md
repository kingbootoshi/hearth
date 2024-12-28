12-27: i got the cloud memory done and quest boo's AI chat connected to it. adding memories works. querying memories works.
long/mid/short term memory process works as well. all stored to supabase database.

update: finished modularizing this entire bot and setup openrouter for the entire system, so OpenRouter API covers all AI services in the bot.

- give the bot function calling/tools. personally i want it to be able to use it's own commands, and post to twitter
- give the chatbot module vision. i think openrouter will route it to a vision model if vision is required.