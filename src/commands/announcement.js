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
const announcementStore = require('../utils/announcementStore');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announcement')
    .setDescription('สร้างประกาศข่าวสาร แฟม U2M พร้อมระบบกดรับทราบ (เฉพาะหัวหน้า/ผู้จัดการ)')
    .addStringOption(option =>
      option.setName('title')
        .setDescription('หัวข้อประกาศ')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('message')
        .setDescription('รายละเอียดข่าวสารประกาศ (สามารถใช้การขึ้นบรรทัดใหม่ได้)')
        .setRequired(true)
    )
    .addAttachmentOption(option =>
      option.setName('image')
        .setDescription('รูปภาพประกอบประกาศ (แนบไฟล์รูปภาพ)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('mention')
        .setDescription('การแท็กแจ้งเตือนสมาชิก')
        .setRequired(false)
        .addChoices(
          { name: '📢 @everyone (แท็กทุกคน)', value: 'everyone' },
          { name: '🔔 @here (แท็กคนที่ออนไลน์)', value: 'here' },
          { name: '🔕 ไม่แท็ก', value: 'none' }
        )
    ),

  async execute(interaction) {
    try {
      const { LEADER_ROLE_ID, MANAGER_ROLE_ID } = config.roles;
      const member = interaction.member;

      // 🛡️ Strict Permission Check: Leader or Manager role only
      const isLeader = LEADER_ROLE_ID && !LEADER_ROLE_ID.includes('YOUR_') && member.roles.cache.has(LEADER_ROLE_ID);
      const isManager = MANAGER_ROLE_ID && !MANAGER_ROLE_ID.includes('YOUR_') && member.roles.cache.has(MANAGER_ROLE_ID);
      const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

      if (!isLeader && !isManager && !isAdmin) {
        return await interaction.reply({
          content: '❌ **คุณไม่มีสิทธิ์สร้างประกาศ!** เฉพาะยศ **หัวหน้า** หรือ **ผู้จัดการ** เท่านั้นที่มีสิทธิ์ใช้คำสั่งนี้',
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: false });

      const title = interaction.options.getString('title');
      const message = interaction.options.getString('message');
      const imageAttachment = interaction.options.getAttachment('image');
      const mentionOption = interaction.options.getString('mention') || 'none';

      // Create unique Announcement Record ID
      const announcementId = `ann_${Date.now()}`;
      announcementStore.createAnnouncement(announcementId, {
        title,
        message,
        authorId: interaction.user.id,
        authorName: interaction.member.displayName || interaction.user.username,
        channelId: interaction.channelId
      });

      // Prepare U2M Metallic Logo Attachment
      const logoPath = path.join(__dirname, '../../public/assets/u2m_logo.png');
      const logoAttachment = new AttachmentBuilder(logoPath, { name: 'u2m_logo.png' });
      const filesToSend = [logoAttachment];

      // Build Premium Announcement Embed Card
      const embed = new EmbedBuilder()
        .setTitle(`📢 ${title}`)
        .setDescription(
          `👋 **ประกาศสำคัญจาก แฟม UP TO ME (U2M)**\n\n` +
          `${message}\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `> 👔 **ผู้ประกาศ**: **${interaction.member.displayName || interaction.user.username}**\n` +
          `> ⏰ **เวลาประกาศ**: <t:${Math.floor(Date.now() / 1000)}:F>\n` +
          `> 👥 **ยอดผู้รับทราบ**: \` 0 คน \``
        )
        .setColor(0x7c3aed)
        .setThumbnail('attachment://u2m_logo.png')
        .setFooter({ text: '⚡ ระบบประกาศข่าวสาร แฟม up2m' })
        .setTimestamp();

      // Handle Image Attachment if provided
      if (imageAttachment && imageAttachment.contentType?.startsWith('image/')) {
        embed.setImage(imageAttachment.url);
      }

      // Interactive Buttons
      const btnAck = new ButtonBuilder()
        .setCustomId(`ack_${announcementId}`)
        .setLabel('🔔 กดรับทราบข่าวสาร')
        .setStyle(ButtonStyle.Success);

      const btnList = new ButtonBuilder()
        .setCustomId(`list_ack_${announcementId}`)
        .setLabel('📋 ดูรายชื่อผู้รับทราบ')
        .setStyle(ButtonStyle.Secondary);

      const row = new ActionRowBuilder().addComponents(btnAck, btnList);

      // Handle Mention Text
      let contentPrefix = '';
      if (mentionOption === 'everyone') contentPrefix = '@everyone ';
      else if (mentionOption === 'here') contentPrefix = '@here ';

      await interaction.editReply({
        content: contentPrefix.trim() ? contentPrefix.trim() : null,
        embeds: [embed],
        components: [row],
        files: filesToSend
      });

    } catch (error) {
      console.error('[Announcement Command Error]', error);
      if (interaction.deferred) {
        await interaction.editReply({ content: '❌ **เกิดข้อผิดพลาดในการสร้างประกาศ**: ' + error.message }).catch(() => {});
      } else {
        await interaction.reply({ content: '❌ **เกิดข้อผิดพลาดในการสร้างประกาศ**: ' + error.message, ephemeral: true }).catch(() => {});
      }
    }
  }
};
