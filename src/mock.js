// Dữ liệu mẫu dùng khi USE_MOCK=true (chưa kết nối SQL Server). Cấu trúc giống bảng thật trong eGMF.
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const day = (offset, hour = 0) => {
  const d = new Date();
  d.setHours(hour, int(0, 59), 0, 0);
  d.setDate(d.getDate() + offset);
  return d.toISOString();
};
const sum = (arr, k) => arr.reduce((s, x) => s + (x[k] || 0), 0);

const xiNghiep = [1, 2, 3].map((n) => ({ ma: String(n), ten: `XÍ NGHIỆP MAY ${n}` }));
const to = {};
xiNghiep.forEach((xn) => {
  to[xn.ma] = Array.from({ length: 12 }, (_, k) => ({ ma: String(k + 1), ten: `Tổ ${k + 1}` }));
});

const khach = ['AF07802', 'AF01234', 'AF05555'];
const nguoi = ['VÕ THỊ NGA', 'NGÔ THỊ KIỀU OANH', 'LÊ VŨ PHONG', 'ĐẶNG QUỐC HIỆP'];
const mauList = ['8941360 NOIR', '8996818 BLANC', '9013014 GREEN'];
const sizeList = ['S', 'M', 'L', 'XL'];
const chiTietList = [['Vải chính', 'THÂN TRƯỚC'], ['Vải chính', 'THÂN SAU'], ['Vải chính', 'TAY'], ['Vải lót', 'LÓT THÂN']];

const lenhSX = [];
const keHoach = [];
const tem = [];
const phieuCap = [];
const phieuCapCT = [];
const quetXuat = [];
let soTem = 1;
let soPC = 2610001000;

xiNghiep.forEach((xn) => {
  for (let n = 0; n < 16; n++) {
    const lenh = `TUNTT-${String(600 + Number(xn.ma) * 20 + n).padStart(4, '0')}-2026`;
    const maHang = String(int(330000, 380000));
    const maus = mauList.slice(0, int(1, 2));
    const toObj = pick(to[xn.ma]);
    const bd = int(-20, 5);
    const po = String(int(4524000000, 4525999999));
    let tong = 0;

    // Tem BTP cắt: mỗi (chi tiết, màu, size) cắt thành vài tem
    maus.forEach((mau) => sizeList.forEach((size) => {
      const slSize = int(100, 400);
      tong += slSize;
      chiTietList.forEach(([loaiNL, chiTiet]) => {
        for (let left = slSize; left > 0;) {
          const sl = Math.min(left, int(20, 60));
          left -= sl;
          tem.push({ barcode: `BTP26100${String(soTem++).padStart(5, '0')}`, lenhSX: lenh, maHang, loaiNL, chiTiet, mau, size, soLuong: sl, slXuat: 0 });
        }
      });
    }));
    lenhSX.push({ lenhSX: lenh, maHang, mua: 'SS27', khachHang: pick(khach), ngay: day(bd - 15), soLuong: tong });
    keHoach.push({
      xn: xn.ma, maTo: toObj.ma, tenTo: toObj.ma, maHang, soLuong: tong,
      ngayVaoChuyen: day(bd - 1), ngayBatDau: day(bd), ngayKetThuc: day(bd + int(5, 15)),
    });

    // Tổ đặt BTP theo từng màu; khâu cắt quét tem xuất (đủ hoặc thiếu)
    maus.forEach((mau, i) => {
      const soPhieu = String(soPC++);
      const ngayNhan = day(bd + i);
      const daXuat = rnd() > 0.25;
      phieuCap.push({
        xnCode: `XN${xn.ma}`, to: toObj.ma, soPhieu, ngayNhan, ngayTao: day(bd + i - 1, 9), lenhSX: lenh, maHang, mua: 'SS27',
        trangThai: daXuat ? 'ĐÃ DUYỆT' : 'MỚI TẠO', nguoiTao: pick(nguoi),
      });
      sizeList.forEach((size) => {
        const tems = tem.filter((t) => t.lenhSX === lenh && t.mau === mau && t.size === size);
        const slDat = sum(tems.filter((t) => t.chiTiet === chiTietList[0][1]), 'soLuong');
        let slXuat = 0;
        if (daXuat) {
          tems.forEach((t) => {
            if (rnd() < 0.85) {
              t.slXuat = t.soLuong;
              if (t.chiTiet === chiTietList[0][1]) slXuat += t.soLuong;
              quetXuat.push({
                soPhieu, barcode: t.barcode, thoiGianXuat: day(bd + i, int(7, 16)), nguoiXuat: pick(nguoi), po, mau, size,
                chungLoai: t.loaiNL, soLuong: t.soLuong, thoiGianNhan: rnd() > 0.3 ? day(bd + i, 17) : null, nguoiNhan: null, traBTP: false,
              });
            }
          });
        }
        phieuCapCT.push({ soPhieu, po, mau, size, slDat, slXuat, slNhan: Math.floor(slXuat * 0.9) });
      });
    });
  }
});

const inRange = (d, tu, den) => d.slice(0, 10) >= tu && d.slice(0, 10) <= den;

module.exports = {
  xiNghiep: () => xiNghiep,
  to: ({ xn }) => to[xn] || [],
  keHoachPhanBo: ({ xn, tuNgay, denNgay }) =>
    keHoach.filter((k) => k.xn === xn && k.ngayKetThuc.slice(0, 10) >= tuNgay && k.ngayBatDau.slice(0, 10) <= denNgay)
      .sort((a, b) => Number(a.maTo) - Number(b.maTo) || a.ngayBatDau.localeCompare(b.ngayBatDau)),
  phieuCapBTP: ({ xnCode, to: maTo, tuNgay, denNgay }) =>
    phieuCap.filter((p) => p.xnCode === xnCode && p.to === maTo && inRange(p.ngayNhan, tuNgay, denNgay))
      .map((p) => {
        const ct = phieuCapCT.filter((c) => c.soPhieu === p.soPhieu);
        return { ...p, slDat: sum(ct, 'slDat'), slXuat: sum(ct, 'slXuat'), slNhan: sum(ct, 'slNhan') };
      })
      .sort((a, b) => b.ngayNhan.localeCompare(a.ngayNhan)),
  phieuCapChiTiet: ({ soPhieu }) => phieuCapCT.filter((c) => c.soPhieu === soPhieu),
  phieuXuatTheoPhieuCap: ({ soPhieu }) => quetXuat.filter((x) => x.soPhieu === soPhieu)
    .sort((a, b) => a.thoiGianXuat.localeCompare(b.thoiGianXuat)),
  lenhSX: ({ q }) => lenhSX.filter((l) => !q || l.lenhSX.includes(q) || l.maHang.includes(q))
    .sort((a, b) => b.ngay.localeCompare(a.ngay)).slice(0, 50),
  btpCatNXT: ({ lenhSX: lenh }) => {
    const groups = new Map();
    tem.filter((t) => t.lenhSX === lenh).forEach((t) => {
      const key = [t.loaiNL, t.chiTiet, t.mau, t.size].join('|');
      const g = groups.get(key) || { loaiNL: t.loaiNL, chiTiet: t.chiTiet, mau: t.mau, size: t.size, maHang: t.maHang, soTem: 0, slCat: 0, slXuat: 0 };
      g.soTem++; g.slCat += t.soLuong; g.slXuat += t.slXuat;
      groups.set(key, g);
    });
    return [...groups.values()].map((g) => ({ ...g, slTon: g.slCat - g.slXuat }));
  },
  btpCatXuat: ({ lenhSX: lenh, loaiNL, chiTiet, mau, size }) => {
    const codes = new Set(tem.filter((t) => t.lenhSX === lenh && t.loaiNL === loaiNL && t.chiTiet === chiTiet && t.mau === mau && t.size === size).map((t) => t.barcode));
    const groups = new Map();
    quetXuat.filter((x) => codes.has(x.barcode)).forEach((x) => {
      const pc = phieuCap.find((p) => p.soPhieu === x.soPhieu);
      const ct = phieuCapCT.find((c) => c.soPhieu === x.soPhieu && c.mau === x.mau && c.size === x.size) || {};
      const key = `${x.soPhieu}|${ct.size}`;
      const g = groups.get(key) || {
        soPhieuCap: x.soPhieu, xn: pc.xnCode, maTo: pc.to, po: ct.po, mauDat: ct.mau, sizeDat: ct.size,
        slDat: ct.slDat, slDaXuatPhieu: ct.slXuat, soTem: 0, soLuong: 0, tuLuc: x.thoiGianXuat, denLuc: x.thoiGianXuat,
      };
      g.soTem++; g.soLuong += x.soLuong;
      if (x.thoiGianXuat < g.tuLuc) g.tuLuc = x.thoiGianXuat;
      if (x.thoiGianXuat > g.denLuc) g.denLuc = x.thoiGianXuat;
      groups.set(key, g);
    });
    return [...groups.values()];
  },
};
