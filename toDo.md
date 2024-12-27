12-27: i got the cloud memory done and quest boo's AI chat connected to it. adding memories works. querying memories works.
long/mid/short term memory process works as well. all stored to supabase database.

next steps is to modularize this entire bot

setup openrouter for the entire system

1. make the entire chat bot personality easy to change. create one general config that:
- sets the name of the bot (this is for bot responses, memory, etc)
- sets the personality of the bot (this is for the chat responses)
- sets the lora & image gen prompts needed for the bot (this is for the image generation)
- sets the memory API of the bot. what is the connection link of the memory API that the bot's API hits?
- give the bot function calling/tools. personally i want it to be able to use it's own commands, and post to twitter

2. make discord features modular and configurable. definitely looking like we should have a seperate config for each module
- summary module, what channel is the summary module reading? what channel does it post to? what AI get's used? what prompt?
- chatbotModule: what channel do the AI's memories get posted to? what functions/tools does the AI bot have access to?

3. commands automatically get added to the bot via command handler. how can we have modules easily integrate with DiscordBot.ts? it's already somewhat supported but you have to add it like 3 different times. be easy to just add one. like adding the class once.