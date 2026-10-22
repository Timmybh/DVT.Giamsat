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
router.get('/btp-cat', handle('btpCatNXT', (req) => ({
  lenhSX: (req.query.lenhSX || '').trim(), tuNgay: req.query.tuNgay, denNgay: req.query.denNgay,
})));
router.get('/btp-cat/xuat', handle('btpCatXuat', (req) => ({
  lenhSX: (req.query.lenhSX || '').trim(), loaiNL: req.query.loaiNL || '', chiTiet: req.query.chiTiet || '',
  mau: req.query.mau || '', size: req.query.size || '', tuNgay: req.query.tuNgay || '', denNgay: req.query.denNgay || '',
})));

// ---- Nhập xuất tồn BTP cắt theo điều tiết ----
// Chia 2 nhóm theo phiếu điều tiết:
//  - Cắt theo chủng loại: mọi loại NL (Vải chính, Keo...) -> nhóm con từng loại NL, dòng theo size (cộng mọi màu).
//  - Cắt theo màu: chỉ loại NL có ghi màu -> nhóm con từng màu, dòng theo size; cắt / xuất đồng bộ = nhỏ nhất giữa các loại NL có màu
//    (loại NL nào chưa cắt size đó tính 0), tác nghiệp = lớn nhất.
// Size ghi khác nhau giữa tác nghiệp và bàn máy sẽ thành dòng riêng.
const sizeSort = (a, b) => a.size.localeCompare(b.size, undefined, { numeric: true });
const tinh = (r) => ({ ...r, slTon: r.slCat - r.slXuat, conPhaiCat: Math.max(r.tacNghiep - r.slCat, 0) });
router.get('/btp-cat/dieu-tiet', async (req, res) => {
  try {
    const p = { lenhSX: (req.query.lenhSX || '').trim() };
    const [phieus, tns, bms] = await Promise.all([run('dtPhieu', p), run('dtTacNghiep', p), run('dtBanMay', p)]);
    if (!phieus.length) return res.json({ coDieuTiet: false, loaiNLs: [], nhomLoai: [], nhomMau: [] });
    const loaiOf = new Map(phieus.map((x) => [String(x.id), x.loaiNL || '(trống)']));
    const loaiNLs = [...new Set(phieus.map((x) => x.loaiNL || '(trống)'))];
    // Loại NL cắt theo chủng loại: mọi dòng tác nghiệp đều không có màu
    const coMau = new Set(tns.filter((t) => t.mau).map((t) => loaiOf.get(String(t.idPhieu))));
    const loaiMau = loaiNLs.filter((l) => coMau.has(l));
    const loaiChung = loaiNLs.filter((l) => !coMau.has(l));

    const mapLoai = new Map(); // loaiNL|size
    const mapMau = new Map(); // mau|size
    const oLoai = (loaiNL, size) => {
      const k = `${loaiNL}|${size}`;
      if (!mapLoai.has(k)) mapLoai.set(k, { loaiNL, size, mau: '', tacNghiep: 0, soBo: 0, slCat: 0, slXuat: 0 });
      return mapLoai.get(k);
    };
    const oMau = (mau, size, loaiNL) => {
      const k = `${mau}|${size}`;
      if (!mapMau.has(k)) mapMau.set(k, { mau, size, theoLoai: Object.fromEntries(loaiMau.map((l) => [l, { tacNghiep: 0, soBo: 0, slCat: 0, slXuat: 0 }])) });
      return mapMau.get(k).theoLoai[loaiNL];
    };
    // Mọi loại NL đều vào nhóm chủng loại (cộng mọi màu theo size); loại NL có màu vào thêm nhóm màu
    const o = (x) => {
      const l = loaiOf.get(String(x.idPhieu));
      return coMau.has(l) ? [oLoai(l, x.size), oMau(x.mau, x.size, l)] : [oLoai(l, x.size)];
    };
    tns.forEach((t) => o(t).forEach((x) => (x.tacNghiep += Number(t.soLuong || 0))));
    bms.forEach((b) => o(b).forEach((x) => {
      x.soBo += Number(b.soBo || 0); x.slCat += Number(b.slCat || 0); x.slXuat += Number(b.slXuat || 0);
    }));

    const nhomLoai = loaiNLs.map((loaiNL) => ({
      loaiNL,
      rows: [...mapLoai.values()].filter((r) => r.loaiNL === loaiNL).map((r) => tinh({ ...r, theoLoai: { [loaiNL]: { ...r } } })).sort(sizeSort),
    })).filter((g) => g.rows.length);
    const dongMau = [...mapMau.values()].map((r) => {
      const ls = Object.values(r.theoLoai);
      return tinh({
        ...r,
        tacNghiep: Math.max(...ls.map((x) => x.tacNghiep)),
        slCat: Math.min(...ls.map((x) => x.slCat)),
        slXuat: Math.min(...ls.map((x) => x.slXuat)),
      });
    });
    const nhomMau = [...new Set(dongMau.map((r) => r.mau))].sort().map((mau) => ({ mau, rows: dongMau.filter((r) => r.mau === mau).sort(sizeSort) }));
    res.json({ coDieuTiet: true, loaiNLs, loaiMau, loaiChung, nhomLoai, nhomMau });
  } catch (err) {
    console.error('[dieuTiet]', err.message);
    res.status(500).json({ error: err.message });
  }
});
const dtParams = (req) => ({
  lenhSX: (req.query.lenhSX || '').trim(), mau: req.query.mau || '', size: req.query.size || '', loaiNL: req.query.loaiNL || '',
});
router.get('/btp-cat/dieu-tiet/chi-tiet', handle('dtChiTiet', dtParams));
router.get('/btp-cat/dieu-tiet/phieu-cap', handle('dtPhieuCap', dtParams));

// ---- Tổ trưởng may / QC / Giám đốc XN ----
const ngay = (req) => req.query.d || today();
router.get('/ke-hoach-ngay', handleXn('keHoachNgay', (req) => ({ xn: req.query.xn, d0: ngay(req) })));
router.get('/san-luong-gio', handleXn('sanLuongGio', (req) => ({ d0: ngay(req) })));
router.get('/po-may-ra', handleXn('poMayRa', async (req) => ({ xnNum: await xnNum(req.query.xn), d0: ngay(req) })));
router.get('/lao-dong', handleXn('laoDong', (req) => ({ d0: ngay(req) })));
const qcRange = (req) => ({ tuNgay: req.query.tuNgay || daysAgo(13), denNgay: req.query.denNgay || today() });
router.get('/qc-nscl', handleXn('qcNscl', qcRange));
router.get('/qc-loi-chi-tiet', handleXn('qcLoiChiTiet', qcRange));
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
