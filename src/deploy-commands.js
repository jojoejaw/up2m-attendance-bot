require('dotenv').config();
const { REST, Routes } = require('discord.js');
const attendancePanel = require('./commands/attendancePanel');

const commands = [
  attendancePanel.data.toJSON()
];

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || token.includes('your_')) {
  console.error('❌ [Error] Please fill DISCORD_TOKEN and CLIENT_ID in .env file before running deploy-commands.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log(`⏳ Deploying ${commands.length} application (/) commands...`);

    if (guildId && !guildId.includes('your_')) {
      // Register Guild Commands (Instant update for test server)
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );
      console.log(`✅ Successfully registered application commands to Guild: ${guildId}`);
    } else {
      // Register Global Commands
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
      );
      console.log('✅ Successfully registered application commands globally!');
    }
  } catch (error) {
    console.error('❌ Error deploying application commands:', error);
  }
})();
