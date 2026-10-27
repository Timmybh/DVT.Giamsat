// Đối chiếu (CHỈ ĐỌC) chuyền HiPro với tổ eGMF theo PO chung trong 60 ngày gần nhất.
// Chạy: npm run doi-chieu-to
//   -> config/ma-to-hipro.json  : bảng ánh xạ web đang dùng (kiểm tra lại, sửa tay nếu ghép sai)
//   -> khao-sat/doi-chieu-to.txt : báo cáo số PO trùng của từng chuyền để kiểm tra
// File json đã có thì giữ các dòng có "khoa": true (đã sửa tay), chỉ ghi đè các dòng còn lại.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const { FILE } = require('../src/maHiPro');

const NGAY = 60;
const HIPRO = {
  db: 'hipro',
  text: `
    SELECT DISTINCT nm.ten AS xn, c.ten AS chuyen, LTRIM(RTRIM(sp.po)) AS po
    FROM dbo.pro_ke_hoach_san_xuat k
    JOIN dbo.pro_chuyen c ON c.id = k.pro_chuyen_id
    JOIN dbo.pro_nha_may nm ON nm.id = c.pro_nha_may_id
    JOIN dbo.pro_san_pham sp ON sp.id = k.pro_san_pham_id
    WHERE k.ngay_san_xuat >= DATEADD(day, -${NGAY}, CAST(GETDATE() AS date)) AND sp.po IS NOT NULL`,
};
const EGMF = {
  db: 'egmf',
  text: `
    SELECT DISTINCT x.TenXiNghiep AS xn, LTRIM(RTRIM(e.TenCum)) AS maTo, LTRIM(RTRIM(po.PONo)) AS po
    FROM dbo.OMM_KeHoachThang k
    JOIN dbo.OMM_PO_ChiTiet pct ON pct.POCTId = k.CTPOId
    JOIN dbo.OMM_PO po ON po.POId = pct.POId
    JOIN dbo.Lib_CumChuyen e ON e.CumId = k.ChuyenId
    JOIN dbo.Lib_PhanXuong px ON px.PXId = e.PXId
    JOIN dbo.Lib_XiNghiep x ON x.XNId = px.XNId
    WHERE k.SoLuong > 0 AND k.NgayMayKeHoachKetThuc >= DATEADD(day, -${NGAY}, CAST(GETDATE() AS date))`,
};

(async () => {
  const [hp, eg] = await Promise.all([db.query(HIPRO), db.query(EGMF)]);
  const up = (v) => String(v ?? '').trim().toUpperCase();
  const soXN = (ten) => { const m = /(\d+)/.exec(String(ten ?? '')); return m ? String(Number(m[1])) : ''; };

  // eGMF: PO -> danh sách (xí nghiệp, tổ)
  const toCuaPO = new Map();
  eg.forEach((r) => {
    const k = up(r.po);
    (toCuaPO.get(k) || toCuaPO.set(k, []).get(k)).push({ xn: soXN(r.xn), xnTen: r.xn, to: r.maTo });
  });
  // HiPro: (nhà máy, chuyền) -> PO
  const chuyen = new Map();
  hp.forEach((r) => {
    const k = `${r.xn}|${r.chuyen}`;
    (chuyen.get(k) || chuyen.set(k, { hiproXN: r.xn, hiproTo: r.chuyen, pos: new Set() }).get(k)).pos.add(up(r.po));
  });

  let cu = [];
  try { cu = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { /* chưa có */ }
  const khoa = new Map(cu.filter((r) => r.khoa).map((r) => [`${r.hiproXN}|${r.hiproTo}`, r]));

  const ketQua = [];
  const baoCao = [`Đối chiếu chuyền HiPro - tổ eGMF theo PO chung (${NGAY} ngày gần nhất), ${new Date().toLocaleString('vi-VN')}`, ''];
  [...chuyen.values()].sort((a, b) => `${a.hiproXN}|${a.hiproTo}`.localeCompare(`${b.hiproXN}|${b.hiproTo}`, 'vi', { numeric: true })).forEach((c) => {
    const dem = new Map();
    c.pos.forEach((po) => (toCuaPO.get(po) || []).forEach((t) => {
      const k = `${t.xn}|${t.to}`;
      const x = dem.get(k) || dem.set(k, { ...t, n: 0 }).get(k);
      x.n += 1;
    }));
    const xep = [...dem.values()].sort((a, b) => b.n - a.n);
    const k = `${c.hiproXN}|${c.hiproTo}`;
    baoCao.push(`HiPro: ${c.hiproXN} / ${c.hiproTo}  (${c.pos.size} PO)`);
    if (khoa.has(k)) {
      ketQua.push(khoa.get(k));
      baoCao.push(`   -> giữ dòng đã sửa tay: XN ${khoa.get(k).xn}, tổ ${khoa.get(k).to}`);
    } else if (xep.length) {
      ketQua.push({ hiproXN: c.hiproXN, hiproTo: c.hiproTo, xn: xep[0].xn, to: xep[0].to, poTrung: xep[0].n, tongPO: c.pos.size });
      baoCao.push(`   -> ${xep[0].xnTen} / tổ ${xep[0].to}: ${xep[0].n}/${c.pos.size} PO trùng`);
    } else {
      baoCao.push('   -> KHÔNG có PO nào trùng eGMF, chưa ghép (web lấy số trong tên)');
    }
    xep.slice(1, 3).forEach((t) => baoCao.push(`      khác: ${t.xnTen} / tổ ${t.to}: ${t.n} PO`));
  });

  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, `${JSON.stringify(ketQua, null, 2)}\n`);
  fs.mkdirSync('khao-sat', { recursive: true });
  fs.writeFileSync(path.join('khao-sat', 'doi-chieu-to.txt'), `${baoCao.join('\n')}\n`);
  console.log(`Đã ghi ${FILE} (${ketQua.length} chuyền) và khao-sat/doi-chieu-to.txt`);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
