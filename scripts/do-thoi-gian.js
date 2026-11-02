// Đo thời gian (CHỈ ĐỌC, không lock) các câu của trang Kế hoạch phân bổ, để biết câu nào nặng.
// Chạy: npm run do-thoi-gian -- <xnId> <tuNgay> <denNgay>   vd: npm run do-thoi-gian -- 8 2026-09-01 2026-11-29
require('dotenv').config();
process.env.DB_REQUEST_TIMEOUT = process.env.DB_REQUEST_TIMEOUT || '300000';
const db = require('../src/db');
const queries = require('../src/queries');

const [xn, tuNgay, denNgay] = process.argv.slice(2);
if (!xn || !tuNgay || !denNgay) { console.error('Ví dụ: npm run do-thoi-gian -- 8 2026-09-01 2026-11-29 (xnId lấy trên URL ?xn=)'); process.exit(1); }

(async () => {
  const ten = (await db.query({ db: 'egmf', text: 'SELECT TOP 1 TenXiNghiep FROM dbo.Lib_XiNghiep WHERE XNId = @xn' }, { xn }).catch(() => []))[0];
  const so = ten ? (/(\d+)/.exec(String(ten.TenXiNghiep)) || [])[1] : '';
  const dept = process.argv[5] || (so ? `M${Number(so)}` : '');
  console.log(`xn=${xn} dept=${dept} ${tuNgay} -> ${denNgay}`);
  const p = { xn, tuNgay, denNgay, dept };
  for (const name of ['keHoachPhanBo', 'keHoachChuaPhanBo', 'keHoachTheoSize', 'lenhTheoSize', 'keHoachChuaPhanBoSize']) {
    const t0 = Date.now();
    try {
      const rows = await db.query(queries[name], p);
      console.log(`${name.padEnd(24)} ${String(Date.now() - t0).padStart(7)} ms  ${rows.length} dòng`);
    } catch (e) { console.log(`${name.padEnd(24)} ${String(Date.now() - t0).padStart(7)} ms  LỖI ${e.message}`); }
  }
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
