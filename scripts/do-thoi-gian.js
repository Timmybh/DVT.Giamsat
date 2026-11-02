// Đo thời gian (CHỈ ĐỌC, không lock) các câu của trang Kế hoạch phân bổ, để biết câu nào nặng.
// Chạy: npm run do-thoi-gian -- <xnId> <tuNgay> <denNgay>   vd: npm run do-thoi-gian -- 8 2026-09-01 2026-11-29
require('dotenv').config();
process.env.DB_REQUEST_TIMEOUT = process.env.DB_REQUEST_TIMEOUT || '300000';
const db = require('../src/db');
const queries = require('../src/queries');
const { docChuaPhanBo } = require('../src/chuaPhanBo');

const [xn, tuNgay, denNgay] = process.argv.slice(2);
if (!xn || !tuNgay || !denNgay) { console.error('Ví dụ: npm run do-thoi-gian -- 8 2026-09-01 2026-11-29 (xnId lấy trên URL ?xn=)'); process.exit(1); }

(async () => {
  const ten = (await db.query({ db: 'egmf', text: 'SELECT TOP 1 TenXiNghiep FROM dbo.Lib_XiNghiep WHERE XNId = @xn' }, { xn }).catch(() => []))[0];
  const so = ten ? (/(\d+)/.exec(String(ten.TenXiNghiep)) || [])[1] : '';
  const dept = process.argv[5] || (so ? `M${Number(so)}` : '');
  console.log(`xn=${xn} dept=${dept} ${tuNgay} -> ${denNgay}`);
  const p = { xn, tuNgay, denNgay, dept };
  const chay = {
    keHoachPhanBo: () => db.query(queries.keHoachPhanBo, p),
    'chuaPhanBo (Theo PO)': () => docChuaPhanBo(p, false),
    keHoachTheoSize: () => db.query(queries.keHoachTheoSize, p),
    lenhTheoSize: () => db.query(queries.lenhTheoSize, p),
    'chuaPhanBo (Theo size)': () => docChuaPhanBo(p, true),
  };
  // SL SX HiPro của trang: cũ (mọi PO, chỉ bảng hiện hành) và mới (PO của bảng, kèm bảng lưu trữ)
  const kh = await db.query(queries.keHoachPhanBo, p);
  const tu = kh.reduce((m, r) => { const d = new Date(r.ngayVaoChuyen || r.ngayBatDau); return d < m ? d : m; }, new Date());
  const tuS = `${tu.getFullYear()}-${String(tu.getMonth() + 1).padStart(2, '0')}-${String(tu.getDate()).padStart(2, '0')}`;
  const homNay = new Date().toISOString().slice(0, 10);
  const dsPO = [...new Set(kh.map((r) => String(r.po ?? '').trim()).filter(Boolean))];
  chay[`HiPro cũ sanLuongTheoHang (${tuS})`] = () => db.query(queries.sanLuongTheoHang, { tuNgay: tuS, denNgay: homNay });
  chay[`HiPro mới mayRaHiPro (${dsPO.length} PO)`] = async () => {
    const bang = (await db.query(queries.nsclLuuTru, {})).map((x) => x.name).filter((b) => {
      const m = /^pro_nscl_(\d{2})_(\d{4})$/.exec(b);
      return m && `${m[2]}-${m[1]}` >= tuS.slice(0, 7);
    });
    const pp = { tuLK: tuS, tuNgay: tuS, denNgay: homNay, ...Object.fromEntries(dsPO.map((v, i) => [`hp${i}`, v])) };
    return db.query(queries.mayRaHiPro({ bang, nPO: dsPO.length }), pp);
  };
  for (const [name, f] of Object.entries(chay)) {
    const t0 = Date.now();
    try {
      const rows = await f();
      console.log(`${name.padEnd(24)} ${String(Date.now() - t0).padStart(7)} ms  ${rows.length} dòng`);
    } catch (e) { console.log(`${name.padEnd(24)} ${String(Date.now() - t0).padStart(7)} ms  LỖI ${e.message}`); }
  }
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
