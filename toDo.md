12-27: i got the cloud memory done and quest boo's AI chat connected to it. adding memories works. querying memories works.
long/mid/short term memory process works as well. all stored to supabase database.

update: finished modularizing this entire bot and setup openrouter for the entire system, so OpenRouter API covers all AI services in the bot.

to do:
- make adding ai memories async
- switch quest boo to an agent system to make it easier to manage. add messages, etc. it's getting messy
- give the bot VC functionality
- add game tools to quest boo and ways to engage the community
- add random chat functionality to try and trigger conversations. do random commands etc.
- modularize the ai function calling commands better (i kinda just stored everything in tool handler)

low priority:
quest boo personalization:
- connect embedchain to the chatbot module, and add all boo stories to the embedchain for boo universe consistency.

is this possible?:
- convert mem0 python to typescript so we can have it in this script instead of setting up a server.