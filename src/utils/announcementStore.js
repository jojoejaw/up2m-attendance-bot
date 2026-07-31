/**
 * In-Memory Store for U2M Family Announcements & User Drafts
 */
class AnnouncementStore {
  constructor() {
    this.announcements = new Map(); // id -> { id, title, message, imageUrl, authorId, authorName, channelId, createdAt, acknowledgedUsers: Set }
    this.drafts = new Map(); // userId -> { title, message, imageUrl, mentions: [] }
  }

  setDraft(userId, draftData) {
    const existing = this.drafts.get(userId) || { mentions: [] };
    this.drafts.set(userId, { ...existing, ...draftData });
    return this.drafts.get(userId);
  }

  getDraft(userId) {
    return this.drafts.get(userId);
  }

  clearDraft(userId) {
    this.drafts.delete(userId);
  }

  createAnnouncement(id, data) {
    const record = {
      id,
      title: data.title,
      message: data.message,
      imageUrl: data.imageUrl || null,
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
