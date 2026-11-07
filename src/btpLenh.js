// NXT BTP cắt theo lệnh sản xuất (màn BTP cắt, bỏ trống lệnh): lệnh gốc Bravo có ngày lệnh trong khoảng xem (của XN),
// SL lệnh = lệnh gốc + điều chỉnh / thu hồi; rồi ghép tem cắt thân chính vải chính của các lệnh đó (mọi ngày tạo tem).
// Trả: [{ lenhSX, ngayLenh, maHang, slLenh, soTem, slBTP, slXuat, slVaoChuyen, slTon }]
const db = require('./db');
const queries = require('./queries');

const LO = 1000; // số tham số mỗi lần IN (SQL Server tối đa 2100)
const chia = (ds, n = LO) => Array.from({ length: Math.ceil(ds.length / n) }, (_, i) => ds.slice(i * n, (i + 1) * n));

async function docBtpLenh({ dept, tuNgay, denNgay }) {
  const dong = await db.query(queries.btpLenhKy, { dept, tuNgay, denNgay });
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
  const ds = [...lenh.values()].filter((l) => l.slLenh > 0); // bỏ lệnh đã thu hồi hết
  // B3: tem cắt theo lệnh
  const tem = new Map();
  for (const lo of chia(ds.map((l) => l.lenhSX), LO / 2)) {
    const p = Object.fromEntries(lo.flatMap((v, i) => [[`l${2 * i}`, `${v};`], [`l${2 * i + 1}`, v]]));
    (await db.query(queries.btpCatTheoLenh({ n: lo.length * 2 }), p)).forEach((r) => tem.set(r.lenhSX, r));
  }
  return ds.map((l) => {
    const t = tem.get(l.lenhSX) || {};
    const slBTP = Number(t.slBTP || 0);
    const slXuat = Number(t.slXuat || 0);
    return { ...l, soTem: Number(t.soTem || 0), slBTP, slXuat, slVaoChuyen: Number(t.slVaoChuyen || 0), slTon: slBTP - slXuat };
  }).sort((a, b) => new Date(a.ngayLenh) - new Date(b.ngayLenh) || String(a.lenhSX).localeCompare(String(b.lenhSX)));
}

module.exports = { docBtpLenh };
