/**
 * Helper utility to send DM safely to a Discord GuildMember or User.
 * Handles cases where user has Direct Messages disabled.
 * 
 * @param {import('discord.js').GuildMember | import('discord.js').User} user 
 * @param {string | import('discord.js').EmbedBuilder | object} messageContent 
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendSafeDM(user, messageContent) {
  try {
    const payload = typeof messageContent === 'string' 
      ? { content: messageContent } 
      : (messageContent.embeds ? messageContent : { embeds: [messageContent] });

    await user.send(payload);
    return { success: true };
  } catch (error) {
    console.warn(`[DM Warning] Could not send DM to ${user.user?.tag || user.tag}:`, error.message);
    return { 
      success: false, 
      error: error.code === 50007 ? 'User has DMs disabled' : error.message 
    };
  }
}

module.exports = { sendSafeDM };
