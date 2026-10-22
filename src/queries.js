// ============================================================================
// TOÀN BỘ CÂU SQL NẰM Ở ĐÂY.
// Mỗi câu phải trả về đúng các cột alias (AS ...) để giao diện hiển thị.
// db: 'egmf' hoặc 'hipro' - chọn database chạy câu lệnh.
//
// [ĐÃ XÁC NHẬN] lấy theo dự án DH-DVT (app/services/omm_plan.py, egmf_ops.py):
//   Lib_XiNghiep (XNId, TenXiNghiep) -> Lib_PhanXuong (PXId, XNId) -> Lib_CumChuyen (CumId, TenCum, PXId)
//   OMM_KeHoachThang (ChuyenId = CumId, CTPOId, SoLuong, NgayVaoChuyenKeHoachBatDau,
//     NgayMayKeHoachBatDau, NgayMayKeHoachKetThuc) -> OMM_PO_ChiTiet -> OMM_PO -> OMM_DonHang (MaHang)
// [TẠM] bảng BTP / lệnh sản xuất: chưa có trong DH-DVT. Chạy `npm run khao-sat` để liệt kê
//   các bảng CUTTING_*, *BTP*, *LenhSanXuat* rồi sửa các câu đánh dấu [TẠM].
// ============================================================================

module.exports = {
  // Danh mục xí nghiệp [ĐÃ XÁC NHẬN]
  xiNghiep: {
    db: 'egmf',
    text: `
      SELECT CAST(XNId AS varchar(20)) AS ma, TenXiNghiep AS ten
      FROM dbo.Lib_XiNghiep
      ORDER BY XNId`,
  },

  // Danh sách tổ (chuyền) theo xí nghiệp [ĐÃ XÁC NHẬN]. Tham số: @xn (XNId)
  // TenCum là số chuyền; bỏ chuyền giả '0', '99' như DH-DVT
  to: {
    db: 'egmf',
    text: `
      SELECT CAST(e.CumId AS varchar(20)) AS ma, N'Tổ ' + LTRIM(RTRIM(e.TenCum)) AS ten
      FROM dbo.Lib_CumChuyen e
      JOIN dbo.Lib_PhanXuong px ON px.PXId = e.PXId
      WHERE px.XNId = @xn AND LTRIM(RTRIM(e.TenCum)) NOT IN ('0', '99')
      ORDER BY TRY_CAST(e.TenCum AS int), e.TenCum`,
  },

  // Kế hoạch phân bổ (kế hoạch tháng theo chuyền) [ĐÃ XÁC NHẬN]. Tham số: @xn, @tuNgay, @denNgay
  // maTo = CumId để lọc theo tổ; tenTo để hiển thị
  keHoachPhanBo: {
    db: 'egmf',
    text: `
      SELECT CAST(e.CumId AS varchar(20)) AS maTo, LTRIM(RTRIM(e.TenCum)) AS tenTo,
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
      GROUP BY e.CumId, e.TenCum, dh.MaHang
      ORDER BY TRY_CAST(e.TenCum AS int), MIN(k.NgayMayKeHoachBatDau)`,
  },

  // [TẠM] Phiếu cấp BTP (tổ may đặt BTP). Tham số: @xn, @to
  phieuCapBTP: {
    db: 'egmf',
    text: `
      SELECT pc.SoPhieu AS soPhieu, pc.NgayDat AS ngayDat, pc.NgayCanHang AS ngayCan,
             pc.LenhSX AS lenhSX, pc.MaHang AS maHang, pc.Mau AS mau,
             pc.SLDat AS slDat,
             ISNULL((SELECT SUM(px.SoLuong) FROM dbo.BTP_PhieuXuat px
                     WHERE px.SoPhieuCap = pc.SoPhieu), 0) AS slDaCap
      FROM dbo.BTP_PhieuCap pc
      WHERE pc.MaXN = @xn AND pc.MaTo = @to
      ORDER BY pc.NgayDat DESC`,
  },

  // [TẠM] Phiếu xuất BTP từ khâu cắt cho 1 phiếu cấp. Tham số: @soPhieu
  phieuXuatTheoPhieuCap: {
    db: 'egmf',
    text: `
      SELECT px.SoPhieuXuat AS soPhieuXuat, px.NgayXuat AS ngayXuat,
             px.LenhSX AS lenhSX, px.MaHang AS maHang, px.Mau AS mau, px.Size AS size,
             px.SoBo AS soBo, px.SoLuong AS soLuong, px.NguoiXuat AS nguoiXuat
      FROM dbo.BTP_PhieuXuat px
      WHERE px.SoPhieuCap = @soPhieu
      ORDER BY px.NgayXuat`,
  },

  // [TẠM] Tìm lệnh sản xuất. Tham số: @xn, @q
  lenhSX: {
    db: 'egmf',
    text: `
      SELECT TOP 50 LenhSX AS lenhSX, MaHang AS maHang, KhachHang AS khachHang, SoLuong AS soLuong
      FROM dbo.SX_LenhSanXuat
      WHERE MaXN = @xn AND (@q = '' OR LenhSX LIKE '%' + @q + '%' OR MaHang LIKE '%' + @q + '%')
      ORDER BY NgayTao DESC`,
  },

  // [TẠM] Nhập - xuất - tồn BTP cắt theo lệnh SX. Tham số: @lenhSX
  btpCatNXT: {
    db: 'egmf',
    text: `
      SELECT c.MaHang AS maHang, c.Mau AS mau, c.Size AS size,
             SUM(c.SoLuong) AS slCat,
             ISNULL(x.slXuat, 0) AS slXuat,
             SUM(c.SoLuong) - ISNULL(x.slXuat, 0) AS slTon
      FROM dbo.BTP_Cat c
      OUTER APPLY (SELECT SUM(px.SoLuong) AS slXuat FROM dbo.BTP_PhieuXuat px
                   WHERE px.LenhSX = c.LenhSX AND px.Mau = c.Mau AND px.Size = c.Size) x
      WHERE c.LenhSX = @lenhSX
      GROUP BY c.MaHang, c.Mau, c.Size, x.slXuat
      ORDER BY c.Mau, c.Size`,
  },

  // [TẠM] Chi tiết xuất của 1 dòng BTP cắt. Tham số: @lenhSX, @mau, @size
  btpCatXuat: {
    db: 'egmf',
    text: `
      SELECT px.SoPhieuXuat AS soPhieuXuat, px.NgayXuat AS ngayXuat,
             px.SoPhieuCap AS soPhieuCap, pc.MaTo AS maTo, px.SoBo AS soBo, px.SoLuong AS soLuong
      FROM dbo.BTP_PhieuXuat px
      LEFT JOIN dbo.BTP_PhieuCap pc ON pc.SoPhieu = px.SoPhieuCap
      WHERE px.LenhSX = @lenhSX AND px.Mau = @mau AND px.Size = @size
      ORDER BY px.NgayXuat`,
  },
};
