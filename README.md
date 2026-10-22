# DVT Giám sát

Web giám sát xưởng may, đọc dữ liệu eGMF và HiPro trên SQL Server 10.8.0.72 (chỉ đọc).
Node.js + Express + `mssql`, giao diện HTML/JS thuần.

## Chạy UAT trên máy local

Cần Node.js 18 trở lên.

```powershell
npm install
copy .env.example .env      # điền DB_USER / DB_PASSWORD, đặt USE_MOCK=false
npm start                   # http://localhost:3000
```

`npm run mock` chạy bằng dữ liệu mẫu, không cần SQL Server. Nên dùng tài khoản SQL chỉ có quyền đọc (db_datareader).

## Khảo sát bảng BTP

Các bảng phiếu cấp BTP, phiếu xuất BTP cắt, lệnh sản xuất chưa xác định. Chạy:

```powershell
npm run khao-sat
```

Script chỉ đọc (SELECT), ghi cột, khóa ngoại và 5 dòng mẫu của các bảng `CUTTING_PhieuCapBTP*`, `CUTTING_PhieuHoachToan*`, lệnh sản xuất vào `khao-sat\ket-qua-<database>.txt`.
Gửi file này để sửa các câu SQL đánh dấu `[TẠM]` trong `src/queries.js`.

## Triển khai production (máy khác trong LAN)

```powershell
npm run build:zip           # tạo dist\dvt-giamsat-<version>.zip, đã kèm node_modules
```

Trên máy đích: cài Node.js 18+, giải nén, sửa `.env` (lần đầu `start.bat` tự tạo từ `.env.example`), chạy `start.bat`.

## Nguồn dữ liệu (eGMF)

| Màn hình | Bảng |
|---|---|
| Xí nghiệp, tổ | `Lib_XiNghiep` → `Lib_PhanXuong` → `Lib_CumChuyen` (TenCum = số tổ) |
| Kế hoạch phân bổ | `OMM_KeHoachThang` → `OMM_PO_ChiTiet` → `OMM_PO` → `OMM_DonHang` |
| Lệnh sản xuất | `Bravo_LenhSanXuat_Master` (DocNo) + `_Detail`, SL lệnh từ `CUTTING_LenhSanXuat_SoLuongLenh` |
| Phiếu cấp BTP | `CUTTING_PhieuCapBTP` (TenPhanXuong = XN1.., TenCum = tổ) + `CUTTING_PhieuCapBTP_ChiTiet` |
| Tem đã xuất cho phiếu cấp | `CUTTING_PhieuCapBTP_BarcodeChiTiet` |
| Nhập xuất tồn BTP cắt | `CUTTING_PhieuHoachToan_TemBarCode` (SL cắt = SoLuong, xuất = SoLuongThucXuat) |
| Kế hoạch ngày theo tổ | `OMM_KeHoachThang` (SoLuong / SoNgaySX) |
| Sản lượng theo giờ | HiPro `pro_nscl` (qty_1_h … qty_14_h) → `pro_ke_hoach_san_xuat` → `pro_chuyen` / `pro_nha_may` / `pro_san_pham` |
| PO đang may | `Report_BaoCaoMayRa` (bản ghi mới nhất theo PO x chuyền trong ngày) |
| Lao động | `LCD_Truc_Quan_ChuyenMay_LaoDong` |
| Lỗi QC | `DFC_InLine_*`, `DFCEndlineChitietloi`, `DFCDauChuyenChitietloi`, `DFCFinalChitietloiBoSung` |
| Doanh thu XN | `LCD_Truc_Quan_XiNghiep_DoanhThu_Ngay` |

Mọi truy vấn chạy `READ UNCOMMITTED` (đọc không khóa, tương đương `WITH (NOLOCK)`).

## Cấu trúc

| Đường dẫn | Nội dung |
|---|---|
| `server.js` | Web server Express |
| `src/queries.js` | Toàn bộ câu SQL |
| `src/api.js` | Các API `/api/...` |
| `src/mock.js` | Dữ liệu mẫu |
| `scripts/khao-sat.js` | Khảo sát bảng/cột trên SQL Server |
| `scripts/build-zip.ps1` | Đóng gói production |
| `public/index.html` | Trang chính: chọn xí nghiệp + 4 vai trò |
| `public/lean/` | Kế hoạch phân bổ, Tình hình đặt BTP, Nhập xuất tồn BTP cắt |
| `public/role/` | Tổ trưởng may, Tổ trưởng QC, Giám đốc XN |
