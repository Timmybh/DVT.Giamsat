// Tìm (CHỈ ĐỌC) cột nào trong eGMF lưu số lệnh sản xuất (LSX), để xem màn hình kế hoạch lấy lệnh từ đâu.
// Bước 1: liệt kê cột có tên giống LSX / LenhSX / LenhSanXuat / ProductionOrder.
// Bước 2: với mỗi cột chữ tìm được, đếm TOP 5 dòng có giá trị = số lệnh mẫu.
// Chạy: npm run tim-cot-lsx -- HAMTT-0303-2026   -> khao-sat/tim-cot-lsx.txt
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const lenh = String(process.argv[2] || 'HAMTT-0303-2026').trim();

(async () => {
  const out = [`Số lệnh mẫu: ${lenh}`, ''];
  const cot = await db.query({ db: 'egmf', text: `
    SELECT c.TABLE_NAME AS bang, c.COLUMN_NAME AS cot, c.DATA_TYPE AS kieu, t.TABLE_TYPE AS loai
    FROM INFORMATION_SCHEMA.COLUMNS c JOIN INFORMATION_SCHEMA.TABLES t ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
    WHERE c.TABLE_SCHEMA = 'dbo' AND (c.COLUMN_NAME LIKE '%LSX%' OR c.COLUMN_NAME LIKE '%LenhSX%' OR c.COLUMN_NAME LIKE '%LenhSanXuat%'
      OR c.COLUMN_NAME LIKE '%ProductionOrder%' OR c.COLUMN_NAME LIKE '%SoLenh%')
    ORDER BY c.TABLE_NAME, c.COLUMN_NAME` });
  out.push('=== Cột có tên giống lệnh sản xuất ===', 'bang | cot | kieu | loai', ...cot.map((r) => `${r.bang} | ${r.cot} | ${r.kieu} | ${r.loai}`), '');
  out.push(`=== Cột có giá trị = '${lenh}' (TOP 5 mỗi cột) ===`);
  for (const r of cot.filter((x) => /char/i.test(x.kieu) && x.loai === 'BASE TABLE')) {
    try {
      const rs = await db.query({ db: 'egmf', text: `SELECT TOP 5 * FROM dbo.[${r.bang}] WHERE [${r.cot}] LIKE '%' + @lenh + '%'` }, { lenh });
      if (rs.length) {
        out.push(`--- ${r.bang}.${r.cot}: ${rs.length} dòng (tối đa 5) ---`, Object.keys(rs[0]).join(' | '));
        rs.forEach((x) => out.push(Object.values(x).map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v)).join(' | ')));
      } else out.push(`${r.bang}.${r.cot}: không có`);
    } catch (e) { out.push(`${r.bang}.${r.cot}: LỖI ${e.message}`); }
  }
  fs.mkdirSync('khao-sat', { recursive: true });
  fs.writeFileSync(path.join('khao-sat', 'tim-cot-lsx.txt'), `${out.join('\n')}\n`);
  console.log('Đã ghi khao-sat/tim-cot-lsx.txt');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
