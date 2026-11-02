// Kiểm tra (CHỈ ĐỌC) khóa nối HiPro -> eGMF cho một tổ trong ngày:
//   pro_ke_hoach_san_xuat.oid_mapping -> NV_KeHoachSanXuat.KHTId (= OMM_KeHoachThang.KHTId)
//   pro_chuyen.oid_mapping -> DM_Chuyen.IdChuyenOMM (= Lib_CumChuyen.CumId)
//   pro_san_pham.oid_mapping -> DM_SanPham_PO.CTPOId (= OMM_PO_ChiTiet.POCTId)
// Chạy: npm run kiem-tra-khop -- <ngày yyyy-mm-dd> <số xí nghiệp> <tổ>   -> khao-sat/kiem-tra-khop.txt
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const [d, xn, to] = process.argv.slice(2);
if (!d || !xn || !to) { console.error('Ví dụ: npm run kiem-tra-khop -- 2026-11-02 2 6'); process.exit(1); }

const HIPRO = {
  db: 'hipro',
  text: `
    SELECT c.ten AS chuyen, c.stt, dmc.IdChuyenOMM AS cumId, sp.ma_san_pham AS maHang, sp.ma_don_hang AS maDonHang, sp.po,
           sppo.CTPOId AS ctpoId, nv.KHTId AS khtId, k.id AS khsxId, CAST(k.ngay_san_xuat AS date) AS ngay,
           SUM(${Array.from({ length: 14 }, (_, i) => `ISNULL(n.qty_${i + 1}_h, 0) + ISNULL(n.fix_${i + 1}_h, 0)`).join(' + ')}) AS mayRa
    FROM dbo.pro_ke_hoach_san_xuat k
    JOIN dbo.pro_chuyen c ON c.id = k.pro_chuyen_id
    JOIN dbo.pro_nha_may nm ON nm.id = c.pro_nha_may_id
    JOIN dbo.pro_san_pham sp ON sp.id = k.pro_san_pham_id
    LEFT JOIN dbo.pro_nscl n ON n.pro_ke_hoach_san_xuat_id = k.id
    LEFT JOIN dbo.DM_Chuyen dmc ON dmc.Oid = c.oid_mapping
    LEFT JOIN dbo.DM_SanPham_PO sppo ON sppo.Oid = sp.oid_mapping
    LEFT JOIN dbo.NV_KeHoachSanXuat nv ON nv.Oid = k.oid_mapping
    WHERE k.ngay_san_xuat >= @d AND k.ngay_san_xuat < DATEADD(day, 1, @d) AND nm.ten LIKE '%' + @xn AND c.ten = @to
    GROUP BY c.ten, c.stt, dmc.IdChuyenOMM, sp.ma_san_pham, sp.ma_don_hang, sp.po, sppo.CTPOId, nv.KHTId, k.id, CAST(k.ngay_san_xuat AS date)`,
};
const EGMF = (ids) => ({
  db: 'egmf',
  text: `
    SELECT k.KHTId, k.CTPOId, k.ChuyenId AS cumId, LTRIM(RTRIM(e.TenCum)) AS maTo, po.PONo, dh.MaHang, k.LSX, k.SoLuong, k.TinhTrang,
           k.NgayVaoChuyenKeHoachBatDau, k.NgayMayKeHoachKetThuc
    FROM dbo.OMM_KeHoachThang k
    JOIN dbo.OMM_PO_ChiTiet pct ON pct.POCTId = k.CTPOId
    JOIN dbo.OMM_PO po ON po.POId = pct.POId
    JOIN dbo.OMM_DonHang dh ON dh.DHId = po.DHId
    LEFT JOIN dbo.Lib_CumChuyen e ON e.CumId = k.ChuyenId
    WHERE k.KHTId IN (${ids.length ? ids.map((_, i) => `@k${i}`).join(', ') : 'NULL'})`,
});

(async () => {
  const bang = (rows) => (rows.length
    ? [Object.keys(rows[0]).join(' | '), ...rows.map((r) => Object.values(r).map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v)).join(' | '))]
    : ['(không có dòng nào)']);
  const out = [`Ngày ${d}, xí nghiệp ${xn}, tổ ${to}`, ''];
  let hp = [];
  out.push('=== HiPro: kế hoạch SX trong ngày + khóa nối sang eGMF ===');
  try { hp = await db.query(HIPRO, { d, xn: String(Number(xn)), to: String(to) }); out.push(...bang(hp)); } catch (e) { out.push(`LỖI: ${e.message}`); }
  out.push('');
  const ids = [...new Set(hp.map((r) => r.khtId).filter((v) => v != null))];
  out.push('=== eGMF: dòng OMM_KeHoachThang theo KHTId của HiPro ===');
  try {
    const p = {}; ids.forEach((v, i) => { p[`k${i}`] = v; });
    out.push(...bang(await db.query(EGMF(ids), p)));
  } catch (e) { out.push(`LỖI: ${e.message}`); }
  fs.mkdirSync('khao-sat', { recursive: true });
  fs.writeFileSync(path.join('khao-sat', 'kiem-tra-khop.txt'), `${out.join('\n')}\n`);
  console.log('Đã ghi khao-sat/kiem-tra-khop.txt');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
