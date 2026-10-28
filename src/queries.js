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

// Chủng loại vải chính trong cột danh sách 'Vải chính, Keo' (như store báo cáo may ra; XN2 có thêm 'Vải chính B')
const VAI_CHINH = ['Vải chính', 'Vải chính 1', 'Vải chính A', 'Vải chính G'];
const vaiChinh = (col) => {
  const ds = `',' + REPLACE(ISNULL(${col}, ''), ', ', ',') + ','`;
  return VAI_CHINH.map((v) => `${ds} LIKE N'%,${v},%'`).concat(`(@xnCode = 'XN2' AND ${ds} LIKE N'%,Vải chính B,%')`).join(' OR ');
};

// PO đang chạy của tổ @to tại ngày @d (kế hoạch từ vào chuyền đến kết thúc may phủ @d)
const poChayToSQL = `
        SELECT DISTINCT po.PONo AS po
        FROM dbo.OMM_KeHoachThang k
        JOIN dbo.OMM_PO_ChiTiet pct ON pct.POCTId = k.CTPOId
        JOIN dbo.OMM_PO po ON po.POId = pct.POId
        JOIN dbo.Lib_CumChuyen e ON e.CumId = k.ChuyenId
        JOIN dbo.Lib_PhanXuong px ON px.PXId = e.PXId
        WHERE px.XNId = @xn AND LTRIM(RTRIM(e.TenCum)) = @to AND k.SoLuong > 0
          AND k.NgayVaoChuyenKeHoachBatDau < DATEADD(day, 1, @d) AND k.NgayMayKeHoachKetThuc >= @d`;
// PO của các dòng phiếu cấp BTP theo điều kiện lọc lưới "Chi tiết đặt BTP" (@xnCode, @to, @tuNgay, @denNgay, @lenhSX, @po)
const poPhieuCapLocSQL = `
          SELECT ct.PO
          FROM dbo.CUTTING_PhieuCapBTP pc
          JOIN dbo.CUTTING_PhieuCapBTP_ChiTiet ct ON ct.IdCapBTP = pc.IdCapBTP
          WHERE pc.TenPhanXuong = @xnCode
            AND (@to = '' OR LTRIM(RTRIM(pc.TenCum)) = @to)
            AND pc.NgayNhanBTP >= @tuNgay AND pc.NgayNhanBTP < DATEADD(day, 1, @denNgay)
            AND (@lenhSX = '' OR pc.LenhSanXuat LIKE '%' + @lenhSX + '%' OR ct.LenhSanXuat LIKE '%' + @lenhSX + '%')
            AND (@po = '' OR ct.PO LIKE '%' + @po + '%')`;
// PO trong phiếu đặt BTP của tổ tạo trong 30 ngày tới hết @d
const poDatToSQL = `
        SELECT DISTINCT ct.PO AS po
        FROM dbo.CUTTING_PhieuCapBTP pc
        JOIN dbo.CUTTING_PhieuCapBTP_ChiTiet ct ON ct.IdCapBTP = pc.IdCapBTP
        WHERE pc.TenPhanXuong = @xnCode AND LTRIM(RTRIM(pc.TenCum)) = @to
          AND pc.NgayTao >= DATEADD(day, -30, @d) AND pc.NgayTao < DATEADD(day, 1, @d)`;

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

  // Kế hoạch phân bổ theo tổ x mã hàng x PO x lệnh SX (Bravo_LenhSanXuat_Detail_PO, slLenh = SL của PO trong lệnh).
  // PO có nhiều lệnh thành nhiều dòng; SL kế hoạch (của tổ x PO) chỉ ghi ở dòng đầu để tổng không bị lặp.
  // Tham số: @xn, @tuNgay, @denNgay
  keHoachPhanBo: {
    db: 'egmf',
    text: `
      SELECT x.maTo, x.tenTo, x.maHang, x.po, l.lenhSX, l.slLenh,
             CASE WHEN ROW_NUMBER() OVER (PARTITION BY x.maTo, x.po ORDER BY l.lenhSX) = 1 THEN x.soLuong END AS soLuong,
             x.ngayVaoChuyen, x.ngayBatDau, x.ngayKetThuc
      FROM (
        SELECT LTRIM(RTRIM(e.TenCum)) AS maTo, LTRIM(RTRIM(e.TenCum)) AS tenTo,
               dh.MaHang AS maHang, po.PONo AS po, SUM(k.SoLuong) AS soLuong,
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
        GROUP BY e.TenCum, dh.MaHang, po.PONo
      ) x
      LEFT JOIN (
        SELECT b.PO, a.DocNo AS lenhSX, SUM(ISNULL(b.Quantity, 0)) AS slLenh
        FROM dbo.Bravo_LenhSanXuat_Detail_PO b
        JOIN dbo.Bravo_LenhSanXuat_Detail a ON a.Id = b.IdDetail
        GROUP BY b.PO, a.DocNo
      ) l ON l.PO = x.po
      ORDER BY LEN(x.maTo), x.maTo, x.ngayBatDau, x.po, l.lenhSX`,
  },

  // Kế hoạch phân bổ theo size: tổ x mã hàng x PO x màu x size (OMM_KeHoachThang_SBD), cùng điều kiện ngày với keHoachPhanBo.
  // thuTuSize: STT size trên phiếu điều tiết của mã hàng. Lệnh ghép ở API từ lenhTheoSize. Tham số: @xn, @tuNgay, @denNgay
  keHoachTheoSize: {
    db: 'egmf',
    text: `
      WITH sbd AS (
        SELECT LTRIM(RTRIM(e.TenCum)) AS maTo, dh.MaHang AS maHang, po.PONo AS po,
               ISNULL(s.TenMau, '') AS mau, ISNULL(s.TenSize, '') AS size, SUM(ISNULL(s.SoLuong, 0)) AS soLuong
        FROM dbo.OMM_KeHoachThang k
        JOIN dbo.OMM_KeHoachThang_SBD s ON s.KHTId = k.KHTId
        JOIN dbo.OMM_PO_ChiTiet ct ON ct.POCTId = k.CTPOId
        JOIN dbo.OMM_PO po ON po.POId = ct.POId
        JOIN dbo.OMM_DonHang dh ON dh.DHId = po.DHId
        JOIN dbo.Lib_CumChuyen e ON e.CumId = k.ChuyenId
        JOIN dbo.Lib_PhanXuong px ON px.PXId = e.PXId
        WHERE px.XNId = @xn AND k.SoLuong > 0
          AND k.NgayMayKeHoachKetThuc >= @tuNgay AND k.NgayMayKeHoachBatDau < DATEADD(day, 1, @denNgay)
        GROUP BY LTRIM(RTRIM(e.TenCum)), dh.MaHang, po.PONo, ISNULL(s.TenMau, ''), ISNULL(s.TenSize, '')
      ),
      tt AS (
        SELECT p.MaHang, ts.SizeName, ts.SizeCode, MIN(ts.STT) AS stt
        FROM dbo.Cutting_PhieuDieuTietGiacSoDo_ThuTuSize ts
        JOIN dbo.Cutting_PhieuDieuTietGiacSoDo p ON p.Id = ts.PhieuDieuTietId
        WHERE p.MaHang IN (SELECT maHang FROM sbd)
        GROUP BY p.MaHang, ts.SizeName, ts.SizeCode
      )
      SELECT x.*,
             (SELECT MIN(t.stt) FROM tt t WHERE t.MaHang = x.maHang AND (t.SizeName = x.size OR t.SizeCode = REPLACE(x.size, ' ', ''))) AS thuTuSize
      FROM sbd x`,
  },

  // SL kế hoạch theo lệnh SX x PO x màu x size (Bravo_LenhSanXuat_Detail_PO) cho các PO của keHoachTheoSize.
  // Lệnh điều chỉnh (TypeCt = 1, ProductionOrderAdjNo = lệnh gốc) cộng vào lệnh gốc; bỏ lệnh IsActive = 0. Tham số như keHoachTheoSize
  lenhTheoSize: {
    db: 'egmf',
    text: `
      WITH dsPO AS (
        SELECT DISTINCT po.PONo AS po
        FROM dbo.OMM_KeHoachThang k
        JOIN dbo.OMM_KeHoachThang_SBD s ON s.KHTId = k.KHTId
        JOIN dbo.OMM_PO_ChiTiet ct ON ct.POCTId = k.CTPOId
        JOIN dbo.OMM_PO po ON po.POId = ct.POId
        JOIN dbo.OMM_DonHang dh ON dh.DHId = po.DHId
        JOIN dbo.Lib_CumChuyen e ON e.CumId = k.ChuyenId
        JOIN dbo.Lib_PhanXuong px ON px.PXId = e.PXId
        WHERE px.XNId = @xn AND k.SoLuong > 0
          AND k.NgayMayKeHoachKetThuc >= @tuNgay AND k.NgayMayKeHoachBatDau < DATEADD(day, 1, @denNgay)
      )
      SELECT CASE WHEN a.TypeCt = 1 AND ISNULL(a.ProductionOrderAdjNo, '') <> '' THEN a.ProductionOrderAdjNo ELSE a.DocNo END AS lenhSX,
             b.PO AS po, MAX(b.ProductCode) AS maHang, ISNULL(b.ColorCode, '') AS mau, ISNULL(b.SizeCode, '') AS size,
             SUM(ISNULL(b.Quantity, 0)) AS slLenh
      FROM dbo.Bravo_LenhSanXuat_Detail_PO b
      JOIN dbo.Bravo_LenhSanXuat_Detail a ON a.Id = b.IdDetail
      WHERE b.PO IN (SELECT po FROM dsPO) AND ISNULL(a.IsActive, 1) <> 0
      GROUP BY CASE WHEN a.TypeCt = 1 AND ISNULL(a.ProductionOrderAdjNo, '') <> '' THEN a.ProductionOrderAdjNo ELSE a.DocNo END,
               b.PO, ISNULL(b.ColorCode, ''), ISNULL(b.SizeCode, '')`,
  },

  // Size breakdown kế hoạch của 1 tổ x mã hàng (OMM_KeHoachThang_SBD theo KHTId), gom theo màu x size.
  // thuTuSize = STT size trên phiếu điều tiết của mã hàng (Cutting_PhieuDieuTietGiacSoDo_ThuTuSize), null nếu chưa có điều tiết.
  // Cùng điều kiện với keHoachPhanBo. Tham số: @xn, @tuNgay, @denNgay, @to, @maHang, @po ('' = mọi PO)
  keHoachSize: {
    db: 'egmf',
    text: `
      SELECT ISNULL(s.TenMau, '') AS mau, ISNULL(s.TenSize, '') AS size, SUM(ISNULL(s.SoLuong, 0)) AS soLuong, MIN(s.SKId) AS thuTu,
             (SELECT MIN(ts.STT) FROM dbo.Cutting_PhieuDieuTietGiacSoDo_ThuTuSize ts
              JOIN dbo.Cutting_PhieuDieuTietGiacSoDo p ON p.Id = ts.PhieuDieuTietId
              WHERE p.MaHang = @maHang
                AND (ts.SizeName = ISNULL(s.TenSize, '') OR ts.SizeCode = REPLACE(ISNULL(s.TenSize, ''), ' ', ''))) AS thuTuSize
      FROM dbo.OMM_KeHoachThang k
      JOIN dbo.OMM_KeHoachThang_SBD s ON s.KHTId = k.KHTId
      JOIN dbo.OMM_PO_ChiTiet ct ON ct.POCTId = k.CTPOId
      JOIN dbo.OMM_PO po ON po.POId = ct.POId
      JOIN dbo.OMM_DonHang dh ON dh.DHId = po.DHId
      JOIN dbo.Lib_CumChuyen e ON e.CumId = k.ChuyenId
      JOIN dbo.Lib_PhanXuong px ON px.PXId = e.PXId
      WHERE px.XNId = @xn AND k.SoLuong > 0 AND LTRIM(RTRIM(e.TenCum)) = @to AND dh.MaHang = @maHang AND (@po = '' OR po.PONo = @po)
        AND k.NgayMayKeHoachKetThuc >= @tuNgay AND k.NgayMayKeHoachBatDau < DATEADD(day, 1, @denNgay)
      GROUP BY ISNULL(s.TenMau, ''), ISNULL(s.TenSize, '')`,
  },

  // Phiếu cấp BTP của 1 tổ. Tham số: @xnCode ('XN1'), @to (số tổ), @tuNgay, @denNgay (theo ngày nhận BTP)
  // SL kế hoạch phân bổ (OMM_KeHoachThang_SBD) theo tổ x PO x màu x size, cho các PO có trong phiếu cấp khớp điều kiện
  // của chiTietDatBTP. Màu / size ghi khác kiểu với phiếu cấp, API tự chuẩn hóa để ghép. Tham số như chiTietDatBTP + @xn
  khSBDTheoPhieuCap: {
    db: 'egmf',
    text: `
      SELECT LTRIM(RTRIM(e.TenCum)) AS maTo, po.PONo AS po, ISNULL(s.TenMau, '') AS mau, ISNULL(s.TenSize, '') AS size,
             SUM(ISNULL(s.SoLuong, 0)) AS soLuong
      FROM dbo.OMM_KeHoachThang k
      JOIN dbo.OMM_KeHoachThang_SBD s ON s.KHTId = k.KHTId
      JOIN dbo.OMM_PO_ChiTiet pct ON pct.POCTId = k.CTPOId
      JOIN dbo.OMM_PO po ON po.POId = pct.POId
      JOIN dbo.Lib_CumChuyen e ON e.CumId = k.ChuyenId
      JOIN dbo.Lib_PhanXuong px ON px.PXId = e.PXId
      WHERE px.XNId = @xn AND (@to = '' OR LTRIM(RTRIM(e.TenCum)) = @to)
        AND po.PONo IN (
          SELECT ct.PO
          FROM dbo.CUTTING_PhieuCapBTP pc
          JOIN dbo.CUTTING_PhieuCapBTP_ChiTiet ct ON ct.IdCapBTP = pc.IdCapBTP
          WHERE pc.TenPhanXuong = @xnCode
            AND (@to = '' OR LTRIM(RTRIM(pc.TenCum)) = @to)
            AND pc.NgayNhanBTP >= @tuNgay AND pc.NgayNhanBTP < DATEADD(day, 1, @denNgay)
            AND (@lenhSX = '' OR pc.LenhSanXuat LIKE '%' + @lenhSX + '%' OR ct.LenhSanXuat LIKE '%' + @lenhSX + '%')
            AND (@po = '' OR ct.PO LIKE '%' + @po + '%'))
      GROUP BY LTRIM(RTRIM(e.TenCum)), po.PONo, ISNULL(s.TenMau, ''), ISNULL(s.TenSize, '')`,
  },

  // Tổng SL lệnh (Bravo) theo lệnh x PO x màu x size của các PO có trong lưới chi tiết đặt BTP (cùng điều kiện lọc)
  lenhTheoPhieuCap: {
    db: 'egmf',
    text: `
      SELECT CASE WHEN a.TypeCt = 1 AND ISNULL(a.ProductionOrderAdjNo, '') <> '' THEN a.ProductionOrderAdjNo ELSE a.DocNo END AS lenhSX,
             b.PO AS po, ISNULL(b.ColorCode, '') AS mau, ISNULL(b.SizeCode, '') AS size, SUM(ISNULL(b.Quantity, 0)) AS slLenh
      FROM dbo.Bravo_LenhSanXuat_Detail_PO b
      JOIN dbo.Bravo_LenhSanXuat_Detail a ON a.Id = b.IdDetail
      WHERE ISNULL(a.IsActive, 1) <> 0 AND b.PO IN (${poPhieuCapLocSQL})
      GROUP BY CASE WHEN a.TypeCt = 1 AND ISNULL(a.ProductionOrderAdjNo, '') <> '' THEN a.ProductionOrderAdjNo ELSE a.DocNo END,
               b.PO, ISNULL(b.ColorCode, ''), ISNULL(b.SizeCode, '')`,
  },
  // SL đặt (SoLuongCanCap) của từng xí nghiệp x tổ, mọi ngày, theo lệnh x PO x màu x size của các PO trong lưới chi tiết đặt BTP
  datTatCaToTheoPhieuCap: {
    db: 'egmf',
    text: `
      SELECT pc.TenPhanXuong AS xnCode, LTRIM(RTRIM(pc.TenCum)) AS maTo,
             ISNULL(NULLIF(ct.LenhSanXuat, ''), pc.LenhSanXuat) AS lenhSX, ct.PO AS po, ISNULL(ct.TenMau, '') AS mau,
             ISNULL(ct.SizeCode, '') AS size, SUM(ISNULL(ct.SoLuongCanCap, 0)) AS slDat
      FROM dbo.CUTTING_PhieuCapBTP pc
      JOIN dbo.CUTTING_PhieuCapBTP_ChiTiet ct ON ct.IdCapBTP = pc.IdCapBTP
      WHERE ct.PO IN (${poPhieuCapLocSQL})
      GROUP BY pc.TenPhanXuong, LTRIM(RTRIM(pc.TenCum)), ISNULL(NULLIF(ct.LenhSanXuat, ''), pc.LenhSanXuat), ct.PO, ISNULL(ct.TenMau, ''), ISNULL(ct.SizeCode, '')`,
  },

  // Mã hàng, lao động, SOT: lao động theo ngày x tổ x mã hàng (LCD_Truc_Quan_ChuyenMay_LaoDong),
  // ghép quy trình công nghệ (QTCN_QuyTrinhCongNghe_Master) theo mã hàng, chỉ bản có check SOT (TinhOWE = 'SOT'), lấy phiên bản mới nhất.
  // SOT = TongThoiGian (giây / sản phẩm). API lọc xí nghiệp theo tên. Tham số: @tuNgay, @denNgay
  sotMaHang: {
    db: 'egmf',
    text: `
      SELECT ld.ngay, ld.xn, ld.line, ld.maHang, ld.tongLD, ld.hienDien, ld.ldTheoMa,
             q.Id AS idQTCN, q.TongThoiGian AS sot, q.SoLaoDong AS ldQTCN, q.MucTieuNangSuat AS mucTieu, q.NhipDoSanXuat AS nhipDo,
             q.ThoiGianLamViec AS thoiGianLamViec, q.TenKhachHang AS khachHang, q.TenChungLoai AS chungLoai, q.PhienBan AS phienBan, q.TrangThai AS trangThai
      FROM (
        SELECT CAST(a.Ngay AS date) AS ngay, a.XiNghiep AS xn, ISNULL(a.TenChuyen, CAST(a.ToChuyen AS nvarchar(20))) AS line,
               LTRIM(RTRIM(a.MaHang)) AS maHang, MAX(a.TongSoLaoDong) AS tongLD, MAX(a.SoLaoDongHienDien) AS hienDien,
               MAX(a.SoLaoDongTheoMahang) AS ldTheoMa
        FROM dbo.LCD_Truc_Quan_ChuyenMay_LaoDong a
        WHERE a.Ngay >= @tuNgay AND a.Ngay < DATEADD(day, 1, @denNgay) AND ISNULL(a.MaHang, '') <> ''
        GROUP BY CAST(a.Ngay AS date), a.XiNghiep, ISNULL(a.TenChuyen, CAST(a.ToChuyen AS nvarchar(20))), LTRIM(RTRIM(a.MaHang))
      ) ld
      OUTER APPLY (
        SELECT TOP 1 m.Id, m.TongThoiGian, m.SoLaoDong, m.MucTieuNangSuat, m.NhipDoSanXuat, m.ThoiGianLamViec,
               m.TenKhachHang, m.TenChungLoai, m.PhienBan, m.TrangThai
        FROM dbo.QTCN_QuyTrinhCongNghe_Master m
        WHERE LTRIM(RTRIM(m.MaHang)) = ld.maHang AND m.TinhOWE = 'SOT'
        ORDER BY m.PhienBan DESC, m.Id DESC
      ) q
      ORDER BY ld.ngay DESC, ld.line, ld.maHang`,
  },

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
  // slDat = SoLuongCanCap (SL tổ đặt trên phiếu); ct.SoLuong là SL kế hoạch chép từ SBD (slKHPhieu, dự phòng khi không ghép được SBD)
  chiTietDatBTP: {
    db: 'egmf',
    text: `
      SELECT TOP 3000 LTRIM(RTRIM(pc.TenCum)) AS maTo, pc.SoPhieuCapBTP AS soPhieu, pc.NgayNhanBTP AS ngayNhan,
             ISNULL(NULLIF(ct.LenhSanXuat, ''), pc.LenhSanXuat) AS lenhSX, pc.ProductCode AS maHang,
             ct.PO AS po, ct.TenMau AS mau, ct.SizeCode AS size,
             ISNULL(ct.SoLuongCanCap, 0) AS slDat, ISNULL(ct.SoLuong, 0) AS slKHPhieu,
             ISNULL(ct.SoLuongThucXuat, 0) AS slCap, ISNULL(ct.SoLuongThucNhan, 0) AS slNhan
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
             tc.BanCat AS banCat, t.BanMay AS banMay, t.IdBanMay AS idBanMay, ht.SoPhieu AS phieuHoachToan, t.ViTriBTP AS viTri,
             CASE WHEN ROW_NUMBER() OVER (PARTITION BY t.Id ORDER BY bc.ThoiGianQuetXuat) = 1 THEN ISNULL(t.SoLuong, 0) END AS slCat,
             CASE WHEN ROW_NUMBER() OVER (PARTITION BY t.Id ORDER BY bc.ThoiGianQuetXuat) = 1
                  THEN ISNULL(t.SoLuong, 0) - ISNULL(t.SoLuongThucXuat, 0) END AS slTon,
             bc.SoPhieuCapBTP AS soPhieuCap, bc.BarcodeCapBTPMoi AS temXuat, REPLACE(ISNULL(bc.LenhSanXuat, ''), ';', '') AS lenhXuat,
             bc.PO AS po, bc.Size AS sizeDat, pc.TenPhanXuong AS xn, LTRIM(RTRIM(pc.TenCum)) AS maTo, pc.NgayNhanBTP AS ngayNhan,
             bc.SoLuongDaXuat AS slXuat, bc.ThoiGianQuetXuat AS thoiGianXuat, bc.NguoiQuetXuat AS nguoiXuat,
             bc.SoLuongDaNhan AS slNhan, bc.ThoiGianQuetNhan AS thoiGianNhan
      FROM dbo.CUTTING_PhieuHoachToan_TemBarCode t
      LEFT JOIN dbo.CUTTING_PhieuHoachToan ht ON ht.PhieuHoachToanId = t.PhieuHoachToanId
      OUTER APPLY (SELECT TOP 1 c.BanCat FROM dbo.CUTTING_PhieuHoachToan_TemBarcode_ChiTiet c WHERE c.IdTem = t.Id) tc
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

  // Sản lượng đạt (qty) lũy kế theo xí nghiệp x chuyền x mã hàng x PO trong khoảng ngày (pro_nscl hiện hành). Tham số: @tuNgay, @denNgay
  sanLuongTheoHang: {
    db: 'hipro',
    text: `
      SELECT nm.ten AS xn, c.ten AS line, sp.ma_san_pham AS maHang, sp.po AS po,
             SUM(${Array.from({ length: 14 }, (_, i) => `ISNULL(n.qty_${i + 1}_h, 0)`).join(' + ')}) AS slSX
      FROM dbo.pro_nscl n
      JOIN dbo.pro_ke_hoach_san_xuat k ON k.id = n.pro_ke_hoach_san_xuat_id
      JOIN dbo.pro_chuyen c ON c.id = k.pro_chuyen_id
      JOIN dbo.pro_nha_may nm ON nm.id = c.pro_nha_may_id
      JOIN dbo.pro_san_pham sp ON sp.id = k.pro_san_pham_id
      JOIN dbo.pro_check_point cp ON cp.id = n.pro_check_point_id AND cp.pro_chuyen_id = k.pro_chuyen_id
      WHERE k.ngay_san_xuat >= @tuNgay AND k.ngay_san_xuat < DATEADD(day, 1, @denNgay)
      GROUP BY nm.ten, c.ten, sp.ma_san_pham, sp.po`,
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
  // -> CUTTING_PhieuHoachToan_TemBarCode (mỗi bó 1 tem / chi tiết). Bó đã xuất = SL xuất của tem chi tiết trống (tem thân chính,
  // kho quét tem này khi xuất); bó không có tem thân chính thì lấy SL xuất nhỏ nhất trong các tem của bó.

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
        SELECT tc.IdBanMay,
               ISNULL(MIN(CASE WHEN ISNULL(t.TenChiTiet, '') = '' THEN ISNULL(t.SoLuongThucXuat, 0) END),
                      MIN(ISNULL(t.SoLuongThucXuat, 0))) AS slXuat
        FROM dbo.CUTTING_PhieuHoachToan_TemBarCode t
        JOIN dbo.CUTTING_PhieuHoachToan_TemBarcode_ChiTiet tc ON tc.IdTem = t.Id
        WHERE ${matchLenh('t.LenhSanXuat')}
        GROUP BY tc.IdBanMay
      ) x ON x.IdBanMay = bm.IdBanMay
      WHERE ${matchLenh('m.LenhSanXuat')}
      GROUP BY bm.IdPhieuDieuTiet, ISNULL(bm.MauSanPham, ''), ISNULL(bm.TenSize, '')`,
  },

  // Tem theo chi tiết của 1 màu SP x size (qua bó cắt). Tham số: @lenhSX, @mau ('*' = mọi màu), @size, @loaiNL ('' = mọi loại)
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
        WHERE ${matchLenh('m.LenhSanXuat')} AND (@mau = '*' OR ISNULL(bm.MauSanPham, '') = @mau) AND ISNULL(bm.TenSize, '') = @size
          AND (@loaiNL = '' OR ISNULL(m.ChungLoai, '') = @loaiNL)
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
        WHERE ${matchLenh('m.LenhSanXuat')} AND (@mau = '*' OR ISNULL(bm.MauSanPham, '') = @mau) AND ISNULL(bm.TenSize, '') = @size
          AND (@loaiNL = '' OR ISNULL(m.ChungLoai, '') = @loaiNL)
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
  // ======================= Báo cáo may ra (viết lại từ Report_BaoCaoMayRa_GetData_TuNgay_DenNgay) =======================
  // Đọc thẳng nguồn, không qua bảng snapshot Report_BaoCaoMayRa. Dòng = tổ x PO.
  //   "Trong kỳ" = @tuNgay..@denNgay. "Lũy kế" = từ lúc bắt đầu (không chặn dưới) đến hết @denNgay.
  //   Vào chuyền: quét nhận BTP (ThoiGianQuetNhan), không tính tem trả, chỉ vải chính, chỉ tem thân chính (TenChiTiet trống)
  //     để mỗi bó tính 1 lần (store cũ dùng DISTINCT nên gộp nhầm các bó cùng SL trong 1 phiếu xuất).
  //   Nhập kho: Lib_GiaoHangThanhPhamDetail đã xác nhận, phiếu không hủy, tổ theo Lib_XacNhanTemDongGoi.IdTo.
  //   SL: tổng phân bổ OMM_KeHoachThang của tổ x PO (mọi tháng), không cắt trần lũy kế theo SL như store cũ.
  // Dòng được lấy khi tổ x PO có kế hoạch vào chuyền / may giao với kỳ, hoặc có vào chuyền / nhập kho trong kỳ.
  // Tham số: @xn (XNId), @xnCode ('XN1'), @tuNgay, @denNgay. May ra (HiPro) ghép ở API theo tổ x PO.
  mayRa: {
    db: 'egmf',
    text: `
      WITH kh AS (
        SELECT LTRIM(RTRIM(e.TenCum)) AS maTo, po.PONo AS po, MAX(dh.MaHang) AS maHang, SUM(k.SoLuong) AS soLuong,
               MIN(k.NgayVaoChuyenKeHoachBatDau) AS ngayKH,
               MAX(CASE WHEN k.NgayVaoChuyenKeHoachBatDau < DATEADD(day, 1, @denNgay)
                         AND ISNULL(k.NgayMayKeHoachKetThuc, k.NgayVaoChuyenKeHoachKetThuc) >= @tuNgay THEN 1 ELSE 0 END) AS trongKy
        FROM dbo.OMM_KeHoachThang k
        JOIN dbo.OMM_PO_ChiTiet ct ON ct.POCTId = k.CTPOId
        JOIN dbo.OMM_PO po ON po.POId = ct.POId
        JOIN dbo.OMM_DonHang dh ON dh.DHId = po.DHId
        JOIN dbo.Lib_CumChuyen e ON e.CumId = k.ChuyenId
        JOIN dbo.Lib_PhanXuong px ON px.PXId = e.PXId
        WHERE px.XNId = @xn AND k.SoLuong > 0
        GROUP BY LTRIM(RTRIM(e.TenCum)), po.PONo
      ),
      nhan AS (
        SELECT LTRIM(RTRIM(pc.TenCum)) AS maTo, bc.PO AS po, pc.ProductCode AS maHang, pc.LenhSanXuat AS lenhSX,
               bc.ThoiGianQuetNhan AS luc, ISNULL(bc.SoLuongDaNhan, 0) AS sl
        FROM dbo.CUTTING_PhieuCapBTP_BarcodeChiTiet bc
        JOIN dbo.CUTTING_PhieuCapBTP pc ON pc.SoPhieuCapBTP = bc.SoPhieuCapBTP
        JOIN dbo.CUTTING_PhieuHoachToan_TemBarCode t ON t.Barcode = bc.TemBarcodeBTP
        WHERE pc.TenPhanXuong = @xnCode AND ISNULL(bc.TraBTP, 0) = 0 AND ISNULL(t.TenChiTiet, '') = ''
          AND bc.ThoiGianQuetNhan < DATEADD(day, 1, @denNgay)
          AND (${vaiChinh('bc.ChungLoai')})
      ),
      giao AS (
        SELECT DISTINCT LTRIM(RTRIM(cc.TenCum)) AS maTo, ct.PO AS po, ct.MaHang AS maHang, ct.Barcode AS barcode,
               CASE WHEN isXacNhan = 1 THEN ISNULL(ct.SoLuong, 0) ELSE 0 END AS sl, CAST(ct.NgayTaoPhieu AS date) AS ngay
        FROM dbo.Lib_GiaoHangThanhPhamDetail ct
        JOIN dbo.Lib_GiaoHangThanhPham ph ON ph.id = ct.idPhieu AND ph.TrangThai <> 'HUYPHIEU'
        JOIN dbo.Lib_XacNhanTemDongGoi dg ON dg.Barcode = ct.Barcode
        JOIN dbo.Lib_CumChuyen cc ON cc.CumId = dg.IdTo
        JOIN dbo.Lib_PhanXuong px ON px.PXId = cc.PXId
        WHERE px.XNId = @xn AND ct.NgayTaoPhieu < DATEADD(day, 1, @denNgay)
      ),
      keys AS (
        SELECT maTo, po FROM kh WHERE trongKy = 1
        UNION SELECT maTo, po FROM nhan WHERE luc >= @tuNgay
        UNION SELECT maTo, po FROM giao WHERE ngay >= @tuNgay
      ),
      vc AS (
        SELECT n.maTo, n.po, MAX(n.maHang) AS maHang, MAX(n.lenhSX) AS lenhSX, MIN(n.luc) AS ngayDau,
               SUM(CASE WHEN n.luc >= @tuNgay THEN n.sl ELSE 0 END) AS vaoKy, SUM(n.sl) AS vaoLK
        FROM nhan n JOIN keys k ON k.maTo = n.maTo AND k.po = n.po
        GROUP BY n.maTo, n.po
      ),
      nk AS (
        SELECT g.maTo, g.po, MAX(g.maHang) AS maHang,
               SUM(CASE WHEN g.ngay >= @tuNgay THEN g.sl ELSE 0 END) AS nhapKy, SUM(g.sl) AS nhapLK
        FROM giao g JOIN keys k ON k.maTo = g.maTo AND k.po = g.po
        GROUP BY g.maTo, g.po
      )
      SELECT k.maTo, k.po, COALESCE(vc.maHang, kh.maHang, nk.maHang) AS maHang, vc.lenhSX, kh.soLuong,
             vc.vaoKy, vc.vaoLK, nk.nhapKy, nk.nhapLK,
             CASE WHEN vc.ngayDau IS NULL OR kh.ngayKH < vc.ngayDau THEN kh.ngayKH ELSE vc.ngayDau END AS ngayBatDau,
             xh.ngayXuat, kc.khachHang
      FROM keys k
      LEFT JOIN kh ON kh.maTo = k.maTo AND kh.po = k.po
      LEFT JOIN vc ON vc.maTo = k.maTo AND vc.po = k.po
      LEFT JOIN nk ON nk.maTo = k.maTo AND nk.po = k.po
      OUTER APPLY (SELECT MAX(CAST(x.EHD AS date)) AS ngayXuat FROM dbo.FG_LichXuatHangTuan_Imported x WHERE x.PO = k.po) xh
      OUTER APPLY (
        SELECT TOP 1 ISNULL(l.TenKhachHangNew, '') AS khachHang
        FROM dbo.Bravo_LenhSanXuat_Detail_PO b
        JOIN dbo.Bravo_LenhSanXuat_Detail a ON a.Id = b.IdDetail
        JOIN dbo.Lib_KhachHang l ON l.MaKhachHang = a.CustomerCode
        WHERE b.PO = k.po
      ) kc
      ORDER BY LEN(k.maTo), k.maTo, k.po`,
  },

  // Các bảng lưu trữ NSCL theo tháng của HiPro (pro_nscl_MM_YYYY): dữ liệu tháng cũ bị chuyển khỏi pro_nscl
  nsclLuuTru: {
    db: 'hipro',
    text: `SELECT name FROM sys.tables WHERE name LIKE 'pro[_]nscl[_][0-9][0-9][_][0-9][0-9][0-9][0-9]'`,
  },

  // May ra (HiPro) theo nhà máy x chuyền x PO: đạt + sửa đạt (qty_*_h + fix_*_h) + sua_po_luy_ke như store cũ;
  // thêm đạt lần đầu (qty) và lỗi (reject) của ngày @denNgay để tính đã kiểm / RFT,
  // đọc cả pro_nscl hiện hành lẫn các bảng lưu trữ truyền vào (tên đã kiểm ở API). Tham số: @tuLK, @tuNgay, @denNgay
  mayRaHiPro: (bangLuuTru = []) => {
    const cong = (cot) => Array.from({ length: 14 }, (_, i) => `ISNULL(${cot}_${i + 1}_h, 0)`).join(' + ');
    const cot = `${cong('qty')} AS dat, ${cong('fix')} AS sua, ${cong('reject')} AS loi`;
    const nguon = [`SELECT pro_ke_hoach_san_xuat_id, pro_check_point_id, ${cot}, ISNULL(sua_po_luy_ke, 0) AS dc FROM dbo.pro_nscl`]
      .concat(bangLuuTru.map((b) => `SELECT pro_ke_hoach_san_xuat_id, pro_check_point_id, ${cot}, 0 AS dc FROM dbo.${b}`));
    return {
      db: 'hipro',
      text: `
      SELECT nm.ten AS xn, c.ten AS line, sp.po AS po, MAX(sp.ma_san_pham) AS maHang,
             SUM(CASE WHEN k.ngay_san_xuat >= @tuNgay THEN n.dat + n.sua + n.dc ELSE 0 END) AS mayRaKy,
             SUM(CASE WHEN k.ngay_san_xuat >= @denNgay THEN n.dat + n.sua + n.dc ELSE 0 END) AS mayRaNgay,
             SUM(n.dat + n.sua + n.dc) AS mayRaLK,
             SUM(CASE WHEN k.ngay_san_xuat >= @denNgay THEN n.dat ELSE 0 END) AS datNgay,
             SUM(CASE WHEN k.ngay_san_xuat >= @denNgay THEN n.loi ELSE 0 END) AS loiNgay
      FROM (${nguon.join('\n        UNION ALL ')}) n
      JOIN dbo.pro_ke_hoach_san_xuat k ON k.id = n.pro_ke_hoach_san_xuat_id
      JOIN dbo.pro_chuyen c ON c.id = k.pro_chuyen_id
      JOIN dbo.pro_nha_may nm ON nm.id = c.pro_nha_may_id
      JOIN dbo.pro_san_pham sp ON sp.id = k.pro_san_pham_id
      JOIN dbo.pro_check_point cp ON cp.id = n.pro_check_point_id AND cp.pro_chuyen_id = k.pro_chuyen_id
      WHERE k.ngay_san_xuat >= @tuLK AND k.ngay_san_xuat < DATEADD(day, 1, @denNgay)
      GROUP BY nm.ten, c.ten, sp.po`,
    };
  },

  // ======================= Tổ trưởng chuyền may: kế hoạch tổ theo PO x size =======================
  // PO "đang chạy" của tổ tại ngày @d: có dòng OMM_KeHoachThang từ vào chuyền đến kết thúc may phủ ngày @d.
  // Phiếu đặt gần đây: phiếu cấp BTP của tổ tạo trong 30 ngày tới @d. Tham số chung: @xn, @xnCode, @to, @d
  khToSize: {
    db: 'egmf',
    text: `
      WITH poChay AS (${poChayToSQL}),
      poDat AS (${poDatToSQL})
      SELECT po.PONo AS po, dh.MaHang AS maHang, ISNULL(s.TenMau, '') AS mau, ISNULL(s.TenSize, '') AS size,
             SUM(ISNULL(s.SoLuong, 0)) AS soLuong,
             CASE WHEN po.PONo IN (SELECT po FROM poChay) THEN 1 ELSE 0 END AS dangChay
      FROM dbo.OMM_KeHoachThang k
      JOIN dbo.OMM_KeHoachThang_SBD s ON s.KHTId = k.KHTId
      JOIN dbo.OMM_PO_ChiTiet pct ON pct.POCTId = k.CTPOId
      JOIN dbo.OMM_PO po ON po.POId = pct.POId
      JOIN dbo.OMM_DonHang dh ON dh.DHId = po.DHId
      JOIN dbo.Lib_CumChuyen e ON e.CumId = k.ChuyenId
      JOIN dbo.Lib_PhanXuong px ON px.PXId = e.PXId
      WHERE px.XNId = @xn AND LTRIM(RTRIM(e.TenCum)) = @to AND k.SoLuong > 0
        AND (po.PONo IN (SELECT po FROM poChay) OR po.PONo IN (SELECT po FROM poDat))
      GROUP BY po.PONo, dh.MaHang, ISNULL(s.TenMau, ''), ISNULL(s.TenSize, '')`,
  },

  // Theo PO đang chạy của tổ: SL kế hoạch, KH ngày @d (như keHoachNgay), ngày vào chuyền / kết thúc may, lệnh SX (Bravo)
  khToPO: {
    db: 'egmf',
    text: `
      WITH poChay AS (${poChayToSQL})
      SELECT x.*,
             STUFF((SELECT DISTINCT ', ' + a.DocNo
                    FROM dbo.Bravo_LenhSanXuat_Detail_PO b
                    JOIN dbo.Bravo_LenhSanXuat_Detail a ON a.Id = b.IdDetail
                    WHERE b.PO = x.po
                    FOR XML PATH('')), 1, 2, '') AS lenhSX
      FROM (
        SELECT po.PONo AS po, MAX(dh.MaHang) AS maHang, SUM(k.SoLuong) AS soLuong,
               SUM(CASE WHEN CAST(k.NgayMayKeHoachBatDau AS date) <= @d AND @d <= CAST(k.NgayMayKeHoachKetThuc AS date)
                        THEN CASE WHEN ISNULL(k.SoNgaySX, 0) <= 1 THEN k.SoLuong ELSE k.SoLuong * 1.0 / k.SoNgaySX END
                        ELSE 0 END) AS khNgay,
               MIN(k.NgayVaoChuyenKeHoachBatDau) AS ngayVaoChuyen, MAX(k.NgayMayKeHoachKetThuc) AS ngayKetThuc
        FROM dbo.OMM_KeHoachThang k
        JOIN dbo.OMM_PO_ChiTiet pct ON pct.POCTId = k.CTPOId
        JOIN dbo.OMM_PO po ON po.POId = pct.POId
        JOIN dbo.OMM_DonHang dh ON dh.DHId = po.DHId
        JOIN dbo.Lib_CumChuyen e ON e.CumId = k.ChuyenId
        JOIN dbo.Lib_PhanXuong px ON px.PXId = e.PXId
        WHERE px.XNId = @xn AND LTRIM(RTRIM(e.TenCum)) = @to AND k.SoLuong > 0
          AND po.PONo IN (SELECT po FROM poChay)
        GROUP BY po.PONo
      ) x`,
  },

  // Dòng chi tiết phiếu đặt BTP của tổ (SL đặt = SoLuongCanCap), tạo đến hết @d, thuộc PO đang chạy hoặc tạo trong 30 ngày
  datToSize: {
    db: 'egmf',
    text: `
      WITH poChay AS (${poChayToSQL})
      SELECT pc.SoPhieuCapBTP AS soPhieu, pc.NgayTao AS ngayTao, pc.NgayNhanBTP AS ngayNhan,
             ISNULL(NULLIF(ct.LenhSanXuat, ''), pc.LenhSanXuat) AS lenhSX, ct.PO AS po, pc.ProductCode AS maHang, ISNULL(ct.TenMau, '') AS mau, ISNULL(ct.SizeCode, '') AS size,
             ISNULL(ct.SoLuongCanCap, 0) AS slDat, ISNULL(ct.SoLuongThucNhan, 0) AS slNhan
      FROM dbo.CUTTING_PhieuCapBTP pc
      JOIN dbo.CUTTING_PhieuCapBTP_ChiTiet ct ON ct.IdCapBTP = pc.IdCapBTP
      WHERE pc.TenPhanXuong = @xnCode AND LTRIM(RTRIM(pc.TenCum)) = @to AND pc.NgayTao < DATEADD(day, 1, @d)
        AND (pc.NgayTao >= DATEADD(day, -30, @d) OR ct.PO IN (SELECT po FROM poChay))`,
  },

  // SL kế hoạch theo lệnh x PO x màu x size (Bravo) cho PO đang chạy / có phiếu đặt gần đây của tổ (như lenhTheoSize)
  lenhToSize: {
    db: 'egmf',
    text: `
      WITH poChay AS (${poChayToSQL}),
      poDat AS (${poDatToSQL})
      SELECT CASE WHEN a.TypeCt = 1 AND ISNULL(a.ProductionOrderAdjNo, '') <> '' THEN a.ProductionOrderAdjNo ELSE a.DocNo END AS lenhSX,
             b.PO AS po, ISNULL(b.ColorCode, '') AS mau, ISNULL(b.SizeCode, '') AS size, SUM(ISNULL(b.Quantity, 0)) AS slLenh
      FROM dbo.Bravo_LenhSanXuat_Detail_PO b
      JOIN dbo.Bravo_LenhSanXuat_Detail a ON a.Id = b.IdDetail
      WHERE (b.PO IN (SELECT po FROM poChay) OR b.PO IN (SELECT po FROM poDat)) AND ISNULL(a.IsActive, 1) <> 0
      GROUP BY CASE WHEN a.TypeCt = 1 AND ISNULL(a.ProductionOrderAdjNo, '') <> '' THEN a.ProductionOrderAdjNo ELSE a.DocNo END,
               b.PO, ISNULL(b.ColorCode, ''), ISNULL(b.SizeCode, '')`,
  },
};
