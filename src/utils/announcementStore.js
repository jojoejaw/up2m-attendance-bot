/**
 * In-Memory Store for U2M Family Announcements
 */
class AnnouncementStore {
  constructor() {
    this.announcements = new Map(); // id -> { id, title, message, authorId, authorName, channelId, createdAt, acknowledgedUsers: Set }
  }

  createAnnouncement(id, data) {
    const record = {
      id,
      title: data.title,
      message: data.message,
      authorId: data.authorId,
      authorName: data.authorName,
      channelId: data.channelId,
      createdAt: new Date(),
      acknowledgedUsers: new Set()
    };
    this.announcements.set(id, record);
    return record;
  }

  getAnnouncement(id) {
    return this.announcements.get(id);
  }

  acknowledge(id, userId) {
    const ann = this.announcements.get(id);
    if (!ann) return { success: false, reason: 'NOT_FOUND' };
    if (ann.acknowledgedUsers.has(userId)) {
      return { success: false, reason: 'ALREADY_ACKNOWLEDGED' };
    }
    ann.acknowledgedUsers.add(userId);
    return { success: true, count: ann.acknowledgedUsers.size };
  }
}

module.exports = new AnnouncementStore();
