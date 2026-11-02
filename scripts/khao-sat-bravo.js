// Khảo sát (CHỈ ĐỌC, không lock) các bảng Bravo lệnh sản xuất trong eGMF (tên bắt đầu Bravo_LenhSanXuat).
// Mỗi bảng: số dòng, danh sách cột (kiểu dữ liệu), và các dòng của 1 lệnh mẫu (theo DocNo / IdMaster / IdDetail).
// Chạy: npm run khao-sat-bravo -- <Lenh>   vd: npm run khao-sat-bravo -- LYLT-0170-2026   -> khao-sat/khao-sat-bravo.txt
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const lenh = String(process.argv[2] || '').trim();
if (!lenh) { console.error('Thiếu lệnh. Ví dụ: npm run khao-sat-bravo -- LYLT-0170-2026'); process.exit(1); }
const q = (text, p = {}) => db.query({ db: 'egmf', text }, p);

(async () => {
  const fmt = (rows) => (rows.length
    ? [Object.keys(rows[0]).join(' | '), ...rows.map((r) => Object.values(r).map((v) => (v instanceof Date ? v.toISOString().replace('T', ' ').slice(0, 19) : v)).join(' | '))]
    : ['(không có dòng nào)']);
  const out = [];
  const bangs = await q(`
    SELECT t.name AS bang, SUM(p.rows) AS soDong
    FROM sys.tables t JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
    WHERE t.name LIKE 'Bravo[_]LenhSanXuat%'
    GROUP BY t.name ORDER BY t.name`);
  out.push('=== Các bảng Bravo_LenhSanXuat* ===', ...fmt(bangs), '');
  // Id master / detail của lệnh mẫu để lọc bảng con
  const ma = await q('SELECT Id FROM dbo.Bravo_LenhSanXuat_Master WHERE DocNo = @lenh', { lenh }).catch(() => []);
  const de = await q(`SELECT a.Id FROM dbo.Bravo_LenhSanXuat_Detail a
    WHERE a.DocNo = @lenh OR a.IdMaster IN (SELECT Id FROM dbo.Bravo_LenhSanXuat_Master WHERE DocNo = @lenh)`, { lenh }).catch(() => []);
  const ds = (rows) => (rows.length ? rows.map((r) => Number(r.Id)).filter(Number.isFinite).join(',') : 'NULL');
  out.push(`Lệnh mẫu ${lenh}: Master Id = ${ds(ma)}; Detail Id = ${ds(de)}`, '');
  for (const b of bangs) {
    const cot = await q(`
      SELECT c.name AS cot, ty.name AS kieu, c.max_length AS doDai
      FROM sys.columns c JOIN sys.types ty ON ty.user_type_id = c.user_type_id
      WHERE c.object_id = OBJECT_ID('dbo.' + @b) ORDER BY c.column_id`, { b: b.bang });
    const ten = cot.map((c) => c.cot);
    out.push(`=== ${b.bang} (${b.soDong} dòng) ===`);
    out.push(`Cột: ${cot.map((c) => `${c.cot} (${c.kieu})`).join(', ')}`);
    let loc = '';
    if (b.bang === 'Bravo_LenhSanXuat_Master' || (ten.includes('DocNo') && !ten.includes('IdMaster') && !ten.includes('IdDetail'))) loc = ten.includes('DocNo') ? 'DocNo = @lenh' : '';
    else if (ten.includes('IdDetail')) loc = `IdDetail IN (${ds(de)})`;
    else if (ten.includes('IdMaster')) loc = `IdMaster IN (${ds(ma)})`;
    else if (ten.includes('DocNo')) loc = 'DocNo = @lenh';
    if (loc) {
      out.push(`Dòng của lệnh mẫu (WHERE ${loc}, tối đa 30):`);
      try { out.push(...fmt(await q(`SELECT TOP 30 * FROM dbo.[${b.bang}] WHERE ${loc}`, { lenh }))); } catch (e) { out.push(`LỖI: ${e.message}`); }
    } else {
      out.push('Không có cột DocNo / IdMaster / IdDetail. 5 dòng mẫu:');
      try { out.push(...fmt(await q(`SELECT TOP 5 * FROM dbo.[${b.bang}]`))); } catch (e) { out.push(`LỖI: ${e.message}`); }
    }
    out.push('');
  }
  fs.mkdirSync('khao-sat', { recursive: true });
  fs.writeFileSync(path.join('khao-sat', 'khao-sat-bravo.txt'), `${out.join('\n')}\n`);
  console.log('Đã ghi khao-sat/khao-sat-bravo.txt');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
