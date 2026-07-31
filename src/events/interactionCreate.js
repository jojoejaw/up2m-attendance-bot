const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
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
        if (interaction.customId === 'modal_create_announcement') {
          await interaction.deferReply({ ephemeral: false });

          const title = interaction.fields.getTextInputValue('ann_title');
          const message = interaction.fields.getTextInputValue('ann_message');
          const mentionInput = (interaction.fields.getTextInputValue('ann_mention') || 'none').toLowerCase().trim();

          const announcementStore = require('../utils/announcementStore');
          const announcementId = `ann_${Date.now()}`;
          announcementStore.createAnnouncement(announcementId, {
            title,
            message,
            authorId: interaction.user.id,
            authorName: interaction.member.displayName || interaction.user.username,
            channelId: interaction.channelId
          });

          const path = require('path');
          const logoPath = path.join(__dirname, '../../public/assets/u2m_logo.png');
          const logoAttachment = new AttachmentBuilder(logoPath, { name: 'u2m_logo.png' });

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
            .setThumbnail('attachment://u2m_logo.png')
            .setFooter({ text: '⚡ ระบบประกาศข่าวสาร แฟม up2m' })
            .setTimestamp();

          const btnAck = new ButtonBuilder()
            .setCustomId(`ack_${announcementId}`)
            .setLabel('🔔 กดรับทราบข่าวสาร')
            .setStyle(ButtonStyle.Success);

          const btnList = new ButtonBuilder()
            .setCustomId(`list_ack_${announcementId}`)
            .setLabel('📋 ดูรายชื่อผู้รับทราบ')
            .setStyle(ButtonStyle.Secondary);

          const row = new ActionRowBuilder().addComponents(btnAck, btnList);

          let contentPrefix = '';
          if (mentionInput === 'everyone') contentPrefix = '@everyone ';
          else if (mentionInput === 'here') contentPrefix = '@here ';

          return await interaction.editReply({
            content: contentPrefix.trim() ? contentPrefix.trim() : null,
            embeds: [embed],
            components: [row],
            files: [logoAttachment]
          });
        }
      }

      // 2. Handle Component Interactions (Buttons / Select Menus)
      if (!interaction.isMessageComponent()) return;

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

        // Update the main embed with new acknowledged count
        const oldEmbed = interaction.message.embeds[0];
        if (oldEmbed && ann) {
          const updatedEmbed = EmbedBuilder.from(oldEmbed)
            .setDescription(
              oldEmbed.description.replace(
                /> 👥 \*\*ยอดผู้รับทราบ\*\*: ` \d+ คน `/,
                `> 👥 **ยอดผู้รับทราบ**: \` ${ann.acknowledgedUsers.size} คน \``
              )
            );
          await interaction.message.edit({ embeds: [updatedEmbed] }).catch(() => {});
        }

        return await interaction.reply({
          content: `✅ **คุณ ${interaction.user} ได้กดรับทราบประกาศเรื่อง "${ann ? ann.title : 'ประกาศ'}" เรียบร้อยแล้ว!**`,
          ephemeral: true
        });
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
        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
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
