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
      res.json(await run(name, getParams(req)));
    } catch (err) {
      console.error(`[${name}]`, err.message);
      res.status(500).json({ error: err.message });
    }
  };
}

const today = () => new Date().toISOString().slice(0, 10);

router.get('/status', (req, res) => res.json({ mock: db.useMock() }));
router.get('/xi-nghiep', handle('xiNghiep', () => ({})));
router.get('/to', handle('to', (req) => ({ xn: req.query.xn })));
router.get('/ke-hoach-phan-bo', handle('keHoachPhanBo', (req) => ({
  xn: req.query.xn, tuNgay: req.query.tuNgay || today(), denNgay: req.query.denNgay || today(),
})));
router.get('/phieu-cap-btp', handle('phieuCapBTP', (req) => ({ xn: req.query.xn, to: req.query.to })));
router.get('/phieu-cap-btp/:soPhieu/phieu-xuat', handle('phieuXuatTheoPhieuCap', (req) => ({ soPhieu: req.params.soPhieu })));
router.get('/lenh-sx', handle('lenhSX', (req) => ({ xn: req.query.xn, q: req.query.q || '' })));
router.get('/btp-cat', handle('btpCatNXT', (req) => ({ lenhSX: req.query.lenhSX })));
router.get('/btp-cat/xuat', handle('btpCatXuat', (req) => ({
  lenhSX: req.query.lenhSX, mau: req.query.mau, size: req.query.size,
})));

module.exports = router;
