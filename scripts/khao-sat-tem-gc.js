// Khảo sát (CHỈ ĐỌC, READ UNCOMMITTED như src/db.js) tem gia công để tra khi quét QR ở trang tổ trưởng may.
// 1. Các bảng có tên chứa GiaCong: số dòng, các cột
// 2. 3 dòng mới nhất (theo cột Id đầu tiên nếu có) của các bảng GiaCong có cột kiểu Barcode / Tem
// 3. Có mã tem mẫu thì tìm mã đó trong mọi cột Barcode / Tem của các bảng CUTTING% và %GiaCong% (TOP 1 mỗi cột)
// Chạy: npm run khao-sat-tem-gc   hoặc kèm mã tem gia công mẫu sau dấu --   -> khao-sat/khao-sat-tem-gc.txt
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const ma = String(process.argv[2] || '').trim();
const fmt = (v) => (v instanceof Date ? v.toISOString().slice(0, 16).replace('T', ' ') : v == null ? '' : String(v).slice(0, 60));
const bang = (out, tieuDe, rs) => {
  out.push(`=== ${tieuDe} (${rs.length} dòng) ===`);
  if (rs.length) out.push(Object.keys(rs[0]).join(' | '), ...rs.map((r) => Object.values(r).map(fmt).join(' | ')));
  out.push('');
};
const q = (text, p = {}) => db.query({ db: 'egmf', text }, p);

(async () => {
  const out = [`Mã tem mẫu: ${ma || '(không có)'}`, ''];
  const bangs = await q(`
    SELECT t.name AS bang, SUM(CASE WHEN p.index_id IN (0, 1) THEN p.rows ELSE 0 END) AS soDong
    FROM sys.tables t JOIN sys.partitions p ON p.object_id = t.object_id
    WHERE t.name LIKE '%GiaCong%'
    GROUP BY t.name ORDER BY t.name`);
  bang(out, '1. Bảng có tên chứa GiaCong', bangs);
  const cot = await q(`
    SELECT t.name AS bang, c.name AS cot, ty.name AS kieu, c.max_length AS dai, c.column_id AS stt
    FROM sys.tables t JOIN sys.columns c ON c.object_id = t.object_id JOIN sys.types ty ON ty.user_type_id = c.user_type_id
    WHERE t.name LIKE '%GiaCong%' OR t.name LIKE 'CUTTING%'
    ORDER BY t.name, c.column_id`);
  const theoBang = new Map();
  cot.forEach((c) => (theoBang.get(c.bang) || theoBang.set(c.bang, []).get(c.bang)).push(c));
  out.push('=== 1b. Cột của các bảng GiaCong ===');
  theoBang.forEach((cs, b) => { if (/GiaCong/i.test(b)) out.push(`${b}: ${cs.map((c) => `${c.cot} ${c.kieu}`).join(', ')}`); });
  out.push('');
  const laMa = (c) => /barcode|^tem|matem|ma_tem/i.test(c.cot) && /char/i.test(c.kieu);
  for (const [b, cs] of theoBang) {
    if (!/GiaCong/i.test(b) || !cs.some(laMa)) continue;
    const id = cs.find((c) => /^id$/i.test(c.cot)) || cs[0];
    try {
      bang(out, `2. ${b}: 3 dòng mới nhất`, await q(`SELECT TOP 3 * FROM dbo.[${b}] ORDER BY [${id.cot}] DESC`));
    } catch (e) { out.push(`2. ${b}: lỗi ${e.message}`, ''); }
  }
  if (ma) {
    const tim = [];
    for (const [b, cs] of theoBang) {
      for (const c of cs.filter(laMa)) {
        try {
          const r = await q(`SELECT TOP 1 1 AS co FROM dbo.[${b}] WHERE [${c.cot}] = @ma`, { ma });
          if (r.length) tim.push({ bang: b, cot: c.cot });
        } catch (e) { tim.push({ bang: b, cot: `${c.cot} (lỗi ${e.message})` }); }
      }
    }
    bang(out, `3. Bảng / cột có mã ${ma}`, tim);
    for (const t of tim.filter((x) => !/lỗi/.test(x.cot)).slice(0, 5)) {
      bang(out, `3b. ${t.bang} dòng có ${t.cot} = mã`, await q(`SELECT TOP 5 * FROM dbo.[${t.bang}] WHERE [${t.cot}] = @ma`, { ma }));
    }
  }
  const dir = path.join(__dirname, '..', 'khao-sat');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'khao-sat-tem-gc.txt');
  fs.writeFileSync(file, out.join('\r\n'));
  console.log(`Xong: ${file}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
