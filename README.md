# 🤖 Discord Team Attendance Bot

ระบบบอทเช็คชื่อสมาชิกในทีมบน Discord พร้อมระบบคัดกรองตามยศ (Roles), แผงควบคุม Interactive UI (ปุ่มและ Select Menu), ระบบ DM แจ้งเตือนรายบุคคล และบันทึกประวัติการเช็คชื่อลงในห้อง **Discord Log Channel** โดยไม่ต้องใช้ Database ภายนอก

---

## ✨ ฟีเจอร์หลัก (Key Features)

1. **ระบบต้อนรับเมื่อได้รับการแต่งตั้งยศ (Role Assignment DM Notification)**:
   - เมื่อมีสมาชิกได้รับยศ `หัวหน้า`, `ผู้จัดการ`, หรือ `สมาชิก` บอทจะส่ง DM ทักทายไปหาทันที:  
     *"🎉 คุณได้รับการรับเชิญเข้าร่วมตำแหน่ง: [ชื่อยศ]"*
   - บันทึกการแต่งตั้งยศลงในห้อง Log Channel

2. **แผงควบคุมเช็คชื่อแบบ Batch (Manager Interactive UI)**:
   - คำสั่ง `/attendance-panel` สำหรับผู้จัดการ
   - กรองสมาชิกเฉพาะคนที่มี 3 ยศหลัก (**ข้าม `บุคคลทั่วไป` อัตโนมัติ**)
   - ตั้งค่าเริ่มต้นเป็น `🟢 มาตรงเวลา` ทุกคน
   - ผู้จัดการสามารถสลับเลือกเปลี่ยนสถานะเฉพาะคนที่ `🟡 มาสาย` หรือ `🔴 ขาดงาน`
   - ปุ่ม **[ 🚀 🟢 ยืนยันการเช็คชื่อทั้งหมด ]** กดยืนยันรอบเดียว

3. **ระบบแจ้งเตือนและบันทึก Log (Post Check-in & Audit Log)**:
   - ส่ง DM แจ้งเตือนผลการเช็คชื่อ + วันเวลา ถึงสมาชิกทุกคนรายบุคคล (รองรับเคสสมาชิกปิด DM)
   - ส่งการ์ดสรุปประวัติฉบับสมบูรณ์ลงในห้อง **Discord Log Channel**
   - ปุ่ม **[ ✏️ แก้ไขผลย้อนหลัง ]** สำหรับผู้จัดการ

---

## 📁 โครงสร้างโปรเจกต์ (Project Structure)

```
idebot/
├── src/
│   ├── config.json          # ไฟล์ใส่ ID ของ Roles ทั้ง 4 ยศ และ Log Channel ID
│   ├── index.js             # ไฟล์หลักในการเชื่อมต่อและรัน Discord Bot
│   ├── deploy-commands.js   # สคริปต์สำหรับลงทะเบียน Slash Command (/attendance-panel)
│   ├── commands/
│   │   └── attendancePanel.js # โค้ดคำสั่ง /attendance-panel และระบบ UI
│   ├── events/
│   │   ├── guildMemberUpdate.js # Event ดักจับการแอด ยศ -> ส่ง DM
│   │   └── interactionCreate.js # Event จัดการปุ่มกด และ Slash Commands
│   └── utils/
│       ├── attendanceStore.js   # Memory Store เก็บ State การเช็คชื่อชั่วคราว
│       ├── dmSender.js          # ฟังก์ชันส่ง DM พร้อมระบบดัก Error ปิด DM
│       └── logger.js            # ฟังก์ชันส่ง Log ลงห้อง Discord Log Channel
├── .env                     # ไฟล์ใส่ Discord Token และ Client ID
├── package.json
└── README.md
```

---

## ⚙️ ขั้นตอนการตั้งค่าก่อนเริ่มใช้งาน (Setup Guide)

### 1. การตั้งค่าบน Discord Developer Portal
1. เข้าไปที่ [Discord Developer Portal](https://discord.com/developers/applications)
2. กด **New Application** ตั้งชื่อบอทแล้วกด Create
3. ไปที่เมนู **Bot** ด้านซ้าย:
   * กด **Reset Token** แล้วก๊อปปี้ Token มาใส่ในไฟล์ `.env`
   * เลื่อนลงมาหัวข้อ **Privileged Gateway Intents** ให้เปิดใช้งาน 2 หัวข้อนี้:
     - ✅ **Server Members Intent** (จำเป็นมาก เพื่อให้บอทอ่านรายชื่อสมาชิกและยศได้)
     - ✅ **Message Content Intent**
4. ไปที่เมนู **OAuth2 -> URL Generator**:
   * ในช่อง Scopes เลือก: `bot`, `applications.commands`
   * ในช่อง Bot Permissions เลือก: `Manage Roles`, `Send Messages`, `Embed Links`, `Use External Emojis`, `Read Message History`
   * ก๊อปปี้ลิงก์ที่ได้ นำไปวางในเบราว์เซอร์เพื่อดึงบอทเข้าเซิร์ฟเวอร์ของคุณ

---

### 2. การตั้งค่าไฟล์ `.env` และ `src/config.json`

#### ไฟล์ `.env`
```env
DISCORD_TOKEN=TOKEN_ของบอทที่ได้จาก_Developer_Portal
CLIENT_ID=APPLICATION_ID_ของบอท
GUILD_ID=SERVER_ID_เซิร์ฟเวอร์ของคุณ
```

#### ไฟล์ `src/config.json`
เปิดโหมดนักพัฒนาใน Discord (**Developer Mode** ใน Discord Settings -> Advanced -> Developer Mode) จากนั้นคลิกขวาที่ Role และ Channel เพื่อ Copy ID มาใส่:
```json
{
  "roles": {
    "LEADER_ROLE_ID": "ID_ของยศหัวหน้า",
    "MANAGER_ROLE_ID": "ID_ของยศผู้จัดการ",
    "MEMBER_ROLE_ID": "ID_ของยศสมาชิก",
    "VISITOR_ROLE_ID": "ID_ของยศบุคคลทั่วไป"
  },
  "channels": {
    "LOG_CHANNEL_ID": "ID_ของห้อง_LOG_CHANNEL"
  }
}
```

---

## 🚀 วิธีการรันใช้งานบอท (Running the Bot)

1. **ลงทะเบียน Slash Commands (ทำเพียงครั้งแรก)**:
   ```bash
   node src/deploy-commands.js
   ```

2. **เปิดใช้งานบอท**:
   ```bash
   npm start
   ```

---

## 🎯 วิธีการใช้งานสำหรับผู้จัดการ

1. พิมพ์คำสั่ง `/attendance-panel` ในห้องที่ต้องการเช็คชื่อ
2. บอทจะดึงรายชื่อสมาชิกมียศขึ้นมา พร้อมตั้งค่าทุกคนเป็น `🟢 มาตรงเวลา`
3. หากมีคนสายหรือขาด ให้เลือกชื่อในเมนูดร็อปดาวน์ แล้วกดปุ่ม `[ 🟡 สาย ]` หรือ `[ 🔴 ขาด ]`
4. เมื่อเช็คครบแล้ว กดปุ่ม `[ 🚀 🟢 ยืนยันการเช็คชื่อทั้งหมด ]`
5. บอทจะส่ง DM รายงานถึงทุกคน และบันทึก Log ลงห้อง Discord Log Channel อัตโนมัติ!
