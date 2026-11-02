// Khảo sát (CHỈ ĐỌC, không lock) eGMF: lệnh sản xuất / PO nằm ở những bảng nào trước khi vào OMM_ (kế hoạch).
// 1) Liệt kê bảng có tên chứa Lenh / LSX / PO / DonHang / Order kèm số dòng (theo thống kê, không đếm bảng).
// 2) Tìm 1 PO và 1 lệnh mẫu trong mọi cột chữ có tên giống PO / lệnh, cho biết bảng nào có.
// Chạy: npm run khao-sat-lenh -- <PO> [Lenh]   vd: npm run khao-sat-lenh -- 6WNEW011J03-H168002 LYLT-0170-2026
//   -> khao-sat/khao-sat-lenh.txt
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const po = String(process.argv[2] || '').trim();
const lenh = String(process.argv[3] || '').trim();
if (!po) { console.error('Thiếu PO. Ví dụ: npm run khao-sat-lenh -- 6WNEW011J03-H168002 LYLT-0170-2026'); process.exit(1); }

const BANG = {
  db: 'egmf',
  text: `
    SELECT t.name AS bang, SUM(p.rows) AS soDong,
           STUFF((SELECT ', ' + c.name FROM sys.columns c WHERE c.object_id = t.object_id ORDER BY c.column_id FOR XML PATH('')), 1, 2, '') AS cot
    FROM sys.tables t
    JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
    WHERE t.name LIKE '%Lenh%' OR t.name LIKE '%LSX%' OR t.name LIKE '%[_]PO%' OR t.name LIKE 'PO%'
       OR t.name LIKE '%DonHang%' OR t.name LIKE '%Order%' OR t.name LIKE '%Bravo%'
    GROUP BY t.name, t.object_id
    ORDER BY t.name`,
};
// Cột chữ có tên giống PO / lệnh, trong các bảng có > 0 dòng
const COT = {
  db: 'egmf',
  text: `
    SELECT t.name AS bang, c.name AS cot,
           CASE WHEN c.name LIKE '%PO%' THEN 'po' ELSE 'lenh' END AS loai
    FROM sys.tables t
    JOIN sys.columns c ON c.object_id = t.object_id
    JOIN sys.types ty ON ty.user_type_id = c.user_type_id
    WHERE ty.name IN ('varchar', 'nvarchar', 'char', 'nchar')
      AND (c.name IN ('PO', 'PONo', 'SoPO', 'MaPO', 'PO_No', 'PONumber') OR c.name LIKE '%Lenh%' OR c.name IN ('LSX', 'DocNo', 'ProductionOrderNo', 'ProductionOrderAdjNo'))
      AND EXISTS (SELECT 1 FROM sys.partitions p WHERE p.object_id = t.object_id AND p.index_id IN (0, 1) AND p.rows > 0)
    ORDER BY t.name, c.name`,
};

(async () => {
  const fmt = (rows) => (rows.length
    ? [Object.keys(rows[0]).join(' | '), ...rows.map((r) => Object.values(r).map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v)).join(' | '))]
    : ['(không có dòng nào)']);
  const out = [];
  out.push('=== Bảng liên quan lệnh / PO / đơn hàng ===');
  try { out.push(...fmt(await db.query(BANG, {}))); } catch (e) { out.push(`LỖI: ${e.message}`); }
  out.push('');
  const cots = await db.query(COT, {});
  const tim = async (giaTri, loai) => {
    out.push(`=== Bảng có ${loai === 'po' ? 'PO' : 'lệnh'} "${giaTri}" (khớp nguyên văn hoặc chứa) ===`);
    out.push('bang | cot | soDong | viDu');
    let co = 0;
    for (const c of cots.filter((x) => x.loai === loai)) {
      try {
        const r = await db.query({ db: 'egmf', text: `
          SELECT COUNT(*) AS n, MIN(CAST([${c.cot}] AS nvarchar(200))) AS viDu
          FROM (SELECT TOP 1000 [${c.cot}] FROM dbo.[${c.bang}] WHERE [${c.cot}] LIKE '%' + @v + '%') x` }, { v: giaTri });
        if (r[0].n > 0) { co += 1; out.push(`${c.bang} | ${c.cot} | ${r[0].n}${r[0].n === 1000 ? '+' : ''} | ${r[0].viDu}`); }
      } catch (e) { out.push(`${c.bang} | ${c.cot} | LỖI: ${e.message}`); }
    }
    if (!co) out.push('(không bảng nào có)');
    out.push('');
  };
  await tim(po, 'po');
  if (lenh) await tim(lenh, 'lenh');
  fs.mkdirSync('khao-sat', { recursive: true });
  fs.writeFileSync(path.join('khao-sat', 'khao-sat-lenh.txt'), `${out.join('\n')}\n`);
  console.log('Đã ghi khao-sat/khao-sat-lenh.txt');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
