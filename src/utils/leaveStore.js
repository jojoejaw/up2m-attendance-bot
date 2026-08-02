const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'leaves.json');

function getThailandDateString() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date());
}

class LeaveStore {
  constructor() {
    this.leavesMap = new Map();
    this.initStorage();
  }

  initStorage() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DATA_FILE)) {
        const rawData = fs.readFileSync(DATA_FILE, 'utf8');
        const parsed = JSON.parse(rawData || '{}');
        for (const [guildId, list] of Object.entries(parsed)) {
          this.leavesMap.set(guildId, list);
        }
      }
    } catch (err) {
      console.error('[LeaveStore Init Error]', err.message);
    }
  }

  saveToDisk() {
    try {
      const obj = {};
      for (const [guildId, list] of this.leavesMap.entries()) {
        obj[guildId] = list;
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err) {
      console.error('[LeaveStore Save Error]', err.message);
    }
  }

  getLeaves(guildId) {
    const list = this.leavesMap.get(guildId) || [];
    // Sort descending by created date
    return [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  addLeave(guildId, leaveData) {
    const list = this.leavesMap.get(guildId) || [];
    const newRecord = {
      id: `leave_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      guildId,
      userId: leaveData.userId,
      displayName: leaveData.displayName,
      username: leaveData.username,
      avatarUrl: leaveData.avatarUrl,
      roleName: leaveData.roleName || 'up2me',
      date: leaveData.date, // YYYY-MM-DD
      isFullDay: Boolean(leaveData.isFullDay),
      startTime: leaveData.startTime || null,
      endTime: leaveData.endTime || null,
      reason: leaveData.reason || 'ไม่ได้ระบุเหตุผล',
      createdAt: new Date().toISOString()
    };

    list.push(newRecord);
    this.leavesMap.set(guildId, list);
    this.saveToDisk();
    return newRecord;
  }

  isMemberOnLeaveToday(guildId, userId) {
    const todayStr = getThailandDateString();
    const list = this.getLeaves(guildId);
    return list.some(l => l.userId === userId && l.date === todayStr);
  }

  cancelLeave(guildId, leaveId) {
    const list = this.leavesMap.get(guildId) || [];
    const index = list.findIndex(l => l.id === leaveId);
    if (index === -1) return null;
    const [removed] = list.splice(index, 1);
    this.leavesMap.set(guildId, list);
    this.saveToDisk();
    return removed;
  }
}

module.exports = new LeaveStore();
