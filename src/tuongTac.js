// Đếm lượt tương tác (SQLite qua sql.js, không cần build native): mỗi lần mở trang, bấm, đổi bộ lọc là 1 lượt.
// File: data/tuong-tac.sqlite (đổi bằng biến TUONG_TAC_DB). Ghi xuống đĩa gom mỗi 2 giây và khi tắt server.
const fs = require('fs');
const path = require('path');
const express = require('express');
const initSqlJs = require('sql.js');

const FILE = path.resolve(process.env.TUONG_TAC_DB || path.join(__dirname, '..', 'data', 'tuong-tac.sqlite'));
let dbPromise = null;
let henGhi = null;

function moDb() {
  if (!dbPromise) {
    dbPromise = initSqlJs().then((SQL) => {
      const db = fs.existsSync(FILE) ? new SQL.Database(fs.readFileSync(FILE)) : new SQL.Database();
      db.run(`CREATE TABLE IF NOT EXISTS tuong_tac (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thoi_gian TEXT NOT NULL,
        ngay TEXT NOT NULL,
        trang TEXT, loai TEXT, chi_tiet TEXT, xn TEXT, ip TEXT, trinh_duyet TEXT)`);
      db.run('CREATE INDEX IF NOT EXISTS ix_tuong_tac_ngay ON tuong_tac (ngay)');
      return db;
    });
  }
  return dbPromise;
}

async function ghiXuongDia() {
  henGhi = null;
  const db = await moDb();
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tam = `${FILE}.tmp`;
  fs.writeFileSync(tam, Buffer.from(db.export()));
  fs.renameSync(tam, FILE);
}
const henGhiXuong = () => { if (!henGhi) henGhi = setTimeout(() => ghiXuongDia().catch((e) => console.error('[tuongTac] ghi file:', e.message)), 2000); };

// Giờ Việt Nam theo máy chủ (máy chủ đặt múi giờ VN)
const p2 = (x) => String(x).padStart(2, '0');
const ngayGio = (d = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
const cat = (v, n) => (v == null ? null : String(v).slice(0, n));

async function ghi(ds, req) {
  const db = await moDb();
  const ip = cat(req.headers['x-forwarded-for'] || req.socket.remoteAddress, 64);
  const ua = cat(req.headers['user-agent'], 300);
  const lenh = db.prepare('INSERT INTO tuong_tac (thoi_gian, ngay, trang, loai, chi_tiet, xn, ip, trinh_duyet) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  try {
    ds.slice(0, 50).forEach((x) => {
      const tg = ngayGio();
      lenh.run([tg, tg.slice(0, 10), cat(x.trang, 200), cat(x.loai, 30), cat(x.chiTiet, 200), cat(x.xn, 20), ip, ua]);
    });
  } finally { lenh.free(); }
  henGhiXuong();
}

async function dem() {
  const db = await moDb();
  const homNay = ngayGio().slice(0, 10);
  const r = db.exec('SELECT COUNT(*), SUM(CASE WHEN ngay = ? THEN 1 ELSE 0 END) FROM tuong_tac', [homNay])[0].values[0];
  return { tong: Number(r[0] || 0), homNay: Number(r[1] || 0) };
}

const router = express.Router();
// Nhận 1 hoặc nhiều lượt: { trang, loai, chiTiet, xn } (sendBeacon gửi text/plain nên tự đọc JSON)
router.post('/tuong-tac', express.text({ type: '*/*', limit: '64kb' }), async (req, res) => {
  try {
    let body = req.body;
    if (typeof body === 'string') body = body ? JSON.parse(body) : {};
    const ds = Array.isArray(body) ? body : [body];
    await ghi(ds, req);
    res.json(await dem());
  } catch (err) {
    console.error('[tuongTac]', err.message);
    res.status(400).json({ error: err.message });
  }
});
router.get('/tuong-tac/dem', async (req, res) => {
  try { res.json(await dem()); } catch (err) { res.status(500).json({ error: err.message }); }
});
// Thống kê theo ngày x trang (để xem nhanh): ?tuNgay=&denNgay=
router.get('/tuong-tac/thong-ke', async (req, res) => {
  try {
    const db = await moDb();
    const tu = String(req.query.tuNgay || '0000-00-00');
    const den = String(req.query.denNgay || '9999-12-31');
    const kq = db.exec(`SELECT ngay, trang, loai, COUNT(*) AS soLuot FROM tuong_tac WHERE ngay BETWEEN ? AND ?
      GROUP BY ngay, trang, loai ORDER BY ngay DESC, soLuot DESC`, [tu, den])[0];
    res.json(kq ? kq.values.map((v) => Object.fromEntries(kq.columns.map((c, i) => [c, v[i]]))) : []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Ghi nốt khi tắt server
const dong = () => { if (henGhi) { clearTimeout(henGhi); ghiXuongDia().finally(() => process.exit(0)); } else process.exit(0); };
process.once('SIGINT', dong);
process.once('SIGTERM', dong);

module.exports = { router, dem };
