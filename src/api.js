const express = require('express');
const db = require('./db');
const queries = require('./queries');
const mock = require('./mock');

const router = express.Router();

// Chạy truy vấn theo tên: dữ liệu mẫu hoặc SQL Server thật. Câu dựng động (hàm) nhận thêm `arg`.
async function run(name, params, arg) {
  if (db.useMock()) return mock[name](params, arg);
  const q = queries[name];
  return db.query(typeof q === 'function' ? q(arg) : q, params);
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
// Kế hoạch phân bổ + SL đã sản xuất (HiPro, đạt lũy kế từ ngày vào chuyền sớm nhất đến hôm nay, theo tổ x mã hàng)
router.get('/ke-hoach-phan-bo', async (req, res) => {
  try {
    const rows = await run('keHoachPhanBo', { xn: req.query.xn, tuNgay: req.query.tuNgay || today(), denNgay: req.query.denNgay || today() });
    if (!rows.length) return res.json([]);
    const n = await xnNum(req.query.xn);
    const tu = rows.reduce((m, r) => { const d = new Date(r.ngayVaoChuyen || r.ngayBatDau); return d < m ? d : m; }, new Date());
    const sx = await run('sanLuongTheoHang', { tuNgay: tu.toISOString().slice(0, 10), denNgay: today() });
    // Khớp HiPro theo tổ x PO; nếu tổ x mã hàng chỉ có 1 PO kế hoạch mà không khớp PO thì lấy tổng theo tổ x mã hàng
    const up = (v) => String(v ?? '').trim().toUpperCase();
    const theoPO = new Map();
    const theoHang = new Map();
    const cong = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
    sx.filter((r) => xnOf(r.xn) === n).forEach((r) => {
      cong(theoPO, `${lineOf(r.line)}|${up(r.po)}`, Number(r.slSX || 0));
      cong(theoHang, `${lineOf(r.line)}|${up(r.maHang)}`, Number(r.slSX || 0));
    });
    const soPO = new Map();
    rows.filter((r) => r.soLuong != null).forEach((r) => cong(soPO, `${lineOf(r.maTo)}|${up(r.maHang)}`, 1));
    res.json(rows.map((r) => {
      const kHang = `${lineOf(r.maTo)}|${up(r.maHang)}`;
      const kPO = `${lineOf(r.maTo)}|${up(r.po)}`;
      if (r.soLuong == null) return r; // dòng lệnh thứ 2 trở đi của cùng tổ x PO: SL kế hoạch / SX đã ghi ở dòng đầu
      const slSX = theoPO.has(kPO) ? theoPO.get(kPO) : (soPO.get(kHang) === 1 ? theoHang.get(kHang) || 0 : 0);
      return { ...r, slSX, conLai: Math.max(Number(r.soLuong || 0) - slSX, 0) };
    }));
  } catch (err) {
    console.error('[keHoachPhanBo]', err.message);
    res.status(500).json({ error: err.message });
  }
});
// Kế hoạch theo size: SL phân bổ (SBD, theo tổ) ghép với SL kế hoạch của lệnh (Bravo, theo PO x màu x size).
// Ghép theo PO + mã màu (chữ đầu của tên màu SBD) + size chuẩn hóa; mỗi lệnh 1 dòng. Dòng lệnh không ghép được SBD vẫn hiện (tổ trống).
router.get('/ke-hoach-phan-bo/theo-size', async (req, res) => {
  try {
    const p = { xn: req.query.xn, tuNgay: req.query.tuNgay || today(), denNgay: req.query.denNgay || today() };
    const [sbd, lenh] = await Promise.all([run('keHoachTheoSize', p), run('lenhTheoSize', p)]);
    const khoa = (po, mau, size) => `${String(po ?? '').trim()}|${maMau(mau)}|${chuanSize(size)}`;
    const theoKhoa = new Map();
    lenh.forEach((l) => { const k = khoa(l.po, l.mau, l.size); (theoKhoa.get(k) || theoKhoa.set(k, []).get(k)).push(l); });
    const daGhep = new Set();
    const out = [];
    sbd.forEach((r) => {
      const ls = theoKhoa.get(khoa(r.po, r.mau, r.size)) || [];
      ls.forEach((l) => daGhep.add(l));
      if (!ls.length) out.push({ ...r, lenhSX: null, slLenh: null, slPhanBo: Number(r.soLuong || 0) });
      ls.forEach((l) => out.push({ ...r, lenhSX: l.lenhSX, slLenh: Number(l.slLenh || 0), slPhanBo: Number(r.soLuong || 0) }));
    });
    // thứ tự size cho dòng lệnh lẻ: lấy theo size cùng mã hàng nếu có
    const tts = new Map(sbd.map((r) => [`${r.maHang}|${chuanSize(r.size)}`, r.thuTuSize]));
    lenh.filter((l) => !daGhep.has(l)).forEach((l) => out.push({
      maTo: '', maHang: l.maHang, po: l.po, mau: l.mau, size: l.size, lenhSX: l.lenhSX, slLenh: Number(l.slLenh || 0), slPhanBo: null,
      thuTuSize: tts.get(`${l.maHang}|${chuanSize(l.size)}`) ?? null,
    }));
    res.json(out);
  } catch (err) {
    console.error('[keHoachTheoSize]', err.message);
    res.status(500).json({ error: err.message });
  }
});
router.get('/ke-hoach-phan-bo/size', handle('keHoachSize', (req) => ({
  xn: req.query.xn, tuNgay: req.query.tuNgay || today(), denNgay: req.query.denNgay || today(), to: req.query.to || '', maHang: req.query.maHang || '', po: req.query.po || '',
})));
router.get('/phieu-cap-btp', handle('phieuCapBTP', async (req) => ({
  xnCode: await xnCode(req.query.xn), to: req.query.to,
  tuNgay: req.query.tuNgay || daysAgo(30), denNgay: req.query.denNgay || today(),
})));
// Chi tiết đặt BTP + SL KH (SBD) theo tổ x PO x màu x size.
// Màu / size giữa phiếu cấp và SBD ghi khác kiểu ('UK6-8/EUS(L31)' vs 'UK 6-8 / EU S'): bỏ khoảng trắng, bỏ '(...)' cuối, so chữ hoa;
// màu không khớp nguyên văn thì so mã màu đầu (chữ đầu tiên).
const chuanSize = (v) => String(v ?? '').toUpperCase().replace(/\([^)]*\)\s*$/, '').replace(/\s+/g, '');
const chuanMau = (v) => String(v ?? '').toUpperCase().replace(/\s+/g, '');
const maMau = (v) => String(v ?? '').trim().toUpperCase().split(/[\s/]+/)[0];
router.get('/chi-tiet-dat-btp', async (req, res) => {
  try {
    const p = {
      xn: req.query.xn, xnCode: await xnCode(req.query.xn), to: req.query.to || '',
      tuNgay: req.query.tuNgay || daysAgo(30), denNgay: req.query.denNgay || today(),
      lenhSX: (req.query.lenhSX || '').trim(), po: (req.query.po || '').trim(),
    };
    const [rows, kh] = await Promise.all([run('chiTietDatBTP', p), run('khSBDTheoPhieuCap', p)]);
    const day = new Map();
    const theoMa = new Map();
    const cong = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
    kh.forEach((k) => {
      const g = `${lineOf(k.maTo)}|${String(k.po).trim()}|${chuanSize(k.size)}`;
      cong(day, `${g}|${chuanMau(k.mau)}`, Number(k.soLuong || 0));
      cong(theoMa, `${g}|${maMau(k.mau)}`, Number(k.soLuong || 0));
    });
    res.json(rows.map((r) => {
      const g = `${lineOf(r.maTo)}|${String(r.po).trim()}|${chuanSize(r.size)}`;
      const slKH = day.has(`${g}|${chuanMau(r.mau)}`) ? day.get(`${g}|${chuanMau(r.mau)}`) : theoMa.get(`${g}|${maMau(r.mau)}`);
      return { ...r, slKH: slKH ?? (r.slKHPhieu != null ? Number(r.slKHPhieu) : null) };
    }));
  } catch (err) {
    console.error('[chiTietDatBTP]', err.message);
    res.status(500).json({ error: err.message });
  }
});
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
// Báo cáo may ra (viết lại store Report_BaoCaoMayRa_GetData_TuNgay_DenNgay, đọc thẳng nguồn):
// eGMF cho SL, vào chuyền, nhập kho; HiPro cho may ra, ghép theo tổ x PO.
// Trong kỳ = tuNgay..denNgay; lũy kế = từ lúc bắt đầu PO trên tổ đến hết denNgay (đọc cả bảng lưu trữ pro_nscl_MM_YYYY).
const ymd = (v) => {
  if (!v) return null;
  if (!(v instanceof Date)) return String(v).slice(0, 10);
  const p = (x) => String(x).padStart(2, '0');
  return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
};
// May ra HiPro (nhà máy x chuyền x PO) từ tuLK, đọc cả bảng lưu trữ pro_nscl_MM_YYYY của các tháng tuLK..denNgay
async function docMayRa(tuLK, tuNgay, denNgay) {
  const bang = (await run('nsclLuuTru', {})).map((x) => x.name).filter((b) => {
    const m = /^pro_nscl_(\d{2})_(\d{4})$/.exec(b);
    return m && `${m[2]}-${m[1]}` >= tuLK.slice(0, 7) && `${m[2]}-${m[1]}` <= denNgay.slice(0, 7);
  });
  return { bang, sx: await run('mayRaHiPro', { tuLK, tuNgay, denNgay }, bang) };
}
router.get('/may-ra', async (req, res) => {
  try {
    const tuNgay = req.query.tuNgay || today();
    const denNgay = req.query.denNgay || today();
    const n = await xnNum(req.query.xn);
    const rows = await run('mayRa', { xn: req.query.xn, xnCode: n ? `XN${n}` : '', tuNgay, denNgay });
    const tuLK = rows.reduce((m, r) => { const d = ymd(r.ngayBatDau); return d && d < m ? d : m; }, tuNgay);
    const { bang, sx } = await docMayRa(tuLK, tuNgay, denNgay);

    const key = (line, po) => `${lineOf(line)}|${String(po ?? '').trim()}`;
    const map = new Map();
    rows.forEach((r) => map.set(key(r.maTo, r.po), { ...r, maTo: lineOf(r.maTo), po: String(r.po ?? '').trim(), mayRaKy: 0, mayRaNgay: 0, mayRaLK: 0 }));
    sx.filter((r) => xnOf(r.xn) === n).forEach((r) => {
      const k = key(r.line, r.po);
      let x = map.get(k);
      if (!x) {
        if (!Number(r.mayRaKy)) return; // PO chỉ có may ra trước kỳ: bỏ
        x = { maTo: lineOf(r.line), po: String(r.po ?? '').trim(), maHang: r.maHang, mayRaKy: 0, mayRaNgay: 0, mayRaLK: 0 };
        map.set(k, x);
      }
      x.mayRaKy += Number(r.mayRaKy || 0);
      x.mayRaNgay += Number(r.mayRaNgay || 0);
      x.mayRaLK += Number(r.mayRaLK || 0);
    });
    const N = (v) => Number(v || 0);
    res.json({
      tuLK, bangLuuTru: bang,
      rows: [...map.values()].map((r) => ({
        ...r,
        soLuong: N(r.soLuong), vaoKy: N(r.vaoKy), vaoLK: N(r.vaoLK), nhapKy: N(r.nhapKy), nhapLK: N(r.nhapLK),
        tonMayRa: N(r.vaoLK) - r.mayRaLK, tonDongGoi: r.mayRaLK - N(r.nhapLK), conLai: N(r.soLuong) - r.mayRaLK,
      })).sort((a, b) => Number(a.maTo) - Number(b.maTo) || a.po.localeCompare(b.po)),
    });
  } catch (err) {
    console.error('[mayRa]', err.message);
    res.status(500).json({ error: err.message });
  }
});
// Tổ trưởng may: kế hoạch tổ theo PO (thẻ) x màu x size tại ngày d.
//   SL KH: OMM_KeHoachThang (PO) / SBD (size). SL đặt: SoLuongCanCap phiếu cấp BTP của tổ (hôm nay = phiếu tạo ngày d; lũy kế đến hết d).
//   SL SX: HiPro theo chuyền x PO (HiPro không ghi size). Còn lại hôm nay = KH ngày - SX hôm nay; còn lại = SL KH - SX lũy kế.
//   Phiếu đặt sai kế hoạch (tạo trong 30 ngày): PO không có kế hoạch ở tổ, màu/size không có trong SBD, hoặc đặt lũy kế vượt SL KH size.
router.get('/to-may/ke-hoach', async (req, res) => {
  try {
    const d = req.query.d || today();
    const maTo = String(req.query.to || '').trim();
    const n = await xnNum(req.query.xn);
    const p = { xn: req.query.xn, xnCode: n ? `XN${n}` : '', to: maTo, d };
    const [sbd, pos, dat, lenhs] = await Promise.all([run('khToSize', p), run('khToPO', p), run('datToSize', p), run('lenhToSize', p)]);
    const tuLK = pos.reduce((m, r) => { const x = ymd(r.ngayVaoChuyen); return x && x < m ? x : m; }, d);
    const { sx } = await docMayRa(tuLK, d, d);
    const N = (v) => Number(v || 0);
    const poKey = (v) => String(v ?? '').trim();
    const sxPO = new Map();
    sx.filter((r) => xnOf(r.xn) === n && lineOf(r.line) === lineOf(maTo)).forEach((r) => {
      const x = sxPO.get(poKey(r.po)) || { ngay: 0, lk: 0 };
      x.ngay += N(r.mayRaNgay); x.lk += N(r.mayRaLK);
      sxPO.set(poKey(r.po), x);
    });

    // Dòng size kế hoạch, khóa đầy đủ và khóa theo mã màu
    const sizes = sbd.map((r) => ({ ...r, po: poKey(r.po), kh: N(r.soLuong), datNgay: 0, datLK: 0, phieu: [], tatCaPhieu: [] }));
    const day = new Map();
    const theoMa = new Map();
    sizes.forEach((r) => {
      day.set(`${r.po}|${chuanMau(r.mau)}|${chuanSize(r.size)}`, r);
      if (!theoMa.has(`${r.po}|${maMau(r.mau)}|${chuanSize(r.size)}`)) theoMa.set(`${r.po}|${maMau(r.mau)}|${chuanSize(r.size)}`, r);
    });
    const coPO = new Set(sizes.map((r) => r.po));
    const tu30 = ymd(new Date(new Date(d) - 30 * 86400000));
    const sai = [];
    dat.forEach((x) => {
      const po = poKey(x.po);
      const ngay = ymd(x.ngayTao);
      const dong = { soPhieu: x.soPhieu, ngayTao: x.ngayTao, ngayNhan: x.ngayNhan, lenhSX: x.lenhSX, po, maHang: x.maHang, mau: x.mau, size: x.size, slDat: N(x.slDat) };
      const r = day.get(`${po}|${chuanMau(x.mau)}|${chuanSize(x.size)}`) || theoMa.get(`${po}|${maMau(x.mau)}|${chuanSize(x.size)}`);
      if (!r) {
        if (ngay >= tu30) sai.push({ ...dong, lyDo: coPO.has(po) ? 'Màu / size không có trong kế hoạch phân bổ của tổ' : 'PO không có kế hoạch phân bổ ở tổ' });
        return;
      }
      r.datLK += dong.slDat;
      if (ngay === d) r.datNgay += dong.slDat;
      r.phieu.push({ ...dong, ngay });
      r.tatCaPhieu.push({ ...dong, ngay });
    });
    // Đặt lũy kế vượt SL KH của size: đánh dấu các phiếu từ lúc vượt
    sizes.forEach((r) => {
      let lk = 0;
      r.phieu.sort((a, b) => String(a.ngay).localeCompare(String(b.ngay)) || String(a.soPhieu).localeCompare(String(b.soPhieu)))
        .forEach((x) => {
          lk += x.slDat;
          if (lk > r.kh && x.ngay >= tu30) sai.push({ ...x, lyDo: `Đặt lũy kế ${lk.toLocaleString('vi-VN')} vượt KH ${r.kh.toLocaleString('vi-VN')}` });
        });
      delete r.phieu;
    });

    // Lệnh của từng tổ hợp PO x màu x size (Bravo, ghép theo mã màu + size chuẩn hóa)
    const lenhTheoKhoa = new Map();
    lenhs.forEach((l) => {
      const k = `${poKey(l.po)}|${maMau(l.mau)}|${chuanSize(l.size)}`;
      (lenhTheoKhoa.get(k) || lenhTheoKhoa.set(k, []).get(k)).push(l);
    });
    const goLenh = (v) => String(v ?? '').toUpperCase().replace(/[\s;]+/g, '');
    const cuaLenh = (phieuLenh, lenh) => String(phieuLenh ?? '').toUpperCase().replace(/\s+/g, '').split(';').some((x) => x && x === goLenh(lenh));

    const the = pos.map((x) => {
      const po = poKey(x.po);
      const m = sxPO.get(po) || { ngay: 0, lk: 0 };
      const khNgay = Math.round(N(x.khNgay));
      return {
        po, maHang: x.maHang, lenhSX: x.lenhSX, soLuong: N(x.soLuong), khNgay, ngayVaoChuyen: x.ngayVaoChuyen, ngayKetThuc: x.ngayKetThuc,
        sxNgay: m.ngay, sxLK: m.lk, conLaiNgay: Math.max(khNgay - m.ngay, 0), conLai: Math.max(N(x.soLuong) - m.lk, 0),
        sizes: sizes.filter((r) => r.po === po).flatMap((r) => {
          const ls = lenhTheoKhoa.get(`${po}|${maMau(r.mau)}|${chuanSize(r.size)}`) || [];
          const goc = { mau: r.mau, size: r.size, kh: r.kh };
          if (ls.length <= 1) return [{ ...goc, lenhSX: ls[0] ? ls[0].lenhSX : null, slLenh: ls[0] ? N(ls[0].slLenh) : null, datNgay: r.datNgay, datLK: r.datLK }];
          // PO có nhiều lệnh: tách đặt theo lệnh ghi trên phiếu cấp
          return ls.map((l) => {
            const ps = r.tatCaPhieu.filter((q) => cuaLenh(q.lenhSX, l.lenhSX));
            return { ...goc, lenhSX: l.lenhSX, slLenh: N(l.slLenh), datNgay: ps.filter((q) => q.ngay === d).reduce((t, q) => t + q.slDat, 0), datLK: ps.reduce((t, q) => t + q.slDat, 0) };
          });
        }),
      };
    }).sort((a, b) => String(a.ngayVaoChuyen).localeCompare(String(b.ngayVaoChuyen)));
    sizes.forEach((r) => delete r.tatCaPhieu);
    res.json({ the, sai: sai.sort((a, b) => String(b.ngayTao).localeCompare(String(a.ngayTao))) });
  } catch (err) {
    console.error('[toMayKeHoach]', err.message);
    res.status(500).json({ error: err.message });
  }
});
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
