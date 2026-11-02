// Khảo sát (CHỈ ĐỌC, không lock): PO có nhiều lệnh Bravo trong cùng 1 xí nghiệp, và nguồn nào cho biết SL PO theo từng lệnh.
// 1) Tổng quan: bao nhiêu PO có >= 2 lệnh gốc còn SL > 0 cùng DeptCode (lệnh trong N ngày gần đây)
// 2) Chi tiết 30 PO mẫu: SL mỗi lệnh, các lệnh có chia theo màu x size riêng hay trùng màu x size
// 3) Kế hoạch OMM của các PO mẫu: số dòng kế hoạch / tổ, SL, LSX (xem có khớp số lệnh không)
// 4) Phiếu cấp BTP của các PO mẫu: lệnh ghi trên phiếu + SL đặt theo lệnh
// 5) Các cột có tên giống lệnh trong eGMF (OMM_ / NV_ / CUTTING_) và HiPro
// Chạy: npm run khao-sat-po-nhieu-lenh -- [soNgay=120]   -> khao-sat/khao-sat-po-nhieu-lenh.txt
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const soNgay = Number(process.argv[2]) || 120;
const q = (dbKey, text, p = {}) => db.query({ db: dbKey, text }, p);
const LENH = `
  WITH goc AS (
    SELECT a.DocNo, MAX(LTRIM(RTRIM(ISNULL(a.DeptCode, '')))) AS dept, MIN(m.DocDate) AS ngayLenh
    FROM dbo.Bravo_LenhSanXuat_Detail a JOIN dbo.Bravo_LenhSanXuat_Master m ON m.Id = a.IdMaster
    WHERE ISNULL(a.TypeCt, 0) = 0 AND ISNULL(a.IsActive, 1) <> 0 AND a.DocStatus = 4 AND m.DocDate >= DATEADD(day, -@soNgay, GETDATE())
    GROUP BY a.DocNo
  ),
  l AS (
    SELECT g.DocNo AS lenh, g.dept, g.ngayLenh, LTRIM(RTRIM(b.PO)) AS po, ISNULL(b.ColorCode, '') AS mau, ISNULL(b.SizeCode, '') AS size,
           SUM(ISNULL(b.Quantity, 0)) AS sl
    FROM dbo.Bravo_LenhSanXuat_Detail a
    JOIN dbo.Bravo_LenhSanXuat_Detail_PO b ON b.IdDetail = a.Id
    JOIN goc g ON g.DocNo = CASE WHEN a.TypeCt IN (1, 2) AND ISNULL(a.ProductionOrderAdjNo, '') <> '' THEN a.ProductionOrderAdjNo ELSE a.DocNo END
    WHERE ISNULL(a.IsActive, 1) <> 0 AND a.DocStatus = 4
    GROUP BY g.DocNo, g.dept, g.ngayLenh, LTRIM(RTRIM(b.PO)), ISNULL(b.ColorCode, ''), ISNULL(b.SizeCode, '')
  ),
  lp AS (SELECT po, dept, lenh, MIN(ngayLenh) AS ngayLenh, SUM(sl) AS sl FROM l GROUP BY po, dept, lenh HAVING SUM(sl) > 0),
  po2 AS (SELECT po, dept, COUNT(*) AS soLenh, SUM(sl) AS tongSL FROM lp GROUP BY po, dept HAVING COUNT(*) >= 2)`;

(async () => {
  const fmt = (rows) => (rows.length
    ? [Object.keys(rows[0]).join(' | '), ...rows.map((r) => Object.values(r).map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v)).join(' | '))]
    : ['(không có dòng nào)']);
  const out = [];
  const muc = async (ten, f) => { out.push(`=== ${ten} ===`); try { out.push(...fmt(await f())); } catch (e) { out.push(`LỖI: ${e.message}`); } out.push(''); };

  await muc(`1. Tổng quan (lệnh gốc trong ${soNgay} ngày)`, () => q('egmf', `${LENH}
    SELECT (SELECT COUNT(DISTINCT po + '|' + dept) FROM lp) AS soPO_XN,
           (SELECT COUNT(*) FROM po2) AS soPO_XN_NhieuLenh,
           (SELECT COUNT(*) FROM po2 p WHERE EXISTS (
              SELECT 1 FROM l x JOIN lp y ON y.po = x.po AND y.dept = x.dept AND y.lenh = x.lenh
              WHERE x.po = p.po AND x.dept = p.dept AND x.sl > 0
              GROUP BY x.mau, x.size HAVING COUNT(DISTINCT x.lenh) > 1)) AS soPO_TrungMauSize`, { soNgay }));

  const mau = await q('egmf', `${LENH}
    SELECT TOP 30 p.po, p.dept, p.soLenh, p.tongSL FROM po2 p ORDER BY p.soLenh DESC, p.tongSL DESC`, { soNgay }).catch(() => []);
  const dsPO = mau.map((r) => r.po);
  const thamSo = Object.fromEntries(dsPO.map((v, i) => [`p${i}`, v]));
  const inPO = dsPO.length ? dsPO.map((_, i) => `@p${i}`).join(', ') : 'NULL';

  await muc('2. 30 PO mẫu: SL từng lệnh, số màu x size, số màu x size trùng với lệnh khác', () => q('egmf', `${LENH}
    SELECT y.po, y.dept, y.lenh, y.ngayLenh, y.sl,
           (SELECT COUNT(*) FROM l x WHERE x.po = y.po AND x.dept = y.dept AND x.lenh = y.lenh AND x.sl > 0) AS soMauSize,
           (SELECT COUNT(*) FROM l x WHERE x.po = y.po AND x.dept = y.dept AND x.lenh = y.lenh AND x.sl > 0
              AND EXISTS (SELECT 1 FROM l z JOIN lp w ON w.po = z.po AND w.dept = z.dept AND w.lenh = z.lenh
                          WHERE z.po = x.po AND z.dept = x.dept AND z.mau = x.mau AND z.size = x.size AND z.lenh <> x.lenh AND z.sl > 0)) AS trungMauSize
    FROM lp y WHERE y.po IN (${inPO})
    ORDER BY y.po, y.dept, y.ngayLenh, y.lenh`, { soNgay, ...thamSo }));

  await muc('3. Kế hoạch OMM của các PO mẫu (mỗi dòng kế hoạch)', () => q('egmf', `
    SELECT po.PONo AS po, k.KHTId, px.TenPhanXuong AS xn, LTRIM(RTRIM(e.TenCum)) AS maTo, k.SoLuong, k.LSX, k.TinhTrang,
           k.NgayVaoChuyenKeHoachBatDau AS vaoChuyen, k.NgayMayKeHoachKetThuc AS ketThuc,
           (SELECT SUM(ISNULL(s.SoLuong, 0)) FROM dbo.OMM_KeHoachThang_SBD s WHERE s.KHTId = k.KHTId) AS slSBD
    FROM dbo.OMM_KeHoachThang k
    JOIN dbo.OMM_PO_ChiTiet ct ON ct.POCTId = k.CTPOId
    JOIN dbo.OMM_PO po ON po.POId = ct.POId
    LEFT JOIN dbo.Lib_CumChuyen e ON e.CumId = k.ChuyenId
    LEFT JOIN dbo.Lib_PhanXuong px ON px.PXId = e.PXId
    WHERE po.PONo IN (${inPO}) AND k.SoLuong > 0
    ORDER BY po.PONo, k.NgayVaoChuyenKeHoachBatDau, k.KHTId`, thamSo));

  await muc('4. Phiếu cấp BTP của các PO mẫu: lệnh ghi trên phiếu, SL đặt', () => q('egmf', `
    SELECT ct.PO AS po, pc.TenPhanXuong AS xn, LTRIM(RTRIM(pc.TenCum)) AS maTo, ISNULL(NULLIF(ct.LenhSanXuat, ''), pc.LenhSanXuat) AS lenhTrenPhieu,
           COUNT(DISTINCT pc.IdCapBTP) AS soPhieu, SUM(ISNULL(ct.SoLuongCanCap, 0)) AS slDat
    FROM dbo.CUTTING_PhieuCapBTP pc
    JOIN dbo.CUTTING_PhieuCapBTP_ChiTiet ct ON ct.IdCapBTP = pc.IdCapBTP
    WHERE ct.PO IN (${inPO})
    GROUP BY ct.PO, pc.TenPhanXuong, LTRIM(RTRIM(pc.TenCum)), ISNULL(NULLIF(ct.LenhSanXuat, ''), pc.LenhSanXuat)
    ORDER BY ct.PO, pc.TenPhanXuong, LTRIM(RTRIM(pc.TenCum))`, thamSo));

  const cotLenh = (ten) => `
    SELECT t.name AS bang, c.name AS cot, ty.name AS kieu
    FROM sys.tables t JOIN sys.columns c ON c.object_id = t.object_id JOIN sys.types ty ON ty.user_type_id = c.user_type_id
    WHERE (c.name LIKE '%LSX%' OR c.name LIKE '%Lenh%' OR c.name LIKE '%lenh%' OR c.name LIKE 'ProductionOrder%' OR c.name LIKE '%production_order%')
      ${ten}
    ORDER BY t.name, c.name`;
  await muc('5a. eGMF: cột giống lệnh trong bảng OMM_ / NV_ / CUTTING_ / DM_', () => q('egmf', cotLenh(`AND (t.name LIKE 'OMM[_]%' OR t.name LIKE 'NV[_]%' OR t.name LIKE 'CUTTING[_]%' OR t.name LIKE 'DM[_]%')`)));
  await muc('5b. HiPro: cột giống lệnh', () => q('hipro', cotLenh('')));
  await muc('5c. HiPro: cột của pro_san_pham và pro_ke_hoach_san_xuat', () => q('hipro', `
    SELECT t.name AS bang, c.name AS cot, ty.name AS kieu
    FROM sys.tables t JOIN sys.columns c ON c.object_id = t.object_id JOIN sys.types ty ON ty.user_type_id = c.user_type_id
    WHERE t.name IN ('pro_san_pham', 'pro_ke_hoach_san_xuat') ORDER BY t.name, c.column_id`));

  fs.mkdirSync('khao-sat', { recursive: true });
  fs.writeFileSync(path.join('khao-sat', 'khao-sat-po-nhieu-lenh.txt'), `${out.join('\n')}\n`);
  console.log('Đã ghi khao-sat/khao-sat-po-nhieu-lenh.txt');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
