/**
 * In-memory store for active attendance check-in sessions.
 * Key: Guild ID
 * Value: Session Object containing member statuses and state.
 */
class AttendanceStore {
  constructor() {
    this.activeSessions = new Map();
    this.confirmedRecords = new Map();
  }

  /**
   * Start a new attendance session for a guild.
   * Default status for all eligible members is 'PENDING' (⚪ ยังไม่ได้เช็ค)
   */
  createSession(guildId, eligibleMembers) {
    const membersMap = new Map();
    
    eligibleMembers.forEach(m => {
      membersMap.set(m.id, {
        id: m.id,
        user: m.user,
        displayName: m.displayName || m.user.username,
        roleName: m.roleName,
        status: 'PENDING' // 'PENDING' | 'PRESENT' | 'LATE' | 'ABSENT'
      });
    });

    const session = {
      guildId,
      createdAt: new Date(),
      members: membersMap,
      isConfirmed: false
    };

    this.activeSessions.set(guildId, session);
    return session;
  }

  /**
   * Get active session for a guild.
   */
  getSession(guildId) {
    return this.activeSessions.get(guildId);
  }

  /**
   * Update a member's attendance status in the active session.
   */
  updateMemberStatus(guildId, userId, status) {
    const session = this.activeSessions.get(guildId);
    if (!session) return false;

    const memberData = session.members.get(userId);
    if (memberData) {
      memberData.status = status;
      return true;
    }
    return false;
  }

  /**
   * Check if all members in the session have been checked.
   * Returns list of unchecked members if any.
   */
  getUncheckedMembers(guildId) {
    const session = this.activeSessions.get(guildId);
    if (!session) return [];

    const unchecked = [];
    session.members.forEach(m => {
      if (m.status === 'PENDING') {
        unchecked.push(m);
      }
    });

    return unchecked;
  }

  /**
   * Save confirmed session record.
   */
  confirmSession(guildId, managerId) {
    const session = this.activeSessions.get(guildId);
    if (!session) return null;

    session.isConfirmed = true;
    session.confirmedBy = managerId;
    session.confirmedAt = new Date();

    this.confirmedRecords.set(guildId, session);
    return session;
  }

  /**
   * Get last confirmed session record for a guild.
   */
  getLastRecord(guildId) {
    return this.confirmedRecords.get(guildId) || null;
  }
}

module.exports = new AttendanceStore();
