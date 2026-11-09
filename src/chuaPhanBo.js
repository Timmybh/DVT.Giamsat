// PO đã có lệnh Bravo cho xí nghiệp (DeptCode = 'M<n>') nhưng chưa có kế hoạch phân bổ (OMM_KeHoachThang SoLuong > 0)
// ở tổ nào của xí nghiệp (gồm cả PO chưa đưa vào OMM). Lệnh gốc (TypeCt 0, DocStatus 4, không đình chỉ) có ngày lệnh từ
// tuNgay - 60 ngày đến denNgay (có Ngày lệnh lenhTu..lenhDen thì đúng khoảng đó); SL = lệnh gốc + điều chỉnh / thu hồi, bỏ lệnh x PO đã thu hồi hết.
// Đọc 3 bước nhỏ (cpbLenh, cpbPO, cpbDaPhanBo) rồi ghép ở Node: câu gộp 1 lần chạy gần 2 phút.
// Trả: [{ lenhSX, ngayLenh, po, maHang, slLenh, (mau, size nếu theoSize) }]
const db = require('./db');
const queries = require('./queries');

const LO = 1000; // số tham số mỗi lần IN (SQL Server tối đa 2100)
const chia = (ds) => Array.from({ length: Math.ceil(ds.length / LO) }, (_, i) => ds.slice(i * LO, (i + 1) * LO));

async function docChuaPhanBo({ xn, dept, tuNgay, denNgay, lenhTu = '', lenhDen = '' }, theoSize = false) {
  if (!dept) return [];
  const lenhs = await db.query(queries.cpbLenh, { dept, tuNgay, denNgay, lenhTu, lenhDen });
  if (!lenhs.length) return [];
  const cuaId = new Map(lenhs.map((l) => [String(l.idDetail), l]));
  // B2: SL theo IdDetail x PO (x màu x size)
  const dong = [];
  for (const lo of chia([...cuaId.keys()])) {
    const p = Object.fromEntries(lo.map((v, i) => [`d${i}`, Number(v)]));
    dong.push(...await db.query(queries.cpbPO({ n: lo.length, theoSize }), p));
  }
  // gom về lệnh gốc x PO (x màu x size)
  const gom = new Map();
  const tongLP = new Map();
  dong.forEach((r) => {
    const l = cuaId.get(String(r.idDetail));
    if (!l) return;
    const k = [l.lenhSX, r.po, theoSize ? r.mau : '', theoSize ? r.size : ''].join('|');
    const x = gom.get(k) || { lenhSX: l.lenhSX, ngayLenh: l.ngayLenh, po: r.po, maHang: r.maHang, slLenh: 0, ...(theoSize ? { mau: r.mau, size: r.size } : {}) };
    x.slLenh += Number(r.sl || 0);
    if (!x.maHang && r.maHang) x.maHang = r.maHang;
    gom.set(k, x);
    const klp = `${l.lenhSX}|${r.po}`;
    tongLP.set(klp, (tongLP.get(klp) || 0) + Number(r.sl || 0));
  });
  const conSL = [...gom.values()].filter((x) => (tongLP.get(`${x.lenhSX}|${x.po}`) || 0) > 0);
  // B3: bỏ PO đã có kế hoạch ở XN
  const dsPO = [...new Set(conSL.map((x) => x.po))];
  const daPB = new Set();
  const dangKy = new Set(); // PO đã có trong phần mềm kế hoạch (OMM_PO)
  for (const lo of chia(dsPO)) {
    const p = { xn, ...Object.fromEntries(lo.map((v, i) => [`q${i}`, v])) };
    (await db.query(queries.cpbDaPhanBo({ n: lo.length }), p)).forEach((r) => {
      const po = String(r.po).trim();
      dangKy.add(po);
      if (Number(r.daPB)) daPB.add(po);
    });
  }
  return conSL.filter((x) => !daPB.has(x.po)).map((x) => ({ ...x, daDangKy: dangKy.has(x.po) }))
    .sort((a, b) => new Date(a.ngayLenh) - new Date(b.ngayLenh) || String(a.lenhSX).localeCompare(String(b.lenhSX)) || String(a.po).localeCompare(String(b.po)));
}

module.exports = { docChuaPhanBo };
