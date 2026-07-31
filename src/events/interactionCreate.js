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
      }

      // 2. Handle Component Interactions (Buttons / Select Menus)
      if (!interaction.isMessageComponent()) return;

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
