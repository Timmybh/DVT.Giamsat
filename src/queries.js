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

  // Nhập - xuất - tồn BTP cắt theo lệnh SX, gom theo loại NL x chi tiết x màu x size. Tham số: @lenhSX
  btpCatNXT: {
    db: 'egmf',
    text: `
      SELECT ISNULL(t.LoaiNguyenLieu, '') AS loaiNL, ISNULL(t.TenChiTiet, '') AS chiTiet,
             ISNULL(t.MauSP, '') AS mau, ISNULL(t.TenSize, '') AS size,
             MAX(t.MaHang) AS maHang, COUNT(*) AS soTem,
             SUM(ISNULL(t.SoLuong, 0)) AS slCat,
             SUM(ISNULL(t.SoLuongThucXuat, 0)) AS slXuat,
             SUM(ISNULL(t.SoLuong, 0)) - SUM(ISNULL(t.SoLuongThucXuat, 0)) AS slTon
      FROM dbo.CUTTING_PhieuHoachToan_TemBarCode t
      WHERE ${matchLenh('t.LenhSanXuat')}
      GROUP BY ISNULL(t.LoaiNguyenLieu, ''), ISNULL(t.TenChiTiet, ''), ISNULL(t.MauSP, ''), ISNULL(t.TenSize, '')
      ORDER BY loaiNL, chiTiet, mau, size`,
  },

  // Một dòng BTP cắt đã xuất cho phiếu cấp nào, kèm dòng đặt (PO x màu x size) tương ứng
  // trong CUTTING_PhieuCapBTP_ChiTiet (nối qua BarcodeChiTiet.IdCapBTPCT).
  // Tham số: @lenhSX, @loaiNL, @chiTiet, @mau, @size
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
      GROUP BY bc.SoPhieuCapBTP, bc.IdCapBTPCT
      ORDER BY MIN(bc.ThoiGianQuetXuat)`,
  },
};
