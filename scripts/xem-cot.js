// Xem (CHỈ ĐỌC) danh sách cột của một bảng eGMF và vài dòng mẫu.
// Chạy: npm run xem-cot -- <TenBang> [KHTId]   -> khao-sat/xem-cot.txt
// Ví dụ: npm run xem-cot -- OMM_KeHoachThang_SBD 88353
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const bang = String(process.argv[2] || '').trim();
const kht = process.argv[3] ? Number(process.argv[3]) : null;
if (!/^\w+$/.test(bang)) { console.error('Thiếu hoặc sai tên bảng. Ví dụ: npm run xem-cot -- OMM_KeHoachThang_SBD 88353'); process.exit(1); }

(async () => {
  const fmt = (rows) => (rows.length
    ? [Object.keys(rows[0]).join(' | '), ...rows.map((r) => Object.values(r).map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v)).join(' | '))]
    : ['(không có dòng nào)']);
  const out = [];
  const chay = async (ten, text, p) => {
    out.push(`=== ${ten} ===`);
    try { out.push(...fmt(await db.query({ db: 'egmf', text }, p))); } catch (e) { out.push(`LỖI: ${e.message}`); }
    out.push('');
  };
  await chay(`Cột của dbo.${bang}`, `
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH AS doDai, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @bang ORDER BY ORDINAL_POSITION`, { bang });
  const cot = (await db.query({ db: 'egmf', text: `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @bang`, }, { bang }).catch(() => []))
    .map((r) => r.COLUMN_NAME);
  const loc = kht != null && cot.includes('KHTId') ? 'WHERE KHTId = @kht' : '';
  await chay(`10 dòng mẫu${loc ? ` (KHTId = ${kht})` : ''}`, `SELECT TOP 10 * FROM dbo.[${bang}] ${loc}`, { kht });
  fs.mkdirSync('khao-sat', { recursive: true });
  fs.writeFileSync(path.join('khao-sat', 'xem-cot.txt'), `${out.join('\n')}\n`);
  console.log('Đã ghi khao-sat/xem-cot.txt');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
