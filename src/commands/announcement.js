const { 
  SlashCommandBuilder, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  ActionRowBuilder,
  PermissionFlagsBits
} = require('discord.js');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announcement')
    .setDescription('เปิดหน้าต่างป๊อปอัปสร้างประกาศข่าวสาร แฟม U2M (เฉพาะหัวหน้า/ผู้จัดการ)'),

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

      // 📌 Create Native Discord Modal Popup Window
      const modal = new ModalBuilder()
        .setCustomId('modal_create_announcement')
        .setTitle('📢 สร้างประกาศข่าวสาร แฟม U2M');

      const titleInput = new TextInputBuilder()
        .setCustomId('ann_title')
        .setLabel('หัวข้อประกาศ')
        .setPlaceholder('เช่น นัดประชุมประจำสัปดาห์ / แจ้งกิจกรรมแฟม')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const messageInput = new TextInputBuilder()
        .setCustomId('ann_message')
        .setLabel('รายละเอียดข่าวสาร (พิมพ์ได้หลายบรรทัด)')
        .setPlaceholder('พิมพ์เนื้อหาประกาศรายละเอียด วันเวลา และข้อตกลงที่นี่...')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const mentionInput = new TextInputBuilder()
        .setCustomId('ann_mention')
        .setLabel('แท็กแจ้งเตือน (พิมพ์: everyone / here / none)')
        .setPlaceholder('พิมพ์ everyone หรือ here หรือ none (ค่าเริ่มต้นคือ none)')
        .setStyle(TextInputStyle.Short)
        .setValue('none')
        .setRequired(false);

      const row1 = new ActionRowBuilder().addComponents(titleInput);
      const row2 = new ActionRowBuilder().addComponents(messageInput);
      const row3 = new ActionRowBuilder().addComponents(mentionInput);

      modal.addComponents(row1, row2, row3);

      await interaction.showModal(modal);

    } catch (error) {
      console.error('[Announcement Command Modal Error]', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ **เกิดข้อผิดพลาดในการเปิดหน้าต่างประกาศ**: ' + error.message, ephemeral: true }).catch(() => {});
      }
    }
  }
};
