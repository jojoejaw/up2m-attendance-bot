const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { EmbedBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const attendanceStore = require('../utils/attendanceStore');
const leaveStore = require('../utils/leaveStore');
const { sendSafeDM } = require('../utils/dmSender');
const { sendAttendanceSummaryLog, sendLeaveLogToDiscord } = require('../utils/logger');
const config = require('../config.json');

const STATUS_ICONS = {
  PRESENT: '🟢 มา',
  LATE: '🟡 มาสาย',
  ABSENT: '🔴 ขาด',
  LEAVE: '🏖️ ลา'
};

function getThailandDateString() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date());
}

function startWebServer(client) {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(cors());
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ limit: '25mb', extended: true }));
  app.use(express.static(path.join(__dirname, '../../public')));

  // GET /api/health - Health check endpoint for uptime monitors and keep-alive
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'online',
      bot: client.user ? client.user.tag : 'Connecting...',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    });
  });

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

          canEdit = Boolean(isManager || isLeader);
          const userRoleName = canEdit ? 'manager up2me' : 'up2me';

          currentUserData = {
            id: currentMember.id,
            displayName: currentMember.displayName || currentMember.user.username,
            avatarUrl: currentMember.user.displayAvatarURL({ dynamic: true, size: 128 }),
            roleName: userRoleName,
            canEdit: canEdit
          };
        }
      }

      // Default fallback profile if userId parameter was not passed in URL
      if (!currentUserData) {
        const managerOrLeaderUser = allMembers.find(m => {
          if (m.user.bot) return false;
          const isMgr = MANAGER_ROLE_ID && !MANAGER_ROLE_ID.includes('YOUR_') && m.roles.cache.has(MANAGER_ROLE_ID);
          const isLdr = LEADER_ROLE_ID && !LEADER_ROLE_ID.includes('YOUR_') && m.roles.cache.has(LEADER_ROLE_ID);
          return isMgr || isLdr;
        }) || allMembers.find(m => !m.user.bot) || allMembers.first();

        if (managerOrLeaderUser) {
          const isMgr = MANAGER_ROLE_ID && !MANAGER_ROLE_ID.includes('YOUR_') && managerOrLeaderUser.roles.cache.has(MANAGER_ROLE_ID);
          const isLdr = LEADER_ROLE_ID && !LEADER_ROLE_ID.includes('YOUR_') && managerOrLeaderUser.roles.cache.has(LEADER_ROLE_ID);

          canEdit = Boolean(isMgr || isLdr);
          const userRoleName = canEdit ? 'manager up2me' : 'up2me';

          currentUserData = {
            id: managerOrLeaderUser.id,
            displayName: managerOrLeaderUser.displayName || managerOrLeaderUser.user.username,
            avatarUrl: managerOrLeaderUser.user.displayAvatarURL({ dynamic: true, size: 128 }),
            roleName: userRoleName,
            canEdit: canEdit
          };
        }
      }

      // Tracked roles for table (Only Supervisor and Member roles)
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
          const isMgr = MANAGER_ROLE_ID && !MANAGER_ROLE_ID.includes('YOUR_') && m.roles.cache.has(MANAGER_ROLE_ID);
          const isLdr = LEADER_ROLE_ID && !LEADER_ROLE_ID.includes('YOUR_') && m.roles.cache.has(LEADER_ROLE_ID);
          const hasManagerRole = Boolean(isMgr || isLdr);

          const roleName = hasManagerRole ? 'manager up2me' : 'up2me';
          const rolePriority = hasManagerRole ? 1 : 2;

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

      // Sort strictly by Role Priority: 1. manager up2me -> 2. up2me
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

      const todayStr = getThailandDateString();
      const todayLeaves = leaveStore.getLeaves(guild.id).filter(l => l.date === todayStr);

      const membersWithStatus = eligibleMembers.map(m => {
        const storedData = session.members.get(m.id);
        const leaveRecord = todayLeaves.find(l => l.userId === m.id);

        let status = storedData ? storedData.status : 'PENDING';
        if (leaveRecord) {
          status = 'LEAVE';
          if (storedData) storedData.status = 'LEAVE';
        }

        return {
          ...m,
          status,
          isOnLeave: Boolean(leaveRecord),
          leaveRecord: leaveRecord || null
        };
      });

      // Check if session was confirmed today
      let isTodayConfirmed = false;
      if (session && session.isConfirmed && session.confirmedAt) {
        const confirmedDate = new Date(session.confirmedAt).toDateString();
        const todayDate = new Date().toDateString();
        if (confirmedDate === todayDate) {
          isTodayConfirmed = true;
        } else {
          // Reset session for a new day if confirmed record was from a previous day
          session.isConfirmed = false;
          session.members.forEach(m => { m.status = 'PENDING'; });
        }
      }

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
        isConfirmedToday: Boolean(isTodayConfirmed),
        confirmedBy: session ? session.confirmedBy : null,
        confirmedAt: session ? session.confirmedAt : null,
        lastNotification,
        logChannel: logChannelInfo
      });
    } catch (error) {
      console.error('[Web API Error]', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/leaves - Fetch all leave records for guild
  app.get('/api/leaves', async (req, res) => {
    const { guildId } = req.query;
    let guild = client.guilds.cache.get(guildId) || client.guilds.cache.first();
    if (!guild) {
      return res.status(404).json({ success: false, error: 'ไม่พบเซิร์ฟเวอร์ Discord' });
    }

    try {
      const leaves = leaveStore.getLeaves(guild.id);
      res.json({ success: true, leaves });
    } catch (err) {
      console.error('[Get Leaves API Error]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/leaves/submit - Submit a new leave request
  app.post('/api/leaves/submit', async (req, res) => {
    const { guildId, userId, date, isFullDay, startTime, endTime, reason } = req.body;

    let guild = client.guilds.cache.get(guildId) || client.guilds.cache.first();
    if (!guild) {
      return res.status(404).json({ success: false, error: 'ไม่พบเซิร์ฟเวอร์ Discord' });
    }

    if (!date) {
      return res.status(400).json({ success: false, error: 'กรุณาเลือกวันที่ต้องการแจ้งลา' });
    }

    if (!isFullDay && (!startTime || !endTime)) {
      return res.status(400).json({ success: false, error: 'กรุณาเลือกช่วงเวลาเริ่มต้นและสิ้นสุดกรณีลาชั่วคราว' });
    }

    try {
      let requestingMember = null;
      if (userId) {
        requestingMember = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
      }
      if (!requestingMember) {
        requestingMember = guild.members.cache.find(m => !m.user.bot) || guild.members.cache.first();
      }

      const rolesConfig = config.roles;
      const isMgr = rolesConfig.MANAGER_ROLE_ID && !rolesConfig.MANAGER_ROLE_ID.includes('YOUR_') && requestingMember.roles.cache.has(rolesConfig.MANAGER_ROLE_ID);
      const isLdr = rolesConfig.LEADER_ROLE_ID && !rolesConfig.LEADER_ROLE_ID.includes('YOUR_') && requestingMember.roles.cache.has(rolesConfig.LEADER_ROLE_ID);
      const roleName = (isMgr || isLdr) ? 'manager up2me' : 'up2me';

      const leaveData = {
        userId: requestingMember ? requestingMember.id : 'unknown',
        displayName: requestingMember ? (requestingMember.displayName || requestingMember.user.username) : 'สมาชิก',
        username: requestingMember ? requestingMember.user.username : 'member',
        avatarUrl: requestingMember ? requestingMember.user.displayAvatarURL({ dynamic: true, size: 128 }) : 'https://cdn.discordapp.com/embed/avatars/0.png',
        roleName: roleName,
        date: date,
        isFullDay: Boolean(isFullDay),
        startTime: startTime || null,
        endTime: endTime || null,
        reason: (reason && reason.trim()) ? reason.trim() : 'ไม่ได้ระบุเหตุผล'
      };

      // Add to store
      const newRecord = leaveStore.addLeave(guild.id, leaveData);

      // If leave is for today, update active attendance session immediately
      const todayStr = getThailandDateString();
      if (date === todayStr) {
        const session = attendanceStore.getSession(guild.id);
        if (session && session.members && session.members.has(newRecord.userId)) {
          session.members.get(newRecord.userId).status = 'LEAVE';
        }
      }

      // Send Embed log to Discord Channel (ID: 1533520647831945417)
      await sendLeaveLogToDiscord(client, newRecord).catch(err => console.error('[Leave Log Send Error]', err));

      res.json({ success: true, message: 'ยื่นใบลาเรียบร้อยแล้ว!', record: newRecord });
    } catch (err) {
      console.error('[Submit Leave Error]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/leaves/cancel - Cancel/Delete a leave request
  app.post('/api/leaves/cancel', async (req, res) => {
    const { guildId, leaveId, userId } = req.body;

    let guild = client.guilds.cache.get(guildId) || client.guilds.cache.first();
    if (!guild) {
      return res.status(404).json({ success: false, error: 'ไม่พบเซิร์ฟเวอร์ Discord' });
    }

    if (!leaveId || !userId) {
      return res.status(400).json({ success: false, error: 'ข้อมูลไม่ครบถ้วน' });
    }

    try {
      const leaves = leaveStore.getLeaves(guild.id);
      const targetLeave = leaves.find(l => l.id === leaveId);

      if (!targetLeave) {
        return res.status(404).json({ success: false, error: 'ไม่พบรายการใบลานี้' });
      }

      // Check permission: only the leave owner or manager can cancel
      const rolesConfig = config.roles;
      let requestingMember = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
      const isMgr = requestingMember && rolesConfig.MANAGER_ROLE_ID && !rolesConfig.MANAGER_ROLE_ID.includes('YOUR_') && requestingMember.roles.cache.has(rolesConfig.MANAGER_ROLE_ID);
      const isLdr = requestingMember && rolesConfig.LEADER_ROLE_ID && !rolesConfig.LEADER_ROLE_ID.includes('YOUR_') && requestingMember.roles.cache.has(rolesConfig.LEADER_ROLE_ID);

      const isOwner = (targetLeave.userId === userId);
      const canCancel = isOwner || isMgr || isLdr;

      if (!canCancel) {
        return res.status(403).json({ success: false, error: '🔒 คุณสามารถยกเลิกได้เฉพาะใบลาของคุณเองเท่านั้น' });
      }

      const cancelled = leaveStore.cancelLeave(guild.id, leaveId);

      // If the cancelled leave was for today, reset user's status in active attendance session
      const todayStr = getThailandDateString();
      if (targetLeave.date === todayStr) {
        const session = attendanceStore.getSession(guild.id);
        if (session && session.members && session.members.has(targetLeave.userId)) {
          const mData = session.members.get(targetLeave.userId);
          if (mData.status === 'LEAVE') {
            mData.status = 'PENDING';
          }
        }
      }

      res.json({ success: true, message: 'ยกเลิกใบลาเรียบร้อยแล้ว!', record: cancelled });
    } catch (err) {
      console.error('[Cancel Leave Error]', err);
      res.status(500).json({ success: false, error: err.message });
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

      // Map previous statuses before applying new attendance data to detect changes
      const previousStatuses = new Map();
      if (session && session.members) {
        session.members.forEach((val, key) => {
          previousStatuses.set(key, val.status);
        });
      }

      const wasAlreadyConfirmed = Boolean(session.isConfirmed && session.confirmedAt && (new Date(session.confirmedAt).toDateString() === new Date().toDateString()));

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

      membersList.forEach((m) => {
        if (m.status === 'PRESENT') presentCount++;
        if (m.status === 'LATE') lateCount++;
        if (m.status === 'ABSENT') absentCount++;
      });

      const nowUnix = Math.floor(Date.now() / 1000);
      const nowFormatted = `<t:${nowUnix}:F>`;
      const todayDateFormatted = `<t:${nowUnix}:d>`;

      let dmSuccessCount = 0;
      let dmFailCount = 0;
      const logoPath = path.join(__dirname, '../../public/assets/u2m_logo.png');

      const dmTitle = wasAlreadyConfirmed 
        ? '📢 [แก้ไขข้อมูล] แจ้งเตือนสถานะการเช็คชื่อ แฟม up2m' 
        : '📢 แจ้งเตือนสถานะการเช็คชื่อ แฟม up2m';

      const dmHeaderNote = wasAlreadyConfirmed 
        ? `> ⚠️ **หมายเหตุ**: มีการแก้ไขการเช็คชื่อประจำวันที่ ${todayDateFormatted}\n` 
        : '';

      for (const m of membersList) {
        const oldStatus = previousStatuses.get(m.id);
        const isStatusChanged = oldStatus !== m.status;

        // When editing: ONLY send DM to members whose status was actually changed!
        if (wasAlreadyConfirmed && !isStatusChanged) {
          continue;
        }

        const targetMember = guild.members.cache.get(m.id);
        if (targetMember) {
          const statusText = STATUS_ICONS[m.status];
          const logoAttachment = new AttachmentBuilder(logoPath, { name: 'u2m_logo.png' });

          const dmEmbed = new EmbedBuilder()
            .setTitle(dmTitle)
            .setDescription(
              `**สวัสดีครับคุณ ${targetMember.user}!**\n\n` +
              `> 📊 **สถานะของคุณ**: \` ${statusText} \`\n` +
              `> 👔 **ผู้บันทึก**: \` ${managerName || 'ผู้จัดการ'} ${wasAlreadyConfirmed ? '(แก้ไขข้อมูล)' : ''} \`\n` +
              `> ⏰ **เวลาที่บันทึก**: ${nowFormatted}\n` +
              dmHeaderNote + `\n` +
              `✨ **ขอบคุณที่ร่วมมือในการเช็คชื่อ!**`
            )
            .setColor(wasAlreadyConfirmed ? 0xf59e0b : (m.status === 'PRESENT' ? 0x10b981 : m.status === 'LATE' ? 0xf1c40f : 0xe74c3c))
            .setThumbnail('attachment://u2m_logo.png')
            .setFooter({ text: wasAlreadyConfirmed ? '⚡ ระบบเช็คชื่อ แฟม up2m Notification (แก้ไขข้อมูล)' : '⚡ ระบบเช็คชื่อ แฟม up2m Notification' })
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
        membersList,
        isEdit: wasAlreadyConfirmed
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

  // API Endpoint: Submit Announcement from Web Dashboard
  app.post('/api/announcements/submit', async (req, res) => {
    try {
      const { guildId, userId, title, message, imageUrl, imageBase64, mentions, sendDm, dmOnly, announcementType } = req.body;
      const isDmOnly = Boolean(dmOnly);

      if (!title || !message) {
        return res.status(400).json({ success: false, error: 'กรุณากรอกหัวข้อและรายละเอียดข่าวสาร' });
      }

      const guild = client.guilds.cache.get(guildId) || client.guilds.cache.first();
      if (!guild) {
        return res.status(404).json({ success: false, error: 'Guild not found' });
      }

      const rolesConfig = config.roles;

      // Check user permissions
      let isManager = false;
      let authorDisplayName = 'ผู้จัดการ';
      let currentMember = null;

      if (userId) {
        currentMember = guild.members.cache.get(userId);
        if (!currentMember) {
          currentMember = await guild.members.fetch(userId).catch(() => null);
        }
      }

      // Fallback if userId was not provided (e.g. accessing http://localhost:3000 directly)
      if (!currentMember) {
        currentMember = guild.members.cache.find(m => {
          if (m.user.bot) return false;
          const managerRoleId = rolesConfig.MANAGER_ROLE_ID;
          const leaderRoleId = rolesConfig.LEADER_ROLE_ID;
          const hasMgr = managerRoleId && !managerRoleId.includes('YOUR_') && m.roles.cache.has(managerRoleId);
          const hasLdr = leaderRoleId && !leaderRoleId.includes('YOUR_') && m.roles.cache.has(leaderRoleId);
          return hasMgr || hasLdr;
        }) || guild.members.cache.find(m => !m.user.bot) || guild.members.cache.first();
      }

      if (currentMember) {
        authorDisplayName = currentMember.displayName || currentMember.user.username;
        const managerRoleId = rolesConfig.MANAGER_ROLE_ID;
        const leaderRoleId = rolesConfig.LEADER_ROLE_ID;
        const hasManagerRole = managerRoleId && !managerRoleId.includes('YOUR_') && currentMember.roles.cache.has(managerRoleId);
        const hasLeaderRole = leaderRoleId && !leaderRoleId.includes('YOUR_') && currentMember.roles.cache.has(leaderRoleId);
        isManager = Boolean(hasManagerRole || hasLeaderRole);
      }

      if (!isManager) {
        return res.status(403).json({ success: false, error: 'คุณไม่มีสิทธิ์ส่งประกาศข่าวสาร (เฉพาะหัวหน้า/ผู้จัดการเท่านั้น)' });
      }

      // Identify channel to post announcement (Target Channel ID: 1532754442540159027)
      let targetChannel = null;
      const annChannelId = config.channels ? config.channels.ANNOUNCEMENT_CHANNEL_ID : null;
      if (annChannelId && !annChannelId.includes('YOUR_')) {
        targetChannel = guild.channels.cache.get(annChannelId);
      }
      if (!targetChannel) {
        const commandChannelId = config.channels ? config.channels.BOT_COMMAND_CHANNEL_ID : null;
        if (commandChannelId && !commandChannelId.includes('YOUR_')) {
          targetChannel = guild.channels.cache.get(commandChannelId);
        }
      }
      if (!targetChannel) {
        targetChannel = guild.channels.cache.find(c => c.isTextBased() && c.permissionsFor(guild.members.me).has('SendMessages'));
      }

      if (!targetChannel) {
        return res.status(500).json({ success: false, error: 'ไม่พบช่องสำหรับส่งประกาศใน Discord' });
      }

      // Compile Mention string
      const mentionParts = [];
      if (Array.isArray(mentions)) {
        mentions.forEach(m => {
          if (m === 'everyone') mentionParts.push('@everyone');
          else if (m === 'here') mentionParts.push('@here');
          else if (m === 'manager' && rolesConfig.MANAGER_ROLE_ID && !rolesConfig.MANAGER_ROLE_ID.includes('YOUR_')) mentionParts.push(`<@&${rolesConfig.MANAGER_ROLE_ID}>`);
          else if (m === 'leader' && rolesConfig.LEADER_ROLE_ID && !rolesConfig.LEADER_ROLE_ID.includes('YOUR_')) mentionParts.push(`<@&${rolesConfig.LEADER_ROLE_ID}>`);
          else if (m === 'member' && rolesConfig.MEMBER_ROLE_ID && !rolesConfig.MEMBER_ROLE_ID.includes('YOUR_')) mentionParts.push(`<@&${rolesConfig.MEMBER_ROLE_ID}>`);
        });
      }

      // Determine announcement styling & badge based on announcementType
      let typeLabel = '📢 ประกาศทั่วไป';
      let embedColor = 0x7c3aed; // Purple for GENERAL
      let authorHeader = '📢 ประกาศข่าวสาร • U2M Family';
      let footerTag = '⚡ ระบบประกาศข่าวสาร แฟม up2m';
      let dmContentPrefix = '📢 **มีประกาศข่าวสารใหม่จากแฟม U2M ถึงคุณโดยเฉพาะ**';

      if (announcementType === 'URGENT') {
        typeLabel = '🚨 ประกาศเร่งด่วน';
        embedColor = 0xef4444; // Vibrant Red
        authorHeader = '🚨 ประกาศเร่งด่วน • U2M Family';
        footerTag = '⚡ ระบบประกาศข่าวสาร แฟม up2m • Urgent Notice';
        dmContentPrefix = '🚨 **[ประกาศเร่งด่วน] มีประกาศสำคัญมากถึงคุณโดยเฉพาะ!**';
      } else if (announcementType === 'EMPHASIS') {
        typeLabel = '📌 เน้นย้ำ';
        embedColor = 0xf59e0b; // Amber Gold
        authorHeader = '📌 ประกาศเน้นย้ำ • U2M Family';
        footerTag = '⚡ ระบบประกาศข่าวสาร แฟม up2m • Important Notice';
        dmContentPrefix = '📌 **[เน้นย้ำ] มีประกาศสำคัญโปรดอ่านและปฏิบัติตาม**';
      }

      // Create Announcement Record in Store
      const announcementStore = require('../utils/announcementStore');
      const announcementId = `ann_${Date.now()}`;
      announcementStore.createAnnouncement(announcementId, {
        title,
        message,
        imageUrl,
        announcementType: announcementType || 'GENERAL',
        authorId: userId,
        authorName: authorDisplayName,
        channelId: targetChannel.id
      });

      // Prepare U2M Logo Attachment
      const logoPath = path.join(__dirname, '../../public/assets/u2m_logo.png');
      const filesToSend = [];
      const unixTime = Math.floor(Date.now() / 1000);
      const authorMention = userId ? `<@${userId}>` : `\`${authorDisplayName}\``;

      const embed = new EmbedBuilder()
        .setAuthor({
          name: authorHeader,
          iconURL: 'attachment://u2m_logo.png'
        })
        .setTitle(title)
        .setDescription(
          `${message}\n\n` +
          `────────────────────\n` +
          `• 🏷️ **ประเภทประกาศ**: \` ${typeLabel} \`\n` +
          `• 👔 **ผู้ประกาศ**: ${authorMention}\n` +
          `• 📅 **วันที่**: <t:${unixTime}:d>\n` +
          `• ⏰ **เวลา**: <t:${unixTime}:t>`
        )
        .setColor(embedColor)
        .setFooter({ text: footerTag })
        .setTimestamp();

      if (fs.existsSync(logoPath)) {
        const logoAttachment = new AttachmentBuilder(logoPath, { name: 'u2m_logo.png' });
        filesToSend.push(logoAttachment);
        embed.setThumbnail('attachment://u2m_logo.png');
      }

      // Handle Image: Convert base64 to AttachmentBuilder or use HTTP URL
      if (imageBase64 && typeof imageBase64 === 'string' && imageBase64.startsWith('data:image')) {
        const matches = imageBase64.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
        if (matches) {
          const ext = matches[1];
          const buffer = Buffer.from(matches[2], 'base64');
          const annImageAttachment = new AttachmentBuilder(buffer, { name: `announcement_image.${ext}` });
          filesToSend.push(annImageAttachment);
          embed.setImage(`attachment://announcement_image.${ext}`);
        }
      } else if (imageUrl && imageUrl.trim()) {
        embed.setImage(imageUrl.trim());
      }

      const contentPrefix = mentionParts.length > 0 ? mentionParts.join(' ') : null;

      // Send to Discord Channel ONLY if not dmOnly mode
      if (!isDmOnly && targetChannel) {
        await targetChannel.send({
          content: contentPrefix,
          embeds: [embed],
          files: filesToSend
        });
      }

      let dmSentCount = 0;
      let dmFailCount = 0;

      if (sendDm || isDmOnly) {
        try {
          const teamRoleIds = [
            rolesConfig.LEADER_ROLE_ID,
            rolesConfig.MANAGER_ROLE_ID,
            rolesConfig.MEMBER_ROLE_ID
          ].filter(rId => rId && !rId.includes('YOUR_'));

          const allMembers = await guild.members.fetch();
          const teamMembers = allMembers.filter(m => 
            !m.user.bot && m.roles.cache.some(r => teamRoleIds.includes(r.id))
          );

          for (const [_, member] of teamMembers) {
            try {
              const dmFiles = [];
              const logoPath = path.join(__dirname, '../../public/assets/u2m_logo.png');
              if (fs.existsSync(logoPath)) {
                dmFiles.push(new AttachmentBuilder(logoPath, { name: 'u2m_logo.png' }));
              }
              if (imageBase64 && typeof imageBase64 === 'string' && imageBase64.startsWith('data:image')) {
                const matches = imageBase64.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
                if (matches) {
                  const ext = matches[1];
                  const buffer = Buffer.from(matches[2], 'base64');
                  dmFiles.push(new AttachmentBuilder(buffer, { name: `announcement_image.${ext}` }));
                }
              }

              await member.send({
                content: dmContentPrefix,
                embeds: [embed],
                files: dmFiles
              });
              dmSentCount++;
            } catch (dmErr) {
              console.log(`[DM Send Failed] Could not send to ${member.user.tag}: ${dmErr.message}`);
              dmFailCount++;
            }
          }
        } catch (fetchErr) {
          console.error('[Fetch Members for DM Error]', fetchErr);
        }
      }

      let responseMsg = isDmOnly
        ? `ส่งประกาศแบบ DM ส่วนตัวถึงสมาชิกสำเร็จ ${dmSentCount} คน! (ไม่ได้ส่งลงช่องประกาศ Discord)`
        : 'ส่งประกาศข่าวสารลง Discord เรียบร้อยแล้ว!';

      if (!isDmOnly && sendDm) {
        responseMsg += ` (ส่ง DM ถึงสมาชิกในทีมสำเร็จ ${dmSentCount} คน${dmFailCount > 0 ? `, ล้มเหลว ${dmFailCount} คน` : ''})`;
      }

      res.json({
        success: true,
        message: responseMsg
      });

    } catch (error) {
      console.error('[Web Announcement Submit Error]', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/members/send-dm (Send direct DM to individual member)
  app.post('/api/members/send-dm', async (req, res) => {
    try {
      const { guildId, senderUserId, targetUserId, message, imageUrl, imageBase64 } = req.body;

      if (!targetUserId || !message) {
        return res.status(400).json({ success: false, error: 'กรุณากรอกข้อความที่ต้องการส่ง' });
      }

      const guild = client.guilds.cache.get(guildId) || client.guilds.cache.first();
      if (!guild) {
        return res.status(404).json({ success: false, error: 'Guild not found' });
      }

      // Check permission: sender must be Supervisor (ผู้ดูแล)
      let senderMember = senderUserId ? guild.members.cache.get(senderUserId) : null;
      if (!senderMember && senderUserId) {
        senderMember = await guild.members.fetch(senderUserId).catch(() => null);
      }

      let isSupervisor = false;
      let senderName = 'ผู้ดูแล';
      if (senderMember) {
        senderName = senderMember.displayName || senderMember.user.username;
        const rolesConfig = config.roles;
        const isMgr = rolesConfig.MANAGER_ROLE_ID && !rolesConfig.MANAGER_ROLE_ID.includes('YOUR_') && senderMember.roles.cache.has(rolesConfig.MANAGER_ROLE_ID);
        const isLdr = rolesConfig.LEADER_ROLE_ID && !rolesConfig.LEADER_ROLE_ID.includes('YOUR_') && senderMember.roles.cache.has(rolesConfig.LEADER_ROLE_ID);
        isSupervisor = Boolean(isMgr || isLdr);
      } else {
        isSupervisor = true;
      }

      if (!isSupervisor) {
        return res.status(403).json({ success: false, error: 'เฉพาะยศผู้ดูแลเท่านั้นที่มีสิทธิ์ส่ง DM รายบุคคล' });
      }

      if (targetUserId && String(targetUserId).startsWith('mock_')) {
        return res.json({ success: true, message: 'ส่งข้อความ DM ถึงสมาชิกจำลองสำเร็จแล้ว! (Simulated)' });
      }

      const targetMember = guild.members.cache.get(targetUserId) || await guild.members.fetch(targetUserId).catch(() => null);
      if (!targetMember) {
        return res.status(404).json({ success: false, error: 'ไม่พบสมาชิกปลายทางใน Discord' });
      }

      const filesToSend = [];
      const logoPath = path.join(__dirname, '../../public/assets/u2m_logo.png');
      if (fs.existsSync(logoPath)) {
        filesToSend.push(new AttachmentBuilder(logoPath, { name: 'u2m_logo.png' }));
      }

      const unixTime = Math.floor(Date.now() / 1000);
      const dmEmbed = new EmbedBuilder()
        .setAuthor({ name: '📩 ข้อความส่วนตัว • U2M Family', iconURL: 'attachment://u2m_logo.png' })
        .setTitle('ข้อความแจ้งเตือนส่วนตัวจากผู้ดูแล')
        .setDescription(
          `**สวัสดีครับคุณ ${targetMember.user}!**\n\n` +
          `${message}\n\n` +
          `────────────────────\n` +
          `• 👔 **ผู้ส่ง**: \` ${senderName} (ผู้ดูแล) \`\n` +
          `• ⏰ **เวลาที่ส่ง**: <t:${unixTime}:F>`
        )
        .setColor(0x7c3aed)
        .setThumbnail('attachment://u2m_logo.png')
        .setFooter({ text: '⚡ ระบบส่งข้อความส่วนตัว แฟม up2m' })
        .setTimestamp();

      if (imageBase64 && typeof imageBase64 === 'string' && imageBase64.startsWith('data:image')) {
        const matches = imageBase64.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
        if (matches) {
          const ext = matches[1];
          const buffer = Buffer.from(matches[2], 'base64');
          const imgAttachment = new AttachmentBuilder(buffer, { name: `dm_image.${ext}` });
          filesToSend.push(imgAttachment);
          dmEmbed.setImage(`attachment://dm_image.${ext}`);
        }
      } else if (imageUrl && imageUrl.trim()) {
        dmEmbed.setImage(imageUrl.trim());
      }

      const dmResult = await sendSafeDM(targetMember, {
        content: `📩 **มีข้อความส่วนตัวจากทีมผู้ดูแลถึงคุณ**`,
        embeds: [dmEmbed],
        files: filesToSend
      });

      if (dmResult.success) {
        res.json({ success: true, message: `ส่งข้อความ DM ถึง ${targetMember.displayName} เรียบร้อยแล้ว!` });
      } else {
        res.status(400).json({ success: false, error: `ไม่สามารถส่ง DM หา ${targetMember.displayName} ได้ (${dmResult.reason || 'ปิดรับ DM หรือบล็อกบอท'})` });
      }
    } catch (err) {
      console.error('[Send Individual DM Error]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.listen(PORT, () => {
    console.log(`🌐 [Web Server] Dashboard running on http://localhost:${PORT}`);

    // Self-Ping Heartbeat to prevent Render free instance from going to sleep
    const selfUrl = process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL;
    if (selfUrl) {
      const httpLib = selfUrl.startsWith('https') ? require('https') : require('http');
      setInterval(() => {
        httpLib.get(`${selfUrl}/api/health`, (res) => {
          console.log(`💓 [Self-Ping Heartbeat] Keep-alive ping sent to ${selfUrl}/api/health (Status: ${res.statusCode})`);
        }).on('error', (err) => {
          console.warn(`⚠️ [Self-Ping Warning] ${err.message}`);
        });
      }, 8 * 60 * 1000); // Heartbeat every 8 minutes
    }
  });
}

module.exports = { startWebServer };
