// NXT BTP cắt theo lệnh sản xuất (màn BTP cắt, bỏ trống lệnh): lệnh gốc Bravo có ngày lệnh trong khoảng xem (của XN),
// SL lệnh = lệnh gốc + điều chỉnh / thu hồi; rồi ghép tem cắt thân chính vải chính của các lệnh đó (mọi ngày tạo tem)
// và quét xuất / nhận (cả tem tổng hợp BTH). Nhiều loại vải chính thì lấy loại nhỏ nhất (đồng bộ).
// Trả: [{ lenhSX, ngayLenh, maHang, slLenh, soTem, slBTP, slXuat, slVaoChuyen, slTon }]
const db = require('./db');
const queries = require('./queries');

const LO = 1000; // số tham số mỗi lần IN (SQL Server tối đa 2100)
const chia = (ds, n = LO) => Array.from({ length: Math.ceil(ds.length / n) }, (_, i) => ds.slice(i * n, (i + 1) * n));

async function docBtpLenh({ lenhSX = '', dept, tuNgay, denNgay }) {
  const dong = await db.query(queries.btpLenhKy, { lenhSX, dept, tuNgay, denNgay });
  if (!dong.length) return [];
  const cuaId = new Map(dong.map((l) => [String(l.idDetail), l]));
  const lenh = new Map();
  dong.forEach((l) => { if (!lenh.has(l.lenhSX)) lenh.set(l.lenhSX, { lenhSX: l.lenhSX, ngayLenh: l.ngayLenh, maHang: '', slLenh: 0 }); });
  // B2: SL lệnh theo IdDetail (cộng mọi PO), mã hàng lấy từ dòng PO
  for (const lo of chia([...cuaId.keys()])) {
    const p = Object.fromEntries(lo.map((v, i) => [`d${i}`, Number(v)]));
    (await db.query(queries.cpbPO({ n: lo.length }), p)).forEach((r) => {
      const l = lenh.get(cuaId.get(String(r.idDetail))?.lenhSX);
      if (!l) return;
      l.slLenh += Number(r.sl || 0);
      if (!l.maHang && r.maHang) l.maHang = String(r.maHang).trim();
    });
  }
  const ds = [...lenh.values()].filter((l) => lenhSX || l.slLenh > 0); // bỏ lệnh đã thu hồi hết (trừ khi xem đúng 1 lệnh)
  // B3 + B4: tem cắt và quét xuất / nhận theo lệnh x loại vải chính
  const loai = new Map(); // lenhSX -> Map(loaiNL -> { soTem, slBTP, slXuat, slVaoChuyen })
  const o = (lenhSX, loaiNL) => {
    const m = loai.get(lenhSX) || loai.set(lenhSX, new Map()).get(lenhSX);
    return m.get(loaiNL) || m.set(loaiNL, { soTem: 0, slBTP: 0, slXuat: 0, slVaoChuyen: 0, coTem: false }).get(loaiNL);
  };
  for (const lo of chia(ds.map((l) => l.lenhSX), LO / 2)) {
    const p = Object.fromEntries(lo.flatMap((v, i) => [[`l${2 * i}`, `${v};`], [`l${2 * i + 1}`, v]]));
    const n = lo.length * 2;
    const [tem, xuat] = await Promise.all([db.query(queries.btpCatTheoLenh({ n }), p), db.query(queries.btpXuatTheoLenh({ n }), p)]);
    tem.forEach((r) => { const x = o(r.lenhSX, r.loaiNL); x.soTem += Number(r.soTem || 0); x.slBTP += Number(r.slBTP || 0); x.coTem = true; });
    xuat.forEach((r) => { const x = o(r.lenhSX, r.loaiNL); x.slXuat += Number(r.slXuat || 0); x.slVaoChuyen += Number(r.slVaoChuyen || 0); });
  }
  // Mỗi sản phẩm cần đủ mọi loại vải chính (vd Vải chính 1 + Vải chính 2): SL = loại nhỏ nhất (đồng bộ); số tem = cộng mọi loại
  return ds.map((l) => {
    const cac = [...(loai.get(l.lenhSX) || new Map()).values()].filter((x) => x.coTem);
    const min = (k) => (cac.length ? Math.min(...cac.map((x) => x[k])) : 0);
    const slBTP = min('slBTP');
    const slXuat = min('slXuat');
    return {
      ...l, soLoaiVC: cac.length, soTem: cac.reduce((t, x) => t + x.soTem, 0), slBTP, slXuat, slVaoChuyen: min('slVaoChuyen'), slTon: slBTP - slXuat,
    };
  }).sort((a, b) => new Date(a.ngayLenh) - new Date(b.ngayLenh) || String(a.lenhSX).localeCompare(String(b.lenhSX)));
}

module.exports = { docBtpLenh };
