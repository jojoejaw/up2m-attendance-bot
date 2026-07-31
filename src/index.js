require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { startWebServer } = require('./server/webServer');

// Initialize Discord Client with required Intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,        // Privileged intent for tracking members and roles
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,      // Privileged intent for reading message content
    GatewayIntentBits.DirectMessages       // Required for DM communication
  ],
  partials: [Partials.Channel, Partials.Message]
});

// Load Events
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.name) {
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
      } else {
        client.on(event.name, (...args) => event.execute(...args));
      }
      console.log(`[Event Loaded] ${event.name}`);
    }
  }
}

// Ready Event
client.once('ready', async () => {
  console.log(`=================================`);
  console.log(`🤖 Discord Attendance Bot Connected!`);
  console.log(`👤 Logged in as: ${client.user.tag}`);

  // Pre-fetch members for all guilds once at startup to warm up cache
  try {
    for (const [id, guild] of client.guilds.cache) {
      const members = await guild.members.fetch();
      console.log(`👥 Pre-cached ${members.size} members for guild: ${guild.name}`);
    }
  } catch (err) {
    console.warn('[Cache Warmup Warning]', err.message);
  }

  console.log(`=================================`);

  // Start Web Dashboard Server
  startWebServer(client);
});

// Login Bot
const token = process.env.DISCORD_TOKEN;
if (!token || token === 'your_bot_token_here') {
  console.warn('⚠️ [Warning] DISCORD_TOKEN is not set in .env file yet. Please set your token to run the bot.');
} else {
  client.login(token).catch(err => {
    console.error('❌ [Login Error] Failed to log in to Discord:', err.message);
  });
}

module.exports = client;
