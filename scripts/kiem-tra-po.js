// Kiểm tra (CHỈ ĐỌC) một PO: kế hoạch eGMF (Đã SX, tình trạng) và sản lượng HiPro theo chuyền.
// Chạy: npm run kiem-tra-po -- <PO>   -> khao-sat/kiem-tra-po.txt
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const po = String(process.argv[2] || '').trim();
if (!po) { console.error('Thiếu PO. Ví dụ: npm run kiem-tra-po -- 6KNEW107J06-H167994'); process.exit(1); }
const goc = po.split('-')[0];

const KE_HOACH = {
  db: 'egmf',
  text: `
    SELECT k.KHTId, po.PONo, px.TenPhanXuong, LTRIM(RTRIM(e.TenCum)) AS maTo, e.STT, k.SoLuong, k.SoLuongTPDaNhap,
           k.SoLuongCoThePhanBo, k.TinhTrang, k.TrangThai, k.SanXuatXong, k.isGoc, k.isBanHanh, k.LSX,
           k.NgayVaoChuyenKeHoachBatDau, k.NgayMayKeHoachKetThuc
    FROM dbo.OMM_KeHoachThang k
    JOIN dbo.OMM_PO_ChiTiet pct ON pct.POCTId = k.CTPOId
    JOIN dbo.OMM_PO po ON po.POId = pct.POId
    LEFT JOIN dbo.Lib_CumChuyen e ON e.CumId = k.ChuyenId
    LEFT JOIN dbo.Lib_PhanXuong px ON px.PXId = e.PXId
    WHERE po.PONo = @po
    ORDER BY k.KHTId`,
};
const GIA_TRI = {
  db: 'egmf',
  text: `
    SELECT 'TinhTrang' AS cot, ISNULL(TinhTrang, '(null)') AS giaTri, COUNT(*) AS n FROM dbo.OMM_KeHoachThang GROUP BY TinhTrang
    UNION ALL SELECT 'TrangThai', ISNULL(TrangThai, '(null)'), COUNT(*) FROM dbo.OMM_KeHoachThang GROUP BY TrangThai
    UNION ALL SELECT 'SanXuatXong', ISNULL(CAST(SanXuatXong AS varchar(5)), '(null)'), COUNT(*) FROM dbo.OMM_KeHoachThang GROUP BY SanXuatXong`,
};
const HIPRO = {
  db: 'hipro',
  text: `
    SELECT nm.ten AS xn, c.ten AS chuyen, c.stt, sp.ma_san_pham AS maHang, sp.po,
           MIN(k.ngay_san_xuat) AS tuNgay, MAX(k.ngay_san_xuat) AS denNgay,
           SUM(${Array.from({ length: 14 }, (_, i) => `ISNULL(n.qty_${i + 1}_h, 0)`).join(' + ')}) AS dat
    FROM dbo.pro_ke_hoach_san_xuat k
    JOIN dbo.pro_chuyen c ON c.id = k.pro_chuyen_id
    JOIN dbo.pro_nha_may nm ON nm.id = c.pro_nha_may_id
    JOIN dbo.pro_san_pham sp ON sp.id = k.pro_san_pham_id
    LEFT JOIN dbo.pro_nscl n ON n.pro_ke_hoach_san_xuat_id = k.id
    WHERE sp.po LIKE '%' + @goc + '%'
    GROUP BY nm.ten, c.ten, c.stt, sp.ma_san_pham, sp.po
    ORDER BY sp.po, nm.ten, c.ten`,
};

(async () => {
  const bang = (rows) => (rows.length
    ? [Object.keys(rows[0]).join(' | '), ...rows.map((r) => Object.values(r).map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v)).join(' | '))]
    : ['(không có dòng nào)']);
  const out = [];
  const chay = async (ten, q, p) => {
    out.push(`=== ${ten} ===`);
    try { out.push(...bang(await db.query(q, p))); } catch (e) { out.push(`LỖI: ${e.message}`); }
    out.push('');
  };
  await chay(`Kế hoạch eGMF của PO ${po}`, KE_HOACH, { po });
  await chay('Giá trị TinhTrang / TrangThai / SanXuatXong (toàn bảng)', GIA_TRI, {});
  await chay(`HiPro: kế hoạch + SL đạt (pro_nscl hiện hành) theo chuyền, PO chứa "${goc}"`, HIPRO, { goc });
  fs.mkdirSync('khao-sat', { recursive: true });
  fs.writeFileSync(path.join('khao-sat', 'kiem-tra-po.txt'), `${out.join('\n')}\n`);
  console.log('Đã ghi khao-sat/kiem-tra-po.txt');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
