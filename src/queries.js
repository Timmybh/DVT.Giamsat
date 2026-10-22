// ============================================================================
// TOÀN BỘ CÂU SQL NẰM Ở ĐÂY.
// Mỗi câu phải trả về đúng các cột alias (AS ...) để giao diện hiển thị.
// db: 'egmf' hoặc 'hipro' - chọn database chạy câu lệnh.
// Viết cho SQL Server bản cũ: không dùng STRING_SPLIT, TRY_CAST, STRING_AGG.
//
// Xí nghiệp / tổ / kế hoạch (theo dự án DH-DVT):
//   Lib_XiNghiep (XNId, TenXiNghiep) -> Lib_PhanXuong (PXId, XNId) -> Lib_CumChuyen (CumId, TenCum = số tổ)
//   OMM_KeHoachThang -> OMM_PO_ChiTiet -> OMM_PO -> OMM_DonHang (MaHang)
// BTP cắt (theo khảo sát eGMF 22/10/2026):
//   Bravo_LenhSanXuat_Master (DocNo = lệnh SX) + _Detail (ProductCode); CUTTING_LenhSanXuat_SoLuongLenh
//   CUTTING_PhieuCapBTP (phiếu cấp: TenPhanXuong = 'XN1', TenCum = số tổ) -> _ChiTiet (IdCapBTP: PO, màu, size, SL)
//   CUTTING_PhieuHoachToan_TemBarCode (tem BTP cắt: Barcode, SoLuong, SoLuongThucXuat)
//   CUTTING_PhieuCapBTP_BarcodeChiTiet (mỗi lần quét tem xuất cho phiếu cấp: TemBarcodeBTP = Barcode của tem)
// Lệnh SX trong các bảng CUTTING lưu dạng 'TUNTT-0634-2026;' (có thể nhiều lệnh, ngăn bằng ';').
// ============================================================================

// Điều kiện khớp 1 lệnh SX trong cột dạng 'A;' hoặc 'A; B;'
const matchLenh = (col) => `';' + REPLACE(${col}, ' ', '') + ';' LIKE '%;' + @lenhSX + ';%'`;

module.exports = {
  // Danh mục xí nghiệp. API tự suy ra mã 'XN1'.. từ số trong tên để lọc bảng CUTTING
  xiNghiep: {
    db: 'egmf',
    text: `
      SELECT CAST(XNId AS varchar(20)) AS ma, TenXiNghiep AS ten
      FROM dbo.Lib_XiNghiep
      ORDER BY XNId`,
  },

  // Danh sách tổ theo xí nghiệp. Tham số: @xn (XNId). ma = số tổ (khớp CUTTING_PhieuCapBTP.TenCum)
  to: {
    db: 'egmf',
    text: `
      SELECT DISTINCT LTRIM(RTRIM(e.TenCum)) AS ma, N'Tổ ' + LTRIM(RTRIM(e.TenCum)) AS ten, LEN(LTRIM(RTRIM(e.TenCum))) AS len
      FROM dbo.Lib_CumChuyen e
      JOIN dbo.Lib_PhanXuong px ON px.PXId = e.PXId
      WHERE px.XNId = @xn AND LTRIM(RTRIM(e.TenCum)) NOT IN ('', '0', '99')
      ORDER BY len, ma`,
  },

  // Kế hoạch phân bổ theo tổ x mã hàng. Tham số: @xn, @tuNgay, @denNgay
  keHoachPhanBo: {
    db: 'egmf',
    text: `
      SELECT LTRIM(RTRIM(e.TenCum)) AS maTo, LTRIM(RTRIM(e.TenCum)) AS tenTo,
             dh.MaHang AS maHang, SUM(k.SoLuong) AS soLuong,
             MIN(k.NgayVaoChuyenKeHoachBatDau) AS ngayVaoChuyen,
             MIN(k.NgayMayKeHoachBatDau) AS ngayBatDau,
             MAX(k.NgayMayKeHoachKetThuc) AS ngayKetThuc
      FROM dbo.OMM_KeHoachThang k
      JOIN dbo.OMM_PO_ChiTiet ct ON ct.POCTId = k.CTPOId
      JOIN dbo.OMM_PO po ON po.POId = ct.POId
      JOIN dbo.OMM_DonHang dh ON dh.DHId = po.DHId
      JOIN dbo.Lib_CumChuyen e ON e.CumId = k.ChuyenId
      JOIN dbo.Lib_PhanXuong px ON px.PXId = e.PXId
      WHERE px.XNId = @xn AND k.SoLuong > 0
        AND k.NgayMayKeHoachKetThuc >= @tuNgay AND k.NgayMayKeHoachBatDau < DATEADD(day, 1, @denNgay)
      GROUP BY e.TenCum, dh.MaHang
      ORDER BY LEN(LTRIM(RTRIM(e.TenCum))), LTRIM(RTRIM(e.TenCum)), MIN(k.NgayMayKeHoachBatDau)`,
  },

  // Phiếu cấp BTP của 1 tổ. Tham số: @xnCode ('XN1'), @to (số tổ), @tuNgay, @denNgay (theo ngày nhận BTP)
  phieuCapBTP: {
    db: 'egmf',
    text: `
      SELECT pc.SoPhieuCapBTP AS soPhieu, pc.NgayNhanBTP AS ngayNhan, pc.NgayTao AS ngayTao,
             pc.LenhSanXuat AS lenhSX, pc.ProductCode AS maHang, pc.SeasonCode AS mua,
             pc.TrangThai AS trangThai, pc.NguoiTao AS nguoiTao,
             ISNULL(ct.slDat, 0) AS slDat, ISNULL(ct.slXuat, 0) AS slXuat, ISNULL(ct.slNhan, 0) AS slNhan
      FROM dbo.CUTTING_PhieuCapBTP pc
      LEFT JOIN (
        SELECT IdCapBTP, SUM(SoLuong) AS slDat, SUM(SoLuongThucXuat) AS slXuat, SUM(SoLuongThucNhan) AS slNhan
        FROM dbo.CUTTING_PhieuCapBTP_ChiTiet GROUP BY IdCapBTP
      ) ct ON ct.IdCapBTP = pc.IdCapBTP
      WHERE pc.TenPhanXuong = @xnCode AND LTRIM(RTRIM(pc.TenCum)) = @to
        AND pc.NgayNhanBTP >= @tuNgay AND pc.NgayNhanBTP < DATEADD(day, 1, @denNgay)
      ORDER BY pc.NgayNhanBTP DESC, pc.SoPhieuCapBTP DESC`,
  },

  // Chi tiết đặt (PO x màu x size) của 1 phiếu cấp. Tham số: @soPhieu
  phieuCapChiTiet: {
    db: 'egmf',
    text: `
      SELECT ct.PO AS po, ct.TenMau AS mau, ct.SizeCode AS size, ct.SoLuong AS slDat,
             ISNULL(ct.SoLuongThucXuat, 0) AS slXuat, ISNULL(ct.SoLuongThucNhan, 0) AS slNhan
      FROM dbo.CUTTING_PhieuCapBTP_ChiTiet ct
      JOIN dbo.CUTTING_PhieuCapBTP pc ON pc.IdCapBTP = ct.IdCapBTP
      WHERE pc.SoPhieuCapBTP = @soPhieu
      ORDER BY ct.PO, ct.TenMau, ct.Id`,
  },

  // Chi tiết đặt BTP theo size, lọc nhiều phiếu. Tham số: @xnCode, @to ('' = tất cả tổ),
  // @tuNgay, @denNgay (ngày nhận BTP), @lenhSX, @po ('' = bỏ qua, có thì tìm gần đúng). Tối đa 3000 dòng.
  chiTietDatBTP: {
    db: 'egmf',
    text: `
      SELECT TOP 3000 LTRIM(RTRIM(pc.TenCum)) AS maTo, pc.SoPhieuCapBTP AS soPhieu, pc.NgayNhanBTP AS ngayNhan,
             ISNULL(NULLIF(ct.LenhSanXuat, ''), pc.LenhSanXuat) AS lenhSX, pc.ProductCode AS maHang,
             ct.PO AS po, ct.TenMau AS mau, ct.SizeCode AS size,
             ISNULL(ct.SoLuong, 0) AS slDat, ISNULL(ct.SoLuongThucXuat, 0) AS slCap, ISNULL(ct.SoLuongThucNhan, 0) AS slNhan
      FROM dbo.CUTTING_PhieuCapBTP pc
      JOIN dbo.CUTTING_PhieuCapBTP_ChiTiet ct ON ct.IdCapBTP = pc.IdCapBTP
      WHERE pc.TenPhanXuong = @xnCode
        AND (@to = '' OR LTRIM(RTRIM(pc.TenCum)) = @to)
        AND pc.NgayNhanBTP >= @tuNgay AND pc.NgayNhanBTP < DATEADD(day, 1, @denNgay)
        AND (@lenhSX = '' OR pc.LenhSanXuat LIKE '%' + @lenhSX + '%' OR ct.LenhSanXuat LIKE '%' + @lenhSX + '%')
        AND (@po = '' OR ct.PO LIKE '%' + @po + '%')
      ORDER BY LEN(LTRIM(RTRIM(pc.TenCum))), LTRIM(RTRIM(pc.TenCum)), pc.NgayNhanBTP DESC, pc.SoPhieuCapBTP, ct.PO, ct.TenMau, ct.Id`,
  },

  // Tem BTP khâu cắt đã quét xuất cho 1 phiếu cấp. Tham số: @soPhieu
  phieuXuatTheoPhieuCap: {
    db: 'egmf',
    text: `
      SELECT bc.TemBarcodeBTP AS barcode, bc.ThoiGianQuetXuat AS thoiGianXuat, bc.NguoiQuetXuat AS nguoiXuat,
             bc.PO AS po, bc.Mau AS mau, bc.Size AS size, bc.ChungLoai AS chungLoai,
             bc.SoLuongDaXuat AS soLuong, bc.ThoiGianQuetNhan AS thoiGianNhan, bc.NguoiQuetNhan AS nguoiNhan,
             bc.TraBTP AS traBTP
      FROM dbo.CUTTING_PhieuCapBTP_BarcodeChiTiet bc
      WHERE bc.SoPhieuCapBTP = @soPhieu
      ORDER BY bc.ThoiGianQuetXuat, bc.IdPhieuXuatKhoBTP`,
  },

  // Tìm lệnh sản xuất (lệnh gốc, không lấy phiếu điều chỉnh TypeCt = 1). Tham số: @q
  lenhSX: {
    db: 'egmf',
    text: `
      SELECT TOP 50 m.DocNo AS lenhSX, d.ProductCode AS maHang, d.SeasonCode AS mua,
             m.CustomerCode AS khachHang, m.DocDate AS ngay, sl.SoLuongLenh AS soLuong
      FROM dbo.Bravo_LenhSanXuat_Master m
      OUTER APPLY (SELECT TOP 1 ProductCode, SeasonCode FROM dbo.Bravo_LenhSanXuat_Detail WHERE IdMaster = m.Id) d
      OUTER APPLY (SELECT TOP 1 SoLuongLenh FROM dbo.CUTTING_LenhSanXuat_SoLuongLenh
                   WHERE LenhSanXuat = m.DocNo + ';' OR LenhSanXuat = m.DocNo) sl
      WHERE m.IsActive = 1 AND ISNULL(m.TypeCt, 0) = 0
        AND (@q = '' OR m.DocNo LIKE '%' + @q + '%' OR d.ProductCode LIKE '%' + @q + '%')
      ORDER BY m.DocDate DESC, m.Id DESC`,
  },

  // Nhập - xuất - tồn BTP cắt chi tiết từng tem: mỗi dòng = 1 tem x 1 lần quét xuất cho phiếu cấp (tem chưa xuất: 1 dòng trống phần xuất).
  // SL cắt / tồn chỉ ghi ở dòng đầu của tem để cộng không bị trùng. Lọc theo ngày tạo tem; @lenhSX = '' là mọi lệnh.
  // Tham số: @lenhSX, @tuNgay, @denNgay
  btpCatNXT: {
    db: 'egmf',
    text: `
      SELECT TOP 30000 t.Barcode AS barcode, t.NgayTao AS ngayTao,
             REPLACE(ISNULL(t.LenhSanXuat, ''), ';', '') AS lenhSX, REPLACE(ISNULL(t.MaHang, ''), ';', '') AS maHang, t.Mua AS mua,
             t.LoaiNguyenLieu AS loaiNL, t.TenChiTiet AS chiTiet, t.MauSP AS mau, t.MauVai AS mauVai, t.TenSize AS size,
             t.BanMay AS banCat, t.IdBanMay AS idBanMay, ht.SoPhieu AS phieuHoachToan, t.ViTriBTP AS viTri,
             CASE WHEN ROW_NUMBER() OVER (PARTITION BY t.Id ORDER BY bc.ThoiGianQuetXuat) = 1 THEN ISNULL(t.SoLuong, 0) END AS slCat,
             CASE WHEN ROW_NUMBER() OVER (PARTITION BY t.Id ORDER BY bc.ThoiGianQuetXuat) = 1
                  THEN ISNULL(t.SoLuong, 0) - ISNULL(t.SoLuongThucXuat, 0) END AS slTon,
             bc.SoPhieuCapBTP AS soPhieuCap, bc.BarcodeCapBTPMoi AS temXuat, REPLACE(ISNULL(bc.LenhSanXuat, ''), ';', '') AS lenhXuat,
             bc.PO AS po, bc.Size AS sizeDat, pc.TenPhanXuong AS xn, LTRIM(RTRIM(pc.TenCum)) AS maTo, pc.NgayNhanBTP AS ngayNhan,
             bc.SoLuongDaXuat AS slXuat, bc.ThoiGianQuetXuat AS thoiGianXuat, bc.NguoiQuetXuat AS nguoiXuat,
             bc.SoLuongDaNhan AS slNhan, bc.ThoiGianQuetNhan AS thoiGianNhan
      FROM dbo.CUTTING_PhieuHoachToan_TemBarCode t
      LEFT JOIN dbo.CUTTING_PhieuHoachToan ht ON ht.PhieuHoachToanId = t.PhieuHoachToanId
      LEFT JOIN dbo.CUTTING_PhieuCapBTP_BarcodeChiTiet bc ON bc.TemBarcodeBTP = t.Barcode
      LEFT JOIN dbo.CUTTING_PhieuCapBTP pc ON pc.SoPhieuCapBTP = bc.SoPhieuCapBTP
      WHERE t.NgayTao >= @tuNgay AND t.NgayTao < DATEADD(day, 1, @denNgay)
        AND (@lenhSX = '' OR ${matchLenh('t.LenhSanXuat')})
      ORDER BY t.NgayTao, t.Barcode, bc.ThoiGianQuetXuat`,
  },

  // Một dòng BTP cắt đã xuất cho phiếu cấp nào, kèm dòng đặt (PO x màu x size) tương ứng
  // trong CUTTING_PhieuCapBTP_ChiTiet (nối qua BarcodeChiTiet.IdCapBTPCT).
  // Tham số: @lenhSX, @loaiNL, @chiTiet, @mau, @size, @tuNgay, @denNgay (ngày tạo tem, '' là không lọc)
  btpCatXuat: {
    db: 'egmf',
    text: `
      SELECT bc.SoPhieuCapBTP AS soPhieuCap, MAX(pc.TenPhanXuong) AS xn, MAX(LTRIM(RTRIM(pc.TenCum))) AS maTo,
             MAX(ct.PO) AS po, MAX(ct.TenMau) AS mauDat, MAX(ct.SizeCode) AS sizeDat,
             MAX(ct.SoLuong) AS slDat, MAX(ct.SoLuongThucXuat) AS slDaXuatPhieu,
             COUNT(*) AS soTem, SUM(ISNULL(bc.SoLuongDaXuat, 0)) AS soLuong,
             MIN(bc.ThoiGianQuetXuat) AS tuLuc, MAX(bc.ThoiGianQuetXuat) AS denLuc
      FROM dbo.CUTTING_PhieuHoachToan_TemBarCode t
      JOIN dbo.CUTTING_PhieuCapBTP_BarcodeChiTiet bc ON bc.TemBarcodeBTP = t.Barcode
      LEFT JOIN dbo.CUTTING_PhieuCapBTP pc ON pc.SoPhieuCapBTP = bc.SoPhieuCapBTP
      LEFT JOIN dbo.CUTTING_PhieuCapBTP_ChiTiet ct ON ct.Id = bc.IdCapBTPCT
      WHERE ${matchLenh('t.LenhSanXuat')}
        AND ISNULL(t.LoaiNguyenLieu, '') = @loaiNL AND ISNULL(t.TenChiTiet, '') = @chiTiet
        AND ISNULL(t.MauSP, '') = @mau AND ISNULL(t.TenSize, '') = @size
        AND (@tuNgay = '' OR (t.NgayTao >= @tuNgay AND t.NgayTao < DATEADD(day, 1, @denNgay)))
      GROUP BY bc.SoPhieuCapBTP, bc.IdCapBTPCT
      ORDER BY MIN(bc.ThoiGianQuetXuat)`,
  },

  // ======================= Tổ trưởng may / QC / Giám đốc XN =======================
  // Nguồn và cách tính theo dự án DH-DVT (egmf_ops.py, hipro.py, omm_plan.py).

  // Kế hoạch may trong ngày theo tổ: SoNgaySX <= 1 lấy SoLuong, ngược lại SoLuong / SoNgaySX. Tham số: @xn, @d0
  keHoachNgay: {
    db: 'egmf',
    text: `
      SELECT LTRIM(RTRIM(e.TenCum)) AS line,
             SUM(CASE WHEN ISNULL(k.SoNgaySX, 0) <= 1 THEN k.SoLuong ELSE k.SoLuong / k.SoNgaySX END) AS keHoach
      FROM dbo.OMM_KeHoachThang k
      JOIN dbo.Lib_CumChuyen e ON e.CumId = k.ChuyenId
      JOIN dbo.Lib_PhanXuong px ON px.PXId = e.PXId
      WHERE px.XNId = @xn AND k.SoLuong > 0
        AND CAST(k.NgayMayKeHoachBatDau AS date) <= @d0 AND @d0 <= CAST(k.NgayMayKeHoachKetThuc AS date)
      GROUP BY e.TenCum`,
  },

  // Sản lượng theo giờ (HiPro): tổng qty_1_h..qty_14_h (đạt) và reject_1_h..reject_14_h (lỗi) theo chuyền x mã hàng. Tham số: @d0. API lọc xí nghiệp theo tên nhà máy.
  sanLuongGio: {
    db: 'hipro',
    text: `
      SELECT nm.ten AS xn, c.ten AS line, sp.ma_san_pham AS maHang,
             ${Array.from({ length: 14 }, (_, i) => `SUM(ISNULL(n.qty_${i + 1}_h, 0)) AS h${i + 1}`).join(', ')},
             ${Array.from({ length: 14 }, (_, i) => `SUM(ISNULL(n.reject_${i + 1}_h, 0)) AS r${i + 1}`).join(', ')}
      FROM dbo.pro_nscl n
      JOIN dbo.pro_ke_hoach_san_xuat k ON k.id = n.pro_ke_hoach_san_xuat_id
      JOIN dbo.pro_chuyen c ON c.id = k.pro_chuyen_id
      JOIN dbo.pro_nha_may nm ON nm.id = c.pro_nha_may_id
      JOIN dbo.pro_san_pham sp ON sp.id = k.pro_san_pham_id
      JOIN dbo.pro_check_point cp ON cp.id = n.pro_check_point_id AND cp.pro_chuyen_id = k.pro_chuyen_id
      WHERE k.ngay_san_xuat >= @d0 AND k.ngay_san_xuat < DATEADD(day, 1, @d0)
      GROUP BY nm.ten, c.ten, sp.ma_san_pham`,
  },

  // Tình hình may theo PO (Report_BaoCaoMayRa là nhật ký snapshot ~10 phút: lấy bản mới nhất theo PO x chuyền trong ngày).
  // Tham số: @xnNum ('1'), @d0
  poMayRa: {
    db: 'egmf',
    text: `
      WITH latest AS (
        SELECT TenChuyen, PO, LenhSanXuat, MaHang, KhachHang, SoLuong, VaoChuyenLuyKe, MayRaSoLuong, MayRaLuyKe, NgayXuatHang,
               ROW_NUMBER() OVER (PARTITION BY PO, TenChuyen ORDER BY ThoiGianTao DESC) AS rn
        FROM dbo.Report_BaoCaoMayRa
        WHERE PO IS NOT NULL AND CAST(XiNghiep AS nvarchar(20)) = @xnNum
          AND NgaySanXuat >= @d0 AND NgaySanXuat < DATEADD(day, 1, @d0)
      )
      SELECT TenChuyen AS line, PO AS po, LenhSanXuat AS lenhSX, MaHang AS maHang, KhachHang AS khachHang,
             SoLuong AS soLuong, VaoChuyenLuyKe AS vaoChuyenLK, MayRaSoLuong AS mayRaNgay, MayRaLuyKe AS mayRaLK,
             NgayXuatHang AS ngayXuat
      FROM latest WHERE rn = 1
      ORDER BY LEN(TenChuyen), TenChuyen, PO`,
  },

  // Lao động theo chuyền trong ngày. Tham số: @d0. API lọc xí nghiệp theo tên.
  laoDong: {
    db: 'egmf',
    text: `
      SELECT XiNghiep AS xn, TenChuyen AS line, MAX(TongSoLaoDong) AS tong, MAX(SoLaoDongHienDien) AS hienDien
      FROM dbo.LCD_Truc_Quan_ChuyenMay_LaoDong
      WHERE Ngay >= @d0 AND Ngay < DATEADD(day, 1, @d0) AND TenChuyen IS NOT NULL
      GROUP BY XiNghiep, TenChuyen`,
  },

  // QC theo ngày x tổ (HiPro NSCL): đạt = qty_*_h, lỗi = reject_*_h, sửa = fix_*_h. Tham số: @tuNgay, @denNgay.
  // API lọc xí nghiệp theo tên nhà máy. Chỉ đọc bảng pro_nscl hiện hành (dữ liệu tháng cũ đã chuyển sang pro_nscl_MM_YYYY).
  qcNscl: {
    db: 'hipro',
    text: `
      SELECT CAST(k.ngay_san_xuat AS date) AS ngay, nm.ten AS xn, c.ten AS line,
             SUM(${Array.from({ length: 14 }, (_, i) => `ISNULL(n.qty_${i + 1}_h, 0)`).join(' + ')}) AS dat,
             SUM(${Array.from({ length: 14 }, (_, i) => `ISNULL(n.reject_${i + 1}_h, 0)`).join(' + ')}) AS loi,
             SUM(${Array.from({ length: 14 }, (_, i) => `ISNULL(n.fix_${i + 1}_h, 0)`).join(' + ')}) AS sua
      FROM dbo.pro_nscl n
      JOIN dbo.pro_ke_hoach_san_xuat k ON k.id = n.pro_ke_hoach_san_xuat_id
      JOIN dbo.pro_chuyen c ON c.id = k.pro_chuyen_id
      JOIN dbo.pro_nha_may nm ON nm.id = c.pro_nha_may_id
      JOIN dbo.pro_check_point cp ON cp.id = n.pro_check_point_id AND cp.pro_chuyen_id = k.pro_chuyen_id
      WHERE k.ngay_san_xuat >= @tuNgay AND k.ngay_san_xuat < DATEADD(day, 1, @denNgay)
      GROUP BY CAST(k.ngay_san_xuat AS date), nm.ten, c.ten`,
  },

  // Chi tiết lỗi theo tổ x mã lỗi (pro_nscl_chi_tiet_loi -> pro_loi -> pro_cum_loi). Tham số: @tuNgay, @denNgay
  qcLoiChiTiet: {
    db: 'hipro',
    text: `
      SELECT nm.ten AS xn, c.ten AS line, ISNULL(l.ma_loi, d.ma_loi) AS maLoi, l.ten_loi AS tenLoi, cl.ten AS cumLoi, COUNT(*) AS soLan
      FROM dbo.pro_nscl_chi_tiet_loi d
      JOIN dbo.pro_nscl n ON n.id = d.pronscl_id
      JOIN dbo.pro_ke_hoach_san_xuat k ON k.id = n.pro_ke_hoach_san_xuat_id
      JOIN dbo.pro_chuyen c ON c.id = k.pro_chuyen_id
      JOIN dbo.pro_nha_may nm ON nm.id = c.pro_nha_may_id
      JOIN dbo.pro_check_point cp ON cp.id = n.pro_check_point_id AND cp.pro_chuyen_id = k.pro_chuyen_id
      LEFT JOIN dbo.pro_loi l ON l.id = d.pro_loi_id
      LEFT JOIN dbo.pro_cum_loi cl ON cl.id = l.pro_cum_loi_id
      WHERE k.ngay_san_xuat >= @tuNgay AND k.ngay_san_xuat < DATEADD(day, 1, @denNgay)
      GROUP BY nm.ten, c.ten, ISNULL(l.ma_loi, d.ma_loi), l.ten_loi, cl.ten`,
  },

  // Doanh thu xí nghiệp theo ngày (màn hình ERP "DOANH THU XÍ NGHIỆP"). Dữ liệu nhập tay nên có thể trùng ngày:
  // API giữ dòng Id lớn nhất mỗi ngày. Tham số: @xnNum, @tuNgay, @denNgay
  doanhThuNgay: {
    db: 'egmf',
    text: `
      SELECT Id AS id, Ngay AS ngay, DoanhThuKeHoach AS keHoach, DoanhThuThucHien AS thucHien, DoanhThuConLai AS conLai
      FROM dbo.LCD_Truc_Quan_XiNghiep_DoanhThu_Ngay
      WHERE CAST(XiNghiep AS nvarchar(20)) = @xnNum AND Ngay >= @tuNgay AND Ngay < DATEADD(day, 1, @denNgay)
      ORDER BY Ngay, Id`,
  },

  // ======================= Nhập xuất tồn BTP cắt theo điều tiết =======================
  // Cutting_PhieuDieuTietGiacSoDo (phiếu điều tiết: lệnh x loại NL) -> _TacNghiep (SL sản phẩm theo màu SP x size)
  // -> _ChiTiet_BanMay (bó cắt: màu SP, size, SL sản phẩm) -> CUTTING_PhieuHoachToan_TemBarcode_ChiTiet (IdBanMay)
  // -> CUTTING_PhieuHoachToan_TemBarCode (mỗi bó 1 tem / chi tiết). Bó đã xuất đồng bộ = SL xuất nhỏ nhất trong các tem của bó.

  // Các phiếu điều tiết của lệnh. Tham số: @lenhSX
  dtPhieu: {
    db: 'egmf',
    text: `
      SELECT m.Id AS id, ISNULL(m.ChungLoai, '') AS loaiNL
      FROM dbo.Cutting_PhieuDieuTietGiacSoDo m
      WHERE ${matchLenh('m.LenhSanXuat')}`,
  },

  // SL tác nghiệp theo phiếu x màu SP x size. Tham số: @lenhSX
  dtTacNghiep: {
    db: 'egmf',
    text: `
      SELECT t.IdMaster AS idPhieu, ISNULL(t.MauProduct, '') AS mau, ISNULL(t.Size, '') AS size, SUM(ISNULL(t.SoLuong, 0)) AS soLuong
      FROM dbo.Cutting_PhieuDieuTietGiacSoDo_TacNghiep t
      JOIN dbo.Cutting_PhieuDieuTietGiacSoDo m ON m.Id = t.IdMaster
      WHERE ${matchLenh('m.LenhSanXuat')}
      GROUP BY t.IdMaster, ISNULL(t.MauProduct, ''), ISNULL(t.Size, '')`,
  },

  // Bó đã cắt (đã in tem) theo phiếu x màu SP x size, kèm SL sản phẩm đã xuất đồng bộ. Tham số: @lenhSX
  dtBanMay: {
    db: 'egmf',
    text: `
      SELECT bm.IdPhieuDieuTiet AS idPhieu, ISNULL(bm.MauSanPham, '') AS mau, ISNULL(bm.TenSize, '') AS size,
             COUNT(*) AS soBo, SUM(ISNULL(bm.SoLuong, 0)) AS slCat, SUM(x.slXuat) AS slXuat
      FROM dbo.Cutting_PhieuDieuTietGiacSoDo_ChiTiet_BanMay bm
      JOIN dbo.Cutting_PhieuDieuTietGiacSoDo m ON m.Id = bm.IdPhieuDieuTiet
      JOIN (
        SELECT tc.IdBanMay, MIN(ISNULL(t.SoLuongThucXuat, 0)) AS slXuat
        FROM dbo.CUTTING_PhieuHoachToan_TemBarCode t
        JOIN dbo.CUTTING_PhieuHoachToan_TemBarcode_ChiTiet tc ON tc.IdTem = t.Id
        WHERE ${matchLenh('t.LenhSanXuat')}
        GROUP BY tc.IdBanMay
      ) x ON x.IdBanMay = bm.IdBanMay
      WHERE ${matchLenh('m.LenhSanXuat')}
      GROUP BY bm.IdPhieuDieuTiet, ISNULL(bm.MauSanPham, ''), ISNULL(bm.TenSize, '')`,
  },

  // Tem theo chi tiết của 1 màu SP x size (qua bó cắt). Tham số: @lenhSX, @mau, @size
  dtChiTiet: {
    db: 'egmf',
    text: `
      WITH tems AS (
        SELECT DISTINCT t.Id, ISNULL(t.LoaiNguyenLieu, ISNULL(m.ChungLoai, '')) AS loaiNL, ISNULL(t.TenChiTiet, '') AS chiTiet,
               ISNULL(t.SoLuong, 0) AS sl, ISNULL(t.SoLuongThucXuat, 0) AS xuat
        FROM dbo.Cutting_PhieuDieuTietGiacSoDo_ChiTiet_BanMay bm
        JOIN dbo.Cutting_PhieuDieuTietGiacSoDo m ON m.Id = bm.IdPhieuDieuTiet
        JOIN dbo.CUTTING_PhieuHoachToan_TemBarcode_ChiTiet tc ON tc.IdBanMay = bm.IdBanMay
        JOIN dbo.CUTTING_PhieuHoachToan_TemBarCode t ON t.Id = tc.IdTem
        WHERE ${matchLenh('m.LenhSanXuat')} AND ISNULL(bm.MauSanPham, '') = @mau AND ISNULL(bm.TenSize, '') = @size
      )
      SELECT loaiNL, chiTiet, COUNT(*) AS soTem, SUM(sl) AS slCat, SUM(xuat) AS slXuat, SUM(sl) - SUM(xuat) AS slTon
      FROM tems GROUP BY loaiNL, chiTiet ORDER BY loaiNL, chiTiet`,
  },

  // Phiếu cấp đã nhận 1 màu SP x size, theo loại NL: số bó, SL sản phẩm đồng bộ (bó đủ tem mọi chi tiết).
  // Tham số: @lenhSX, @mau, @size
  dtPhieuCap: {
    db: 'egmf',
    text: `
      WITH tems AS (
        SELECT DISTINCT t.Id, t.Barcode, tc.IdBanMay, ISNULL(m.ChungLoai, '') AS loaiNL
        FROM dbo.Cutting_PhieuDieuTietGiacSoDo_ChiTiet_BanMay bm
        JOIN dbo.Cutting_PhieuDieuTietGiacSoDo m ON m.Id = bm.IdPhieuDieuTiet
        JOIN dbo.CUTTING_PhieuHoachToan_TemBarcode_ChiTiet tc ON tc.IdBanMay = bm.IdBanMay
        JOIN dbo.CUTTING_PhieuHoachToan_TemBarCode t ON t.Id = tc.IdTem
        WHERE ${matchLenh('m.LenhSanXuat')} AND ISNULL(bm.MauSanPham, '') = @mau AND ISNULL(bm.TenSize, '') = @size
      ),
      temMoiBo AS (SELECT IdBanMay, COUNT(*) AS n FROM tems GROUP BY IdBanMay),
      quet AS (
        SELECT bc.SoPhieuCapBTP, x.loaiNL, x.IdBanMay, COUNT(*) AS n, MIN(ISNULL(bc.SoLuongDaXuat, 0)) AS mn,
               MIN(bc.ThoiGianQuetXuat) AS tu, MAX(bc.ThoiGianQuetXuat) AS den, MAX(bc.IdCapBTPCT) AS idct
        FROM tems x JOIN dbo.CUTTING_PhieuCapBTP_BarcodeChiTiet bc ON bc.TemBarcodeBTP = x.Barcode
        GROUP BY bc.SoPhieuCapBTP, x.loaiNL, x.IdBanMay
      )
      SELECT q.SoPhieuCapBTP AS soPhieuCap, q.loaiNL, MAX(pc.TenPhanXuong) AS xn, MAX(LTRIM(RTRIM(pc.TenCum))) AS maTo,
             MAX(ct.PO) AS po, MAX(ct.SizeCode) AS sizeDat, MAX(ct.SoLuong) AS slDat,
             COUNT(*) AS soBo, SUM(q.n) AS soTem, SUM(CASE WHEN q.n >= tb.n THEN q.mn ELSE 0 END) AS slSP,
             MIN(q.tu) AS tuLuc, MAX(q.den) AS denLuc
      FROM quet q
      JOIN temMoiBo tb ON tb.IdBanMay = q.IdBanMay
      LEFT JOIN dbo.CUTTING_PhieuCapBTP pc ON pc.SoPhieuCapBTP = q.SoPhieuCapBTP
      LEFT JOIN dbo.CUTTING_PhieuCapBTP_ChiTiet ct ON ct.Id = q.idct
      GROUP BY q.SoPhieuCapBTP, q.loaiNL
      ORDER BY MIN(q.tu)`,
  },
};
