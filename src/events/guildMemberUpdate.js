const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const path = require('path');
const { sendSafeDM } = require('../utils/dmSender');
const { sendRoleAuditLog } = require('../utils/logger');
const config = require('../config.json');

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember) {
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;

    const { LEADER_ROLE_ID, MANAGER_ROLE_ID, MEMBER_ROLE_ID } = config.roles;
    const trackedRoleIds = [LEADER_ROLE_ID, MANAGER_ROLE_ID, MEMBER_ROLE_ID].filter(
      id => id && !id.includes('YOUR_')
    );

    // Detect newly ADDED roles
    const addedRoles = newRoles.filter(role => !oldRoles.has(role.id));
    for (const [roleId, role] of addedRoles) {
      if (trackedRoleIds.includes(roleId)) {
        // Send DM notification to user with U2M Logo
        const nowFormatted = `<t:${Math.floor(Date.now() / 1000)}:F>`;
        const logoPath = path.join(__dirname, '../../public/assets/u2m_logo.png');
        const logoAttachment = new AttachmentBuilder(logoPath, { name: 'u2m_logo.png' });

        const dmEmbed = new EmbedBuilder()
          .setTitle('แจ้งเตือนตำแหน่งยศใหม่')
          .setDescription(
            `👋 **สวัสดีครับคุณ ${newMember.user}!**\n\n` +
            `> 🛡️ **ยศตำแหน่ง**: \` [ ${role.name} ] \`\n` +
            `> 🏢 **เซิร์ฟเวอร์**: \` ${newMember.guild.name} \`\n` +
            `> ⏰ **เวลาที่ได้รับการแต่งตั้ง**: ${nowFormatted}\n\n` +
            `✨ **คุณได้ยศใหม่!**`
          )
          .setColor(0x10b981)
          .setThumbnail('attachment://u2m_logo.png')
          .setFooter({ text: '⚡ ระบบเช็คชื่อ แฟม up2m' })
          .setTimestamp();

        const dmResult = await sendSafeDM(newMember, { embeds: [dmEmbed], files: [logoAttachment] });

        // Send Log to Channel 3 (Role Audit Log Channel)
        await sendRoleAuditLog(newMember.client, {
          targetMember: newMember,
          role: role,
          action: 'ADDED',
          dmStatus: dmResult.success
        });

        console.log(`[Role Added Log] Assigned ${role.name} to ${newMember.user.tag}`);
      }
    }

    // Detect REMOVED roles
    const removedRoles = oldRoles.filter(role => !newRoles.has(role.id));
    for (const [roleId, role] of removedRoles) {
      if (trackedRoleIds.includes(roleId)) {
        // Send Log to Channel 3 (Role Audit Log Channel)
        await sendRoleAuditLog(newMember.client, {
          targetMember: newMember,
          role: role,
          action: 'REMOVED',
          dmStatus: false
        });

        console.log(`[Role Removed Log] Removed ${role.name} from ${newMember.user.tag}`);
      }
    }
  }
};
