#!/usr/bin/env node
require('dotenv/config');
const {chat} = require('./src/providers/minimax.js');
(async () => {
  try {
    const r = await chat({
      model: 'abab6.5s-chat',
      systemPrompt: 'Reply in one short sentence.',
      messages: [{role:'user', content: 'Say hello in exactly 3 words'}],
      apiKey: process.env.MINIMAX_API_KEY,
      groupId: process.env.MINIMAX_GROUP_ID
    });
    console.log('MiniMax:', r);
  } catch(e) {
    console.error('Error:', e.message);
  }
})();
