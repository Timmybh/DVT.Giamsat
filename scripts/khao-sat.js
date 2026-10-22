// Khảo sát (CHỈ ĐỌC) các bảng/view liên quan BTP cắt, phiếu cấp, phiếu xuất, lệnh sản xuất.
// Chạy: npm run khao-sat   -> ghi ra khao-sat/<db>.csv để gửi lại cho người phát triển.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const PATTERNS = [
  'CUTTING%', '%BTP%', '%Cat%Phieu%', '%Phieu%Cat%', '%KhoCat%', '%PhieuCap%', '%PhieuXuat%',
  '%DatHang%BTP%', '%CapPhat%', '%LenhSanXuat%', '%LenhSX%', '%ProductionOrder%', '%PhanBo%',
];

const SURVEY_SQL = `
  SELECT o.type_desc AS loai, s.name + '.' + o.name AS bang,
         (SELECT SUM(p.rows) FROM sys.partitions p WHERE p.object_id = o.object_id AND p.index_id IN (0, 1)) AS so_dong,
         c.column_id AS stt, c.name AS cot, t.name AS kieu, c.max_length AS do_dai, c.is_nullable AS cho_null
  FROM sys.objects o
  JOIN sys.schemas s ON s.schema_id = o.schema_id
  JOIN sys.columns c ON c.object_id = o.object_id
  JOIN sys.types t ON t.user_type_id = c.user_type_id
  WHERE o.type IN ('U', 'V') AND (${PATTERNS.map((_, i) => `o.name LIKE @p${i}`).join(' OR ')})
  ORDER BY o.name, c.column_id`;

const csv = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

async function survey(database) {
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_SERVER,
    port: Number(process.env.DB_PORT || 1433),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
    options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: process.env.DB_TRUST_CERT !== 'false' },
  }).connect();
  try {
    const req = pool.request();
    PATTERNS.forEach((p, i) => req.input(`p${i}`, p));
    const rows = (await req.query(SURVEY_SQL)).recordset;
    const cols = ['loai', 'bang', 'so_dong', 'stt', 'cot', 'kieu', 'do_dai', 'cho_null'];
    const out = [cols.join(','), ...rows.map((r) => cols.map((c) => csv(r[c])).join(','))].join('\n');
    const dir = path.join(__dirname, '..', 'khao-sat');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${database}.csv`);
    fs.writeFileSync(file, '﻿' + out);
    console.log(`${database}: ${new Set(rows.map((r) => r.bang)).size} bảng/view -> ${file}`);
  } finally {
    await pool.close();
  }
}

(async () => {
  for (const db of [process.env.DB_EGMF, process.env.DB_HIPRO].filter(Boolean)) {
    try {
      await survey(db);
    } catch (err) {
      console.error(`${db}: lỗi ${err.message}`);
    }
  }
})();
