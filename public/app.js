/**
 * 📌 DC Check-In Web Dashboard Frontend Script
 * Compact Single-Line Clean Footer Bar
 */

let membersData = [];
let guildId = new URLSearchParams(window.location.search).get('guildId') || '';
let userId = new URLSearchParams(window.location.search).get('userId') || '';
let currentUser = null;
let canEdit = false;

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
    if (!userId) {
      try {
        const savedId = localStorage.getItem('saved_user_id');
        if (savedId) userId = savedId;
      } catch (e) {}
    }

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
        if (currentUser.roleName === 'หัวหน้า') {
          sidebarUserRole.style.color = '#d97706';
        } else if (currentUser.roleName === 'ผู้จัดการ') {
          sidebarUserRole.style.color = '#4f46e5';
        } else if (currentUser.roleName === 'สมาชิก') {
          sidebarUserRole.style.color = '#10b981';
        } else {
          sidebarUserRole.style.color = '#94a3b8';
        }
      }
    }

    membersData = data.members || [];
    renderMemberRows();
    updateMetrics();
    applyPermissionState();

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

  if (!membersData || membersData.length === 0) {
    memberRowsList.innerHTML = `
      <div class="loading-box">
        ⚠️ ไม่พบสมาชิกในทีมที่มีสิทธิ์เช็คชื่อ (หัวหน้า / ผู้จัดการ / สมาชิก)
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
    if (m.roleName === 'หัวหน้า') {
      rolePillClass = 'role-pill-leader';
      roleIcon = 'fa-solid fa-crown';
    } else if (m.roleName === 'ผู้จัดการ') {
      rolePillClass = 'role-pill-manager';
      roleIcon = 'fa-solid fa-user-tie';
    }

    const isPresent = m.status === 'PRESENT';
    const isLate = m.status === 'LATE';
    const isAbsent = m.status === 'ABSENT';
    const avatarUrl = m.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';
    const displayName = m.displayName || m.username || 'สมาชิก';
    const username = m.username || 'user';

    const disabledAttr = canEdit ? '' : 'disabled style="cursor: not-allowed; opacity: 0.75;"';

    row.innerHTML = `
      <!-- Col 1: Index Number -->
      <div class="col-index-group">
        <span class="row-index-num">${indexPadded}</span>
      </div>

      <!-- Col 2: Role Pill -->
      <div>
        <span class="role-pill ${rolePillClass}">
          <i class="${roleIcon}"></i> ${m.roleName || 'สมาชิก'}
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
  if (canEdit) {
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
        showToast('🔒 เฉพาะผู้จัดการเท่านั้นที่เช็คชื่อได้', 'error');
      });
    });
  }
}

// Apply UI Lock or Unlock based on permissions (Concise Single-Line)
function applyPermissionState() {
  const infoText = document.querySelector('.footer-info-text');

  if (!canEdit) {
    if (btnSubmitAttendance) {
      btnSubmitAttendance.disabled = true;
      btnSubmitAttendance.style.opacity = '0.65';
      btnSubmitAttendance.style.cursor = 'not-allowed';
      btnSubmitAttendance.innerHTML = '<i class="fa-solid fa-lock"></i> เฉพาะผู้จัดการที่เช็คชื่อได้';
    }
    if (infoText) {
      infoText.innerHTML = '<i class="fa-solid fa-lock" style="color: #ef4444;"></i> <span>โหมดอ่านอย่างเดียว (เฉพาะผู้จัดการที่เช็คชื่อได้)</span>';
      infoText.style.color = '#ef4444';
    }
  } else {
    if (btnSubmitAttendance) {
      btnSubmitAttendance.disabled = false;
      btnSubmitAttendance.style.opacity = '1';
      btnSubmitAttendance.style.cursor = 'pointer';
      btnSubmitAttendance.innerHTML = '<i class="fa-solid fa-circle-check"></i> ยืนยันการเช็คชื่อ';
    }
    if (infoText) {
      infoText.innerHTML = '<i class="fa-solid fa-circle-info"></i> <span>กรุณาเช็คชื่อให้ครบทุกคนก่อนยืนยัน</span>';
      infoText.style.color = 'var(--purple-primary)';
    }
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

// Handle Submit Button
if (btnSubmitAttendance) {
  btnSubmitAttendance.addEventListener('click', async () => {
    if (!canEdit) {
      showToast('🔒 เฉพาะผู้จัดการเท่านั้นที่สามารถยืนยันการเช็คชื่อได้', 'error');
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
        if (successModal) successModal.classList.add('active');
        
        // Update Bottom Notification Card in Real-Time
        const notifTime = document.getElementById('notifTime');
        const notifDesc = document.getElementById('notifDesc');
        if (notifTime) notifTime.textContent = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
        if (notifDesc) notifDesc.textContent = `บันทึกการเช็คชื่อครั้งล่าสุดสำเร็จ โดย ${managerName}`;
      } else {
        showToast(result.error || 'เกิดข้อผิดพลาดในการบันทึก', 'error');
      }
    } catch (error) {
      console.error('Submit Error:', error);
      showToast('เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
    } finally {
      if (canEdit) {
        btnSubmitAttendance.disabled = false;
        btnSubmitAttendance.innerHTML = '<i class="fa-solid fa-circle-check"></i> ยืนยันการเช็คชื่อ';
      }
    }
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

// User Profile Switcher Modal Logic
const sidebarUserCard = document.getElementById('sidebarUserCard');
const userSwitchModal = document.getElementById('userSwitchModal');
const userSwitchList = document.getElementById('userSwitchList');
const btnCloseUserSwitchModal = document.getElementById('btnCloseUserSwitchModal');

if (sidebarUserCard) {
  sidebarUserCard.addEventListener('click', openUserSwitchModal);
}

if (btnCloseUserSwitchModal) {
  btnCloseUserSwitchModal.addEventListener('click', () => {
    if (userSwitchModal) userSwitchModal.classList.remove('active');
  });
}

function openUserSwitchModal() {
  if (!userSwitchModal || !userSwitchList) return;
  
  if (!membersData || membersData.length === 0) {
    userSwitchList.innerHTML = '<div style="font-size: 0.82rem; color: var(--text-muted); text-align: center; padding: 1rem;">ไม่พบข้อมูลสมาชิก</div>';
  } else {
    userSwitchList.innerHTML = '';
    membersData.forEach(m => {
      const item = document.createElement('div');
      const isCurrent = currentUser && currentUser.id === m.id;
      
      item.style.cssText = `
        background: ${isCurrent ? 'var(--purple-light)' : 'var(--bg-subtle)'};
        border: 1px solid ${isCurrent ? 'var(--purple-primary)' : 'var(--border-card)'};
        border-radius: 12px;
        padding: 0.6rem 0.85rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        transition: all 0.2s ease;
      `;

      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.65rem;">
          <img src="${m.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'}" style="width: 34px; height: 34px; border-radius: 50%; object-fit: cover;">
          <div style="display: flex; flex-direction: column;">
            <strong style="font-size: 0.85rem; color: var(--text-main);">${m.displayName || m.username}</strong>
            <span style="font-size: 0.72rem; color: var(--text-muted);">@${m.username || 'user'}</span>
          </div>
        </div>
        <span class="role-pill ${m.roleName === 'หัวหน้า' ? 'role-pill-leader' : m.roleName === 'ผู้จัดการ' ? 'role-pill-manager' : 'role-pill-member'}" style="font-size: 0.72rem; padding: 0.2rem 0.65rem;">
          ${m.roleName || 'สมาชิก'}
        </span>
      `;

      item.addEventListener('click', () => {
        userId = m.id;
        try {
          localStorage.setItem('saved_user_id', m.id);
          const newUrl = `${window.location.pathname}?guildId=${guildId}&userId=${m.id}`;
          window.history.replaceState(null, '', newUrl);
        } catch (e) {}

        if (userSwitchModal) userSwitchModal.classList.remove('active');
        fetchMembersData();
        showToast(`สลับโปรไฟล์เป็นคุณ "${m.displayName}" เรียบร้อยแล้ว`, 'success');
      });

      userSwitchList.appendChild(item);
    });
  }

  userSwitchModal.classList.add('active');
}

// Initial Load
fetchMembersData();
