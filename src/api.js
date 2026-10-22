const express = require('express');
const db = require('./db');
const queries = require('./queries');
const mock = require('./mock');

const router = express.Router();

// Chạy truy vấn theo tên: dữ liệu mẫu hoặc SQL Server thật
async function run(name, params) {
  if (db.useMock()) return mock[name](params);
  return db.query(queries[name], params);
}

function handle(name, getParams) {
  return async (req, res) => {
    try {
      res.json(await run(name, await getParams(req)));
    } catch (err) {
      console.error(`[${name}]`, err.message);
      res.status(500).json({ error: err.message });
    }
  };
}

const iso = (d) => d.toISOString().slice(0, 10);
const today = () => iso(new Date());
const daysAgo = (n) => iso(new Date(Date.now() - n * 86400000));

// Bảng CUTTING lưu xí nghiệp dạng 'XN1'; lấy số trong tên xí nghiệp (như DH-DVT)
let xnCache;
async function xnNum(xn) {
  if (!xnCache) xnCache = await run('xiNghiep', {});
  const row = xnCache.find((x) => x.ma === String(xn));
  const m = /(\d+)/.exec(row ? row.ten : '');
  return m ? String(Number(m[1])) : '';
}
async function xnCode(xn) {
  const n = await xnNum(xn);
  return n ? `XN${n}` : '';
}

// Tên xí nghiệp ghi nhiều kiểu ('XN1', 'XÍ NGHIỆP MAY 1', 1): lấy số như DH-DVT; phòng ban -> null
const XN_RE = /(?:XN|X[ÍI] ?NGHI[ỆE]P(?: MAY)?)\s*0?(\d)/i;
const xnOf = (raw) => {
  if (raw == null) return null;
  if (/^\s*\d+\s*$/.test(String(raw))) return String(Number(raw));
  const m = XN_RE.exec(String(raw));
  return m ? String(Number(m[1])) : null;
};
// Số tổ: '7', 'Chuyền 07', 'TỔ 7' -> '7'
const lineOf = (raw) => {
  const m = /(\d+)/.exec(String(raw ?? ''));
  return m ? String(Number(m[1])) : String(raw ?? '').trim();
};

// Chạy truy vấn rồi lọc theo xí nghiệp (cột xn dạng tên) và chuẩn hóa số tổ
function handleXn(name, getParams) {
  return async (req, res) => {
    try {
      const n = await xnNum(req.query.xn);
      const rows = await run(name, await getParams(req));
      res.json(rows.filter((r) => r.xn === undefined || xnOf(r.xn) === n)
        .map((r) => (r.line !== undefined ? { ...r, line: lineOf(r.line) } : r)));
    } catch (err) {
      console.error(`[${name}]`, err.message);
      res.status(500).json({ error: err.message });
    }
  };
}

router.get('/status', (req, res) => res.json({ mock: db.useMock() }));
router.get('/xi-nghiep', handle('xiNghiep', () => ({})));
router.get('/to', handle('to', (req) => ({ xn: req.query.xn })));
router.get('/ke-hoach-phan-bo', handle('keHoachPhanBo', (req) => ({
  xn: req.query.xn, tuNgay: req.query.tuNgay || today(), denNgay: req.query.denNgay || today(),
})));
router.get('/phieu-cap-btp', handle('phieuCapBTP', async (req) => ({
  xnCode: await xnCode(req.query.xn), to: req.query.to,
  tuNgay: req.query.tuNgay || daysAgo(30), denNgay: req.query.denNgay || today(),
})));
router.get('/chi-tiet-dat-btp', handle('chiTietDatBTP', async (req) => ({
  xnCode: await xnCode(req.query.xn), to: req.query.to || '',
  tuNgay: req.query.tuNgay || daysAgo(30), denNgay: req.query.denNgay || today(),
  lenhSX: (req.query.lenhSX || '').trim(), po: (req.query.po || '').trim(),
})));
router.get('/phieu-cap-btp/:soPhieu/chi-tiet', handle('phieuCapChiTiet', (req) => ({ soPhieu: req.params.soPhieu })));
router.get('/phieu-cap-btp/:soPhieu/phieu-xuat', handle('phieuXuatTheoPhieuCap', (req) => ({ soPhieu: req.params.soPhieu })));
router.get('/lenh-sx', handle('lenhSX', (req) => ({ q: (req.query.q || '').trim() })));
router.get('/btp-cat', handle('btpCatNXT', (req) => ({ lenhSX: (req.query.lenhSX || '').trim() })));
router.get('/btp-cat/xuat', handle('btpCatXuat', (req) => ({
  lenhSX: (req.query.lenhSX || '').trim(), loaiNL: req.query.loaiNL || '', chiTiet: req.query.chiTiet || '',
  mau: req.query.mau || '', size: req.query.size || '',
})));

// ---- Tổ trưởng may / QC / Giám đốc XN ----
const ngay = (req) => req.query.d || today();
router.get('/ke-hoach-ngay', handleXn('keHoachNgay', (req) => ({ xn: req.query.xn, d0: ngay(req) })));
router.get('/san-luong-gio', handleXn('sanLuongGio', (req) => ({ d0: ngay(req) })));
router.get('/po-may-ra', handleXn('poMayRa', async (req) => ({ xnNum: await xnNum(req.query.xn), d0: ngay(req) })));
router.get('/lao-dong', handleXn('laoDong', (req) => ({ d0: ngay(req) })));
router.get('/qc-loi', handleXn('qcLoi', (req) => ({ tuNgay: req.query.tuNgay || daysAgo(13), denNgay: req.query.denNgay || today() })));
router.get('/doanh-thu', async (req, res) => {
  try {
    const rows = await run('doanhThuNgay', {
      xnNum: await xnNum(req.query.xn), tuNgay: req.query.tuNgay || daysAgo(30), denNgay: req.query.denNgay || today(),
    });
    // Nhập tay có thể trùng ngày: giữ dòng Id lớn nhất
    const byDay = new Map();
    rows.forEach((r) => {
      const k = new Date(r.ngay).toISOString().slice(0, 10);
      if (!byDay.has(k) || byDay.get(k).id < r.id) byDay.set(k, r);
    });
    res.json([...byDay.values()]);
  } catch (err) {
    console.error('[doanhThuNgay]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
