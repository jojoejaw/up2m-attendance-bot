/**
 * 📌 DC Check-In Web Dashboard Frontend Script
 * Compact Single-Line Clean Footer Bar
 */

let membersData = [];
let guildId = new URLSearchParams(window.location.search).get('guildId') || '';
let userId = new URLSearchParams(window.location.search).get('userId') || '';
let currentUser = null;
let canEdit = false;
let isConfirmedToday = false;
let isEditMode = false;

// DOM Elements
const serverName = document.getElementById('serverName');
const currentDateSub = document.getElementById('currentDateSub');
const memberRowsList = document.getElementById('memberRowsList');
const liveClock = document.getElementById('liveClock');

// Sidebar User Profile DOM Elements
const sidebarUserAvatar = document.getElementById('sidebarUserAvatar');
const sidebarUserName = document.getElementById('sidebarUserName');
const sidebarUserRole = document.querySelector('.user-role-badge');

const valTotal = document.getElementById('valTotal');
const valPending = document.getElementById('valPending');
const valPresent = document.getElementById('valPresent');
const valLate = document.getElementById('valLate');
const valAbsent = document.getElementById('valAbsent');

const checkedCountText = document.getElementById('checkedCountText');
const bannerStatusText = document.getElementById('bannerStatusText');

const managerNameInput = document.getElementById('managerNameInput');
const btnSubmitAttendance = document.getElementById('btnSubmitAttendance');
const btnCancelEditAttendance = document.getElementById('btnCancelEditAttendance');
const btnRefresh = document.getElementById('btnRefresh');

const btnCheckAllPresent = document.getElementById('btnCheckAllPresent');
const btnResetAllStatus = document.getElementById('btnResetAllStatus');
const btnUpdateMemberList = document.getElementById('btnUpdateMemberList');

const successModal = document.getElementById('successModal');
const btnCloseModal = document.getElementById('btnCloseModal');
const toastContainer = document.getElementById('toastContainer');

// Initialize Thai Date Display matching reference format
function updateDateDisplay() {
  const now = new Date();
  const dateOptions = { day: 'numeric', month: 'long', year: 'numeric' };
  const dateStr = now.toLocaleDateString('th-TH', dateOptions);
  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  
  if (currentDateSub) {
    currentDateSub.innerHTML = `<i class="fa-regular fa-calendar"></i> วันที่ ${dateStr} <span class="divider">|</span> เวลา ${timeStr} น.`;
  }
  if (liveClock) liveClock.textContent = now.toLocaleTimeString('th-TH');
}
setInterval(updateDateDisplay, 1000);
updateDateDisplay();

// Fetch Data from Server
async function fetchMembersData() {
  try {
    if (memberRowsList) {
      memberRowsList.innerHTML = `
        <div class="loading-box">
          <i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลดข้อมูลสมาชิกจาก Discord...
        </div>
      `;
    }

    const res = await fetch(`/api/members?guildId=${guildId}&userId=${userId}`);
    const data = await res.json();

    if (!data.success) {
      if (memberRowsList) {
        memberRowsList.innerHTML = `
          <div class="loading-box text-error">
            <i class="fa-solid fa-triangle-exclamation"></i> ไม่สามารถโหลดข้อมูลได้: ${data.error || 'Unknown error'}
            <br><br>
            <button class="btn-refresh-pill" onclick="fetchMembersData()"><i class="fa-solid fa-rotate-right"></i> กดลองใหม่อีกครั้ง</button>
          </div>
        `;
      }
      showToast(data.error || 'ไม่สามารถโหลดข้อมูลได้', 'error');
      return;
    }

    if (data.guildId) guildId = data.guildId;

    // Update Top Left Sidebar Brand with actual Discord Server Icon & Name
    const sidebarGuildLogo = document.getElementById('sidebarGuildLogo');
    const sidebarGuildName = document.getElementById('sidebarGuildName');

    if (sidebarGuildName && data.guildName) {
      sidebarGuildName.textContent = data.guildName;
    }
    if (sidebarGuildLogo) {
      if (data.guildIcon) {
        sidebarGuildLogo.innerHTML = `<img src="${data.guildIcon}" alt="${data.guildName || 'Server'}" style="width: 100%; height: 100%; border-radius: 14px; object-fit: cover;">`;
      } else if (data.guildName) {
        sidebarGuildLogo.innerHTML = `<span style="font-weight: 700; font-size: 1.2rem; color: #fff;">${data.guildName.charAt(0).toUpperCase()}</span>`;
      }
    }

    // Update Logged-in User Profile at Sidebar Bottom Left
    if (data.currentUser) {
      currentUser = data.currentUser;
      canEdit = currentUser.canEdit || false;

      if (sidebarUserAvatar) sidebarUserAvatar.src = currentUser.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';
      if (sidebarUserName) sidebarUserName.textContent = currentUser.displayName || 'ผู้ใช้งาน';
      if (sidebarUserRole) {
        sidebarUserRole.textContent = currentUser.roleName || 'สมาชิก';
        if (currentUser.roleName === 'ผู้ดูแล') {
          sidebarUserRole.style.color = '#7c3aed';
        } else {
          sidebarUserRole.style.color = '#10b981';
        }
      }
    }

    membersData = data.members || [];
    isConfirmedToday = Boolean(data.isConfirmedToday);
    isEditMode = false;
    renderMemberRows();
    renderSidebarMemberList();
    updateMetrics();
    applyPermissionState();
    applyAnnouncementPermState();

    // Update Bottom Banner Cards (Recent Notification & Log Channel)
    const notifTime = document.getElementById('notifTime');
    const notifDesc = document.getElementById('notifDesc');
    const logChannelTag = document.getElementById('logChannelTag');
    const btnLogLink = document.getElementById('btnLogLink');

    if (data.lastNotification) {
      if (notifTime) notifTime.textContent = data.lastNotification.time;
      if (notifDesc) notifDesc.textContent = data.lastNotification.text;
    } else {
      if (notifTime) notifTime.textContent = '--:-- น.';
      if (notifDesc) notifDesc.textContent = 'ยังไม่มีการบันทึกการเช็คชื่อในวันนี้';
    }

    if (data.logChannel) {
      if (logChannelTag) logChannelTag.innerHTML = `<i class="fa-solid fa-hashtag"></i> ${data.logChannel.name}`;
      if (btnLogLink) {
        btnLogLink.onclick = () => {
          if (data.logChannel.url && data.logChannel.url !== '#') {
            window.open(data.logChannel.url, '_blank');
          } else {
            showToast('โปรดตั้งค่า SUMMARY_LOG_CHANNEL_ID ใน config.json ก่อน', 'error');
          }
        };
      }
    }
  } catch (error) {
    console.error('[Frontend Fetch Error]', error);
    if (memberRowsList) {
      memberRowsList.innerHTML = `
        <div class="loading-box text-error">
          <i class="fa-solid fa-triangle-exclamation"></i> เกิดข้อผิดพลาดในการโหลดข้อมูล: ${error.message}
          <br><br>
          <button class="btn-refresh-pill" onclick="fetchMembersData()"><i class="fa-solid fa-rotate-right"></i> กดลองใหม่อีกครั้ง</button>
        </div>
      `;
    }
    showToast(`เกิดข้อผิดพลาดในการโหลดข้อมูล: ${error.message}`, 'error');
  }
}

// Render Member Rows (New Reference Image 100% Match)
function renderMemberRows() {
  if (!memberRowsList) return;

  if (membersData.length === 0) {
    memberRowsList.innerHTML = `
      <div class="loading-box text-muted">
        ⚠️ ไม่พบสมาชิกในทีมที่มีสิทธิ์เช็คชื่อ (manager up2me / up2me)
      </div>
    `;
    return;
  }

  memberRowsList.innerHTML = '';

  membersData.forEach((m, idx) => {
    const row = document.createElement('div');
    row.className = 'member-row-card';

    // Format Index number to 2 digits (e.g. 01, 02, 03)
    const indexPadded = String(idx + 1).padStart(2, '0');

    // Role Pill Styling
    let rolePillClass = 'role-pill-member';
    let roleIcon = 'fa-solid fa-user';
    if (m.roleName === 'manager up2me') {
      rolePillClass = 'role-pill-manager';
      roleIcon = 'fa-solid fa-shield-halved';
    }

    const isPresent = m.status === 'PRESENT';
    const isLate = m.status === 'LATE';
    const isAbsent = m.status === 'ABSENT';
    const avatarUrl = m.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';
    const displayName = m.displayName || m.username || 'สมาชิก';
    const username = m.username || 'user';

    const isEditable = canEdit && (!isConfirmedToday || isEditMode);
    const disabledAttr = isEditable ? '' : 'disabled style="cursor: not-allowed; opacity: 0.85;"';

    row.innerHTML = `
      <!-- Col 1: Index Number -->
      <div class="col-index-group">
        <span class="row-index-num">${indexPadded}</span>
      </div>

      <!-- Col 2: Role Pill -->
      <div>
        <span class="role-pill ${rolePillClass}">
          <i class="${roleIcon}"></i> ${m.roleName || 'up2me'}
        </span>
      </div>

      <!-- Col 3: Member Profile -->
      <div class="member-profile-box">
        <div class="profile-avatar-wrapper">
          <img src="${avatarUrl}" alt="${displayName}">
          <span class="avatar-status-dot"></span>
        </div>
        <div class="profile-names">
          <span class="profile-display-name">${displayName}</span>
          <span class="profile-username">@${username}</span>
        </div>
      </div>

      <!-- Col 4: Status Buttons Row -->
      <div class="status-buttons-row">
        <button class="status-btn-pill btn-status-present ${isPresent ? 'active' : ''}" data-user="${m.id}" data-status="PRESENT" ${disabledAttr}>
          <i class="fa-solid fa-circle-check"></i> มา
        </button>
        <button class="status-btn-pill btn-status-late ${isLate ? 'active' : ''}" data-user="${m.id}" data-status="LATE" ${disabledAttr}>
          <i class="fa-solid fa-clock"></i> สาย
        </button>
        <button class="status-btn-pill btn-status-absent ${isAbsent ? 'active' : ''}" data-user="${m.id}" data-status="ABSENT" ${disabledAttr}>
          <i class="fa-solid fa-circle-xmark"></i> ขาด
        </button>
      </div>
    `;

    memberRowsList.appendChild(row);
  });

  // Attach Click Handlers to Status Buttons if allowed
  if (canEdit && (!isConfirmedToday || isEditMode)) {
    document.querySelectorAll('.status-btn-pill').forEach(btn => {
      btn.addEventListener('click', function () {
        const userId = this.getAttribute('data-user');
        const status = this.getAttribute('data-status');

        const targetMember = membersData.find(m => m.id === userId);
        if (targetMember) {
          targetMember.status = status;
        }

        const userBtns = document.querySelectorAll(`.status-btn-pill[data-user="${userId}"]`);
        userBtns.forEach(b => b.classList.remove('active'));
        this.classList.add('active');

        updateMetrics();
      });
    });
  } else {
    document.querySelectorAll('.status-btn-pill').forEach(btn => {
      btn.addEventListener('click', function () {
        if (!canEdit) {
          showToast('🔒 เฉพาะ manager up2me เท่านั้นที่เช็คชื่อได้', 'error');
        } else if (isConfirmedToday && !isEditMode) {
          showToast('🔒 บันทึกการเช็คชื่อของวันนี้แล้ว (กดปุ่ม "แก้ไขการเช็คชื่อ" ด้านล่างหากต้องการแก้ไข)', 'warning');
        }
      });
    });
  }
}

// Render Sidebar Member List (Right Sidebar Card: 👥 สมาชิกมียศใน Discord)
function renderSidebarMemberList() {
  const sidebarMemberList = document.getElementById('sidebarMemberList');
  const sidebarTeamCount = document.getElementById('sidebarTeamCount');

  if (sidebarTeamCount) {
    sidebarTeamCount.textContent = `${membersData ? membersData.length : 0} คน`;
  }

  if (!sidebarMemberList) return;

  if (!membersData || membersData.length === 0) {
    sidebarMemberList.innerHTML = `
      <div style="font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 1rem 0;">
        ยังไม่มีสมาชิกที่มีสิทธิ์
      </div>
    `;
    return;
  }

  sidebarMemberList.innerHTML = membersData.map(m => {
    const displayName = m.displayName || m.username || 'สมาชิก';
    const username = m.username || 'user';
    const avatarUrl = m.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';
    const roleName = m.roleName || 'up2me';

    let roleBadgeClass = 's-role-member';
    let roleIcon = 'fa-solid fa-user';
    if (roleName === 'manager up2me') {
      roleBadgeClass = 's-role-manager';
      roleIcon = 'fa-solid fa-shield-halved';
    }

    const dmBtn = canEdit ? `
      <button type="button" class="btn-dm-direct-pill" data-userid="${m.id}" data-name="${displayName}" data-username="${username}" data-avatar="${avatarUrl}" title="ส่ง DM หา ${displayName}">
        <i class="fa-solid fa-paper-plane"></i> DM
      </button>
    ` : '';

    return `
      <div class="sidebar-member-item">
        <div class="s-member-left">
          <img src="${avatarUrl}" class="s-member-avatar" alt="${displayName}">
          <div class="s-member-info">
            <span class="s-member-name">${displayName}</span>
            <span class="s-member-username">@${username}</span>
          </div>
        </div>
        ${dmBtn}
      </div>
    `;
  }).join('');

  // Attach click events to Direct DM buttons
  document.querySelectorAll('.btn-dm-direct-pill').forEach(btn => {
    btn.addEventListener('click', function () {
      const uId = this.getAttribute('data-userid');
      const uName = this.getAttribute('data-name');
      const uUsername = this.getAttribute('data-username');
      const uAvatar = this.getAttribute('data-avatar');
      openDirectDmModal(uId, uName, uUsername, uAvatar);
    });
  });
}

// Apply UI Lock or Unlock based on permissions & daily check-in state
function applyPermissionState() {
  const infoText = document.getElementById('attendanceFooterInfo') || document.querySelector('.footer-info-text');

  if (!canEdit) {
    if (btnSubmitAttendance) {
      btnSubmitAttendance.disabled = true;
      btnSubmitAttendance.style.opacity = '0.65';
      btnSubmitAttendance.style.cursor = 'not-allowed';
      btnSubmitAttendance.style.background = 'var(--header-gradient)';
      btnSubmitAttendance.innerHTML = '<i class="fa-solid fa-lock"></i> เฉพาะ manager up2me ที่เช็คชื่อได้';
    }
    if (infoText) {
      infoText.innerHTML = '<i class="fa-solid fa-lock" style="color: #ef4444;"></i> <span>โหมดอ่านอย่างเดียว (เฉพาะ manager up2me ที่เช็คชื่อได้)</span>';
      infoText.style.color = '#ef4444';
    }
    if (btnCancelEditAttendance) btnCancelEditAttendance.style.display = 'none';
    return;
  }

  // Manager or Leader Permission
  if (isConfirmedToday && !isEditMode) {
    // State 1: Confirmed Today -> Show Edit Button
    if (btnSubmitAttendance) {
      btnSubmitAttendance.disabled = false;
      btnSubmitAttendance.style.opacity = '1';
      btnSubmitAttendance.style.cursor = 'pointer';
      btnSubmitAttendance.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
      btnSubmitAttendance.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> แก้ไขการเช็คชื่อ';
    }
    if (infoText) {
      infoText.innerHTML = '<i class="fa-solid fa-circle-check" style="color: #10b981;"></i> <strong style="color: #10b981;">เช็คชื่อของวันนี้เรียบร้อยแล้ว</strong> <span style="font-size: 0.78rem; color: #64748b;">(สามารถเช็คได้วันละ 1 ครั้ง)</span>';
    }
    if (btnCancelEditAttendance) btnCancelEditAttendance.style.display = 'none';

  } else if (isConfirmedToday && isEditMode) {
    // State 2: Editing Today's Check-In
    if (btnSubmitAttendance) {
      btnSubmitAttendance.disabled = false;
      btnSubmitAttendance.style.opacity = '1';
      btnSubmitAttendance.style.cursor = 'pointer';
      btnSubmitAttendance.style.background = 'linear-gradient(135deg, #10b981, #059669)';
      btnSubmitAttendance.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> บันทึกการแก้ไข';
    }
    if (infoText) {
      infoText.innerHTML = '<i class="fa-solid fa-pen-to-square" style="color: #f59e0b;"></i> <strong style="color: #d97706;">อยู่ในโหมดแก้ไขการเช็คชื่อวันนี้</strong> <span style="font-size: 0.78rem; color: #64748b;">(ปรับเปลี่ยนสถานะแล้วกดบันทึกใหม่)</span>';
    }
    if (btnCancelEditAttendance) btnCancelEditAttendance.style.display = 'inline-flex';

  } else {
    // State 3: Normal Unconfirmed Check-In Mode
    if (btnSubmitAttendance) {
      btnSubmitAttendance.disabled = false;
      btnSubmitAttendance.style.opacity = '1';
      btnSubmitAttendance.style.cursor = 'pointer';
      btnSubmitAttendance.style.background = 'var(--header-gradient)';
      btnSubmitAttendance.innerHTML = '<i class="fa-solid fa-circle-check"></i> ยืนยันการเช็คชื่อ';
    }
    if (infoText) {
      infoText.innerHTML = '<i class="fa-solid fa-circle-info"></i> <span>กรุณาเช็คชื่อให้ครบทุกคนก่อนยืนยัน</span>';
      infoText.style.color = 'var(--purple-primary)';
    }
    if (btnCancelEditAttendance) btnCancelEditAttendance.style.display = 'none';
  }
}

// Update Analytics Metrics & Sidebar
function updateMetrics() {
  const total = membersData.length;
  let present = 0;
  let late = 0;
  let absent = 0;
  let pending = 0;

  membersData.forEach(m => {
    if (m.status === 'PRESENT') present++;
    else if (m.status === 'LATE') late++;
    else if (m.status === 'ABSENT') absent++;
    else pending++;
  });

  if (valTotal) valTotal.textContent = `${total} คน`;
  if (valPending) valPending.textContent = `${pending} คน`;
  if (valPresent) valPresent.textContent = `${present} คน`;
  if (valLate) valLate.textContent = `${late} คน`;
  if (valAbsent) valAbsent.textContent = `${absent} คน`;

  const checkedCount = total - pending;
  if (checkedCountText) checkedCountText.textContent = `เช็คแล้ว ${checkedCount} / ${total} คน`;

  if (bannerStatusText) {
    if (pending === 0 && total > 0) {
      bannerStatusText.textContent = 'เช็คชื่อครบแล้ว';
    } else {
      bannerStatusText.textContent = 'รอยืนยัน';
    }
  }
}

// Quick Actions: Check All Present
if (btnCheckAllPresent) {
  btnCheckAllPresent.addEventListener('click', () => {
    if (!canEdit) {
      showToast('🔒 เฉพาะผู้จัดการเท่านั้นที่สามารถเช็คชื่อได้', 'error');
      return;
    }
    membersData.forEach(m => m.status = 'PRESENT');
    renderMemberRows();
    updateMetrics();
    showToast('เช็คชื่อสมาชิกทุกคนเป็น "มา" เรียบร้อยแล้ว', 'success');
  });
}

// Quick Actions: Reset All Status
if (btnResetAllStatus) {
  btnResetAllStatus.addEventListener('click', () => {
    if (!canEdit) {
      showToast('🔒 เฉพาะผู้จัดการเท่านั้นที่สามารถรีเซ็ตสถานะได้', 'error');
      return;
    }
    membersData.forEach(m => m.status = 'PENDING');
    renderMemberRows();
    updateMetrics();
    showToast('รีเซ็ตสถานะทุกคนเป็น "รอการเช็คชื่อ" แล้ว', 'info');
  });
}

// Quick Actions: Update Member List
if (btnUpdateMemberList) {
  btnUpdateMemberList.addEventListener('click', () => {
    fetchMembersData();
    showToast('กำลังอัปเดตรายชื่อสมาชิกจาก Discord...', 'info');
  });
}

// Handle Submit / Edit Button
if (btnSubmitAttendance) {
  btnSubmitAttendance.addEventListener('click', async () => {
    if (!canEdit) {
      showToast('🔒 เฉพาะผู้จัดการเท่านั้นที่สามารถเช็คชื่อได้', 'error');
      return;
    }

    // If today is confirmed and not currently in edit mode, toggle Edit Mode
    if (isConfirmedToday && !isEditMode) {
      isEditMode = true;
      renderMemberRows();
      applyPermissionState();
      showToast('✏️ เข้าสู่โหมดแก้ไขการเช็คชื่อ เลือกปรับเปลี่ยนสถานะแล้วกด "บันทึกการแก้ไข" ได้เลย', 'info');
      return;
    }

    const managerName = currentUser ? currentUser.displayName : 'ผู้จัดการ';

    // Validation: Check if anyone is still PENDING
    const unchecked = membersData.filter(m => m.status === 'PENDING' || !m.status);
    if (unchecked.length > 0) {
      const uncheckedNames = unchecked.map(m => m.displayName || m.username).join(', ');
      showToast(`⚠️ กรุณาเช็คชื่อให้ครบทุกคนก่อนยืนยัน (ยังไม่ได้เช็คอีก ${unchecked.length} คน: ${uncheckedNames})`, 'error');
      return;
    }

    try {
      btnSubmitAttendance.disabled = true;
      btnSubmitAttendance.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังยืนยัน...';

      const payload = {
        guildId,
        managerName,
        attendanceData: membersData.map(m => ({ id: m.id, status: m.status }))
      };

      const res = await fetch('/api/attendance/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await res.json();

      if (result.success) {
        isConfirmedToday = true;
        isEditMode = false;
        renderMemberRows();
        applyPermissionState();

        if (successModal) successModal.classList.add('active');
        showToast('บันทึกการเช็คชื่อสำเร็จเรียบร้อยแล้ว!', 'success');

        // Update Bottom Notification Card in Real-Time
        const notifTime = document.getElementById('notifTime');
        const notifDesc = document.getElementById('notifDesc');
        if (notifTime) notifTime.textContent = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
        if (notifDesc) notifDesc.textContent = `บันทึกการเช็คชื่อครั้งล่าสุดสำเร็จ โดย ${managerName}`;
      } else {
        showToast(result.error || 'เกิดข้อผิดพลาดในการบันทึก', 'error');
        applyPermissionState();
      }
    } catch (error) {
      console.error('Submit Error:', error);
      showToast('เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
      applyPermissionState();
    }
  });
}

// Cancel Edit Button Handler (Cancels editing mode, reverts back to confirmed saved data and shows Edit button)
if (btnCancelEditAttendance) {
  btnCancelEditAttendance.addEventListener('click', () => {
    isEditMode = false;
    fetchMembersData();
    showToast('ยกเลิกการแก้ไขแล้ว คืนค่าเดิมที่เคยบันทึกไว้', 'info');
  });
}

// Toast Helper
function showToast(message, type = 'info') {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="fa-solid fa-circle-info"></i> <span>${message}</span>`;

  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4500);
}

// Close Modal
if (btnCloseModal) {
  btnCloseModal.addEventListener('click', () => {
    if (successModal) successModal.classList.remove('active');
  });
}

if (btnRefresh) {
  btnRefresh.addEventListener('click', fetchMembersData);
}

// Nav Tab Switching Logic
const navAttendance = document.getElementById('navAttendance');
const navAnnouncement = document.getElementById('navAnnouncement');
const attendanceMainViewCard = document.getElementById('attendanceMainViewCard');
const announcementViewCard = document.getElementById('announcementViewCard');
const btnBackToAttendance = document.getElementById('btnBackToAttendance');

function switchToTab(tabName) {
  if (tabName === 'announcement') {
    if (attendanceMainViewCard) attendanceMainViewCard.style.setProperty('display', 'none', 'important');
    if (announcementViewCard) announcementViewCard.style.setProperty('display', 'flex', 'important');
    if (navAttendance) navAttendance.classList.remove('active');
    if (navAnnouncement) navAnnouncement.classList.add('active');
  } else {
    if (attendanceMainViewCard) attendanceMainViewCard.style.setProperty('display', 'flex', 'important');
    if (announcementViewCard) announcementViewCard.style.setProperty('display', 'none', 'important');
    if (navAttendance) navAttendance.classList.add('active');
    if (navAnnouncement) navAnnouncement.classList.remove('active');
  }
}

if (navAttendance) navAttendance.addEventListener('click', (e) => { e.preventDefault(); switchToTab('attendance'); });
if (navAnnouncement) navAnnouncement.addEventListener('click', (e) => { e.preventDefault(); switchToTab('announcement'); });
if (btnBackToAttendance) btnBackToAttendance.addEventListener('click', () => switchToTab('attendance'));

// Web Announcement Submit Handler
const btnSubmitWebAnnouncement = document.getElementById('btnSubmitWebAnnouncement');
const webAnnTitle = document.getElementById('webAnnTitle');
const webAnnMessage = document.getElementById('webAnnMessage');
const webAnnImageUrl = document.getElementById('webAnnImageUrl');
const announcementPermNotice = document.getElementById('announcementPermNotice');
const announcementFormFields = document.getElementById('announcementFormFields');

// Apply Announcement Permission State
function applyAnnouncementPermState() {
  if (!canEdit) {
    if (announcementPermNotice) announcementPermNotice.style.display = 'block';
    if (announcementFormFields) announcementFormFields.style.opacity = '0.5';
    if (btnSubmitWebAnnouncement) {
      btnSubmitWebAnnouncement.disabled = true;
      btnSubmitWebAnnouncement.style.opacity = '0.6';
      btnSubmitWebAnnouncement.style.cursor = 'not-allowed';
    }
  } else {
    if (announcementPermNotice) announcementPermNotice.style.display = 'none';
    if (announcementFormFields) announcementFormFields.style.opacity = '1';
    if (btnSubmitWebAnnouncement) {
      btnSubmitWebAnnouncement.disabled = false;
      btnSubmitWebAnnouncement.style.opacity = '1';
      btnSubmitWebAnnouncement.style.cursor = 'pointer';
    }
  }
}

// Image Option Tabs Logic (URL vs File Upload)
const tabImgUrl = document.getElementById('tabImgUrl');
const tabImgFile = document.getElementById('tabImgFile');
const boxImgUrl = document.getElementById('boxImgUrl');
const boxImgFile = document.getElementById('boxImgFile');
const webAnnImageFile = document.getElementById('webAnnImageFile');
const btnBrowseFile = document.getElementById('btnBrowseFile');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const imagePreview = document.getElementById('imagePreview');

let activeImgOption = 'url';
let selectedBase64Image = null;
let selectedAnnType = 'GENERAL';

// Announcement Type Pill Selection
document.querySelectorAll('.ann-type-pill').forEach(pill => {
  pill.addEventListener('click', function() {
    document.querySelectorAll('.ann-type-pill').forEach(p => p.classList.remove('active'));
    this.classList.add('active');
    selectedAnnType = this.getAttribute('data-type') || 'GENERAL';
  });
});

// Title and Message Character Counter logic
if (webAnnTitle) {
  const titleCharCount = document.getElementById('titleCharCount');
  webAnnTitle.addEventListener('input', () => {
    if (titleCharCount) titleCharCount.textContent = `${webAnnTitle.value.length}/100`;
  });
}

if (webAnnMessage) {
  const msgCharCount = document.getElementById('msgCharCount');
  webAnnMessage.addEventListener('input', () => {
    if (msgCharCount) msgCharCount.textContent = `${webAnnMessage.value.length}/1000`;
  });
}

if (tabImgUrl && tabImgFile) {
  tabImgUrl.addEventListener('click', () => {
    activeImgOption = 'url';
    tabImgUrl.classList.add('active');
    tabImgFile.classList.remove('active');
    if (boxImgUrl) boxImgUrl.style.display = 'block';
    if (boxImgFile) boxImgFile.style.display = 'none';
  });

  tabImgFile.addEventListener('click', () => {
    activeImgOption = 'file';
    tabImgFile.classList.add('active');
    tabImgUrl.classList.remove('active');
    if (boxImgUrl) boxImgUrl.style.display = 'none';
    if (boxImgFile) boxImgFile.style.display = 'block';
  });
}

if (btnBrowseFile && webAnnImageFile) {
  btnBrowseFile.addEventListener('click', () => webAnnImageFile.click());

  const fileCompactRow = document.getElementById('fileCompactRow');
  const compactPreviewBox = document.getElementById('compactPreviewBox');
  const compactFileName = document.getElementById('compactFileName');
  const compactFileSize = document.getElementById('compactFileSize');
  const btnRemoveImage = document.getElementById('btnRemoveImage');

  webAnnImageFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        selectedBase64Image = evt.target.result;
        if (imagePreview) imagePreview.src = selectedBase64Image;
        if (compactFileName) compactFileName.textContent = file.name;
        if (compactFileSize) compactFileSize.textContent = `${(file.size / 1024).toFixed(1)} KB`;

        if (fileCompactRow) fileCompactRow.style.display = 'none';
        if (compactPreviewBox) compactPreviewBox.style.display = 'flex';
      };
      reader.readAsDataURL(file);
    }
  });

  if (btnRemoveImage) {
    btnRemoveImage.addEventListener('click', () => {
      webAnnImageFile.value = '';
      selectedBase64Image = null;
      if (compactPreviewBox) compactPreviewBox.style.display = 'none';
      if (fileCompactRow) fileCompactRow.style.display = 'flex';
    });
  }
}

async function handleAnnouncementSubmit(forceDm = false) {
  if (!canEdit) {
    showToast('คุณไม่มีสิทธิ์ส่งประกาศ (เฉพาะยศ manager up2me เท่านั้น)', 'error');
    return;
  }

  const title = webAnnTitle ? webAnnTitle.value.trim() : '';
  const message = webAnnMessage ? webAnnMessage.value.trim() : '';

  if (!title || !message) {
    showToast('กรุณากรอกหัวข้อและรายละเอียดข่าวสารให้ครบถ้วน', 'warning');
    return;
  }

  let imageUrlPayload = null;
  let imageBase64Payload = null;

  if (activeImgOption === 'url') {
    imageUrlPayload = webAnnImageUrl ? webAnnImageUrl.value.trim() : null;
  } else if (activeImgOption === 'file') {
    imageBase64Payload = selectedBase64Image;
  }

  const chkSendDm = document.getElementById('chkSendDm');
  const sendDm = forceDm ? true : (chkSendDm ? chkSendDm.checked : false);

  const selectedMentions = [];
  document.querySelectorAll('.chk-mention:checked').forEach(chk => {
    selectedMentions.push(chk.value);
  });

  const activeBtn = forceDm ? document.getElementById('btnSubmitDmAnnouncement') : btnSubmitWebAnnouncement;
  if (btnSubmitWebAnnouncement) btnSubmitWebAnnouncement.disabled = true;
  const btnDm = document.getElementById('btnSubmitDmAnnouncement');
  if (btnDm) btnDm.disabled = true;

  if (activeBtn) {
    activeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังส่งประกาศ...';
  }

  try {
    const response = await fetch('/api/announcements/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guildId,
        userId,
        title,
        message,
        imageUrl: imageUrlPayload,
        imageBase64: imageBase64Payload,
        mentions: selectedMentions,
        sendDm: forceDm ? true : sendDm,
        dmOnly: forceDm,
        announcementType: selectedAnnType
      })
    });

    const resData = await response.json();

    if (resData.success) {
      showToast(`🎉 ${resData.message || (forceDm ? 'ส่งประกาศแบบ DM ส่วนตัวเรียบร้อยแล้ว!' : 'ส่งประกาศลง Discord เรียบร้อยแล้ว!')}`, 'success');
      if (webAnnTitle) webAnnTitle.value = '';
      if (webAnnMessage) webAnnMessage.value = '';
      if (webAnnImageUrl) webAnnImageUrl.value = '';
      selectedBase64Image = null;
      if (webAnnImageFile) webAnnImageFile.value = '';
      if (chkSendDm) chkSendDm.checked = false;
      const compactPreviewBox = document.getElementById('compactPreviewBox');
      const fileCompactRow = document.getElementById('fileCompactRow');
      if (compactPreviewBox) compactPreviewBox.style.display = 'none';
      if (fileCompactRow) fileCompactRow.style.display = 'flex';
      document.querySelectorAll('.chk-mention').forEach(chk => chk.checked = false);
    } else {
      showToast(`❌ ${resData.error || 'เกิดข้อผิดพลาดในการส่งประกาศ'}`, 'error');
    }
  } catch (err) {
    console.error('[Web Announcement Error]', err);
    showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  } finally {
    if (btnSubmitWebAnnouncement) {
      btnSubmitWebAnnouncement.disabled = false;
      btnSubmitWebAnnouncement.innerHTML = '<i class="fa-solid fa-paper-plane"></i> ส่งประกาศลง Discord ทันที';
    }
    if (btnDm) {
      btnDm.disabled = false;
      btnDm.innerHTML = '<i class="fa-solid fa-paper-plane"></i> ส่งประกาศแบบ DM ส่วนตัว';
    }
  }
}

if (btnSubmitWebAnnouncement) {
  btnSubmitWebAnnouncement.addEventListener('click', () => handleAnnouncementSubmit(false));
}

const btnSubmitDmAnnouncement = document.getElementById('btnSubmitDmAnnouncement');
if (btnSubmitDmAnnouncement) {
  btnSubmitDmAnnouncement.addEventListener('click', () => handleAnnouncementSubmit(true));
}

// ----------------------------------------------------
// 📩 Direct DM Individual Member Modal Logic
// ----------------------------------------------------
let selectedDmTargetUserId = null;
let activeDmImgOption = 'url';
let selectedDmBase64Image = null;

const directDmModal = document.getElementById('directDmModal');
const btnCloseDmModal = document.getElementById('btnCloseDmModal');
const btnCancelDmModal = document.getElementById('btnCancelDmModal');
const btnSendDirectDm = document.getElementById('btnSendDirectDm');

const dmTargetAvatar = document.getElementById('dmTargetAvatar');
const dmTargetName = document.getElementById('dmTargetName');
const dmMessageText = document.getElementById('dmMessageText');
const dmMsgCharCount = document.getElementById('dmMsgCharCount');

const tabDmImgUrl = document.getElementById('tabDmImgUrl');
const tabDmImgFile = document.getElementById('tabDmImgFile');
const boxDmImgUrl = document.getElementById('boxDmImgUrl');
const boxDmImgFile = document.getElementById('boxDmImgFile');
const dmImageUrl = document.getElementById('dmImageUrl');
const dmImageFile = document.getElementById('dmImageFile');
const btnBrowseDmFile = document.getElementById('btnBrowseDmFile');
const dmFilePreviewBox = document.getElementById('dmFilePreviewBox');
const dmImgPreview = document.getElementById('dmImgPreview');
const dmFileName = document.getElementById('dmFileName');
const btnRemoveDmImg = document.getElementById('btnRemoveDmImg');

function openDirectDmModal(uId, uName, uUsername, uAvatar) {
  selectedDmTargetUserId = uId;
  if (dmTargetName) dmTargetName.textContent = `${uName} (@${uUsername})`;
  if (dmTargetAvatar) dmTargetAvatar.src = uAvatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
  if (dmMessageText) dmMessageText.value = '';
  if (dmMsgCharCount) dmMsgCharCount.textContent = '0/1000';
  if (dmImageUrl) dmImageUrl.value = '';
  if (dmImageFile) dmImageFile.value = '';
  selectedDmBase64Image = null;
  if (dmFilePreviewBox) dmFilePreviewBox.style.display = 'none';

  if (directDmModal) directDmModal.classList.add('active');
}

function closeDirectDmModal() {
  if (directDmModal) directDmModal.classList.remove('active');
  selectedDmTargetUserId = null;
}

if (btnCloseDmModal) btnCloseDmModal.addEventListener('click', closeDirectDmModal);
if (btnCancelDmModal) btnCancelDmModal.addEventListener('click', closeDirectDmModal);

if (dmMessageText && dmMsgCharCount) {
  dmMessageText.addEventListener('input', () => {
    dmMsgCharCount.textContent = `${dmMessageText.value.length}/1000`;
  });
}

if (tabDmImgUrl && tabDmImgFile) {
  tabDmImgUrl.addEventListener('click', () => {
    activeDmImgOption = 'url';
    tabDmImgUrl.classList.add('active');
    tabDmImgFile.classList.remove('active');
    if (boxDmImgUrl) boxDmImgUrl.style.display = 'block';
    if (boxDmImgFile) boxDmImgFile.style.display = 'none';
  });

  tabDmImgFile.addEventListener('click', () => {
    activeDmImgOption = 'file';
    tabDmImgFile.classList.add('active');
    tabDmImgUrl.classList.remove('active');
    if (boxDmImgUrl) boxDmImgUrl.style.display = 'none';
    if (boxDmImgFile) boxDmImgFile.style.display = 'block';
  });
}

if (btnBrowseDmFile && dmImageFile) {
  btnBrowseDmFile.addEventListener('click', () => dmImageFile.click());
  dmImageFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      activeDmImgOption = 'file';
      const reader = new FileReader();
      reader.onload = (evt) => {
        selectedDmBase64Image = evt.target.result;
        if (dmImgPreview) dmImgPreview.src = selectedDmBase64Image;
        if (dmFileName) dmFileName.textContent = file.name;
        if (dmFilePreviewBox) dmFilePreviewBox.style.display = 'flex';
      };
      reader.readAsDataURL(file);
    }
  });

  if (btnRemoveDmImg) {
    btnRemoveDmImg.addEventListener('click', () => {
      dmImageFile.value = '';
      selectedDmBase64Image = null;
      activeDmImgOption = 'url';
      if (dmFilePreviewBox) dmFilePreviewBox.style.display = 'none';
    });
  }
}

if (btnSendDirectDm) {
  btnSendDirectDm.addEventListener('click', async () => {
    const message = dmMessageText ? dmMessageText.value.trim() : '';
    if (!message) {
      showToast('กรุณากรอกข้อความที่ต้องการส่ง', 'warning');
      return;
    }

    let urlPayload = null;
    let base64Payload = null;
    if (activeDmImgOption === 'url' && dmImageUrl) {
      urlPayload = dmImageUrl.value.trim() || null;
    } else if (activeDmImgOption === 'file') {
      base64Payload = selectedDmBase64Image;
    }

    try {
      btnSendDirectDm.disabled = true;
      btnSendDirectDm.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังส่ง DM...';

      const res = await fetch('/api/members/send-dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guildId,
          senderUserId: userId,
          targetUserId: selectedDmTargetUserId,
          message,
          imageUrl: urlPayload,
          imageBase64: base64Payload
        })
      });

      const data = await res.json();
      if (data.success) {
        showToast(`🎉 ${data.message || 'ส่ง DM สำเร็จ!'}`, 'success');
        closeDirectDmModal();
      } else {
        showToast(`❌ ${data.error || 'ส่ง DM ล้มเหลว'}`, 'error');
      }
    } catch (err) {
      console.error('[Direct DM Error]', err);
      showToast('เกิดข้อผิดพลาดในการส่งข้อความ', 'error');
    } finally {
      btnSendDirectDm.disabled = false;
      btnSendDirectDm.innerHTML = '<i class="fa-solid fa-paper-plane"></i> ส่งข้อความ DM ทันที';
    }
  });
}

// Initial Load
switchToTab('attendance');
fetchMembersData();
