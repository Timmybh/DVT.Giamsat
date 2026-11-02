const express = require('express');
const db = require('./db');
const queries = require('./queries');
const mock = require('./mock');
const { doiMa } = require('./maHiPro');

const router = express.Router();

// Chạy truy vấn theo tên: dữ liệu mẫu hoặc SQL Server thật. Câu dựng động (hàm) nhận thêm `arg`.
async function run(name, params, arg) {
  if (db.useMock()) return mock[name](params, arg);
  const q = queries[name];
  const t0 = Date.now();
  try {
    return await db.query(typeof q === 'function' ? q(arg) : q, params);
  } finally {
    // câu chạy chậm (> 3 giây) ghi ra log để biết câu nào nặng
    const ms = Date.now() - t0;
    if (ms > 3000) console.log(`[cham] ${name} ${ms} ms ${JSON.stringify(params).slice(0, 200)}`);
  }
}

// PO có lệnh cho XN nhưng chưa phân bổ (src/chuaPhanBo.js); dữ liệu mẫu dùng mock keHoachChuaPhanBo(Size)
const { docChuaPhanBo } = require('./chuaPhanBo');
const chuaPB = (p, theoSize) => (db.useMock() ? mock[theoSize ? 'keHoachChuaPhanBoSize' : 'keHoachChuaPhanBo'](p) : docChuaPhanBo(p, theoSize));

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

// Chuyền HiPro -> xí nghiệp / tổ eGMF: ưu tiên khóa nối CumId (DM_Chuyen.IdChuyenOMM) của HiPro,
// không có thì theo config/ma-to-hipro.json, cuối cùng lấy số trong tên. Danh mục tổ nạp lại mỗi 10 phút.
let cumMap = new Map();
let cumLuc = 0;
async function napCum() {
  if (Date.now() - cumLuc < 600000) return;
  cumLuc = Date.now();
  try {
    cumMap = new Map((await run('cumChuyen', {})).map((r) => [String(r.cumId), { xn: xnOf(r.xnTen), to: lineOf(r.maTo) }]));
  } catch (e) { console.error('[cumChuyen]', e.message); }
}
const hp = (r) => (r.cumId != null && cumMap.get(String(r.cumId))) || doiMa(r.xn, r.line, xnOf, lineOf);

// Chạy truy vấn rồi lọc theo xí nghiệp (cột xn dạng tên) và chuẩn hóa số tổ. laHiPro: đổi mã HiPro sang eGMF
function handleXn(name, getParams, laHiPro = false) {
  return async (req, res) => {
    try {
      const n = await xnNum(req.query.xn);
      const rows = await run(name, await getParams(req));
      if (laHiPro) {
        await napCum();
        res.json(rows.map((r) => { const m = hp(r); return { ...r, xn: m.xn, line: m.to }; }).filter((r) => r.xn === n));
        return;
      }
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
    const pk = { xn: req.query.xn, tuNgay: req.query.tuNgay || today(), denNgay: req.query.denNgay || today() };
    const n = await xnNum(req.query.xn);
    // PO đã có lệnh cho xí nghiệp (DeptCode M<n>) nhưng chưa phân bổ cho tổ nào: hiện cuối bảng, tổ trống, SL kế hoạch trống
    const [rows0, chua] = await Promise.all([run('keHoachPhanBo', pk), n ? chuaPB({ ...pk, dept: `M${n}` }, false) : []]);
    // Mỗi tổ x PO: ưu tiên lệnh đúng DeptCode của XN (theoXN), rồi ẩn lệnh gốc đã thu hồi về 0 (gốc + điều chỉnh / thu hồi = 0)
    // khi còn lệnh khác > 0; SL kế hoạch chuyển về dòng đầu còn lại.
    const nhomTP = new Map();
    rows0.forEach((r) => { const k = `${r.maTo}|${r.po}`; (nhomTP.get(k) || nhomTP.set(k, []).get(k)).push(r); });
    const rows = [];
    nhomTP.forEach((rs) => {
      const sl = rs.find((r) => r.soLuong != null)?.soLuong ?? null;
      const coLenh = rs.filter((r) => r.lenhSX);
      if (!coLenh.length) { rows.push(...rs); return; }
      const gocCua = (r) => (Number(r.typeCt) > 0 && r.lenhGoc ? r.lenhGoc : r.lenhSX);
      // lọc XN theo lệnh gốc: lệnh điều chỉnh / thu hồi đi theo lệnh gốc
      const gocs = new Map();
      coLenh.forEach((r) => { const g = gocCua(r); const x = gocs.get(g) || { lenhSX: g, dept: '', slLenh: 0, ds: [] }; x.ds.push(r); x.slLenh += Number(r.slLenh || 0); if (gocCua(r) === r.lenhSX) x.dept = r.dept; gocs.set(g, x); });
      const giu = boLenh0(theoXN([...gocs.values()], n));
      const ds = giu.flatMap((g) => g.ds);
      ds.forEach((r, i) => { r.soLuong = i === 0 ? sl : null; });
      rows.push(...ds);
    });
    const dongChua = chua.map((l) => ({
      maTo: '', tenTo: '', maHang: l.maHang, po: l.po, lenhSX: l.lenhSX, slLenh: Number(l.slLenh || 0), loaiLenh: 'Lệnh gốc',
      soLuong: null, ngayLenh: l.ngayLenh, chuaPhanBo: true,
    }));
    if (!rows.length) return res.json(dongChua);
    const tu = rows.reduce((m, r) => { const d = new Date(r.ngayVaoChuyen || r.ngayBatDau); return d < m ? d : m; }, new Date());
    // SL SX = may ra HiPro (đạt + sửa + điều chỉnh lũy kế), chỉ đọc các PO của bảng và cả bảng lưu trữ pro_nscl_MM_YYYY
    // (trước đây đọc mọi PO mọi nhà máy, chỉ bảng tháng hiện hành nên PO may từ tháng trước bị thiếu SL)
    const dsPO = [...new Set(rows.map((r) => String(r.po ?? '').trim()).filter(Boolean))];
    const tuNgaySX = ymd(tu);
    const { sx: sx0 } = db.useMock()
      ? { sx: (await run('sanLuongTheoHang', {})).map((r) => ({ ...r, mayRaLK: r.slSX })) }
      : await docMayRa(tuNgaySX, tuNgaySX, today(), dsPO.length <= 2000 ? dsPO : []);
    const sx = sx0.map((r) => ({ ...r, slSX: Number(r.mayRaLK || 0) }));
    // Khớp HiPro theo tổ x PO; nếu tổ x mã hàng chỉ có 1 PO kế hoạch mà không khớp PO thì lấy tổng theo tổ x mã hàng
    const up = (v) => String(v ?? '').trim().toUpperCase();
    const theoPO = new Map();
    const theoHang = new Map();
    const cong = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
    sx.map((r) => ({ ...r, ...hp(r) })).filter((r) => r.xn === n).forEach((r) => {
      cong(theoPO, `${r.to}|${up(r.po)}`, Number(r.slSX || 0));
      cong(theoHang, `${r.to}|${up(r.maHang)}`, Number(r.slSX || 0));
    });
    const soPO = new Map();
    rows.filter((r) => r.soLuong != null).forEach((r) => cong(soPO, `${lineOf(r.maTo)}|${up(r.maHang)}`, 1));
    res.json(rows.map((r) => {
      const kHang = `${lineOf(r.maTo)}|${up(r.maHang)}`;
      const kPO = `${lineOf(r.maTo)}|${up(r.po)}`;
      if (r.soLuong == null) return r; // dòng lệnh thứ 2 trở đi của cùng tổ x PO: SL kế hoạch / SX đã ghi ở dòng đầu
      const slSX = theoPO.has(kPO) ? theoPO.get(kPO) : (soPO.get(kHang) === 1 ? theoHang.get(kHang) || 0 : 0);
      return { ...r, slSX, conLai: Math.max(Number(r.soLuong || 0) - slSX, 0) };
    }).concat(dongChua));
  } catch (err) {
    console.error('[keHoachPhanBo]', err.message);
    res.status(500).json({ error: err.message });
  }
});
// Kế hoạch theo size: SL phân bổ (SBD, theo tổ) ghép với SL kế hoạch của lệnh (Bravo, theo PO x màu x size).
// Ghép theo PO + màu (bangMau: tên SBD -> mã màu Bravo) + size chuẩn hóa; mỗi lệnh 1 dòng. Dòng lệnh không ghép được SBD vẫn hiện (tổ trống).
router.get('/ke-hoach-phan-bo/theo-size', async (req, res) => {
  try {
    const p = { xn: req.query.xn, tuNgay: req.query.tuNgay || today(), denNgay: req.query.denNgay || today() };
    const nXN = await xnNum(req.query.xn);
    const [sbd, lenh, chua] = await Promise.all([run('keHoachTheoSize', p), run('lenhTheoSize', p),
      nXN ? chuaPB({ ...p, dept: `M${nXN}` }, true) : []]);
    const kMau = bangMau(sbd, lenh);
    const poS = (po) => String(po ?? '').trim();
    const theoKhoa = new Map();
    lenh.forEach((l) => { const k = `${poS(l.po)}|${khoaMa(l.mau)}|${chuanSize(l.size)}`; (theoKhoa.get(k) || theoKhoa.set(k, []).get(k)).push(l); });
    const daGhep = new Set();
    const out = [];
    sbd.forEach((r) => {
      const tatCa = theoKhoa.get(`${poS(r.po)}|${kMau(r.po, r.mau)}|${chuanSize(r.size)}`) || [];
      tatCa.forEach((l) => daGhep.add(l));
      const ls = boLenh0(theoXN(tatCa, nXN));
      if (!ls.length) out.push({ ...r, lenhSX: null, slLenh: null, slPhanBo: Number(r.soLuong || 0) });
      ls.forEach((l) => out.push({ ...r, lenhSX: l.lenhSX, ngayLenh: l.ngayLenh, slLenh: Number(l.slLenh || 0), slPhanBo: Number(r.soLuong || 0) }));
    });
    // thứ tự size cho dòng lệnh lẻ: lấy theo size cùng mã hàng nếu có
    const tts = new Map(sbd.map((r) => [`${r.maHang}|${chuanSize(r.size)}`, r.thuTuSize]));
    lenh.filter((l) => !daGhep.has(l)).forEach((l) => out.push({
      maTo: '', maHang: l.maHang, po: l.po, mau: l.mau, size: l.size, lenhSX: l.lenhSX, ngayLenh: l.ngayLenh, slLenh: Number(l.slLenh || 0), slPhanBo: null,
      thuTuSize: tts.get(`${l.maHang}|${chuanSize(l.size)}`) ?? null,
    }));
    // PO đã có lệnh cho xí nghiệp nhưng chưa phân bổ cho tổ nào (kể cả chưa đưa vào OMM)
    chua.forEach((l) => out.push({
      maTo: '', maHang: l.maHang, po: l.po, mau: l.mau, size: l.size, lenhSX: l.lenhSX, slLenh: Number(l.slLenh || 0), slPhanBo: null,
      thuTuSize: tts.get(`${l.maHang}|${chuanSize(l.size)}`) ?? null, chuaPhanBo: true, ngayLenh: l.ngayLenh,
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
// màu không khớp nguyên văn thì ghép qua mã màu Bravo (bangMau).
const chuanSize = (v) => String(v ?? '').toUpperCase().replace(/\([^)]*\)\s*$/, '').replace(/\s+/g, '');
const chuanMau = (v) => String(v ?? '').toUpperCase().replace(/\s+/g, '');
// Ghép màu tên (SBD / phiếu cấp: '8990370-JERSEY …', '8380664 LS TS …', '01-PUMARED', 'MID SKI 900 …')
// với mã màu Bravo (ColorCode: '8990370', '01-PUMARED', '8995516'). Thứ tự:
//  (a) trùng hẳn (bỏ khoảng trắng, không phân biệt hoa thường)
//  (b) tên = mã + khoảng trắng / '-' / '/' + phần tên (mã phải khớp nguyên cụm: '54' không khớp mã '5')
//  (c) trong 1 PO, sau (a)(b) còn đúng 1 tên và 1 mã chưa ghép thì ghép với nhau (trừ tên mở đầu bằng mã số riêng); nhiều hơn thì để trống
// Lệnh bị thu hồi hết (lệnh gốc + lệnh thu hồi TypeCt 2 cộng về 0) mà cùng PO x màu x size đã có lệnh khác > 0 thì bỏ,
// vd LYLT-0141 (539) + LYLT-0169 thu hồi (-539) = 0, thay bằng LYLT-0170 (539). Nếu chỉ có lệnh 0 thì giữ để thấy đã thu hồi.
const boLenh0 = (ls) => (ls.some((l) => Number(l.slLenh || 0) !== 0) ? ls.filter((l) => Number(l.slLenh || 0) !== 0) : ls);
// Lệnh Bravo ghi xí nghiệp may ở DeptCode ('M1' = XN1, 'M2' = XN2…). Cùng PO x màu x size có lệnh của đúng XN thì chỉ lấy lệnh đó,
// không có thì giữ tất cả (lệnh chưa ghi DeptCode / ghi kiểu khác).
const theoXN = (ls, n) => {
  if (!n) return ls;
  const dung = ls.filter((l) => String(l.dept ?? '').trim().toUpperCase() === `M${n}`);
  return dung.length ? dung : ls;
};
const hoaMau = (v) => String(v ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
const khopMau = (ten, ma) => {
  const t = hoaMau(ten); const m = hoaMau(ma);
  if (!m) return 0;
  if (t.replace(/ /g, '') === m.replace(/ /g, '')) return 2;
  return t.startsWith(m) && /^[ \-/]/.test(t.slice(m.length)) ? 1 : 0;
};
const khoaMa = (ma) => `MA:${chuanMau(ma)}`;
// tens: [{ po, mau }] (SBD), mas: [{ po, mau }] (Bravo). Trả hàm (po, ten) -> khóa màu, so được với khoaMa(mã Bravo).
// Tên chưa có trong tens (vd màu trên phiếu cấp) thì: trùng chuỗi với tên SBD -> khóa của tên đó, không thì (a)(b), không thì theo chuỗi.
function bangMau(tens, mas, poKey = (v) => String(v ?? '').trim()) {
  const theoPO = new Map();
  const lay = (po) => theoPO.get(po) || theoPO.set(po, { tens: new Map(), mas: new Set() }).get(po);
  tens.forEach((r) => { if (String(r.mau ?? '').trim()) lay(poKey(r.po)).tens.set(chuanMau(r.mau), r.mau); });
  mas.forEach((r) => { if (String(r.mau ?? '').trim()) lay(poKey(r.po)).mas.add(hoaMau(r.mau)); });
  const timMa = (ten, mas) => {
    let tot = null; let diem = 0;
    mas.forEach((m) => { const d = khopMau(ten, m); if (d > diem || (d && d === diem && m.length > tot.length)) { tot = m; diem = d; } });
    return tot;
  };
  const kq = new Map();
  theoPO.forEach((g, po) => {
    const conTen = []; const daDung = new Set();
    g.tens.forEach((ten, k) => { const m = timMa(ten, g.mas); if (m) { kq.set(`${po}|${k}`, khoaMa(m)); daDung.add(m); } else conTen.push(k); });
    const conMa = [...g.mas].filter((m) => !daDung.has(m));
    // tên có mã số riêng ở đầu ('8976516 BOXER…') mà không khớp mã nào thì là màu khác, không ghép kiểu (c)
    if (conTen.length === 1 && conMa.length === 1 && !/^\d{5,}(?=[ \-/]|$)/.test(hoaMau(g.tens.get(conTen[0])))) kq.set(`${po}|${conTen[0]}`, khoaMa(conMa[0]));
  });
  return (po0, ten) => {
    const po = poKey(po0); const k = chuanMau(ten);
    if (kq.has(`${po}|${k}`)) return kq.get(`${po}|${k}`);
    const g = theoPO.get(po);
    const m = g && timMa(ten, g.mas);
    return m ? khoaMa(m) : `TEN:${k}`;
  };
}
router.get('/chi-tiet-dat-btp', async (req, res) => {
  try {
    const p = {
      xn: req.query.xn, xnCode: await xnCode(req.query.xn), to: req.query.to || '',
      tuNgay: req.query.tuNgay || daysAgo(30), denNgay: req.query.denNgay || today(),
      lenhSX: (req.query.lenhSX || '').trim(), po: (req.query.po || '').trim(),
    };
    const [rows, kh, lenhs, datAll] = await Promise.all([run('chiTietDatBTP', p), run('khSBDTheoPhieuCap', p), run('lenhTheoPhieuCap', p), run('datTatCaToTheoPhieuCap', p)]);
    const cong = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
    // Tổng SL lệnh (Bravo) và tổng SL đặt của tất cả tổ theo lệnh x PO x màu x size; lệnh phiếu ghi 'A;B' thì cộng các lệnh
    const goLenh = (v) => String(v ?? '').toUpperCase().split(';').map((x) => x.replace(/\s+/g, '')).filter(Boolean);
    const khoaLMS = (lenh, po, mau, size, mauFn) => `${lenh}|${String(po ?? '').trim()}|${mauFn(mau)}|${chuanSize(size)}`;
    const kMau = bangMau(kh, lenhs);
    const slLenh = new Map();
    lenhs.forEach((l) => goLenh(l.lenhSX).forEach((x) => {
      cong(slLenh, khoaLMS(x, l.po, l.mau, l.size, khoaMa), Number(l.slLenh || 0));
    }));
    // Tổ đã đặt: tổ cùng xí nghiệp ghi số tổ, xí nghiệp khác ghi kèm mã xí nghiệp (XN2-6)
    const slDatAll = new Map();
    const toDat = new Map();
    datAll.forEach((d) => {
      const k = khoaLMS(goLenh(d.lenhSX).join(';'), d.po, d.mau, d.size, chuanMau);
      cong(slDatAll, k, Number(d.slDat || 0));
      if (!Number(d.slDat)) return;
      const ten = String(d.xnCode).trim() === p.xnCode ? lineOf(d.maTo) : `${String(d.xnCode).trim()}-${lineOf(d.maTo)}`;
      (toDat.get(k) || toDat.set(k, new Set()).get(k)).add(ten);
    });
    const dsTo = (k) => [...(toDat.get(k) || [])].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true })).join(', ');
    const tongLenh = (r) => {
      let t = null;
      goLenh(r.lenhSX).forEach((x) => {
        const v = slLenh.get(khoaLMS(x, r.po, r.mau, r.size, (m) => kMau(r.po, m)));
        if (v != null) t = (t || 0) + v;
      });
      return t;
    };
    const day = new Map();
    const theoMa = new Map();
    kh.forEach((k) => {
      const g = `${lineOf(k.maTo)}|${String(k.po).trim()}|${chuanSize(k.size)}`;
      cong(day, `${g}|${chuanMau(k.mau)}`, Number(k.soLuong || 0));
      cong(theoMa, `${g}|${kMau(k.po, k.mau)}`, Number(k.soLuong || 0));
    });
    res.json(rows.map((r) => {
      const g = `${lineOf(r.maTo)}|${String(r.po).trim()}|${chuanSize(r.size)}`;
      const slKH = day.has(`${g}|${chuanMau(r.mau)}`) ? day.get(`${g}|${chuanMau(r.mau)}`) : theoMa.get(`${g}|${kMau(r.po, r.mau)}`);
      const tLenh = tongLenh(r);
      const kDat = khoaLMS(goLenh(r.lenhSX).join(';'), r.po, r.mau, r.size, chuanMau);
      const tDat = slDatAll.get(kDat) ?? 0;
      return { ...r, slKH: slKH ?? (r.slKHPhieu != null ? Number(r.slKHPhieu) : null), nguonKH: slKH != null ? 'SBD' : r.slKHPhieu != null ? 'phieu' : null, tongLenh: tLenh, tongDat: tDat, toDaDat: dsTo(kDat), tongConLai: tLenh == null ? null : tLenh - tDat };
    }));
  } catch (err) {
    console.error('[chiTietDatBTP]', err.message);
    res.status(500).json({ error: err.message });
  }
});
router.get('/sot-ma-hang', handleXn('sotMaHang', (req) => ({ tuNgay: req.query.tuNgay || daysAgo(30), denNgay: req.query.denNgay || today() })));
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
router.get('/san-luong-gio', handleXn('sanLuongGio', (req) => ({ d0: ngay(req) }), true));
// Báo cáo may ra (viết lại store Report_BaoCaoMayRa_GetData_TuNgay_DenNgay, đọc thẳng nguồn):
// eGMF cho SL, vào chuyền, nhập kho; HiPro cho may ra, ghép theo tổ x PO.
// Trong kỳ = tuNgay..denNgay; lũy kế = từ lúc bắt đầu PO trên tổ đến hết denNgay (đọc cả bảng lưu trữ pro_nscl_MM_YYYY).
const ymd = (v) => {
  if (!v) return null;
  if (!(v instanceof Date)) return String(v).slice(0, 10);
  const p = (x) => String(x).padStart(2, '0');
  return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
};
// Mốc bắt đầu lũy kế HiPro: ngày bắt đầu kế hoạch sớm nhất nhưng lùi tối thiểu LUI_LK ngày,
// vì tổ có thể may trước ngày kế hoạch (vd PO may xong 20/10 nhưng KH vào chuyền 24/10)
const LUI_LK = 90;
const mocLK = (ngays, d) => ngays.map(ymd).filter(Boolean)
  .reduce((m, x) => (x < m ? x : m), ymd(new Date(new Date(d) - LUI_LK * 86400000)));
// May ra HiPro (nhà máy x chuyền x PO) từ tuLK, đọc cả bảng lưu trữ pro_nscl_MM_YYYY của các tháng tuLK..denNgay
async function docMayRa(tuLK, tuNgay, denNgay, pos = []) {
  await napCum();
  const bang = (await run('nsclLuuTru', {})).map((x) => x.name).filter((b) => {
    const m = /^pro_nscl_(\d{2})_(\d{4})$/.exec(b);
    return m && `${m[2]}-${m[1]}` >= tuLK.slice(0, 7) && `${m[2]}-${m[1]}` <= denNgay.slice(0, 7);
  });
  const p = { tuLK, tuNgay, denNgay };
  pos.forEach((po, i) => { p[`hp${i}`] = po; });
  return { bang, sx: await run('mayRaHiPro', p, { bang, nPO: pos.length }) };
}
async function tinhMayRa(xn, tuNgay, denNgay) {
  const n = await xnNum(xn);
  const p = { xn, xnCode: n ? `XN${n}` : '', tuNgay, denNgay };
  let rows = await run('mayRa', p);
  const tuLK = mocLK(rows.map((r) => r.ngayBatDau), tuNgay);
  const { bang, sx } = await docMayRa(tuLK, tuNgay, denNgay);

  const key = (line, po) => `${lineOf(line)}|${String(po ?? '').trim()}`;
  // Tổ x PO có may ra HiPro trong kỳ mà kế hoạch không rơi vào kỳ (may sớm / trễ so với KH): đọc lại để có SL, vào chuyền, lệnh
  const coKH = new Set(rows.map((r) => key(r.maTo, r.po)));
  const them = [...new Map(sx.map((r) => ({ ...r, ...hp(r) }))
    .filter((r) => r.xn === n && Number(r.mayRaKy) && !coKH.has(key(r.to, r.po)))
    .map((r) => [key(r.to, r.po), r])).values()];
  if (them.length) {
    them.forEach((r, i) => { p[`tt${i}`] = String(r.to); p[`tp${i}`] = String(r.po ?? '').trim(); });
    rows = await run('mayRa', p, { nThem: them.length });
  }
  const map = new Map();
  rows.forEach((r) => map.set(key(r.maTo, r.po), { ...r, maTo: lineOf(r.maTo), po: String(r.po ?? '').trim(), mayRaKy: 0, mayRaNgay: 0, mayRaLK: 0 }));
  sx.map((r) => ({ ...r, ...hp(r) })).filter((r) => r.xn === n).forEach((r) => {
    const k = key(r.to, r.po);
    let x = map.get(k);
    if (!x) {
      if (!Number(r.mayRaKy)) return; // PO chỉ có may ra trước kỳ: bỏ
      x = { maTo: r.to, po: String(r.po ?? '').trim(), maHang: r.maHang, mayRaKy: 0, mayRaNgay: 0, mayRaLK: 0 };
      map.set(k, x);
    }
    x.mayRaKy += Number(r.mayRaKy || 0);
    x.mayRaNgay += Number(r.mayRaNgay || 0);
    x.mayRaLK += Number(r.mayRaLK || 0);
  });
  const N = (v) => Number(v || 0);
  return {
    tuLK, bangLuuTru: bang,
    rows: [...map.values()].map((r) => ({
      ...r,
      soLuong: N(r.soLuong), vaoKy: N(r.vaoKy), vaoLK: N(r.vaoLK), nhapKy: N(r.nhapKy), nhapLK: N(r.nhapLK),
      tonMayRa: N(r.vaoLK) - r.mayRaLK, tonDongGoi: r.mayRaLK - N(r.nhapLK), conLai: N(r.soLuong) - r.mayRaLK,
    })).sort((a, b) => Number(a.maTo) - Number(b.maTo) || a.po.localeCompare(b.po)),
  };
}
router.get('/may-ra', async (req, res) => {
  try {
    res.json(await tinhMayRa(req.query.xn, req.query.tuNgay || today(), req.query.denNgay || today()));
  } catch (err) {
    console.error('[mayRa]', err.message);
    res.status(500).json({ error: err.message });
  }
});
// PO đang may của tổ trưởng: tự tính như báo cáo may ra với kỳ = ngày d (không đọc bảng Report_BaoCaoMayRa), bỏ PO đã may xong
router.get('/po-may-ra', async (req, res) => {
  try {
    const { rows } = await tinhMayRa(req.query.xn, ngay(req), ngay(req));
    // Bỏ PO đã may xong (may ra LK >= SL PO) mà hôm nay không may thêm: không còn "đang may"
    res.json(rows.filter((r) => !(r.soLuong > 0 && r.mayRaLK >= r.soLuong && !r.mayRaNgay)).map((r) => ({
      line: r.maTo, po: r.po, lenhSX: r.lenhSX, maHang: r.maHang, khachHang: r.khachHang, soLuong: r.soLuong,
      vaoChuyenLK: r.vaoLK, mayRaNgay: r.mayRaNgay, mayRaLK: r.mayRaLK, ngayXuat: r.ngayXuat,
    })));
  } catch (err) {
    console.error('[poMayRa]', err.message);
    res.status(500).json({ error: err.message });
  }
});
// Tổ trưởng may: kế hoạch tổ theo PO (thẻ) x màu x size tại ngày d.
//   SL KH: OMM_KeHoachThang (PO) / SBD (size). SL đặt: SoLuongCanCap phiếu cấp BTP của tổ (hôm nay = phiếu tạo ngày d; lũy kế đến hết d).
//   SL SX: HiPro theo chuyền x PO (HiPro không ghi size). Còn lại hôm nay = KH ngày - SX hôm nay; còn lại = SL KH - SX lũy kế.
//   Hoàn thành: tình trạng kế hoạch trong phần mềm kế hoạch là Hoàn thành.
//   Phiếu đặt sai kế hoạch: PO không có kế hoạch ở tổ hoặc màu/size không có trong SBD (phiếu tạo trong 30 ngày), đặt lũy kế vượt SL KH size (mọi phiếu).
router.get('/to-may/ke-hoach', async (req, res) => {
  try {
    const d = req.query.d || today();
    const maTo = String(req.query.to || '').trim();
    const n = await xnNum(req.query.xn);
    const p = { xn: req.query.xn, xnCode: n ? `XN${n}` : '', to: maTo, d };
    // Danh sách PO của tổ tính 1 lần rồi truyền vào các câu sau
    const dsPO = await run('poToMay', p);
    const chay = [...new Set(dsPO.filter((r) => Number(r.chay) === 1).map((r) => r.po))];
    const poDat = [...new Set(dsPO.filter((r) => Number(r.chay) !== 1).map((r) => r.po))];
    chay.forEach((x, i) => { p[`pc${i}`] = x; });
    poDat.forEach((x, i) => { p[`pd${i}`] = x; });
    const so = { nChay: chay.length, nDat: poDat.length };
    const [sbd, pos, dat, lenhs] = await Promise.all([run('khToSize', p, so), run('khToPO', p, so), run('datToSize', p, so), run('lenhToSize', p, so)]);
    const tuLK = mocLK(pos.map((r) => r.ngayVaoChuyen), d);
    // Lũy kế HiPro chỉ đọc các PO của tổ
    const dsPOTo = pos.map((r) => String(r.po ?? '').trim()).filter(Boolean);
    const { sx } = dsPOTo.length ? await docMayRa(tuLK, d, d, dsPOTo) : { sx: [] };
    const N = (v) => Number(v || 0);
    const poKey = (v) => String(v ?? '').trim();
    const sxPO = new Map();
    sx.map((r) => ({ ...r, ...hp(r) })).filter((r) => r.xn === n && r.to === lineOf(maTo)).forEach((r) => {
      const x = sxPO.get(poKey(r.po)) || { ngay: 0, lk: 0, dat: 0, loi: 0 };
      x.ngay += N(r.mayRaNgay); x.lk += N(r.mayRaLK); x.dat += N(r.datNgay); x.loi += N(r.loiNgay);
      sxPO.set(poKey(r.po), x);
    });

    // Dòng size kế hoạch, khóa đầy đủ và khóa theo mã màu
    const sizes = sbd.map((r) => ({ ...r, po: poKey(r.po), kh: N(r.soLuong), datNgay: 0, nhanNgay: 0, datLK: 0, phieu: [], tatCaPhieu: [] }));
    const kMau = bangMau(sbd, lenhs, poKey);
    const day = new Map();
    const theoMa = new Map();
    sizes.forEach((r) => {
      day.set(`${r.po}|${chuanMau(r.mau)}|${chuanSize(r.size)}`, r);
      const km = `${r.po}|${kMau(r.po, r.mau)}|${chuanSize(r.size)}`;
      if (!theoMa.has(km)) theoMa.set(km, r);
    });
    const coPO = new Set(sizes.map((r) => r.po));
    const tu30 = ymd(new Date(new Date(d) - 30 * 86400000));
    const sai = [];
    dat.forEach((x) => {
      const po = poKey(x.po);
      const ngay = ymd(x.ngayTao);
      const dong = { soPhieu: x.soPhieu, ngayTao: x.ngayTao, ngayNhan: x.ngayNhan, lenhSX: x.lenhSX, po, maHang: x.maHang, mau: x.mau, size: x.size, slDat: N(x.slDat), slNhan: N(x.slNhan) };
      const r = day.get(`${po}|${chuanMau(x.mau)}|${chuanSize(x.size)}`) || theoMa.get(`${po}|${kMau(po, x.mau)}|${chuanSize(x.size)}`);
      if (!r) {
        if (ngay >= tu30) sai.push({ ...dong, lyDo: coPO.has(po) ? 'Màu / size không có trong kế hoạch phân bổ của tổ' : 'PO không có kế hoạch phân bổ ở tổ' });
        return;
      }
      r.datLK += dong.slDat;
      if (ngay === d) { r.datNgay += dong.slDat; r.nhanNgay += dong.slNhan; }
      r.phieu.push({ ...dong, ngay });
      r.tatCaPhieu.push({ ...dong, ngay });
    });
    // Đặt lũy kế vượt SL KH của size: đánh dấu các phiếu từ lúc vượt (không giới hạn 30 ngày; trang lọc theo PO trong phạm vi cảnh báo)
    sizes.forEach((r) => {
      let lk = 0;
      r.phieu.sort((a, b) => String(a.ngay).localeCompare(String(b.ngay)) || String(a.soPhieu).localeCompare(String(b.soPhieu)))
        .forEach((x) => {
          lk += x.slDat;
          if (lk > r.kh) sai.push({ ...x, lyDo: `Đặt lũy kế ${lk.toLocaleString('vi-VN')} vượt KH ${r.kh.toLocaleString('vi-VN')}` });
        });
      delete r.phieu;
    });

    // Lệnh của từng tổ hợp PO x màu x size (Bravo, ghép theo mã màu + size chuẩn hóa)
    const lenhTheoKhoa = new Map();
    lenhs.forEach((l) => {
      const k = `${poKey(l.po)}|${khoaMa(l.mau)}|${chuanSize(l.size)}`;
      (lenhTheoKhoa.get(k) || lenhTheoKhoa.set(k, []).get(k)).push(l);
    });
    const goLenh = (v) => String(v ?? '').toUpperCase().replace(/[\s;]+/g, '');
    const cuaLenh = (phieuLenh, lenh) => String(phieuLenh ?? '').toUpperCase().replace(/\s+/g, '').split(';').some((x) => x && x === goLenh(lenh));

    const the = pos.map((x) => {
      const po = poKey(x.po);
      const m = sxPO.get(po) || { ngay: 0, lk: 0, dat: 0, loi: 0 };
      const khNgay = Math.round(N(x.khNgay));
      return {
        po, maHang: x.maHang, lenhSX: x.lenhSX, soLuong: N(x.soLuong), khNgay, ngayVaoChuyen: x.ngayVaoChuyen, ngayKetThuc: x.ngayKetThuc,
        hoanThanh: N(x.hoanThanh) === 1, nangLuc: N(x.nangLuc),
        sxNgay: m.ngay, sxLK: m.lk, kiemNgay: m.dat + m.loi, datLanDau: m.dat, loiNgay: m.loi, conLaiNgay: Math.max(khNgay - m.ngay, 0), conLai: Math.max(N(x.soLuong) - m.lk, 0),
        sizes: sizes.filter((r) => r.po === po).flatMap((r) => {
          const ls = boLenh0(theoXN(lenhTheoKhoa.get(`${po}|${kMau(po, r.mau)}|${chuanSize(r.size)}`) || [], n));
          const goc = { mau: r.mau, size: r.size, kh: r.kh };
          if (ls.length <= 1) return [{ ...goc, lenhSX: ls[0] ? ls[0].lenhSX : null, slLenh: ls[0] ? N(ls[0].slLenh) : null, datNgay: r.datNgay, nhanNgay: r.nhanNgay, datLK: r.datLK }];
          // PO có nhiều lệnh: tách đặt theo lệnh ghi trên phiếu cấp
          return ls.map((l) => {
            const ps = r.tatCaPhieu.filter((q) => cuaLenh(q.lenhSX, l.lenhSX));
            return { ...goc, lenhSX: l.lenhSX, slLenh: N(l.slLenh), datNgay: ps.filter((q) => q.ngay === d).reduce((t, q) => t + q.slDat, 0), nhanNgay: ps.filter((q) => q.ngay === d).reduce((t, q) => t + q.slNhan, 0), datLK: ps.reduce((t, q) => t + q.slDat, 0) };
          });
        }),
      };
    }).sort((a, b) => {
      // Ngày kết thúc may gần ngày đang xem nhất lên trước (trễ hay sắp tới đều tính theo khoảng cách), bằng nhau thì theo ngày vào chuyền
      const kc = (t) => (t.ngayKetThuc ? Math.abs(Date.parse(ymd(t.ngayKetThuc)) - Date.parse(d)) : Infinity);
      return kc(a) - kc(b) || String(a.ngayVaoChuyen).localeCompare(String(b.ngayVaoChuyen));
    });
    sizes.forEach((r) => delete r.tatCaPhieu);
    res.json({ the, sai: sai.sort((a, b) => String(b.ngayTao).localeCompare(String(a.ngayTao))) });
  } catch (err) {
    console.error('[toMayKeHoach]', err.message);
    res.status(500).json({ error: err.message });
  }
});
router.get('/lao-dong', handleXn('laoDong', (req) => ({ d0: ngay(req) })));
const qcRange = (req) => ({ tuNgay: req.query.tuNgay || daysAgo(13), denNgay: req.query.denNgay || today() });
router.get('/qc-nscl', handleXn('qcNscl', qcRange, true));
router.get('/qc-loi-chi-tiet', handleXn('qcLoiChiTiet', qcRange, true));
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
