// Ánh xạ nhà máy / chuyền HiPro -> xí nghiệp / tổ eGMF (mã hai hệ thống khác nhau).
// Bảng ánh xạ: config/ma-to-hipro.json, tạo bằng: npm run doi-chieu-to (rồi sửa tay nếu cần)
//   [{ "hiproXN": "<pro_nha_may.ten>", "hiproTo": "<pro_chuyen.ten>", "xn": "1", "to": "6" }, ...]
// Chuyền không có trong bảng: lấy số trong tên như trước ('XÍ NGHIỆP MAY 1' -> 1, 'Chuyền 07' -> 7).
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'config', 'ma-to-hipro.json');
const khoa = (xn, to) => `${String(xn ?? '').trim().toUpperCase()}|${String(to ?? '').trim().toUpperCase()}`;

let bang = null;
let lucDoc = 0;
// Đọc lại khi file đổi, không cần khởi động lại server
function nap() {
  let mtime = 0;
  try { mtime = fs.statSync(FILE).mtimeMs; } catch (e) { bang = new Map(); return bang; }
  if (bang && mtime === lucDoc) return bang;
  lucDoc = mtime;
  bang = new Map();
  try {
    JSON.parse(fs.readFileSync(FILE, 'utf8')).forEach((r) => bang.set(khoa(r.hiproXN, r.hiproTo), { xn: String(r.xn), to: String(r.to) }));
  } catch (e) {
    console.error('[ma-to-hipro.json]', e.message);
  }
  return bang;
}

// (tên nhà máy, tên chuyền HiPro, hàm dự phòng xnOf, lineOf) -> { xn, to } theo mã eGMF
function doiMa(xnTen, toTen, xnOf, lineOf) {
  const m = nap().get(khoa(xnTen, toTen));
  return m ? { xn: xnOf(m.xn), to: lineOf(m.to) } : { xn: xnOf(xnTen), to: lineOf(toTen) };
}

module.exports = { doiMa, FILE };
