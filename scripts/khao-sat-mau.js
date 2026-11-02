// Khảo sát (CHỈ ĐỌC) cách ghi màu giữa phân bổ eGMF (OMM_KeHoachThang_SBD.TenMau) và lệnh Bravo (Detail_PO.ColorCode).
// Ghép theo PO + size (không theo màu), kế hoạch may trong N ngày gần đây, rồi phân loại kiểu khớp.
// Chạy: npm run khao-sat-mau -- [soNgay=60]   -> khao-sat/khao-sat-mau.txt
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const soNgay = Number(process.argv[2]) || 60;
const Q = {
  db: 'egmf',
  text: `
    WITH sbd AS (
      SELECT DISTINCT po.PONo AS po, LTRIM(RTRIM(ISNULL(s.TenMau, ''))) AS tenMau, REPLACE(UPPER(ISNULL(s.TenSize, '')), ' ', '') AS size
      FROM dbo.OMM_KeHoachThang k
      JOIN dbo.OMM_KeHoachThang_SBD s ON s.KHTId = k.KHTId
      JOIN dbo.OMM_PO_ChiTiet ct ON ct.POCTId = k.CTPOId
      JOIN dbo.OMM_PO po ON po.POId = ct.POId
      WHERE k.SoLuong > 0 AND k.NgayMayKeHoachKetThuc >= DATEADD(day, -@soNgay, GETDATE())
    ),
    lenh AS (
      SELECT DISTINCT LTRIM(RTRIM(b.PO)) AS po, LTRIM(RTRIM(ISNULL(b.ColorCode, ''))) AS colorCode, REPLACE(UPPER(ISNULL(b.SizeCode, '')), ' ', '') AS size
      FROM dbo.Bravo_LenhSanXuat_Detail_PO b
      JOIN dbo.Bravo_LenhSanXuat_Detail a ON a.Id = b.IdDetail
      WHERE ISNULL(a.IsActive, 1) <> 0 AND a.DocStatus = 4 AND LTRIM(RTRIM(b.PO)) IN (SELECT po FROM sbd)
    )
    SELECT DISTINCT s.po, s.tenMau, l.colorCode
    FROM sbd s JOIN lenh l ON l.po = s.po AND l.size = s.size`,
};

const U = (v) => String(v ?? '').trim().toUpperCase();
const kieu = (ten, ma) => {
  const t = U(ten); const m = U(ma);
  if (!m) return 'Bravo trống ColorCode';
  if (t === m) return 'Trùng hẳn';
  if (t.replace(/\s+/g, '') === m.replace(/\s+/g, '')) return 'Trùng khi bỏ khoảng trắng';
  if (t.startsWith(m) && /^[-\s/_.(]/.test(t.slice(m.length))) return 'TenMau = ColorCode + dấu tách + tên';
  if (t.startsWith(m)) return 'TenMau bắt đầu bằng ColorCode (không dấu tách)';
  if (t.includes(m)) return 'ColorCode nằm giữa TenMau';
  if (m.includes(t) && t) return 'TenMau nằm trong ColorCode';
  return 'Không khớp chuỗi';
};

(async () => {
  const rows = await db.query(Q, { soNgay });
  const nhom = new Map();
  rows.forEach((r) => { const k = kieu(r.tenMau, r.colorCode); (nhom.get(k) || nhom.set(k, []).get(k)).push(r); });
  // PO có ít nhất 1 cặp khớp thì cặp "Không khớp chuỗi" của PO đó chỉ là màu khác cùng size, tách riêng
  const poKhop = new Set(rows.filter((r) => kieu(r.tenMau, r.colorCode) !== 'Không khớp chuỗi').map((r) => `${r.po}|${U(r.tenMau)}`));
  const out = [`Khảo sát ${soNgay} ngày, ${rows.length} cặp (PO, TenMau, ColorCode) cùng PO + size`, ''];
  [...nhom.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([k, rs]) => {
    const ds = k === 'Không khớp chuỗi' ? rs.filter((r) => !poKhop.has(`${r.po}|${U(r.tenMau)}`)) : rs;
    out.push(`=== ${k}: ${ds.length} cặp${k === 'Không khớp chuỗi' ? ' (TenMau chưa ghép được màu nào khác của PO)' : ''} ===`);
    out.push('po | tenMau | colorCode');
    ds.slice(0, 40).forEach((r) => out.push(`${r.po} | ${r.tenMau} | ${r.colorCode}`));
    if (ds.length > 40) out.push(`... còn ${ds.length - 40} cặp`);
    out.push('');
  });
  fs.mkdirSync('khao-sat', { recursive: true });
  fs.writeFileSync(path.join('khao-sat', 'khao-sat-mau.txt'), `${out.join('\n')}\n`);
  console.log('Đã ghi khao-sat/khao-sat-mau.txt');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
