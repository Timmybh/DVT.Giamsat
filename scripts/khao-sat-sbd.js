// Khảo sát (CHỈ ĐỌC) phân bổ size (SBD) của 1 PO: toàn bộ cột kế hoạch + SBD, giá trị các cột tình trạng,
// và các bảng OMM khác có tên giống SBD / phân bổ / size break down (tìm SL "treo" chưa phân bổ vào chuyền).
// Chạy: npm run khao-sat-sbd -- 4558955102FOA409991   -> khao-sat/khao-sat-sbd.txt
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const po = String(process.argv[2] || '').trim();
if (!po) { console.error('Thiếu PO. Ví dụ: npm run khao-sat-sbd -- 4558955102FOA409991'); process.exit(1); }

const fmt = (rows) => (rows.length
  ? [Object.keys(rows[0]).join(' | '), ...rows.map((r) => Object.values(r).map((v) => (v instanceof Date ? v.toISOString().replace('T', ' ').slice(0, 16) : v)).join(' | '))]
  : ['(không có dòng nào)']);

(async () => {
  const out = [`PO: ${po}`, ''];
  const q = (text, p) => db.query({ db: 'egmf', text }, p);
  const chay = async (ten, text, p) => {
    out.push(`=== ${ten} ===`);
    try { out.push(...fmt(await q(text, p))); } catch (e) { out.push(`LỖI: ${e.message}`); }
    out.push('');
  };
  const khPO = `SELECT k.KHTId FROM dbo.OMM_KeHoachThang k JOIN dbo.OMM_PO_ChiTiet ct ON ct.POCTId = k.CTPOId JOIN dbo.OMM_PO p ON p.POId = ct.POId WHERE p.PONo = @po`;
  await chay('OMM_KeHoachThang (mọi cột)', `SELECT k.* FROM dbo.OMM_KeHoachThang k WHERE k.KHTId IN (${khPO}) ORDER BY k.KHTId`, { po });
  await chay('OMM_PO_ChiTiet (mọi cột)', `SELECT ct.* FROM dbo.OMM_PO_ChiTiet ct JOIN dbo.OMM_PO p ON p.POId = ct.POId WHERE p.PONo = @po`, { po });
  await chay('OMM_KeHoachThang_SBD (mọi cột, mọi dòng)', `SELECT s.* FROM dbo.OMM_KeHoachThang_SBD s WHERE s.KHTId IN (${khPO}) ORDER BY s.KHTId, s.TenMau, s.TenSize, s.SKId`, { po });
  await chay('Giá trị LoaiMau / ThaoTacNhap trong SBD (toàn bảng)', `
    SELECT 'LoaiMau' AS cot, ISNULL(CAST(LoaiMau AS nvarchar(100)), '(null)') AS giaTri, COUNT(*) AS n FROM dbo.OMM_KeHoachThang_SBD GROUP BY LoaiMau
    UNION ALL SELECT 'ThaoTacNhap', ISNULL(CAST(ThaoTacNhap AS nvarchar(100)), '(null)'), COUNT(*) FROM dbo.OMM_KeHoachThang_SBD GROUP BY ThaoTacNhap
    UNION ALL SELECT 'TenSize trống', CASE WHEN ISNULL(TenSize, '') = '' THEN 'trống' ELSE 'có size' END, COUNT(*) FROM dbo.OMM_KeHoachThang_SBD
      GROUP BY CASE WHEN ISNULL(TenSize, '') = '' THEN 'trống' ELSE 'có size' END`);

  // Các bảng có tên giống SBD / phân bổ / size break down
  const bang = await q(`
    SELECT t.TABLE_NAME AS bang,
           MAX(CASE WHEN c.COLUMN_NAME = 'KHTId' THEN 1 ELSE 0 END) AS coKHT,
           MAX(CASE WHEN c.COLUMN_NAME IN ('PONo', 'PO') THEN c.COLUMN_NAME END) AS cotPO,
           STRING_AGG(CAST(c.COLUMN_NAME AS nvarchar(max)), ', ') WITHIN GROUP (ORDER BY c.ORDINAL_POSITION) AS cot
    FROM INFORMATION_SCHEMA.TABLES t JOIN INFORMATION_SCHEMA.COLUMNS c ON c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME
    WHERE t.TABLE_SCHEMA = 'dbo' AND t.TABLE_TYPE = 'BASE TABLE'
      AND (t.TABLE_NAME LIKE '%SBD%' OR t.TABLE_NAME LIKE '%PhanBo%' OR t.TABLE_NAME LIKE '%SizeBreak%' OR t.TABLE_NAME LIKE 'OMM[_]%')
    GROUP BY t.TABLE_NAME ORDER BY t.TABLE_NAME`).catch((e) => { out.push(`LỖI liệt kê bảng: ${e.message}`); return []; });
  out.push('=== Bảng có tên giống SBD / PhanBo / SizeBreak / OMM_ ===', 'bang | cột', ...bang.map((b) => `${b.bang} | ${b.cot}`), '');
  out.push('=== Dữ liệu của PO trong các bảng trên (TOP 30 mỗi bảng) ===');
  for (const b of bang) {
    if (['OMM_KeHoachThang', 'OMM_KeHoachThang_SBD', 'OMM_PO_ChiTiet'].includes(b.bang)) continue;
    const dk = b.coKHT ? `KHTId IN (${khPO})` : b.cotPO ? `[${b.cotPO}] = @po` : null;
    if (!dk) continue;
    try {
      const rs = await q(`SELECT TOP 30 * FROM dbo.[${b.bang}] WHERE ${dk}`, { po });
      if (rs.length) out.push(`--- ${b.bang}: ${rs.length} dòng ---`, ...fmt(rs)); else out.push(`${b.bang}: không có`);
    } catch (e) { out.push(`${b.bang}: LỖI ${e.message}`); }
  }
  fs.mkdirSync('khao-sat', { recursive: true });
  fs.writeFileSync(path.join('khao-sat', 'khao-sat-sbd.txt'), `${out.join('\n')}\n`);
  console.log('Đã ghi khao-sat/khao-sat-sbd.txt');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
