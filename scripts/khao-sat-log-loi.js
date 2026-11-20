// Khảo sát (CHỈ ĐỌC, READ UNCOMMITTED như src/db.js) log bấm lỗi HiPro pro_nscl_chi_tiet_loi để làm lưới "Log bấm lỗi" trang QC.
// 1. Cột của pro_nscl_chi_tiet_loi, pro_nscl, pro_loi, pro_check_point và các bảng người dùng / thiết bị HiPro
// 2. 20 dòng mới nhất của pro_nscl_chi_tiet_loi (SELECT *) trong ngày, kèm tổ / check point / mã hàng
// 3. Thống kê 1 ngày: số dòng, số dòng có thoi_gian, gio_lam, pro_loi_id
// Chạy: npm run khao-sat-log-loi   hoặc kèm ngày sau dấu -- (vd -- 2026-11-20)   -> khao-sat/khao-sat-log-loi.txt
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const ngay = String(process.argv[2] || new Date().toISOString().slice(0, 10)).trim();
const fmt = (v) => (v instanceof Date ? v.toISOString().slice(0, 19).replace('T', ' ') : v == null ? '' : String(v).slice(0, 60));
const bang = (out, tieuDe, rs) => {
  out.push(`=== ${tieuDe} (${rs.length} dòng) ===`);
  if (rs.length) out.push(Object.keys(rs[0]).join(' | '), ...rs.map((r) => Object.values(r).map(fmt).join(' | ')));
  out.push('');
};
const q = (text, p = {}) => db.query({ db: 'hipro', text }, p);

(async () => {
  const out = [`Ngày: ${ngay}`, ''];
  const cot = await q(`
    SELECT t.name AS bang, c.name AS cot, ty.name AS kieu
    FROM sys.tables t JOIN sys.columns c ON c.object_id = t.object_id JOIN sys.types ty ON ty.user_type_id = c.user_type_id
    WHERE t.name IN ('pro_nscl_chi_tiet_loi', 'pro_nscl', 'pro_loi', 'pro_check_point', 'pro_cum_loi')
       OR t.name LIKE '%user%' OR t.name LIKE '%nguoi%' OR t.name LIKE '%nhan_vien%' OR t.name LIKE '%thiet_bi%' OR t.name LIKE '%device%' OR t.name LIKE '%tablet%'
    ORDER BY t.name, c.column_id`);
  const theoBang = new Map();
  cot.forEach((c) => (theoBang.get(c.bang) || theoBang.set(c.bang, []).get(c.bang)).push(`${c.cot} ${c.kieu}`));
  out.push('=== 1. Cột các bảng ===');
  theoBang.forEach((cs, b) => out.push(`${b}: ${cs.join(', ')}`));
  out.push('');
  const loc = `JOIN dbo.pro_nscl n ON n.id = d.pronscl_id
      JOIN dbo.pro_ke_hoach_san_xuat k ON k.id = n.pro_ke_hoach_san_xuat_id
      WHERE k.ngay_san_xuat >= @ngay AND k.ngay_san_xuat < DATEADD(day, 1, @ngay)`;
  try {
    bang(out, '2. 20 dòng mới nhất pro_nscl_chi_tiet_loi', await q(`
      SELECT TOP 20 c.ten AS to_hipro, cp.ten AS check_point, k.ngay_san_xuat, d.*
      FROM dbo.pro_nscl_chi_tiet_loi d
      ${loc.replace('WHERE', `JOIN dbo.pro_chuyen c ON c.id = k.pro_chuyen_id
      LEFT JOIN dbo.pro_check_point cp ON cp.id = n.pro_check_point_id
      WHERE`)}
      ORDER BY d.id DESC`, { ngay }));
  } catch (e) { out.push(`2. lỗi ${e.message}`, ''); }
  try {
    bang(out, '3. Thống kê trong ngày', await q(`
      SELECT COUNT(*) AS soDong, COUNT(d.thoi_gian) AS coThoiGian, COUNT(d.gio_lam) AS coGioLam, COUNT(d.pro_loi_id) AS coLoiId,
             MIN(d.thoi_gian) AS tu, MAX(d.thoi_gian) AS den, COUNT(DISTINCT d.pronscl_id) AS soPhieuNscl
      FROM dbo.pro_nscl_chi_tiet_loi d
      ${loc}`, { ngay }));
  } catch (e) { out.push(`3. lỗi ${e.message}`, ''); }
  try {
    bang(out, '3b. 1 dòng pro_nscl có lỗi trong ngày', await q(`
      SELECT TOP 1 n.* FROM dbo.pro_nscl_chi_tiet_loi d ${loc} ORDER BY d.id DESC`, { ngay }));
  } catch (e) { out.push(`3b. lỗi ${e.message}`, ''); }
  const dir = path.join(__dirname, '..', 'khao-sat');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, 'khao-sat-log-loi.txt');
  fs.writeFileSync(f, out.join('\n'), 'utf8');
  console.log(`Đã ghi ${f}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
