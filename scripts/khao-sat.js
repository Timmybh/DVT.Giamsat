// Khảo sát (CHỈ ĐỌC) các bảng BTP cắt, phiếu cấp BTP, lệnh sản xuất trên eGMF.
// Chạy: npm run khao-sat   -> ghi ra khao-sat/ket-qua-<database>.txt để gửi lại cho người phát triển.
// Khảo sát nhóm bảng khác: npm run khao-sat -- "%DieuTiet%" "%GiacSoDo%"  (mẫu LIKE theo tên bảng)
// Database khác eGMF: npm run khao-sat -- --db=HiPro "pro[_]nscl%"
// Gồm: cột của từng bảng, khóa ngoại, số dòng và 5 dòng mẫu mới nhất.
// Xuất code store procedure / view / function: npm run khao-sat -- --proc "%MayRa%"  -> khao-sat/store-<database>.txt
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const DEFAULT_PATTERNS = [
  'CUTTING[_]PhieuCapBTP%', 'CUTTING[_]PhieuHoachToan%', 'CUTTING[_]%Xuat%',
  'Bravo[_]LenhSanXuat%', '%LenhSanXuat%', '%ProductionOrder%',
];
const ARGS = process.argv.slice(2);
const DB_ARG = (ARGS.find((a) => a.startsWith('--db=')) || '').slice(5);
const PROC = ARGS.includes('--proc');
const PATTERN_ARGS = ARGS.filter((a) => !a.startsWith('--db=') && a !== '--proc');
const PATTERNS = PATTERN_ARGS.length ? PATTERN_ARGS : DEFAULT_PATTERNS;
const SAMPLE_ROWS = 5;

const TABLES_SQL = `
  SELECT o.object_id AS id, s.name AS sch, o.name AS ten, o.type_desc AS loai,
         (SELECT SUM(p.rows) FROM sys.partitions p WHERE p.object_id = o.object_id AND p.index_id IN (0, 1)) AS so_dong
  FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id
  WHERE o.type IN ('U', 'V') AND (${PATTERNS.map((_, i) => `o.name LIKE @p${i}`).join(' OR ')})
  ORDER BY o.name`;

const COLUMNS_SQL = `
  SELECT c.object_id AS id, c.name AS cot, t.name AS kieu, c.max_length AS do_dai, c.is_nullable AS cho_null,
         CASE WHEN ic.column_id IS NOT NULL THEN 1 ELSE 0 END AS khoa_chinh
  FROM sys.columns c
  JOIN sys.types t ON t.user_type_id = c.user_type_id
  LEFT JOIN sys.indexes i ON i.object_id = c.object_id AND i.is_primary_key = 1
  LEFT JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.column_id = c.column_id
  WHERE c.object_id IN (@@IDS)
  ORDER BY c.object_id, c.column_id`;

const FK_SQL = `
  SELECT OBJECT_NAME(fk.parent_object_id) AS bang, pc.name AS cot,
         OBJECT_NAME(fk.referenced_object_id) AS bang_tham_chieu, rc.name AS cot_tham_chieu
  FROM sys.foreign_key_columns fk
  JOIN sys.columns pc ON pc.object_id = fk.parent_object_id AND pc.column_id = fk.parent_column_id
  JOIN sys.columns rc ON rc.object_id = fk.referenced_object_id AND rc.column_id = fk.referenced_column_id
  WHERE fk.parent_object_id IN (@@IDS) OR fk.referenced_object_id IN (@@IDS)`;

// Code của store / view / function / trigger (cần quyền VIEW DEFINITION)
const PROC_SQL = `
  SELECT s.name AS sch, o.name AS ten, o.type_desc AS loai, o.modify_date AS sua_luc, m.definition AS code
  FROM sys.sql_modules m
  JOIN sys.objects o ON o.object_id = m.object_id
  JOIN sys.schemas s ON s.schema_id = o.schema_id
  WHERE (${PATTERNS.map((_, i) => `o.name LIKE @p${i}`).join(' OR ')})
  ORDER BY o.type_desc, o.name`;

const fmt = (v) => {
  if (v == null) return 'NULL';
  if (v instanceof Date) return v.toISOString().replace('T', ' ').slice(0, 19);
  if (Buffer.isBuffer(v)) return `<binary ${v.length}B>`;
  return String(v).replace(/[\t\r\n]+/g, ' ').slice(0, 60);
};

async function main() {
  const database = DB_ARG || process.env.DB_EGMF || 'eGMF';
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_SERVER,
    port: Number(process.env.DB_PORT || 1433),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
    options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: process.env.DB_TRUST_CERT !== 'false' },
    requestTimeout: 60000,
  }).connect();
  // Đọc không khóa bảng (READ UNCOMMITTED áp dụng cho các câu sau trên cùng kết nối)
  const nolock = (text) => `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;\n${text}`;
  const out = [`Khảo sát ${database} trên ${process.env.DB_SERVER} lúc ${new Date().toISOString()}`, ''];
  if (PROC) {
    try {
      const req = pool.request();
      PATTERNS.forEach((p, i) => req.input(`p${i}`, p));
      const mods = (await req.query(nolock(PROC_SQL))).recordset;
      if (!mods.length) throw new Error('Không tìm thấy store / view / function nào khớp (hoặc tài khoản không có quyền VIEW DEFINITION)');
      out.push('=== DANH SÁCH ===');
      mods.forEach((m) => out.push(`${m.sch}.${m.ten}\t${m.loai}\tsửa lúc ${fmt(m.sua_luc)}`));
      mods.forEach((m) => out.push('', `=== ${m.sch}.${m.ten} (${m.loai}) ===`, m.code));
    } finally {
      await pool.close();
    }
    return ghi(`store-${database}.txt`, out);
  }
  try {
    const req = pool.request();
    PATTERNS.forEach((p, i) => req.input(`p${i}`, p));
    const tables = (await req.query(nolock(TABLES_SQL))).recordset;
    if (!tables.length) throw new Error('Không tìm thấy bảng nào khớp');
    // object_id là số nguyên lấy từ sys.objects nên ghép thẳng vào câu lệnh (SQL Server cũ không có STRING_SPLIT)
    const ids = tables.map((t) => Number(t.id)).join(',');
    const cols = (await pool.request().query(nolock(COLUMNS_SQL).replace(/@@IDS/g, ids))).recordset;
    const fks = (await pool.request().query(nolock(FK_SQL).replace(/@@IDS/g, ids))).recordset;

    out.push('=== DANH SÁCH BẢNG ===');
    tables.forEach((t) => out.push(`${t.sch}.${t.ten}\t${t.loai}\t${t.so_dong ?? '?'} dòng`));
    out.push('', '=== KHÓA NGOẠI ===');
    if (!fks.length) out.push('(không có)');
    fks.forEach((f) => out.push(`${f.bang}.${f.cot} -> ${f.bang_tham_chieu}.${f.cot_tham_chieu}`));

    for (const t of tables) {
      const tc = cols.filter((c) => c.id === t.id);
      out.push('', `=== ${t.sch}.${t.ten} (${t.so_dong ?? '?'} dòng) ===`);
      tc.forEach((c) => out.push(`  ${c.khoa_chinh ? '*' : ' '} ${c.cot}\t${c.kieu}${c.kieu.includes('char') ? `(${c.do_dai})` : ''}${c.cho_null ? '' : ' NOT NULL'}`));
      // 5 dòng mới nhất (theo khóa chính nếu có)
      const pk = tc.find((c) => c.khoa_chinh);
      const order = pk ? `ORDER BY [${pk.cot}] DESC` : '';
      try {
        const rows = (await pool.request().query(nolock(`SELECT TOP ${SAMPLE_ROWS} * FROM [${t.sch}].[${t.ten}] ${order}`))).recordset;
        out.push('  -- dòng mẫu --');
        const names = tc.map((c) => c.cot);
        out.push('  ' + names.join(' | '));
        rows.forEach((r) => out.push('  ' + names.map((n) => fmt(r[n])).join(' | ')));
      } catch (err) {
        out.push(`  (không đọc được dòng mẫu: ${err.message})`);
      }
    }
  } finally {
    await pool.close();
  }
  return ghi(`ket-qua-${database}.txt`, out);
}

function ghi(ten, out) {
  const dir = path.join(__dirname, '..', 'khao-sat');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, ten);
  fs.writeFileSync(file, out.join('\n'));
  console.log(`Đã ghi ${file}`);
}

main().catch((err) => {
  console.error('Lỗi:', err.message);
  process.exit(1);
});
