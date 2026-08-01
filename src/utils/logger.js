const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const path = require('path');
const config = require('../config.json');

/**
 * Helper to fetch a channel by ID safely
 */
async function getChannel(client, channelId) {
  if (!channelId || channelId.includes('YOUR_')) return null;
  return await client.channels.fetch(channelId).catch(() => null);
}

/**
 * 📢 1. Send Daily Attendance Summary Log to Channel 2 (SUMMARY_LOG_CHANNEL_ID)
 */
async function sendAttendanceSummaryLog(client, { managerName, totalMembers, presentCount, lateCount, absentCount, membersList, isEdit = false }) {
  const summaryChannelId = config.channels.SUMMARY_LOG_CHANNEL_ID || config.channels.LOG_CHANNEL_ID;
  const channel = await getChannel(client, summaryChannelId);

  // Status Icons
  const STATUS_ICONS = {
    PRESENT: '🟢 มา',
    LATE: '🟡 มาสาย',
    ABSENT: '🔴 ขาด'
  };

  const ROLE_PRIORITY = {
    'manager up2me': 1,
    'up2me': 2
  };

  const sortedMembers = [...membersList].sort((a, b) => {
    const prioA = a.rolePriority || ROLE_PRIORITY[a.roleName] || 99;
    const prioB = b.rolePriority || ROLE_PRIORITY[b.roleName] || 99;
    return prioA - prioB;
  });

  // Build full list of all members with their check-in status (manager up2me -> up2me)
  const memberListFormatted = sortedMembers.map((m, idx) => {
    const icon = STATUS_ICONS[m.status] || '⚪ ยังไม่ระบุ';
    const paddedIndex = String(idx + 1).padStart(2, '0');
    return `\`${paddedIndex}.\` \`[ ${m.roleName || 'up2me'} ]\` \`${m.displayName}\` ➔ \`${icon}\``;
  }).join('\n');

  const nowUnix = Math.floor(Date.now() / 1000);
  const nowFormatted = `<t:${nowUnix}:F>`;
  const todayDateFormatted = `<t:${nowUnix}:d>`;
  const logoPath = path.join(__dirname, '../../public/assets/u2m_logo.png');
  const logoAttachment = new AttachmentBuilder(logoPath, { name: 'u2m_logo.png' });

  const titleText = isEdit 
    ? '📋 [แก้ไขข้อมูล] รายงานการเช็คชื่อ แฟม up2m ประจำวัน'
    : '📋 รายงานการเช็คชื่อ แฟม up2m ประจำวัน';

  const managerLabel = isEdit ? 'ผู้ปรับปรุงแก้ไข' : 'ผู้บันทึก';
  const editNote = isEdit ? `> ⚠️ **หมายเหตุ**: มีการแก้ไขการเช็คชื่อประจำวันที่ ${todayDateFormatted}\n` : '';

  const embed = new EmbedBuilder()
    .setTitle(titleText)
    .setDescription(
      `> **${managerLabel}**: **${managerName}**\n` +
      `> ⏰ **เวลาที่บันทึก**: ${nowFormatted}\n` +
      editNote + `\n` +
      `📊 **สรุปภาพรวมการเช็คชื่อ**:\n` +
      `> • สมาชิกทั้งหมด: \` ${totalMembers} คน \`\n` +
      `> • 🟢 มา: \` ${presentCount} คน \`\n` +
      `> • 🟡 มาสาย: \` ${lateCount} คน \`\n` +
      `> • 🔴 ขาด: \` ${absentCount} คน \`\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📄 **รายชื่อสมาชิกและสถานะการเช็คชื่อ**:\n\n` +
      memberListFormatted
    )
    .setColor(isEdit ? 0xf59e0b : 0x7c3aed)
    .setThumbnail('attachment://u2m_logo.png')
    .setTimestamp()
    .setFooter({ text: isEdit ? '⚡ ระบบเช็คชื่อ แฟม up2m Summary Report (แก้ไขข้อมูล)' : '⚡ ระบบเช็คชื่อ แฟม up2m Summary Report' });

  if (channel) {
    await channel.send({ embeds: [embed], files: [logoAttachment] }).catch(err => console.error('[Summary Log Error]', err.message));
  } else {
    console.log(`[Summary Log Simulated] Manager ${managerName} confirmed attendance (isEdit: ${isEdit}) for ${totalMembers} members.`);
  }
}

/**
 * 🛡️ 2. Send Role Assignment Audit Log to Channel 3 (ROLE_AUDIT_LOG_CHANNEL_ID)
 */
async function sendRoleAuditLog(client, { targetMember, role, action = 'ADDED', dmStatus }) {
  const auditChannelId = config.channels.ROLE_AUDIT_LOG_CHANNEL_ID || config.channels.LOG_CHANNEL_ID;
  const channel = await getChannel(client, auditChannelId);

  const isAdded = action === 'ADDED';
  const title = isAdded ? '🛡️ [LOG] มีการมอบยศตำแหน่งใหม่' : '🛡️ [LOG] มีการปลด/ถอดยศตำแหน่ง';
  const color = isAdded ? 0x2ecc71 : 0xe74c3c;
  const nowFormatted = `<t:${Math.floor(Date.now() / 1000)}:F>`;
  const logoPath = path.join(__dirname, '../../public/assets/u2m_logo.png');
  const logoAttachment = new AttachmentBuilder(logoPath, { name: 'u2m_logo.png' });

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(
      `> 👤 **สมาชิก**: ${targetMember.user} (\`${targetMember.user.tag}\`)\n` +
      `> 🛡️ **ยศตำแหน่ง**: \` [ ${role.name} ] \`\n` +
      `> ⏰ **เวลาที่ดำเนินการ**: ${nowFormatted}\n` +
      `> 📩 **การแจ้งเตือน DM**: \` ${dmStatus ? '✅ ส่ง DM สำเร็จ' : '⚠️ ปิด DM หรือส่งไม่สำเร็จ'} \``
    )
    .setColor(color)
    .setThumbnail('attachment://u2m_logo.png')
    .setTimestamp()
    .setFooter({ text: '⚡ ระบบเช็คชื่อ แฟม up2m Role Audit Logger' });

  if (channel) {
    await channel.send({ embeds: [embed], files: [logoAttachment] }).catch(err => console.error('[Role Log Error]', err.message));
  } else {
    console.log(`[Role Audit Log Simulated] ${targetMember.user.tag} -> ${role.name} (${action})`);
  }
}

module.exports = {
  sendAttendanceSummaryLog,
  sendRoleAuditLog
};
