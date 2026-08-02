const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, StringSelectMenuBuilder } = require('discord.js');
const attendanceStore = require('../utils/attendanceStore');
const attendancePanel = require('../commands/attendancePanel');
const { sendSafeDM } = require('../utils/dmSender');
const { sendDiscordLog } = require('../utils/logger');
const config = require('../config.json');

const STATUS_ICONS = {
  PENDING: '⚪ ยังไม่ได้เช็ค',
  PRESENT: '🟢 มา',
  LATE: '🟡 มาสาย',
  ABSENT: '🔴 ขาด'
};

// Helper: Render Step 4 Mention Selection Window
async function renderStep4MentionWindow(interaction, draft) {
  const announcementStore = require('../utils/announcementStore');

  const selectedMentions = draft.mentions || [];
  let mentionDisplay = '🔕 ไม่แท็ก';
  if (selectedMentions.length > 0) {
    const labelMap = {
      everyone: '📢 @everyone',
      here: '🔔 @here',
      manager: '👔 @ผู้จัดการ',
      leader: '👑 @หัวหน้า',
      member: '👤 @สมาชิก'
    };
    mentionDisplay = selectedMentions.map(m => labelMap[m] || m).join('  |  ');
  }

  const embedStep4 = new EmbedBuilder()
    .setTitle('🏷️ ขั้นตอนที่ 4/5: เลือกการแท็กแจ้งเตือน (เลือกได้มากกว่า 1 ข้อ)')
    .setDescription(
      `📌 **หัวข้อประกาศ**: **${draft.title}**\n` +
      `🖼️ **สถานะรูปภาพ**: \` ${draft.imageUrl ? '✅ แนบรูปภาพแล้ว' : '❌ ไม่แนบรูปภาพ'} \`\n` +
      `🏷️ **แท็กที่เลือกในปัจจุบัน**: \` ${mentionDisplay} \`\n\n` +
      `👇 **กรุณากดเลือกแท็กในเมนูด้านล่าง (สามารถเลือกได้หลายข้อ) แล้วกดปุ่มยืนยันโพสต์ด้านล่าง:**`
    )
    .setColor(0x8b5cf6)
    .setFooter({ text: 'ระบบประกาศข่าวสาร แฟม up2m' });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('select_ann_mentions')
    .setPlaceholder('👉 กดเลือกแท็กแจ้งเตือน (เลือกได้มากกว่า 1 ข้อ)...')
    .setMinValues(0)
    .setMaxValues(5)
    .addOptions(
      { label: '📢 @everyone', value: 'everyone', description: 'แท็กทุกคนในเซิร์ฟเวอร์', default: selectedMentions.includes('everyone') },
      { label: '🔔 @here', value: 'here', description: 'แท็กสมาชิกที่กำลังออนไลน์', default: selectedMentions.includes('here') },
      { label: '👔 @ผู้จัดการ', value: 'manager', description: 'แท็กเฉพาะยศผู้จัดการ', default: selectedMentions.includes('manager') },
      { label: '👑 @หัวหน้า', value: 'leader', description: 'แท็กเฉพาะยศหัวหน้า', default: selectedMentions.includes('leader') },
      { label: '👤 @สมาชิก', value: 'member', description: 'แท็กเฉพาะยศสมาชิก', default: selectedMentions.includes('member') }
    );

  const btnConfirmPublish = new ButtonBuilder()
    .setCustomId('btn_step5_confirm_publish')
    .setLabel('🚀 ยืนยันและโพสต์ประกาศ')
    .setStyle(ButtonStyle.Success);

  const rowSelect = new ActionRowBuilder().addComponents(selectMenu);
  const rowConfirm = new ActionRowBuilder().addComponents(btnConfirmPublish);

  const payload = {
    content: '✅ **บันทึกขั้นตอนรูปภาพเรียบร้อยแล้ว!**',
    embeds: [embedStep4],
    components: [rowSelect, rowConfirm],
    ephemeral: true
  };

  if (interaction.isModalSubmit() || interaction.replied || interaction.deferred) {
    if (interaction.replied || interaction.deferred) {
      return await interaction.editReply(payload).catch(() => {});
    } else {
      return await interaction.reply(payload).catch(() => {});
    }
  } else if (interaction.isMessageComponent()) {
    return await interaction.update(payload).catch(() => {});
  }
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    try {
      // 1. Handle Slash Commands
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'attendance-panel') {
          return await attendancePanel.execute(interaction);
        }
        if (interaction.commandName === 'announcement') {
          const announcementCommand = require('../commands/announcement');
          return await announcementCommand.execute(interaction);
        }
      }

      // 1.5 Handle Modal Submissions
      if (interaction.isModalSubmit()) {
        const announcementStore = require('../utils/announcementStore');

        // Step 2 Modal Submit: Title & Message
        if (interaction.customId === 'modal_create_announcement') {
          const title = interaction.fields.getTextInputValue('ann_title');
          const message = interaction.fields.getTextInputValue('ann_message');

          // Save draft for user
          announcementStore.setDraft(interaction.user.id, {
            title,
            message,
            imageUrl: null,
            mentions: []
          });

          // Show Step 3 Ephemeral Window: Image Selection Choice
          const embedStep3 = new EmbedBuilder()
            .setTitle('🖼️ ขั้นตอนที่ 3/5: เลือกการแนบรูปภาพประกอบ')
            .setDescription(
              `✅ **บันทึกหัวข้อและรายละเอียดประกาศเรียบร้อยแล้ว!**\n\n` +
              `> 📌 **หัวข้อ**: **${title}**\n\n` +
              `👇 **ต้องการแนบรูปภาพประกอบประกาศหรือไม่? เลือกรูปแบบปุ่มด้านล่าง:**`
            )
            .setColor(0x8b5cf6)
            .setFooter({ text: 'ระบบประกาศข่าวสาร แฟม up2m' });

          const btnImgUrl = new ButtonBuilder()
            .setCustomId('btn_step3_img_url')
            .setLabel('🌐 ใส่ลิงก์รูปภาพ (Image URL)')
            .setStyle(ButtonStyle.Success);

          const btnImgUpload = new ButtonBuilder()
            .setCustomId('btn_step3_img_upload')
            .setLabel('📤 อัปโหลดรูปภาพจากเครื่อง')
            .setStyle(ButtonStyle.Primary);

          const btnImgSkip = new ButtonBuilder()
            .setCustomId('btn_step3_img_skip')
            .setLabel('⏭️ ไม่แนบรูปภาพ (ข้าม)')
            .setStyle(ButtonStyle.Secondary);

          const rowImageButtons = new ActionRowBuilder().addComponents(btnImgUrl, btnImgUpload, btnImgSkip);

          return await interaction.reply({
            embeds: [embedStep3],
            components: [rowImageButtons],
            ephemeral: true
          });
        }

        // Modal Image Submit (URL / Upload link)
        if (interaction.customId === 'modal_add_ann_image_url' || interaction.customId === 'modal_add_ann_image_upload') {
          const imageUrl = interaction.fields.getTextInputValue('ann_image_input');
          const draft = announcementStore.getDraft(interaction.user.id);

          if (draft) {
            draft.imageUrl = imageUrl.trim() ? imageUrl.trim() : null;
            announcementStore.setDraft(interaction.user.id, draft);
          }

          return await renderStep4MentionWindow(interaction, draft || { title: 'ประกาศ', mentions: [] });
        }
      }

      // 2. Handle Component Interactions (Buttons / Select Menus)
      if (!interaction.isMessageComponent()) return;

      // 📢 Step 1 Button Click: "คลิกเพื่อสร้างประกาศใหม่"
      if (interaction.isButton() && interaction.customId === 'btn_start_announcement') {
        const { LEADER_ROLE_ID, MANAGER_ROLE_ID } = config.roles;
        const member = interaction.member;

        const isLeader = LEADER_ROLE_ID && !LEADER_ROLE_ID.includes('YOUR_') && member.roles.cache.has(LEADER_ROLE_ID);
        const isManager = MANAGER_ROLE_ID && !MANAGER_ROLE_ID.includes('YOUR_') && member.roles.cache.has(MANAGER_ROLE_ID);
        const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isLeader && !isManager && !isAdmin) {
          return await interaction.reply({
            content: '❌ **คุณไม่มีสิทธิ์สร้างประกาศ!** เฉพาะยศ **หัวหน้า** หรือ **ผู้จัดการ** เท่านั้น',
            ephemeral: true
          });
        }

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

        const row1 = new ActionRowBuilder().addComponents(titleInput);
        const row2 = new ActionRowBuilder().addComponents(messageInput);
        modal.addComponents(row1, row2);

        return await interaction.showModal(modal);
      }

      // 🖼️ Step 3 Button Click: Option A (Image URL)
      if (interaction.isButton() && interaction.customId === 'btn_step3_img_url') {
        const modal = new ModalBuilder()
          .setCustomId('modal_add_ann_image_url')
          .setTitle('🌐 แนบลิงก์รูปภาพประกอบ (URL)');

        const imageInput = new TextInputBuilder()
          .setCustomId('ann_image_input')
          .setLabel('วางลิงก์รูปภาพ (URL)')
          .setPlaceholder('เช่น https://i.imgur.com/example.png')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const row = new ActionRowBuilder().addComponents(imageInput);
        modal.addComponents(row);

        return await interaction.showModal(modal);
      }

      // 🖼️ Step 3 Button Click: Option B (Image Upload)
      if (interaction.isButton() && interaction.customId === 'btn_step3_img_upload') {
        const modal = new ModalBuilder()
          .setCustomId('modal_add_ann_image_upload')
          .setTitle('📤 อัปโหลดรูปภาพจากเครื่อง');

        const imageInput = new TextInputBuilder()
          .setCustomId('ann_image_input')
          .setLabel('วางลิงก์รูปภาพ หรือ Copy Link จากดิส')
          .setPlaceholder('ส่งรูปในดิสคอร์ดแล้วคัดลอก Copy Link มาวางที่นี่...')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const row = new ActionRowBuilder().addComponents(imageInput);
        modal.addComponents(row);

        return await interaction.showModal(modal);
      }

      // ⏭️ Step 3 Button Click: Option C (Skip Image)
      if (interaction.isButton() && interaction.customId === 'btn_step3_img_skip') {
        const announcementStore = require('../utils/announcementStore');
        const draft = announcementStore.getDraft(interaction.user.id);
        if (draft) {
          draft.imageUrl = null;
          announcementStore.setDraft(interaction.user.id, draft);
        }
        return await renderStep4MentionWindow(interaction, draft || { title: 'ประกาศ', mentions: [] });
      }

      // 🏷️ Step 4 Multi-Select Dropdown Interaction: select_ann_mentions
      if (interaction.isStringSelectMenu() && interaction.customId === 'select_ann_mentions') {
        const announcementStore = require('../utils/announcementStore');
        const draft = announcementStore.getDraft(interaction.user.id);
        if (draft) {
          draft.mentions = interaction.values || [];
          announcementStore.setDraft(interaction.user.id, draft);
        }
        return await renderStep4MentionWindow(interaction, draft || { title: 'ประกาศ', mentions: [] });
      }

      // 🚀 Step 5 Button Click: Confirm & Publish Announcement
      if (interaction.isButton() && interaction.customId === 'btn_step5_confirm_publish') {
        try {
          const announcementStore = require('../utils/announcementStore');
          const draft = announcementStore.getDraft(interaction.user.id);

          if (!draft) {
            return await interaction.reply({
              content: '⚠️ **ไม่พบร่างประกาศของคุณ** กรุณากดปุ่มสร้างประกาศใหม่อีกครั้งครับ',
              ephemeral: true
            });
          }

          const { title, message, imageUrl, mentions } = draft;
          const announcementId = `ann_${Date.now()}`;
          announcementStore.createAnnouncement(announcementId, {
            title,
            message,
            imageUrl,
            authorId: interaction.user.id,
            authorName: interaction.member.displayName || interaction.user.username,
            channelId: interaction.channelId
          });

          // Compile Multi-Mention String
          const { LEADER_ROLE_ID, MANAGER_ROLE_ID, MEMBER_ROLE_ID } = config.roles;
          const mentionParts = [];

          if (mentions && mentions.length > 0) {
            mentions.forEach(m => {
              if (m === 'everyone') mentionParts.push('@everyone');
              else if (m === 'here') mentionParts.push('@here');
              else if (m === 'manager' && MANAGER_ROLE_ID && !MANAGER_ROLE_ID.includes('YOUR_')) mentionParts.push(`<@&${MANAGER_ROLE_ID}>`);
              else if (m === 'leader' && LEADER_ROLE_ID && !LEADER_ROLE_ID.includes('YOUR_')) mentionParts.push(`<@&${LEADER_ROLE_ID}>`);
              else if (m === 'member' && MEMBER_ROLE_ID && !MEMBER_ROLE_ID.includes('YOUR_')) mentionParts.push(`<@&${MEMBER_ROLE_ID}>`);
            });
          }

          const fs = require('fs');
          const path = require('path');
          const logoPath = path.join(__dirname, '../../public/assets/u2m_logo.png');
          const filesToSend = [];

          const embed = new EmbedBuilder()
            .setTitle(`📢 ${title}`)
            .setDescription(
              `### 📌 รายละเอียดข่าวสาร\n` +
              `> ${message.replace(/\n/g, '\n> ')}\n\n` +
              `──────────────────────────────\n` +
              `> 👔 **ผู้ประกาศ**: \` ${interaction.member.displayName || interaction.user.username} \`\n` +
              `> ⏰ **เวลาประกาศ**: <t:${Math.floor(Date.now() / 1000)}:F>\n` +
              `> 👥 **ยอดผู้รับทราบ**: \` 0 คน \``
            )
            .setColor(0x8b5cf6)
            .setFooter({ text: '⚡ ระบบประกาศข่าวสาร แฟม up2m' })
            .setTimestamp();

          if (fs.existsSync(logoPath)) {
            const logoAttachment = new AttachmentBuilder(logoPath, { name: 'u2m_logo.png' });
            filesToSend.push(logoAttachment);
            embed.setThumbnail('attachment://u2m_logo.png');
          }

          if (imageUrl) {
            embed.setImage(imageUrl);
          }

          const btnAck = new ButtonBuilder()
            .setCustomId(`ack_${announcementId}`)
            .setLabel('🔔 กดรับทราบข่าวสาร')
            .setStyle(ButtonStyle.Success);

          const btnList = new ButtonBuilder()
            .setCustomId(`list_ack_${announcementId}`)
            .setLabel('📋 ดูรายชื่อผู้รับทราบ')
            .setStyle(ButtonStyle.Secondary);

          const row = new ActionRowBuilder().addComponents(btnAck, btnList);

          const contentPrefix = mentionParts.length > 0 ? mentionParts.join(' ') : null;

          // Send final announcement to channel
          await interaction.channel.send({
            content: contentPrefix,
            embeds: [embed],
            components: [row],
            files: filesToSend
          });

          // Clear user draft
          announcementStore.clearDraft(interaction.user.id);

          return await interaction.reply({
            content: '🎉 **โพสต์ประกาศข่าวสารลงช่องเรียบร้อยแล้วครับ!**',
            ephemeral: true
          });
        } catch (err) {
          console.error('[Step 5 Publish Announcement Error]', err);
          return await interaction.reply({
            content: '❌ **เกิดข้อผิดพลาดในการโพสต์ประกาศ**: ' + err.message,
            ephemeral: true
          }).catch(() => {});
        }
      }

      // 📢 Handle Announcement Acknowledgment Button (ack_ann_...)
      if (interaction.isButton() && interaction.customId.startsWith('ack_ann_')) {
        const announcementStore = require('../utils/announcementStore');
        const announcementId = interaction.customId.replace('ack_', '');
        const result = announcementStore.acknowledge(announcementId, interaction.user.id);
        const ann = announcementStore.getAnnouncement(announcementId);

        if (!result.success && result.reason === 'ALREADY_ACKNOWLEDGED') {
          return await interaction.reply({
            content: '⚠️ **คุณได้กดรับทราบประกาศนี้ไปเรียบร้อยแล้วครับ!**',
            ephemeral: true
          });
        }

        // Update the main embed natively using interaction.update() to prevent image popups
        const oldEmbed = interaction.message.embeds[0];
        if (oldEmbed && ann) {
          const updatedEmbed = EmbedBuilder.from(oldEmbed);

          if (oldEmbed.description && oldEmbed.description.includes('ยอดผู้รับทราบ')) {
            updatedEmbed.setDescription(
              oldEmbed.description
                .replace(/• 👥 \*\*ยอดผู้รับทราบ\*\*: ` \d+ คน `/, `• 👥 **ยอดผู้รับทราบ**: \` ${ann.acknowledgedUsers.size} คน \``)
                .replace(/> 👥 \*\*ยอดผู้รับทราบ\*\*: ` \d+ คน `/, `> 👥 **ยอดผู้รับทราบ**: \` ${ann.acknowledgedUsers.size} คน \``)
            );
          }

          if (oldEmbed.fields && oldEmbed.fields.length > 0) {
            const fields = [...oldEmbed.fields];
            const ackIdx = fields.findIndex(f => f.name.includes('ยอดผู้รับทราบ'));
            if (ackIdx !== -1) {
              fields[ackIdx] = {
                name: '👥 ยอดผู้รับทราบ',
                value: `\` 🟢 ${ann.acknowledgedUsers.size} คน \``,
                inline: true
              };
              updatedEmbed.setFields(fields);
            }
          }

          // Retain existing message attachments by mapping attachment IDs for Discord REST API v10
          const retainedAttachments = Array.from(interaction.message.attachments.values()).map(att => ({ id: att.id }));

          // Update embed natively without detaching attachments
          await interaction.update({
            embeds: [updatedEmbed],
            attachments: retainedAttachments
          }).catch(() => {});

          // Send private confirmation to clicking user
          return await interaction.followUp({
            content: `✅ **คุณ ${interaction.user} ได้กดรับทราบประกาศเรื่อง "${ann ? ann.title : 'ประกาศ'}" เรียบร้อยแล้ว!**`,
            ephemeral: true
          }).catch(() => {});
        } else {
          return await interaction.reply({
            content: `✅ **คุณ ${interaction.user} ได้กดรับทราบประกาศเรียบร้อยแล้ว!**`,
            ephemeral: true
          }).catch(() => {});
        }
      }

      // 📋 Handle View Acknowledged List Button (list_ack_ann_...)
      if (interaction.isButton() && interaction.customId.startsWith('list_ack_ann_')) {
        const announcementStore = require('../utils/announcementStore');
        const announcementId = interaction.customId.replace('list_ack_', '');
        const ann = announcementStore.getAnnouncement(announcementId);

        if (!ann) {
          return await interaction.reply({
            content: '⚠️ **ไม่พบข้อมูลประกาศนี้ในระบบ**',
            ephemeral: true
          });
        }

        let allMembers = interaction.guild.members.cache;
        const { LEADER_ROLE_ID, MANAGER_ROLE_ID, MEMBER_ROLE_ID } = config.roles;
        const trackedRoleIds = [LEADER_ROLE_ID, MANAGER_ROLE_ID, MEMBER_ROLE_ID].filter(
          id => id && !id.includes('YOUR_')
        );

        const ackList = [];
        const pendingList = [];

        allMembers.forEach(m => {
          if (m.user.bot) return;
          const hasTrackedRole = trackedRoleIds.length > 0
            ? m.roles.cache.some(r => trackedRoleIds.includes(r.id))
            : true;

          if (hasTrackedRole) {
            if (ann.acknowledgedUsers.has(m.id)) {
              ackList.push(`• 🟢 ${m.displayName} (@${m.user.username})`);
            } else {
              pendingList.push(`• 🔴 ${m.displayName} (@${m.user.username})`);
            }
          }
        });

        const ackText = ackList.length > 0 ? ackList.join('\n') : '• ยังไม่มีผู้กดรับทราบ';
        const pendingText = pendingList.length > 0 ? pendingList.join('\n') : '• สมาชิกทุกคนกดรับทราบครบแล้ว 🎉';

        const listEmbed = new EmbedBuilder()
          .setTitle(`📋 รายชื่อผู้รับทราบประกาศ: ${ann.title}`)
          .setDescription(
            `📊 **สรุปยอดผู้รับทราบ**: \` ${ann.acknowledgedUsers.size} / ${ackList.length + pendingList.length} คน \`\n\n` +
            `🟢 **กดรับทราบแล้ว (${ackList.length} คน)**:\n${ackText}\n\n` +
            `🔴 **ยังไม่ได้กดรับทราบ (${pendingList.length} คน)**:\n${pendingText}`
          )
          .setColor(0x7c3aed)
          .setTimestamp();

        return await interaction.reply({
          embeds: [listEmbed],
          ephemeral: true
        });
      }

      // 🌐 Handle Per-User Personal Dashboard Link Button (Sends private link for the exact clicking user)
      if (interaction.isButton() && interaction.customId === 'btn_open_dashboard') {
        const baseUrl = process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
        const personalUrl = `${baseUrl}/?guildId=${interaction.guildId}&userId=${interaction.user.id}`;

        const btnPersonalLink = new ButtonBuilder()
          .setLabel('🌐 คลิกตรงนี้เพื่อเปิดหน้าเว็บของคุณ')
          .setURL(personalUrl)
          .setStyle(ButtonStyle.Link);

        const row = new ActionRowBuilder().addComponents(btnPersonalLink);

        return await interaction.reply({
          content: `👋 **สวัสดีครับคุณ ${interaction.user}!** คลิกปุ่มด้านล่างเพื่อเปิดหน้าเว็บโปรไฟล์ส่วนตัวของคุณได้เลยครับ:`,
          components: [row],
          ephemeral: true
        });
      }

      const { MANAGER_ROLE_ID } = config.roles;
      const isManager = interaction.member.roles.cache.has(MANAGER_ROLE_ID) ||
        interaction.member.permissions.has(PermissionFlagsBits.Administrator);

      // Permission check for interactions
      if (!isManager && MANAGER_ROLE_ID && !MANAGER_ROLE_ID.includes('YOUR_')) {
        return interaction.reply({
          content: '❌ คุณไม่มีสิทธิ์ใช้งานปุ่มควบคุมนี้ (สำหรับผู้จัดการเท่านั้น)',
          ephemeral: true
        });
      }

      const session = attendanceStore.getSession(interaction.guildId);
      if (!session) {
        return interaction.reply({
          content: '⚠️ **ไม่พบเซสชันการเช็คชื่อปัจจุบัน** กรุณาใช้คำสั่ง `/attendance-panel` เพื่อเปิดแผงเช็คชื่อใหม่',
          ephemeral: true
        });
      }

      // Handle Buttons
      if (interaction.isButton()) {
        const { customId } = interaction;

        // Handle Status Change Buttons per user: set_user_status_PRESENT_123456
        if (customId.startsWith('set_user_status_')) {
          const raw = customId.replace('set_user_status_', '');
          const parts = raw.split('_');
          const newStatus = parts[0]; // PRESENT | LATE | ABSENT
          const targetUserId = parts[1];

          if (targetUserId) {
            attendanceStore.updateMemberStatus(interaction.guildId, targetUserId, newStatus);
          }

          const uiData = attendancePanel.buildAttendanceUI(interaction.guild, session);
          return await interaction.update(uiData);
        }

        // Handle Confirm All Button with Validation
        if (customId === 'confirm_attendance_all') {
          // Check if any member is still UNCHECKED (PENDING)
          const uncheckedMembers = attendanceStore.getUncheckedMembers(interaction.guildId);

          if (uncheckedMembers.length > 0) {
            const uncheckedList = uncheckedMembers.map((m, idx) => `**${idx + 1}.** ${m.user} (\`${m.roleName}\`)`).join('\n');

            return await interaction.reply({
              content: `⚠️ **ยังไม่สามารถยืนยันได้!** คุณยังไม่ได้ติ๊กเลือกสถานะให้สมาชิกครบทุกคน\n\n` +
                `📌 **รายชื่อที่ยังไม่ได้ติ๊กเช็คชื่อ (${uncheckedMembers.length} คน)**:\n` +
                `${uncheckedList}\n\n` +
                `👉 กรุณากดเลือกสถานะ (🟢 มา / 🟡 สาย / 🔴 ขาด) ให้สมาชิกทุกท่านก่อนกดยืนยัน!`,
              ephemeral: true
            });
          }

          await interaction.deferUpdate();

          // Confirm session in store
          attendanceStore.confirmSession(interaction.guildId, interaction.user.id);
          const membersList = Array.from(session.members.values());

          let presentCount = 0;
          let lateCount = 0;
          let absentCount = 0;

          const summaryLines = membersList.map((m, idx) => {
            if (m.status === 'PRESENT') presentCount++;
            if (m.status === 'LATE') lateCount++;
            if (m.status === 'ABSENT') absentCount++;

            const icon = STATUS_ICONS[m.status];
            return `**#${idx + 1}** | \`[${m.roleName}]\` | ${m.user} ➔ **${icon}**`;
          });

          const nowFormatted = `<t:${Math.floor(Date.now() / 1000)}:F>`;

          // Summary Embed
          const summaryEmbed = new EmbedBuilder()
            .setTitle('✅ สรุปผลการเช็คชื่อประจำวัน (บันทึกสำเร็จ)')
            .setDescription(
              `**ผู้ดำเนินการ**: ${interaction.user}\n` +
              `**วันเวลาที่เช็คชื่อ**: ${nowFormatted}\n` +
              `**จำนวนสมาชิกทั้งหมด**: ${membersList.length} คน\n\n` +
              `---------------------------------------------------------\n` +
              summaryLines.join('\n') +
              `\n---------------------------------------------------------`
            )
            .setColor(0x2ecc71)
            .addFields({
              name: ' สรุปยอดรวม',
              value: `🟢 มา: **${presentCount}** คน | 🟡 สาย: **${lateCount}** คน | 🔴 ขาด: **${absentCount}** คน`,
              inline: false
            })
            .setFooter({ text: 'ระบบส่ง DM แจ้งเตือนรายบุคคล และลง Log เรียบร้อยแล้ว' })
            .setTimestamp();

          // Send DM to every checked member
          let dmSuccessCount = 0;
          let dmFailCount = 0;

          for (const m of membersList) {
            const statusText = STATUS_ICONS[m.status];
            const dmEmbed = new EmbedBuilder()
              .setTitle('📌 แจ้งเตือนสถานะการเช็คชื่อประจำวัน')
              .setDescription(`สวัสดีครับคุณ ${m.user}! รายงานผลการเช็คชื่อของคุณ:`)
              .setColor(m.status === 'PRESENT' ? 0x2ecc71 : m.status === 'LATE' ? 0xf1c40f : 0xe74c3c)
              .addFields(
                { name: ' สถานะของคุณ', value: `**${statusText}**`, inline: true },
                { name: '👤 บันทึกโดย', value: `${interaction.user.tag}`, inline: true },
                { name: '⏰ วันเวลาที่บันทึก', value: nowFormatted, inline: false }
              )
              .setFooter({ text: 'Discord Team Attendance Notification' })
              .setTimestamp();

            const dmResult = await sendSafeDM(m.user, dmEmbed);
            if (dmResult.success) dmSuccessCount++;
            else dmFailCount++;
          }

          // Post Audit Log to Discord Log Channel
          await sendDiscordLog(interaction.client, {
            title: '📊 [ATTENDANCE LOG] รายงานการเช็คชื่อประจำวัน',
            description: `ผู้จัดการ ${interaction.user} (${interaction.user.tag}) ได้ทำการกดยืนยันการเช็คชื่อสมาชิกจำนวน ${membersList.length} คน`,
            color: 0x2ecc71,
            fields: [
              { name: '👤 ผู้จัดการ', value: `${interaction.user}`, inline: true },
              { name: '⏰ วันเวลา', value: nowFormatted, inline: true },
              { name: '📊 ผลการเช็ค', value: `🟢 มา: ${presentCount} | 🟡 สาย: ${lateCount} | 🔴 ขาด: ${absentCount}`, inline: false },
              { name: '📩 การส่ง DM', value: `✅ สำเร็จ: ${dmSuccessCount} คน | ⚠️ ปิด DM: ${dmFailCount} คน`, inline: false }
            ]
          });

          // Edit button for Manager
          const btnEdit = new ButtonBuilder()
            .setCustomId('edit_attendance_panel')
            .setLabel('✏️ แก้ไขผลการเช็คชื่อ')
            .setStyle(ButtonStyle.Secondary);

          const rowEdit = new ActionRowBuilder().addComponents(btnEdit);

          return await interaction.editReply({
            embeds: [summaryEmbed],
            components: [rowEdit]
          });
        }

        // Handle Edit Button
        if (customId === 'edit_attendance_panel') {
          session.isConfirmed = false;
          const uiData = attendancePanel.buildAttendanceUI(interaction.guild, session);
          return await interaction.update(uiData);
        }
      }
    } catch (error) {
      console.error('[Interaction Error]', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ เกิดข้อผิดพลาดในการประมวลผลคำสั่ง', ephemeral: true }).catch(() => { });
      } else {
        await interaction.followUp({ content: '❌ เกิดข้อผิดพลาดในการประมวลผลคำสั่ง', ephemeral: true }).catch(() => { });
      }
    }
  }
};
