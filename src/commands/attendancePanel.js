const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const attendanceStore = require('../utils/attendanceStore');
const config = require('../config.json');

const { AttachmentBuilder } = require('discord.js');
const path = require('path');

/**
 * Build Clean Embed Card & Web Link Button with User ID authentication
 */
function buildAttendanceUI(guild, session, requestingUser) {
  const membersList = Array.from(session.members.values());
  const totalCount = membersList.length;

  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const dashboardUrl = `${baseUrl}/?guildId=${guild.id}&userId=${requestingUser.id}`;
  const logoPath = path.join(__dirname, '../../public/assets/u2m_logo.png');
  const logoAttachment = new AttachmentBuilder(logoPath, { name: 'u2m_logo.png' });

  const embed = new EmbedBuilder()
    .setTitle('📌 ระบบเช็คชื่อ แฟม up2m (Web Dashboard)')
    .setDescription(
      `> 👥 **สมาชิกที่ต้องเช็ค**: \` ${totalCount} คน \`\n` +
      `> 🛡️ **สิทธิ์การเช็คชื่อ**: \` เฉพาะยศผู้จัดการ \`\n\n` +
      `✨ **คลิกปุ่มด้านล่างเพื่อเปิดหน้าเว็บเช็คชื่อประจำวัน**`
    )
    .setColor(0x7c3aed)
    .setThumbnail('attachment://u2m_logo.png')
    .setFooter({ text: '⚡ ระบบเช็คชื่อ แฟม up2m Control Panel' })
    .setTimestamp();

  const btnWebDashboard = new ButtonBuilder()
    .setCustomId('btn_open_dashboard')
    .setLabel('🌐 เปิดหน้าเว็บระบบเช็คชื่อ แฟม up2m')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(btnWebDashboard);

  return { embeds: [embed], components: [row], files: [logoAttachment] };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('attendance-panel')
    .setDescription('เปิดแผงควบคุมระบบเช็คชื่อ แฟม up2m (เฉพาะยศผู้จัดการเท่านั้น)'),

  buildAttendanceUI,

  async execute(interaction) {
    try {
      const { MANAGER_ROLE_ID, LEADER_ROLE_ID, MEMBER_ROLE_ID } = config.roles;
      const { BOT_COMMAND_CHANNEL_ID } = config.channels;
      const member = interaction.member;

      // 📢 Channel 1 Restriction: Ensure command is called only in configured bot command channel
      if (BOT_COMMAND_CHANNEL_ID && !BOT_COMMAND_CHANNEL_ID.includes('YOUR_')) {
        if (interaction.channelId !== BOT_COMMAND_CHANNEL_ID) {
          return await interaction.reply({
            content: `❌ **คุณไม่สามารถใช้คำสั่งนี้ในห้องนี้ได้!** โปรดใช้คำสั่งในห้องเรียกบอท <#${BOT_COMMAND_CHANNEL_ID}> เท่านั้นครับ`,
            ephemeral: true
          });
        }
      }

      // STRICT RULE: Only Manager role (ผู้จัดการ) can trigger check-in
      const isManager = MANAGER_ROLE_ID && !MANAGER_ROLE_ID.includes('YOUR_')
        ? member.roles.cache.has(MANAGER_ROLE_ID)
        : true;

      if (!isManager) {
        return await interaction.reply({
          content: '❌ **คุณไม่มีสิทธิ์ใช้งานคำสั่งนี้!** เฉพาะยศ **ผู้จัดการ** ยศเดียวเท่านั้นที่สามารถเช็คชื่อได้ (ยศหัวหน้า สมาชิก และบุคคลทั่วไปไม่สามารถเช็คชื่อได้)',
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: false });

      // Fetch all guild members safely using cache first
      let allMembers = interaction.guild.members.cache;
      if (allMembers.size <= 1) {
        try {
          allMembers = await interaction.guild.members.fetch({ time: 5000 });
        } catch (fetchErr) {
          console.warn('[Guild Fetch Warning]', fetchErr.message);
          allMembers = interaction.guild.members.cache;
        }
      }

      // Filter eligible members (Leader, Manager, Member)
      const trackedRoleIds = [LEADER_ROLE_ID, MANAGER_ROLE_ID, MEMBER_ROLE_ID].filter(
        id => id && !id.includes('YOUR_')
      );

      const eligibleMembers = [];
      allMembers.forEach(m => {
        if (m.user.bot) return;

        const hasTrackedRole = trackedRoleIds.length > 0
          ? m.roles.cache.some(r => trackedRoleIds.includes(r.id))
          : true;

        if (hasTrackedRole) {
          let roleName = 'สมาชิก';
          if (LEADER_ROLE_ID && m.roles.cache.has(LEADER_ROLE_ID)) roleName = 'หัวหน้า';
          else if (MANAGER_ROLE_ID && m.roles.cache.has(MANAGER_ROLE_ID)) roleName = 'ผู้จัดการ';

          eligibleMembers.push({
            id: m.id,
            user: m.user,
            displayName: m.displayName || m.user.username,
            roleName: roleName
          });
        }
      });

      if (eligibleMembers.length === 0) {
        return await interaction.editReply({
          content: '⚠️ **ไม่พบสมาชิกในทีมที่มีสิทธิ์เช็คชื่อ** (โปรดตรวจสอบการแจกยศ หัวหน้า/ผู้จัดการ/สมาชิก ให้กับสมาชิกในเซิร์ฟเวอร์ก่อน)'
        });
      }

      // Create session in store
      const session = attendanceStore.createSession(interaction.guildId, eligibleMembers);
      const uiData = buildAttendanceUI(interaction.guild, session, interaction.user);

      await interaction.editReply(uiData);
    } catch (error) {
      console.error('[Attendance Panel Error]', error);
      if (interaction.deferred) {
        await interaction.editReply({ content: '❌ **เกิดข้อผิดพลาดในการโหลดแผงเช็คชื่อ**: ' + error.message }).catch(() => { });
      } else {
        await interaction.reply({ content: '❌ **เกิดข้อผิดพลาดในการโหลดแผงเช็คชื่อ**: ' + error.message, ephemeral: true }).catch(() => { });
      }
    }
  }
};
