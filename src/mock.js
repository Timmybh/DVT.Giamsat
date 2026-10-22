// Dữ liệu mẫu dùng khi USE_MOCK=true (chưa kết nối SQL Server)
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const xiNghiep = [
  { ma: '1', ten: 'Xí nghiệp may 1' },
  { ma: '2', ten: 'Xí nghiệp may 2' },
  { ma: '3', ten: 'Xí nghiệp may 3' },
];
const to = {};
xiNghiep.forEach((xn, i) => {
  to[xn.ma] = Array.from({ length: 8 }, (_, k) => ({ ma: `${i + 1}${String(k + 1).padStart(2, '0')}`, ten: `Tổ ${i + 1}${String(k + 1).padStart(2, '0')}` }));
});

const khach = ['UNIQLO', 'DECATHLON', 'ADIDAS', 'H&M', 'ZARA'];
const mauList = ['Đen', 'Trắng', 'Xanh navy', 'Xám', 'Đỏ'];
const sizeList = ['S', 'M', 'L', 'XL'];

const lenhSX = [];
const keHoach = [];
const btpCat = [];
const phieuCap = [];
const phieuXuat = [];
let soPX = 1;
let soPC = 1;

xiNghiep.forEach((xn) => {
  for (let n = 0; n < 16; n++) {
    const lenh = `LSX${xn.ma}-${String(2600 + n)}`;
    const maHang = `MH${int(1000, 9999)}`;
    const kh = pick(khach);
    const maus = mauList.slice(0, int(1, 3));
    let tong = 0;
    maus.forEach((mau) => sizeList.forEach((size) => {
      const sl = int(200, 900);
      tong += sl;
      btpCat.push({ xn: xn.ma, lenhSX: lenh, maHang, mau, size, slCat: sl });
    }));
    lenhSX.push({ xn: xn.ma, lenhSX: lenh, maHang, khachHang: kh, soLuong: tong });

    const toObj = pick(to[xn.ma]);
    const toNhan = toObj.ma;
    const bd = int(-20, 10);
    keHoach.push({
      xn: xn.ma, maTo: toNhan, tenTo: toObj.ten.replace('Tổ ', ''), maHang, soLuong: tong,
      ngayVaoChuyen: day(bd - 1), ngayBatDau: day(bd), ngayKetThuc: day(bd + int(5, 15)),
    });

    // Tổ đặt BTP theo từng màu, khâu cắt xuất 1-3 lần cho mỗi phiếu cấp
    maus.forEach((mau) => {
      const sp = `PC${String(soPC++).padStart(5, '0')}`;
      const rows = btpCat.filter((r) => r.lenhSX === lenh && r.mau === mau);
      const slDat = rows.reduce((s, r) => s + r.slCat, 0);
      const ngayDat = day(bd - int(1, 3));
      phieuCap.push({ xn: xn.ma, maTo: toNhan, soPhieu: sp, ngayDat, ngayCan: day(bd), lenhSX: lenh, maHang, mau, slDat });
      const lan = int(1, 3);
      for (let l = 0; l < lan; l++) {
        rows.forEach((r) => {
          const sl = Math.floor((r.slCat * int(60, 100)) / 100 / lan);
          phieuXuat.push({
            soPhieuXuat: `PX${String(soPX).padStart(5, '0')}`, ngayXuat: day(bd - 1 + l), soPhieuCap: sp,
            lenhSX: lenh, maHang, mau, size: r.size, soBo: Math.ceil(sl / 25), soLuong: sl, nguoiXuat: pick(['Lan', 'Hùng', 'Mai', 'Tuấn']),
          });
        });
        soPX++;
      }
    });
  }
});

const sum = (arr) => arr.reduce((s, x) => s + x.soLuong, 0);

module.exports = {
  xiNghiep: () => xiNghiep,
  to: ({ xn }) => to[xn] || [],
  keHoachPhanBo: ({ xn, tuNgay, denNgay }) =>
    keHoach.filter((k) => k.xn === xn && k.ngayKetThuc >= tuNgay && k.ngayBatDau <= denNgay)
      .sort((a, b) => a.maTo.localeCompare(b.maTo) || a.ngayBatDau.localeCompare(b.ngayBatDau)),
  phieuCapBTP: ({ xn, to: maTo }) =>
    phieuCap.filter((p) => p.xn === xn && p.maTo === maTo)
      .map((p) => ({ ...p, slDaCap: sum(phieuXuat.filter((x) => x.soPhieuCap === p.soPhieu)) }))
      .sort((a, b) => b.ngayDat.localeCompare(a.ngayDat)),
  phieuXuatTheoPhieuCap: ({ soPhieu }) => phieuXuat.filter((x) => x.soPhieuCap === soPhieu),
  lenhSX: ({ xn, q }) =>
    lenhSX.filter((l) => l.xn === xn && (!q || l.lenhSX.includes(q) || l.maHang.includes(q))),
  btpCatNXT: ({ lenhSX: lenh }) =>
    btpCat.filter((r) => r.lenhSX === lenh).map((r) => {
      const slXuat = sum(phieuXuat.filter((x) => x.lenhSX === lenh && x.mau === r.mau && x.size === r.size));
      return { maHang: r.maHang, mau: r.mau, size: r.size, slCat: r.slCat, slXuat, slTon: r.slCat - slXuat };
    }),
  btpCatXuat: ({ lenhSX: lenh, mau, size }) =>
    phieuXuat.filter((x) => x.lenhSX === lenh && x.mau === mau && x.size === size).map((x) => ({
      soPhieuXuat: x.soPhieuXuat, ngayXuat: x.ngayXuat, soPhieuCap: x.soPhieuCap,
      maTo: (phieuCap.find((p) => p.soPhieu === x.soPhieuCap) || {}).maTo, soBo: x.soBo, soLuong: x.soLuong,
    })),
};
