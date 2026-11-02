// Kiểm tra (CHỈ ĐỌC) một PO: kế hoạch eGMF (Đã SX, tình trạng), phân bổ size SBD, lệnh Bravo và sản lượng HiPro theo chuyền.
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
const SBD = {
  db: 'egmf',
  text: `
    SELECT k.KHTId, LTRIM(RTRIM(e.TenCum)) AS maTo, s.TenMau, s.TenSize, SUM(ISNULL(s.SoLuong, 0)) AS soLuong
    FROM dbo.OMM_KeHoachThang k
    JOIN dbo.OMM_KeHoachThang_SBD s ON s.KHTId = k.KHTId
    JOIN dbo.OMM_PO_ChiTiet pct ON pct.POCTId = k.CTPOId
    JOIN dbo.OMM_PO po ON po.POId = pct.POId
    LEFT JOIN dbo.Lib_CumChuyen e ON e.CumId = k.ChuyenId
    WHERE po.PONo = @po
    GROUP BY k.KHTId, LTRIM(RTRIM(e.TenCum)), s.TenMau, s.TenSize
    ORDER BY k.KHTId, s.TenMau, s.TenSize`,
};
// Mọi lệnh Bravo có PO này, mọi trạng thái (web chỉ dùng DocStatus = 4, bỏ IsActive = 0)
const BRAVO = {
  db: 'egmf',
  text: `
    SELECT a.DocNo, a.TypeCt, a.ProductionOrderAdjNo, a.DocStatus, a.IsActive,
           b.PO, b.ProductCode, b.ColorCode, b.SizeCode, SUM(ISNULL(b.Quantity, 0)) AS slLenh
    FROM dbo.Bravo_LenhSanXuat_Detail_PO b
    JOIN dbo.Bravo_LenhSanXuat_Detail a ON a.Id = b.IdDetail
    WHERE b.PO LIKE '%' + @goc + '%'
    GROUP BY a.DocNo, a.TypeCt, a.ProductionOrderAdjNo, a.DocStatus, a.IsActive, b.PO, b.ProductCode, b.ColorCode, b.SizeCode
    ORDER BY a.DocNo, b.PO, b.ColorCode, b.SizeCode`,
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
  await chay(`Phân bổ size (SBD) của PO ${po}`, SBD, { po });
  await chay(`Lệnh Bravo có PO chứa "${goc}" (mọi trạng thái; web chỉ lấy DocStatus = 4)`, BRAVO, { goc });
  await chay('Giá trị TinhTrang / TrangThai / SanXuatXong (toàn bảng)', GIA_TRI, {});
  await chay(`HiPro: kế hoạch + SL đạt (pro_nscl hiện hành) theo chuyền, PO chứa "${goc}"`, HIPRO, { goc });
  fs.mkdirSync('khao-sat', { recursive: true });
  fs.writeFileSync(path.join('khao-sat', 'kiem-tra-po.txt'), `${out.join('\n')}\n`);
  console.log('Đã ghi khao-sat/kiem-tra-po.txt');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
