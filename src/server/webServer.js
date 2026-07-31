const express = require('express');
const cors = require('cors');
const path = require('path');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const attendanceStore = require('../utils/attendanceStore');
const { sendSafeDM } = require('../utils/dmSender');
const { sendAttendanceSummaryLog } = require('../utils/logger');
const config = require('../config.json');

const STATUS_ICONS = {
  PRESENT: '🟢 มา',
  LATE: '🟡 มาสาย',
  ABSENT: '🔴 ขาด'
};

function startWebServer(client) {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '../../public')));

  // GET /api/members - Open view for everyone, but STRICTLY Manager role only can edit
  app.get('/api/members', async (req, res) => {
    const { guildId, userId } = req.query;

    let guild = client.guilds.cache.get(guildId) || client.guilds.cache.first();
    if (!guild) {
      return res.status(404).json({ success: false, error: 'ไม่พบเซิร์ฟเวอร์ Discord' });
    }

    try {
      let allMembers = guild.members.cache;
      if (allMembers.size <= 1) {
        try {
          allMembers = await guild.members.fetch();
        } catch (fetchErr) {
          console.warn('[Web API Fetch Warning]', fetchErr.message);
          allMembers = guild.members.cache;
        }
      }

      const { LEADER_ROLE_ID, MANAGER_ROLE_ID, MEMBER_ROLE_ID, VISITOR_ROLE_ID } = config.roles;

      // Identify Current Logged-in Discord User
      let currentUserData = null;
      let canEdit = false;

      if (userId) {
        let currentMember = allMembers.get(userId);
        if (!currentMember) {
          currentMember = await guild.members.fetch(userId).catch(() => null);
        }
        if (currentMember) {
          const isManager = MANAGER_ROLE_ID && !MANAGER_ROLE_ID.includes('YOUR_') && currentMember.roles.cache.has(MANAGER_ROLE_ID);
          const isLeader = LEADER_ROLE_ID && !LEADER_ROLE_ID.includes('YOUR_') && currentMember.roles.cache.has(LEADER_ROLE_ID);
          const isVisitor = VISITOR_ROLE_ID && !VISITOR_ROLE_ID.includes('YOUR_') && currentMember.roles.cache.has(VISITOR_ROLE_ID);

          canEdit = Boolean(isManager);

          let userRoleName = 'สมาชิก';
          if (isLeader) userRoleName = 'หัวหน้า';
          else if (isManager) userRoleName = 'ผู้จัดการ';
          else if (isVisitor) userRoleName = 'บุคคลทั่วไป';

          currentUserData = {
            id: currentMember.id,
            displayName: currentMember.displayName || currentMember.user.username,
            avatarUrl: currentMember.user.displayAvatarURL({ dynamic: true, size: 128 }),
            roleName: userRoleName,
            canEdit: canEdit
          };
        }
      }

      // Default fallback profile if userId parameter was not passed
      if (!currentUserData) {
        const firstUser = allMembers.find(m => !m.user.bot) || allMembers.first();
        if (firstUser) {
          const isManager = MANAGER_ROLE_ID && !MANAGER_ROLE_ID.includes('YOUR_') && firstUser.roles.cache.has(MANAGER_ROLE_ID);
          canEdit = Boolean(isManager);

          let userRoleName = 'สมาชิก';
          if (isManager) userRoleName = 'ผู้จัดการ';
          else if (LEADER_ROLE_ID && firstUser.roles.cache.has(LEADER_ROLE_ID)) userRoleName = 'หัวหน้า';

          currentUserData = {
            id: firstUser.id,
            displayName: firstUser.displayName || firstUser.user.username,
            avatarUrl: firstUser.user.displayAvatarURL({ dynamic: true, size: 128 }),
            roleName: userRoleName,
            canEdit: canEdit
          };
        }
      }

      // Tracked roles for table
      const trackedRoleIds = [LEADER_ROLE_ID, MANAGER_ROLE_ID, MEMBER_ROLE_ID].filter(
        id => id && !id.includes('YOUR_')
      );

      const eligibleMembers = [];
      allMembers.forEach(m => {
        if (m.user.bot) return;

        // Explicitly exclude Visitor role from table rows
        const isVisitor = VISITOR_ROLE_ID && !VISITOR_ROLE_ID.includes('YOUR_') && m.roles.cache.has(VISITOR_ROLE_ID);
        if (isVisitor) return;

        const hasTrackedRole = trackedRoleIds.length > 0
          ? m.roles.cache.some(r => trackedRoleIds.includes(r.id))
          : true;

        if (hasTrackedRole) {
          let roleName = 'สมาชิก';
          let rolePriority = 3;

          if (LEADER_ROLE_ID && m.roles.cache.has(LEADER_ROLE_ID)) {
            roleName = 'หัวหน้า';
            rolePriority = 1;
          } else if (MANAGER_ROLE_ID && m.roles.cache.has(MANAGER_ROLE_ID)) {
            roleName = 'ผู้จัดการ';
            rolePriority = 2;
          }

          eligibleMembers.push({
            id: m.id,
            username: m.user.username,
            displayName: m.displayName || m.user.username,
            avatarUrl: m.user.displayAvatarURL({ dynamic: true, size: 128 }),
            roleName: roleName,
            rolePriority: rolePriority
          });
        }
      });

      // Sort strictly by Role Priority: 1. หัวหน้า -> 2. ผู้จัดการ -> 3. สมาชิก
      eligibleMembers.sort((a, b) => a.rolePriority - b.rolePriority);

      // Get or create session
      let session = attendanceStore.getSession(guild.id);
      if (!session) {
        session = attendanceStore.createSession(guild.id, eligibleMembers);
      } else {
        // Clean up any old mock members from session
        for (const [key] of session.members) {
          if (String(key).startsWith('mock_')) {
            session.members.delete(key);
          }
        }

        eligibleMembers.forEach(m => {
          if (!session.members.has(m.id)) {
            session.members.set(m.id, {
              id: m.id,
              user: m.user || { id: m.id, username: m.username },
              displayName: m.displayName,
              roleName: m.roleName,
              rolePriority: m.rolePriority,
              status: 'PENDING'
            });
          }
        });
      }

      const membersWithStatus = eligibleMembers.map(m => {
        const storedData = session.members.get(m.id);
        return {
          ...m,
          status: storedData ? storedData.status : 'PENDING'
        };
      });

      // 🔔 Get Last Notification Record
      const lastRecord = attendanceStore.getLastRecord(guild.id);
      let lastNotification = null;
      if (lastRecord && lastRecord.confirmedAt) {
        const confirmedTime = new Date(lastRecord.confirmedAt);
        const timeStr = confirmedTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        lastNotification = {
          time: `${timeStr} น.`,
          text: `บันทึกการเช็คชื่อครั้งล่าสุดสำเร็จ โดย ${lastRecord.confirmedBy || 'ผู้จัดการ'}`
        };
      }

      // 📄 Get Log Channel Info
      const summaryChannelId = config.channels.SUMMARY_LOG_CHANNEL_ID || config.channels.LOG_CHANNEL_ID;
      let logChannelInfo = {
        name: 'summary-log',
        url: '#'
      };
      if (summaryChannelId && !summaryChannelId.includes('YOUR_')) {
        const ch = client.channels.cache.get(summaryChannelId) || await client.channels.fetch(summaryChannelId).catch(() => null);
        if (ch) {
          logChannelInfo = {
            name: ch.name,
            url: `https://discord.com/channels/${guild.id}/${ch.id}`
          };
        }
      }

      res.json({
        success: true,
        guildId: guild.id,
        guildName: guild.name,
        guildIcon: guild.iconURL({ dynamic: true, size: 128 }),
        currentUser: currentUserData,
        members: membersWithStatus,
        lastNotification,
        logChannel: logChannelInfo
      });
    } catch (error) {
      console.error('[Web API Error]', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/attendance/submit
  app.post('/api/attendance/submit', async (req, res) => {
    const { guildId, managerName, attendanceData } = req.body;

    let guild = client.guilds.cache.get(guildId) || client.guilds.cache.first();
    if (!guild) {
      return res.status(404).json({ success: false, error: 'Guild not found' });
    }

    try {
      let session = attendanceStore.getSession(guild.id);
      if (!session) {
        return res.status(400).json({ success: false, error: 'No active session found' });
      }

      attendanceData.forEach(item => {
        attendanceStore.updateMemberStatus(guild.id, item.id, item.status);
      });

      const unchecked = attendanceStore.getUncheckedMembers(guild.id);
      if (unchecked.length > 0) {
        return res.status(400).json({
          success: false,
          error: `กรุณาเช็คชื่อสมาชิกให้ครบถ้วนก่อนกดยืนยัน! (ยังไม่ได้เช็คอีก ${unchecked.length} คน)`
        });
      }

      attendanceStore.confirmSession(guild.id, managerName || 'ผู้จัดการ (ผ่าน Web Dashboard)');
      const membersList = Array.from(session.members.values());

      let presentCount = 0;
      let lateCount = 0;
      let absentCount = 0;

      const summaryLines = membersList.map((m, idx) => {
        if (m.status === 'PRESENT') presentCount++;
        if (m.status === 'LATE') lateCount++;
        if (m.status === 'ABSENT') absentCount++;

        const icon = STATUS_ICONS[m.status];
        return `**#${idx + 1}** | \`[${m.roleName}]\` | ${m.displayName} ➔ **${icon}**`;
      });

      const nowFormatted = `<t:${Math.floor(Date.now() / 1000)}:F>`;

      let dmSuccessCount = 0;
      let dmFailCount = 0;
      const logoPath = path.join(__dirname, '../../public/assets/u2m_logo.png');

      for (const m of membersList) {
        const targetMember = guild.members.cache.get(m.id);
        if (targetMember) {
          const statusText = STATUS_ICONS[m.status];
          const logoAttachment = new AttachmentBuilder(logoPath, { name: 'u2m_logo.png' });

          const dmEmbed = new EmbedBuilder()
            .setTitle('แจ้งเตือนสถานะการเช็คชื่อ แฟม up2m')
            .setDescription(
              `**สวัสดีครับคุณ ${targetMember.user}!**\n\n` +
              `> 📊 **สถานะของคุณ**: \` ${statusText} \`\n` +
              `> 👔 **ผู้บันทึก**: \` ${managerName || 'ผู้จัดการ'} \`\n` +
              `> ⏰ **วันเวลาที่บันทึก**: ${nowFormatted}\n\n` +
              `✨ **ขอบคุณที่ร่วมมือในการเช็คชื่อ!**`
            )
            .setColor(m.status === 'PRESENT' ? 0x10b981 : m.status === 'LATE' ? 0xf1c40f : 0xe74c3c)
            .setThumbnail('attachment://u2m_logo.png')
            .setFooter({ text: '⚡ ระบบเช็คชื่อ แฟม up2m Notification' })
            .setTimestamp();

          const dmResult = await sendSafeDM(targetMember, { embeds: [dmEmbed], files: [logoAttachment] });
          if (dmResult.success) dmSuccessCount++;
          else dmFailCount++;
        }
      }

      await sendAttendanceSummaryLog(client, {
        managerName: managerName || 'ผู้จัดการ',
        totalMembers: membersList.length,
        presentCount,
        lateCount,
        absentCount,
        membersList
      });

      res.json({
        success: true,
        message: 'บันทึกการเช็คชื่อสำเร็จ! ส่ง DM และลง Log Channel เรียบร้อยแล้ว',
        summary: {
          present: presentCount,
          late: lateCount,
          absent: absentCount,
          total: membersList.length
        }
      });
    } catch (error) {
      console.error('[Web API Submit Error]', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.listen(PORT, () => {
    console.log(`🌐 [Web Server] Dashboard running on http://localhost:${PORT}`);
  });
}

module.exports = { startWebServer };
