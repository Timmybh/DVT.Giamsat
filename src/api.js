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
async function xnCode(xn) {
  if (!xnCache) xnCache = await run('xiNghiep', {});
  const row = xnCache.find((x) => x.ma === String(xn));
  const m = /(\d+)/.exec(row ? row.ten : '');
  return m ? `XN${Number(m[1])}` : '';
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
router.get('/phieu-cap-btp/:soPhieu/chi-tiet', handle('phieuCapChiTiet', (req) => ({ soPhieu: req.params.soPhieu })));
router.get('/phieu-cap-btp/:soPhieu/phieu-xuat', handle('phieuXuatTheoPhieuCap', (req) => ({ soPhieu: req.params.soPhieu })));
router.get('/lenh-sx', handle('lenhSX', (req) => ({ q: (req.query.q || '').trim() })));
router.get('/btp-cat', handle('btpCatNXT', (req) => ({ lenhSX: (req.query.lenhSX || '').trim() })));
router.get('/btp-cat/xuat', handle('btpCatXuat', (req) => ({
  lenhSX: (req.query.lenhSX || '').trim(), loaiNL: req.query.loaiNL || '', chiTiet: req.query.chiTiet || '',
  mau: req.query.mau || '', size: req.query.size || '',
})));

module.exports = router;
