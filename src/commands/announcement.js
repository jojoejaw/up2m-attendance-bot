const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  AttachmentBuilder,
  PermissionFlagsBits
} = require('discord.js');
const path = require('path');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announcement')
    .setDescription('สร้างปุ่มแผงควบคุมการสร้างประกาศข่าวสาร แฟม U2M ในห้องประกาศ (เฉพาะหัวหน้า/ผู้จัดการ)'),

  async execute(interaction) {
    try {
      const { LEADER_ROLE_ID, MANAGER_ROLE_ID } = config.roles;
      const member = interaction.member;

      // 🛡️ Permission check
      const isLeader = LEADER_ROLE_ID && !LEADER_ROLE_ID.includes('YOUR_') && member.roles.cache.has(LEADER_ROLE_ID);
      const isManager = MANAGER_ROLE_ID && !MANAGER_ROLE_ID.includes('YOUR_') && member.roles.cache.has(MANAGER_ROLE_ID);
      const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

      if (!isLeader && !isManager && !isAdmin) {
        return await interaction.reply({
          content: '❌ **คุณไม่มีสิทธิ์ใช้งานคำสั่งนี้!** เฉพาะยศ **หัวหน้า** หรือ **ผู้จัดการ** เท่านั้น',
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: false });

      // Prepare U2M Logo Attachment
      const logoPath = path.join(__dirname, '../../public/assets/u2m_logo.png');
      const logoAttachment = new AttachmentBuilder(logoPath, { name: 'u2m_logo.png' });

      // Build Control Panel Embed
      const embed = new EmbedBuilder()
        .setTitle('📢 ระบบสร้างประกาศข่าวสาร แฟม UP TO ME')
        .setDescription(
          `👋 **ยินดีต้อนรับสู่ระบบส่งประกาศข่าวสารประจำแฟม U2M**\n\n` +
          `> 👔 **สำหรับผู้ที่มีสิทธิ์**: \` หัวหน้า / ผู้จัดการ \`\n` +
          `> 📝 **การใช้งาน**: กดปุ่มด้านล่างเพื่อเปิดหน้าต่างกรอกหัวข้อ และรายละเอียดประกาศ\n\n` +
          `✨ **กดปุ่มด้านล่างเพื่อเริ่มสร้างประกาศใหม่ได้ทันที!**`
        )
        .setColor(0x8b5cf6)
        .setThumbnail('attachment://u2m_logo.png')
        .setFooter({ text: '⚡ ระบบประกาศข่าวสาร แฟม up2m' })
        .setTimestamp();

      const btnCreate = new ButtonBuilder()
        .setCustomId('btn_start_announcement')
        .setLabel('📢 คลิกเพื่อสร้างประกาศใหม่')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(btnCreate);

      return await interaction.editReply({
        embeds: [embed],
        components: [row],
        files: [logoAttachment]
      });

    } catch (error) {
      console.error('[Announcement Panel Error]', error);
      if (interaction.deferred) {
        await interaction.editReply({ content: '❌ **เกิดข้อผิดพลาดในการสร้างแผงประกาศ**: ' + error.message }).catch(() => {});
      } else {
        await interaction.reply({ content: '❌ **เกิดข้อผิดพลาดในการสร้างแผงประกาศ**: ' + error.message, ephemeral: true }).catch(() => {});
      }
    }
  }
};
