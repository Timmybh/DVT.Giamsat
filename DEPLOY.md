# Triển khai production (máy 10.8.0.94)

Thư mục chạy: `C:\Applications\DVT.Giamsat`. Mã nguồn để build: `C:\Source\DVT.Giamsat` (hoặc build trên máy dev rồi chép zip sang).

## 1. Tạo gói (máy dev)

```powershell
cd D:\Source\DVT.Giamsat
git pull
npm.cmd install
npm.cmd run build:zip
```

Kết quả: `Deploy\dvt-giamsat-<version>-<ngày giờ>.zip`, đã kèm `node_modules` (toàn JS thuần, không cần build lại trên máy đích).

## 2. Cài lần đầu (máy 10.8.0.94)

1. Cài Node.js 18+ (đang dùng 24 được).
2. Giải nén zip vào `C:\Applications\DVT.Giamsat`.
3. Chạy `start.bat` một lần để tạo `.env` từ `.env.example`, tắt đi, sửa `.env`:
   - `USE_MOCK=false`
   - `DB_USER`, `DB_PASSWORD` (tài khoản chỉ đọc eGMF / HiPro)
   - `PORT=3000` (QR trên trang tổ trưởng dùng `http://10.8.0.94:<PORT>`)
4. Mở cổng tường lửa (PowerShell quyền Admin):
   ```powershell
   New-NetFirewallRule -DisplayName "DVT Giam sat" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
   ```
5. Chạy `start.bat`, mở `http://10.8.0.94:3000` từ máy khác trong LAN để kiểm tra.

### Tự chạy khi khởi động máy (Task Scheduler)

```powershell
$a = New-ScheduledTaskAction -Execute "C:\Applications\DVT.Giamsat\start.bat" -WorkingDirectory "C:\Applications\DVT.Giamsat"
$t = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName "DVT Giam sat" -Action $a -Trigger $t -User "SYSTEM" -RunLevel Highest
```

## 3. Cập nhật bản mới

1. Dừng ứng dụng (tắt cửa sổ `start.bat` hoặc `Stop-ScheduledTask "DVT Giam sat"`).
2. Giải nén zip mới đè lên `C:\Applications\DVT.Giamsat`.
3. **Giữ nguyên**: `.env`, `data\` (số lượt tương tác, SQLite), `config\ma-to-hipro.json` (nếu có). Gói zip không chứa các file này nên giải nén đè không mất.
4. Chạy lại `start.bat` (hoặc `Start-ScheduledTask "DVT Giam sat"`).

## Ghi chú

- Mọi truy vấn eGMF / HiPro đều chỉ đọc, `READ UNCOMMITTED`.
- Lượt tương tác lưu ở `data\tuong-tac.sqlite`; sao lưu file này nếu cần giữ số liệu lâu dài.
- Đăng nhập chưa có: ai trong LAN cũng mở được.
