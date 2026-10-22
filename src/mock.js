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
const chiTietList = [['Vải chính', 'THÂN TRƯỚC'], ['Vải chính', 'THÂN SAU'], ['Vải chính', 'TAY'], ['Vải lót', 'LÓT THÂN'], ['Keo', 'KEO NẸP']];
const khongMau = new Set(['Keo']); // loại NL cắt theo chủng loại: tác nghiệp không ghi màu
const loaiNLList = [...new Set(chiTietList.map((c) => c[0]))];

const lenhSX = [];
const keHoach = [];
const tem = [];
const phieuCap = [];
const phieuCapCT = [];
const quetXuat = [];
const dieuTiet = []; // phiếu điều tiết: 1 phiếu / (lệnh, loại NL)
const tacNghiep = []; // SL sản phẩm theo màu x size của phiếu điều tiết
const banMay = []; // bó cắt (bàn máy): mỗi bó in 1 tem cho mỗi chi tiết của loại NL
let soTem = 1;
let idDT = 25000;
let idBM = 1150000;
let soPC = 2610001000;

xiNghiep.forEach((xn) => {
  for (let n = 0; n < 16; n++) {
    const lenh = `TUNTT-${String(600 + Number(xn.ma) * 20 + n).padStart(4, '0')}-2026`;
    const maHang = String(int(330000, 380000));
    const maus = mauList.slice(0, int(1, 2));
    const toObj = pick(to[xn.ma]);
    const bd = int(-20, 5);
    const po = String(int(4524000000, 4525999999));
    const kh = pick(khach);
    let tong = 0;

    // Điều tiết -> bó cắt -> tem: mỗi bó in 1 tem cho mỗi chi tiết của loại NL
    const phieuDT = Object.fromEntries(loaiNLList.map((loaiNL) => {
      const p = { id: idDT++, lenhSX: lenh, loaiNL, maHang, khachHang: kh };
      dieuTiet.push(p);
      return [loaiNL, p];
    }));
    maus.forEach((mau) => sizeList.forEach((size) => {
      const slSize = int(100, 400);
      tong += slSize;
      loaiNLList.forEach((loaiNL) => {
        const p = phieuDT[loaiNL];
        const m = khongMau.has(loaiNL) ? '' : mau;
        tacNghiep.push({ idPhieu: p.id, mau: m, size, soLuong: slSize });
        let left = Math.floor(slSize * (rnd() < 0.3 ? 0.7 + rnd() * 0.25 : 1)); // có size cắt chưa đủ
        while (left > 0) {
          const sl = Math.min(left, int(20, 60));
          left -= sl;
          const bm = { idBanMay: idBM++, idPhieu: p.id, mau: m, size, soLuong: sl };
          banMay.push(bm);
          chiTietList.filter((c) => c[0] === loaiNL).forEach(([, chiTiet]) => {
            tem.push({ barcode: `BTP26100${String(soTem++).padStart(5, '0')}`, lenhSX: lenh, maHang, loaiNL, chiTiet, mau: m, size, soLuong: sl, slXuat: 0, idBanMay: bm.idBanMay, ngayTao: day(bd - int(1, 4), 10) });
          });
        }
      });
    }));
    lenhSX.push({ lenhSX: lenh, maHang, mua: 'SS27', khachHang: kh, ngay: day(bd - 15), soLuong: tong });
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
        const tems = tem.filter((t) => t.lenhSX === lenh && (t.mau === mau || (t.mau === '' && i === 0)) && t.size === size);
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

// Số ngẫu nhiên cố định theo khóa (để cùng ngày/tổ luôn ra cùng số)
const hash = (str) => { let h = 2166136261; for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };
const hInt = (key, a, b) => a + Math.floor(hash(key) * (b - a + 1));
const datesBetween = (tu, den) => {
  const out = [];
  for (let d = new Date(tu); d <= new Date(den); d.setDate(d.getDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
};
// Mã hàng đang may của từng tổ trong ngày (lấy theo kế hoạch mẫu, không có thì gán cố định)
const hangCuaTo = (xn, line, d0) => {
  const k = keHoach.find((x) => x.xn === xn && x.maTo === line && x.ngayBatDau.slice(0, 10) <= d0 && x.ngayKetThuc.slice(0, 10) >= d0);
  return k ? k.maHang : String(hInt(`${xn}${line}`, 330000, 380000));
};

const inRange = (d, tu, den) => d.slice(0, 10) >= tu && d.slice(0, 10) <= den;

module.exports = {
  xiNghiep: () => xiNghiep,
  to: ({ xn }) => to[xn] || [],
  keHoachPhanBo: ({ xn, tuNgay, denNgay }) =>
    keHoach.filter((k) => k.xn === xn && k.ngayKetThuc.slice(0, 10) >= tuNgay && k.ngayBatDau.slice(0, 10) <= denNgay)
      .sort((a, b) => Number(a.maTo) - Number(b.maTo) || a.ngayBatDau.localeCompare(b.ngayBatDau)),
  sanLuongTheoHang: () => keHoach.map((k) => ({
    xn: `Xí Nghiệp 0${k.xn}`, line: k.maTo, maHang: k.maHang,
    slSX: Math.floor(k.soLuong * Math.min(1, Math.max(0, (Date.now() - new Date(k.ngayBatDau)) / (new Date(k.ngayKetThuc) - new Date(k.ngayBatDau))))),
  })),
  phieuCapBTP: ({ xnCode, to: maTo, tuNgay, denNgay }) =>
    phieuCap.filter((p) => p.xnCode === xnCode && p.to === maTo && inRange(p.ngayNhan, tuNgay, denNgay))
      .map((p) => {
        const ct = phieuCapCT.filter((c) => c.soPhieu === p.soPhieu);
        return { ...p, slDat: sum(ct, 'slDat'), slXuat: sum(ct, 'slXuat'), slNhan: sum(ct, 'slNhan') };
      })
      .sort((a, b) => b.ngayNhan.localeCompare(a.ngayNhan)),
  chiTietDatBTP: ({ xnCode, to: maTo, tuNgay, denNgay, lenhSX: lenh, po }) =>
    phieuCap.filter((p) => p.xnCode === xnCode && (!maTo || p.to === maTo) && inRange(p.ngayNhan, tuNgay, denNgay) && (!lenh || p.lenhSX.includes(lenh)))
      .sort((a, b) => Number(a.to) - Number(b.to) || b.ngayNhan.localeCompare(a.ngayNhan))
      .flatMap((p) => phieuCapCT.filter((c) => c.soPhieu === p.soPhieu && (!po || c.po.includes(po))).map((c) => ({
        maTo: p.to, soPhieu: p.soPhieu, ngayNhan: p.ngayNhan, lenhSX: p.lenhSX, maHang: p.maHang,
        po: c.po, mau: c.mau, size: c.size, slDat: c.slDat, slCap: c.slXuat, slNhan: c.slNhan,
      }))),
  phieuCapChiTiet: ({ soPhieu }) => phieuCapCT.filter((c) => c.soPhieu === soPhieu),
  phieuXuatTheoPhieuCap: ({ soPhieu }) => quetXuat.filter((x) => x.soPhieu === soPhieu)
    .sort((a, b) => a.thoiGianXuat.localeCompare(b.thoiGianXuat)),
  lenhSX: ({ q }) => lenhSX.filter((l) => !q || l.lenhSX.includes(q) || l.maHang.includes(q))
    .sort((a, b) => b.ngay.localeCompare(a.ngay)).slice(0, 50),
  btpCatNXT: ({ lenhSX: lenh, tuNgay, denNgay }) => tem
    .filter((t) => (!lenh || t.lenhSX === lenh) && inRange(t.ngayTao, tuNgay, denNgay))
    .flatMap((t) => {
      const goc = {
        barcode: t.barcode, ngayTao: t.ngayTao, lenhSX: t.lenhSX, maHang: t.maHang, mua: 'SS27', loaiNL: t.loaiNL, chiTiet: t.chiTiet,
        mau: t.mau, mauVai: t.mau, size: t.size, banCat: 1 + (t.idBanMay % 9), banMay: t.idBanMay % 500, idBanMay: t.idBanMay, phieuHoachToan: String(130000 + (t.idBanMay % 5000)),
      };
      const xs = quetXuat.filter((x) => x.barcode === t.barcode);
      if (!xs.length) return [{ ...goc, slCat: t.soLuong, slTon: t.soLuong - t.slXuat }];
      return xs.map((x, i) => {
        const pc = phieuCap.find((p) => p.soPhieu === x.soPhieu);
        return {
          ...goc, slCat: i ? null : t.soLuong, slTon: i ? null : t.soLuong - t.slXuat,
          soPhieuCap: x.soPhieu, temXuat: x.barcode, lenhXuat: pc.lenhSX, po: x.po, sizeDat: x.size, xn: pc.xnCode, maTo: pc.to,
          ngayNhan: pc.ngayNhan, slXuat: x.soLuong, thoiGianXuat: x.thoiGianXuat, nguoiXuat: x.nguoiXuat,
          slNhan: x.thoiGianNhan ? x.soLuong : null, thoiGianNhan: x.thoiGianNhan,
        };
      });
    })
    .sort((a, b) => a.ngayTao.localeCompare(b.ngayTao) || a.barcode.localeCompare(b.barcode)),
  btpCatXuat: ({ lenhSX: lenh, loaiNL, chiTiet, mau, size, tuNgay, denNgay }) => {
    const codes = new Set(tem.filter((t) => t.lenhSX === lenh && t.loaiNL === loaiNL && t.chiTiet === chiTiet && t.mau === mau && t.size === size
      && (!tuNgay || inRange(t.ngayTao, tuNgay, denNgay))).map((t) => t.barcode));
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
  keHoachNgay: ({ xn, d0 }) => (to[xn] || []).map((t) => ({ line: t.ma, keHoach: hInt(`kh${xn}${t.ma}${d0}`, 500, 1100) })),
  sanLuongGio: ({ d0 }) => xiNghiep.flatMap((xn) => to[xn.ma].map((t) => {
    const row = { xn: `XN${xn.ma}`, line: `Chuyền ${t.ma}`, maHang: hangCuaTo(xn.ma, t.ma, d0) };
    const isToday = d0 === new Date().toISOString().slice(0, 10);
    const maxH = isToday ? Math.min(14, Math.max(1, ((new Date().getUTCHours() + 7) % 24) - 6)) : 10;
    for (let h = 1; h <= 14; h++) {
      row[`h${h}`] = h <= maxH ? hInt(`h${xn.ma}${t.ma}${d0}${h}`, 40, 110) : 0;
      row[`r${h}`] = h <= maxH ? hInt(`r${xn.ma}${t.ma}${d0}${h}`, 0, 8) : 0;
    }
    return row;
  })),
  poMayRa: ({ xnNum, d0 }) => (to[xnNum] || []).flatMap((t) => Array.from({ length: hInt(`npo${xnNum}${t.ma}`, 1, 2) }, (_, i) => {
    const soLuong = hInt(`sl${xnNum}${t.ma}${i}`, 2000, 9000);
    const mayRaLK = Math.floor(soLuong * hash(`lk${xnNum}${t.ma}${i}${d0}`));
    return {
      line: t.ma, po: String(hInt(`po${xnNum}${t.ma}${i}`, 4524000000, 4525999999)), lenhSX: `TUNTT-${hInt(`l${xnNum}${t.ma}${i}`, 600, 700)}-2026`,
      maHang: hangCuaTo(xnNum, t.ma, d0), khachHang: pick(khach), soLuong, vaoChuyenLK: Math.min(soLuong, mayRaLK + hInt(`v${t.ma}${i}`, 200, 900)),
      mayRaNgay: hInt(`mn${xnNum}${t.ma}${i}${d0}`, 100, 600), mayRaLK, ngayXuat: day(hInt(`nx${t.ma}${i}`, 3, 30)),
    };
  })),
  laoDong: ({ d0 }) => xiNghiep.flatMap((xn) => to[xn.ma].map((t) => {
    const tong = hInt(`ld${xn.ma}${t.ma}`, 28, 42);
    return { xn: `XÍ NGHIỆP MAY ${xn.ma}`, line: t.ma, tong, hienDien: tong - hInt(`vm${xn.ma}${t.ma}${d0}`, 0, 5) };
  })),
  qcNscl: ({ tuNgay, denNgay }) => datesBetween(tuNgay, denNgay).flatMap((d) => xiNghiep.flatMap((xn) => to[xn.ma].map((t) => {
    const dat = hInt(`qd${xn.ma}${t.ma}${d}`, 350, 800);
    const loi = hInt(`ql${xn.ma}${t.ma}${d}`, 5, 60);
    return { ngay: d, xn: `Xí Nghiệp 0${xn.ma}`, line: t.ma, dat, loi, sua: Math.floor(loi * 0.8) };
  }))),
  qcLoiChiTiet: ({ tuNgay, denNgay }) => {
    const loiList = [['QAD00012', 'Sụp mí', 'Cụm Lỗi Cấu Trúc'], ['QAD00019', 'Đứt chỉ', 'Cụm Lỗi Cấu Trúc'], ['QAD00076', 'Dơ dầu', 'Cụm Lỗi Vệ Sinh Công Nghiệp'],
      ['QAD00003', 'Lỗi vải', 'Cụm Lỗi NPL'], ['QAD00105', 'Rạn đường may', 'Cụm Lỗi Cấu Trúc'], ['QAD00106', 'Lỗi dơ phấn', 'Cụm Lỗi Vệ Sinh Công Nghiệp']];
    const n = datesBetween(tuNgay, denNgay).length;
    return xiNghiep.flatMap((xn) => to[xn.ma].flatMap((t) => loiList.map(([maLoi, tenLoi, cumLoi]) => ({
      xn: `Xí Nghiệp 0${xn.ma}`, line: t.ma, maLoi, tenLoi, cumLoi, soLan: hInt(`lc${xn.ma}${t.ma}${maLoi}`, 0, 8) * n,
    }))));
  },
  doanhThuNgay: ({ xnNum, tuNgay, denNgay }) => datesBetween(tuNgay, denNgay).map((d, i) => {
    const keHoach = hInt(`dtk${xnNum}${d}`, 30000, 45000);
    const thucHien = Math.floor(keHoach * (0.75 + hash(`dtt${xnNum}${d}`) * 0.35));
    return { id: i + 1, ngay: d, keHoach, thucHien, conLai: keHoach - thucHien };
  }),
  // ---- Nhập xuất tồn theo điều tiết ----
  dtPhieu: ({ lenhSX: lenh }) => dieuTiet.filter((p) => p.lenhSX === lenh).map((p) => ({ id: p.id, loaiNL: p.loaiNL })),
  dtTacNghiep: ({ lenhSX: lenh }) => {
    const ids = new Set(dieuTiet.filter((p) => p.lenhSX === lenh).map((p) => p.id));
    return tacNghiep.filter((t) => ids.has(t.idPhieu));
  },
  dtBanMay: ({ lenhSX: lenh }) => {
    const ids = new Set(dieuTiet.filter((p) => p.lenhSX === lenh).map((p) => p.id));
    const groups = new Map();
    banMay.filter((b) => ids.has(b.idPhieu)).forEach((b) => {
      const tems = tem.filter((t) => t.idBanMay === b.idBanMay);
      if (!tems.length) return;
      const key = [b.idPhieu, b.mau, b.size].join('|');
      const g = groups.get(key) || { idPhieu: b.idPhieu, mau: b.mau, size: b.size, soBo: 0, slCat: 0, slXuat: 0 };
      g.soBo++; g.slCat += b.soLuong; g.slXuat += Math.min(...tems.map((t) => t.slXuat));
      groups.set(key, g);
    });
    return [...groups.values()];
  },
  dtChiTiet: ({ lenhSX: lenh, mau, size, loaiNL }) => {
    const groups = new Map();
    tem.filter((t) => t.lenhSX === lenh && (mau === '*' || t.mau === mau) && t.size === size && (!loaiNL || t.loaiNL === loaiNL)).forEach((t) => {
      const key = `${t.loaiNL}|${t.chiTiet}`;
      const g = groups.get(key) || { loaiNL: t.loaiNL, chiTiet: t.chiTiet, soTem: 0, slCat: 0, slXuat: 0 };
      g.soTem++; g.slCat += t.soLuong; g.slXuat += t.slXuat;
      groups.set(key, g);
    });
    return [...groups.values()].map((g) => ({ ...g, slTon: g.slCat - g.slXuat }));
  },
  dtPhieuCap: ({ lenhSX: lenh, mau, size, loaiNL }) => {
    const groups = new Map();
    const tems = new Map(tem.filter((t) => t.lenhSX === lenh && (mau === '*' || t.mau === mau) && t.size === size && (!loaiNL || t.loaiNL === loaiNL)).map((t) => [t.barcode, t]));
    const temMoiBo = (id) => tem.filter((t) => t.idBanMay === id).length;
    quetXuat.filter((x) => tems.has(x.barcode)).forEach((x) => {
      const t = tems.get(x.barcode);
      const key = `${x.soPhieu}|${t.loaiNL}`;
      const pc = phieuCap.find((p) => p.soPhieu === x.soPhieu);
      const ct = phieuCapCT.find((c) => c.soPhieu === x.soPhieu && c.mau === x.mau && c.size === x.size) || {};
      const g = groups.get(key) || {
        soPhieuCap: x.soPhieu, loaiNL: t.loaiNL, xn: pc.xnCode, maTo: pc.to, po: ct.po, sizeDat: ct.size, slDat: ct.slDat,
        soTem: 0, bo: new Map(), tuLuc: x.thoiGianXuat, denLuc: x.thoiGianXuat,
      };
      g.soTem++;
      const b = g.bo.get(t.idBanMay) || { n: 0, min: Infinity };
      b.n++; b.min = Math.min(b.min, x.soLuong);
      g.bo.set(t.idBanMay, b);
      if (x.thoiGianXuat < g.tuLuc) g.tuLuc = x.thoiGianXuat;
      if (x.thoiGianXuat > g.denLuc) g.denLuc = x.thoiGianXuat;
      groups.set(key, g);
    });
    return [...groups.values()].map(({ bo, ...g }) => ({
      ...g, soBo: bo.size, slSP: [...bo.entries()].reduce((s, [id, b]) => s + (b.n >= temMoiBo(id) ? b.min : 0), 0),
    }));
  },
};
