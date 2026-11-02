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

## 2b. Chạy sau IIS (tùy chọn)

IIS không chạy trực tiếp app Node được (iisnode đã ngừng phát triển, không khuyên dùng). Cách chuẩn: app Node vẫn chạy bằng `start.bat` / Task Scheduler như mục 2, IIS đứng trước làm **reverse proxy** (cổng 80, tên miền, HTTPS, chung IIS với web khác).

1. Cài trên máy 10.8.0.94 (Web Platform / tải từ trang Microsoft): **URL Rewrite 2.1** và **Application Request Routing 3.0**.
2. IIS Manager → chọn tên máy (gốc) → **Application Request Routing Cache** → **Server Proxy Settings** → tick **Enable proxy** → Apply.
3. Tạo site mới (ví dụ `DVT Giam sat`, cổng 80), Physical path: `C:\Applications\DVT.Giamsat\iis` (thư mục này chỉ chứa `web.config`).
4. `web.config` có sẵn trong gói (`iis\web.config`): chuyển mọi request sang `http://localhost:3000`. Đổi cổng trong file nếu `.env` dùng `PORT` khác.
5. Mở cổng 80 trên tường lửa thay cho 3000 (cổng 3000 có thể đóng lại, chỉ IIS gọi nội bộ).
6. Truy cập `http://10.8.0.94/`. QR trên trang tổ trưởng tự bỏ số cổng khi chạy cổng 80.

Ghi chú: IP người dùng trong lượt tương tác lấy từ header `X-Forwarded-For` (ARR gửi kèm khi bật proxy); không có thì ghi IP của IIS.

## 3. Cập nhật bản mới

1. Dừng ứng dụng (tắt cửa sổ `start.bat` hoặc `Stop-ScheduledTask "DVT Giam sat"`).
2. Giải nén zip mới đè lên `C:\Applications\DVT.Giamsat`.
3. **Giữ nguyên**: `.env`, `data\` (số lượt tương tác, SQLite), `config\ma-to-hipro.json` (nếu có). Gói zip không chứa các file này nên giải nén đè không mất. Nếu đã sửa `iis\web.config` (đổi cổng) thì sửa lại sau khi giải nén.
4. Chạy lại `start.bat` (hoặc `Start-ScheduledTask "DVT Giam sat"`).

## Ghi chú

- Mọi truy vấn eGMF / HiPro đều chỉ đọc, `READ UNCOMMITTED`.
- Lượt tương tác lưu ở `data\tuong-tac.sqlite`; sao lưu file này nếu cần giữ số liệu lâu dài.
- Đăng nhập chưa có: ai trong LAN cũng mở được.
