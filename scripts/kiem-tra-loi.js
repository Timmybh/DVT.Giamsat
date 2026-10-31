// Đối chiếu (CHỈ ĐỌC) số lỗi theo giờ của một tổ trong ngày: HiPro pro_nscl (đạt / lỗi / sửa theo giờ, theo check point)
// và kiểm tra chuyên môn inline eGMF (KTCM_InLine_*: khung giờ, SP kiểm, SP lỗi, tên lỗi).
// Chạy: npm run kiem-tra-loi -- <ngày yyyy-mm-dd> <số xí nghiệp> <tổ> [mã hàng]   -> khao-sat/kiem-tra-loi.txt
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const [d, xn, to, maHang = ''] = process.argv.slice(2);
if (!d || !xn || !to) { console.error('Ví dụ: npm run kiem-tra-loi -- 2026-10-31 2 7 FOA409790'); process.exit(1); }
const gio = (cot) => Array.from({ length: 10 }, (_, i) => `SUM(ISNULL(n.${cot}_${i + 1}_h, 0)) AS ${cot.slice(0, 1)}${i + 1}`).join(', ');

const HIPRO = {
  db: 'hipro',
  text: `
    SELECT nm.ten AS xn, c.ten AS chuyen, cp.ten AS checkPoint, cp.type, sp.ma_san_pham AS maHang, sp.po,
           ${gio('qty')}, ${gio('reject')}, ${gio('fix')},
           SUM(ISNULL(n.loi_ngay, 0)) AS loiNgay, SUM(ISNULL(n.sua_ngay, 0)) AS suaNgay
    FROM dbo.pro_nscl n
    JOIN dbo.pro_ke_hoach_san_xuat k ON k.id = n.pro_ke_hoach_san_xuat_id
    JOIN dbo.pro_chuyen c ON c.id = k.pro_chuyen_id
    JOIN dbo.pro_nha_may nm ON nm.id = c.pro_nha_may_id
    JOIN dbo.pro_san_pham sp ON sp.id = k.pro_san_pham_id
    LEFT JOIN dbo.pro_check_point cp ON cp.id = n.pro_check_point_id
    WHERE k.ngay_san_xuat >= @d AND k.ngay_san_xuat < DATEADD(day, 1, @d)
      AND nm.ten LIKE '%' + @xn AND c.ten = @to AND (@maHang = '' OR sp.ma_san_pham = @maHang)
    GROUP BY nm.ten, c.ten, cp.ten, cp.type, sp.ma_san_pham, sp.po`,
};
const HIPRO_KIEM_TRONG = {
  db: 'hipro',
  text: `
    SELECT kt.thoi_gian, kt.gio_lam, kt.ma_loi, l.ten_loi, cp.ten AS checkPoint
    FROM dbo.pro_kiemtrong_chi_tiet_loi kt
    JOIN dbo.pro_ke_hoach_san_xuat k ON k.id = kt.pro_ke_hoach_san_xuat_id
    JOIN dbo.pro_chuyen c ON c.id = k.pro_chuyen_id
    JOIN dbo.pro_nha_may nm ON nm.id = c.pro_nha_may_id
    LEFT JOIN dbo.pro_loi l ON l.id = kt.pro_loi_id
    LEFT JOIN dbo.pro_check_point cp ON cp.id = kt.pro_checkpoint_id
    WHERE kt.thoi_gian >= @d AND kt.thoi_gian < DATEADD(day, 1, @d) AND nm.ten LIKE '%' + @xn AND c.ten = @to
    ORDER BY kt.thoi_gian`,
};
// Kiểm tra inline eGMF: SP kiểm / lỗi theo sơ đồ chuyền (IdMaster) x khung giờ trong ngày, xí nghiệp @xn
const KTCM = {
  db: 'egmf',
  text: `
    SELECT t.IdMaster, sp.IdKhungGio, MIN(kt.ThoiGianKiem) AS tu, MAX(kt.ThoiGianKiem) AS den, MAX(kt.NguoiKiem) AS nguoiKiem,
           SUM(ISNULL(sp.SL, 0)) AS spKiem, SUM(CASE WHEN sp.TrangThai = N'Đạt' THEN ISNULL(sp.SL, 0) ELSE 0 END) AS spDat,
           SUM(CASE WHEN sp.TrangThai <> N'Đạt' THEN ISNULL(sp.SL, 0) ELSE 0 END) AS spLoi
    FROM dbo.KTCM_InLine_SoDoChuyen_Tram_KiemTra_SanPham sp
    JOIN dbo.KTCM_InLine_SoDoChuyen_Tram_KiemTra kt ON kt.Id = sp.IdTramKT
    JOIN dbo.KTCM_InLine_SoDoChuyen_Tram t ON t.Id = kt.IdSDC_Tram
    WHERE sp.NgayTao >= @d AND sp.NgayTao < DATEADD(day, 1, @d) AND sp.XiNghiep LIKE N'%' + @xn
    GROUP BY t.IdMaster, sp.IdKhungGio
    ORDER BY t.IdMaster, sp.IdKhungGio`,
};
const KTCM_LOI = {
  db: 'egmf',
  text: `
    SELECT t.IdMaster, l.IdKhungGio, l.TenLoi, SUM(ISNULL(l.SLLoi, 1)) AS soLoi, MAX(l.NguoiKiem) AS nguoiKiem
    FROM dbo.KTCM_InLine_SoDoChuyen_Tram_KiemTra_SanPham_CTLoi l
    JOIN dbo.KTCM_InLine_SoDoChuyen_Tram_KiemTra_SanPham sp ON sp.Id = l.IdSanPham
    JOIN dbo.KTCM_InLine_SoDoChuyen_Tram_KiemTra kt ON kt.Id = sp.IdTramKT
    JOIN dbo.KTCM_InLine_SoDoChuyen_Tram t ON t.Id = kt.IdSDC_Tram
    WHERE l.NgayKiem >= @d AND l.NgayKiem < DATEADD(day, 1, @d) AND sp.XiNghiep LIKE N'%' + @xn AND l.TenLoi IS NOT NULL
    GROUP BY t.IdMaster, l.IdKhungGio, l.TenLoi
    ORDER BY t.IdMaster, l.IdKhungGio`,
};
// Sơ đồ chuyền (DFC) của tổ để biết IdMaster nào là tổ @to / mã hàng
const SO_DO = {
  db: 'egmf',
  text: `
    SELECT TOP 20 s.Id, s.TenSDC, s.MaHang, s.CumId, LTRIM(RTRIM(e.TenCum)) AS maTo, s.NgayHieuLuc, s.Version
    FROM dbo.DFC_SoDoChuyen s
    LEFT JOIN dbo.Lib_CumChuyen e ON e.CumId = s.CumId
    WHERE (@maHang = '' OR s.MaHang = @maHang)
    ORDER BY s.Id DESC`,
};

(async () => {
  const bang = (rows) => (rows.length
    ? [Object.keys(rows[0]).join(' | '), ...rows.map((r) => Object.values(r).map((v) => (v instanceof Date ? v.toISOString().replace('T', ' ').slice(0, 19) : v)).join(' | '))]
    : ['(không có dòng nào)']);
  const p = { d, xn: String(Number(xn)), to: String(to), maHang };
  const out = [`Ngày ${d}, xí nghiệp ${xn}, tổ ${to}, mã hàng ${maHang || '(tất cả)'}`, ''];
  const chay = async (ten, q) => {
    out.push(`=== ${ten} ===`);
    try { out.push(...bang(await db.query(q, p))); } catch (e) { out.push(`LỖI: ${e.message}`); }
    out.push('');
  };
  await chay('HiPro pro_nscl theo giờ (q = đạt, r = lỗi, f = sửa)', HIPRO);
  await chay('HiPro pro_kiemtrong_chi_tiet_loi', HIPRO_KIEM_TRONG);
  await chay('eGMF kiểm tra inline (KTCM) theo sơ đồ x khung giờ', KTCM);
  await chay('eGMF kiểm tra inline (KTCM) chi tiết lỗi', KTCM_LOI);
  await chay('Sơ đồ chuyền (DFC) gần nhất của mã hàng', SO_DO);
  fs.mkdirSync('khao-sat', { recursive: true });
  fs.writeFileSync(path.join('khao-sat', 'kiem-tra-loi.txt'), `${out.join('\n')}\n`);
  console.log('Đã ghi khao-sat/kiem-tra-loi.txt');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
