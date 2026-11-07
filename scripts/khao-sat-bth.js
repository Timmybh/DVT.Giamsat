// Khảo sát (CHỈ ĐỌC, READ UNCOMMITTED như src/db.js) tem 'BTH...' trên màn xuất BTP của phần mềm gốc, và SL BTP của 1 lệnh.
// 1. Tem cắt của lệnh theo loại NL x chi tiết x đầu mã tem (BTP/BTH..): số tem, SL, SL thực xuất
// 2. Các lần quét xuất của lệnh (CUTTING_PhieuCapBTP_BarcodeChiTiet) theo đầu mã tem: số dòng, SL xuất, SL nhận, có khớp tem cắt không
// 3. Bảng / cột nào chứa mã tem BTH mẫu
// Chạy: npm run khao-sat-bth -- TUNTT-0686-2026 BTH2610004783   -> khao-sat/khao-sat-bth.txt
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const lenh = String(process.argv[2] || 'TUNTT-0686-2026').trim();
const bth = String(process.argv[3] || 'BTH2610004783').trim();
const fmt = (v) => (v instanceof Date ? v.toISOString().slice(0, 16).replace('T', ' ') : v);
const bang = (out, tieuDe, rs) => {
  out.push(`=== ${tieuDe} (${rs.length} dòng) ===`);
  if (rs.length) out.push(Object.keys(rs[0]).join(' | '), ...rs.map((r) => Object.values(r).map(fmt).join(' | ')));
  out.push('');
};

(async () => {
  const out = [`Lệnh: ${lenh}   Tem mẫu: ${bth}`, ''];
  const q = (text) => db.query({ db: 'egmf', text }, { lenh, bth });
  bang(out, '1. Tem cắt của lệnh theo loại NL x chi tiết x đầu mã', await q(`
    SELECT ISNULL(t.LoaiNguyenLieu, '') AS loaiNL, ISNULL(t.TenChiTiet, '') AS chiTiet, LEFT(t.Barcode, 3) AS dau,
           COUNT(*) AS soTem, SUM(ISNULL(t.SoLuong, 0)) AS sl, SUM(ISNULL(t.SoLuongThucXuat, 0)) AS slThucXuat, MIN(t.NgayTao) AS tu, MAX(t.NgayTao) AS den
    FROM dbo.CUTTING_PhieuHoachToan_TemBarCode t
    WHERE REPLACE(t.LenhSanXuat, ';', '') = @lenh
    GROUP BY ISNULL(t.LoaiNguyenLieu, ''), ISNULL(t.TenChiTiet, ''), LEFT(t.Barcode, 3)
    ORDER BY 1, 2, 3`));
  bang(out, '2. Quét xuất của lệnh theo đầu mã tem, có khớp tem cắt hay không', await q(`
    SELECT LEFT(bc.TemBarcodeBTP, 3) AS dau, CASE WHEN t.Id IS NULL THEN 'khong' ELSE 'co' END AS khopTemCat,
           ISNULL(bc.ChungLoai, '') AS chungLoai, COUNT(*) AS soDong, COUNT(DISTINCT bc.TemBarcodeBTP) AS soTem,
           SUM(ISNULL(bc.SoLuongDaXuat, 0)) AS slXuat, SUM(ISNULL(bc.SoLuongDaNhan, 0)) AS slNhan,
           SUM(CASE WHEN bc.ThoiGianQuetNhan IS NOT NULL THEN 1 ELSE 0 END) AS soDongDaNhan
    FROM dbo.CUTTING_PhieuCapBTP_BarcodeChiTiet bc
    LEFT JOIN dbo.CUTTING_PhieuHoachToan_TemBarCode t ON t.Barcode = bc.TemBarcodeBTP
    WHERE REPLACE(bc.LenhSanXuat, ';', '') = @lenh
    GROUP BY LEFT(bc.TemBarcodeBTP, 3), CASE WHEN t.Id IS NULL THEN 'khong' ELSE 'co' END, ISNULL(bc.ChungLoai, '')
    ORDER BY 1, 2, 3`));
  bang(out, `2b. Các dòng quét xuất của tem ${bth}`, await q(`
    SELECT TOP 50 * FROM dbo.CUTTING_PhieuCapBTP_BarcodeChiTiet bc WHERE bc.TemBarcodeBTP = @bth`));
  // 3. cột chữ có tên Barcode / Tem trong bảng CUTTING_*
  const cot = await q(`
    SELECT c.TABLE_NAME AS bang, c.COLUMN_NAME AS cot
    FROM INFORMATION_SCHEMA.COLUMNS c JOIN INFORMATION_SCHEMA.TABLES t ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
    WHERE c.TABLE_SCHEMA = 'dbo' AND t.TABLE_TYPE = 'BASE TABLE' AND c.DATA_TYPE LIKE '%char%'
      AND (c.COLUMN_NAME LIKE '%Barcode%' OR c.COLUMN_NAME LIKE '%Tem%' OR c.COLUMN_NAME LIKE '%Bo%')
      AND c.TABLE_NAME LIKE 'CUTTING%'
    ORDER BY 1, 2`);
  out.push(`=== 3. Cột chứa '${bth}' ===`);
  for (const r of cot) {
    try {
      const rs = await q(`SELECT TOP 5 * FROM dbo.[${r.bang}] WHERE [${r.cot}] = @bth`);
      if (rs.length) {
        out.push(`--- ${r.bang}.${r.cot}: ${rs.length} dòng (tối đa 5) ---`, Object.keys(rs[0]).join(' | '));
        rs.forEach((x) => out.push(Object.values(x).map(fmt).join(' | ')));
      }
    } catch (e) { out.push(`${r.bang}.${r.cot}: LỖI ${e.message}`); }
  }
  out.push(`(đã dò ${cot.length} cột)`);
  fs.mkdirSync('khao-sat', { recursive: true });
  fs.writeFileSync(path.join('khao-sat', 'khao-sat-bth.txt'), `${out.join('\n')}\n`);
  console.log('Đã ghi khao-sat/khao-sat-bth.txt');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
