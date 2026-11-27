// Tra tem bằng ảnh chụp (trang tổ trưởng may): bấm nút QR mở camera của máy để chụp tem (chạy được trên trang http:// trong LAN,
// camera trực tiếp thì trình duyệt đòi HTTPS), đọc QR / mã vạch trong ảnh, tra /api/tem-tra rồi hiện thông tin tem.
// Có ô gõ / bắn mã bằng súng quét.
(() => {
  const $ = (id) => document.getElementById(id);
  const hop = $('hopQR');
  const trangThai = $('qrTrangThai');
  const ketQua = $('qrKetQua');
  const nhap = $('qrNhap');
  const chup = $('qrChup');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let dangTra = false;
  const detector = (() => {
    try { return 'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'data_matrix', 'ean_13'] }) : null; } catch (e) { return null; }
  })();

  // Đọc mã từ 1 khung hình (video hoặc ảnh): BarcodeDetector nếu trình duyệt có (đọc cả mã vạch 1D), không thì jsQR (chỉ QR)
  async function docMa(nguon, w, h) {
    if (detector) {
      try { const ds = await detector.detect(nguon); if (ds.length) return ds[0].rawValue; } catch (e) { /* thử jsQR */ }
    }
    if (!w || !h) return null;
    const tile = Math.min(1, 1000 / Math.max(w, h));
    canvas.width = Math.round(w * tile); canvas.height = Math.round(h * tile);
    ctx.drawImage(nguon, 0, 0, canvas.width, canvas.height);
    const anh = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const r = window.jsQR && window.jsQR(anh.data, anh.width, anh.height, { inversionAttempts: 'attemptBoth' });
    return r ? r.data : null;
  }

  const o = (nhan, v, cls = '') => (v == null || v === '' ? '' : `<div${cls ? ` class="${cls}"` : ''}><span>${nhan}</span><b>${App.esc(v)}</b></div>`);
  // Thẻ lượt xuất / gia công (dễ xem trên điện thoại thay cho lưới)
  const daNhan = (t) => (t ? '<span class="tag ok">Đã nhận</span>' : '<span class="tag warn">Chưa nhận</span>');
  const bangGC = (gc) => (gc.length ? `<div class="qr-the-ds">${gc.map((g) => `<div class="qr-the">
      <div class="qr-the-dau"><b>${App.esc(g.maPhieu || 'Phiếu GC')}</b> ${daNhan(g.thoiGianNhan)}</div>
      <div class="qr-o qr-o-nho">
        ${o('Đơn vị', g.donVi)}${o('Loại / mã GC', [g.loaiGC, g.maGC].filter(Boolean).join(' / '))}${o('Tem gia công', g.temGC)}
        ${o('SL xuất', App.num(g.slXuat))}${o('Lúc xuất', App.datetime(g.thoiGianXuat))}${o('Người xuất', g.nguoiXuat)}
        ${o('SL nhận', App.num(g.slNhan))}${o('Lúc nhận', App.datetime(g.thoiGianNhan))}${o('Người nhận', g.nguoiNhan)}
      </div></div>`).join('')}</div>` : '<div class="empty">Tem không đi gia công</div>');
  const theXuat = (xuat) => `<div class="qr-the-ds">${xuat.map((r) => `<div class="qr-the">
      <div class="qr-the-dau"><b>${App.esc(r.soPhieuCap || 'Phiếu cấp')}</b>${r.xn || r.maTo ? ` · ${App.esc([r.xn, r.maTo && `Tổ ${r.maTo}`].filter(Boolean).join(' / '))}` : ''} ${daNhan(r.thoiGianNhan)}</div>
      <div class="qr-o qr-o-nho">
        ${o('PO', r.po, 'o-vien')}${o('Size', r.sizeDat)}${o('SL xuất', App.num(r.slXuat))}
        ${o('Lúc xuất', App.datetime(r.thoiGianXuat))}${o('Người xuất', r.nguoiXuat)}${o('SL nhận', App.num(r.slNhan))}
        ${o('Lúc nhận', App.datetime(r.thoiGianNhan))}${o('Tem xuất', r.temBTPXuat)}${o('Tem cấp', r.temXuat)}
      </div>${r.khCanhBao ? `<div class="qr-canh-bao">⚠ ${App.esc(r.khCanhBao)}${r.khTo ? ` <span>(đã có KH: ${App.esc(r.khTo)})</span>` : ''}</div>` : ''}</div>`).join('')}</div>`;
  // Màu SP = MauSP trên tem; Màu vải: CUTTING_TemBarcode_Mau (tem nhiều màu vải ghi "23B/ GRAY DUST;77B/ NIGHT FOREST"), không có thì MauVai trên tem
  const tach = (v) => [...new Set(String(v ?? '').split(';').map((x) => x.trim()).filter(Boolean))];
  // Màu SP: MauSP trên tem + bảng nối CUTTING_PhieuHoachToan_Mau ("vải=SP; ...") lọc theo các màu vải của tem
  const mauSPTuMap = (map, vais) => {
    const co = new Set(vais.map((v) => v.toUpperCase()));
    return String(map || '').split(';').map((x) => x.split('=')).filter(([v, sp]) => sp && co.has(String(v).trim().toUpperCase())).map(([, sp]) => sp.trim());
  };
  const mauSPCua = (t) => tach([t.mau, ...mauSPTuMap(t.mapMau, mauVaiCua(t))].filter(Boolean).join(';'));
  const mauVaiCua = (t) => { const ds = tach(t.dsMau); return ds.length ? ds : tach(t.mauVai); };
  const oMau = (nhan, ds) => (!ds.length ? '' : `<div class="qr-mau"><span>${nhan}${ds.length > 1 ? ` (${ds.length} màu)` : ''}</span><div>${ds.map((m) => `<b class="chip-mau">${App.esc(m)}</b>`).join('')}</div></div>`);
  // Tem LOT (tách cây): thẻ gọn như in trên tem (kèm màu, SL, tồn của tem cha), bên dưới là các lượt xuất của tem cha
  function veLot(lot, rows, giaCong) {
    const up = (v) => String(v ?? '').trim().toUpperCase();
    return lot.map((c) => {
      const ds = rows.filter((r) => up(r.barcode) === up(c.barcode));
      const t = ds[0] || {};
      const ton = t.slTem == null ? null : Number(t.slTem || 0) - Number(t.slThucXuat || 0);
      const xuat = ds.filter((r) => r.soPhieuCap || r.thoiGianXuat);
      const gc = giaCong.filter((g) => up(g.temBTP) === up(c.barcode));
      return `<div class="qr-tem qr-lot">
        <div class="qr-tem-dau"><span class="tag">Tem LOT</span> <b>${App.esc(c.code)}</b> <span class="loc-dem">tem cha ${App.esc(c.barcode)}</span></div>
        <div class="qr-o">
          ${o('Mã hàng', c.maHang)}${o('Lệnh SX', c.lenhSX)}${o('Size', c.size)}
          ${o('Bàn may', c.banMay)}${o('Cây', c.cay)}${o('Số lớp', App.num(c.soLop))}
          ${o('Lot', c.lot)}${o('Loại', c.part || c.chiTiet)}${o('Loại NL', c.loaiNL || t.loaiNL)}
          ${o('SL tem', App.num(t.slTem))}${o('Đã xuất', App.num(t.slThucXuat))}${o('Tồn', App.num(ton))}
        </div>
        ${t.barcode ? oMau('Màu SP', mauSPCua(t)) + oMau('Màu vải', mauVaiCua(t)) : ''}
        <div class="qr-tieu">Lượt xuất cho may (${xuat.length})</div>
        ${xuat.length ? theXuat(xuat) : '<div class="empty">Tem chưa xuất cho may</div>'}
        ${gc.length ? `<div class="qr-tieu">Gia công (${gc.length})</div>${bangGC(gc)}` : ''}
      </div>`;
    }).join('');
  }
  // Kế hoạch phân bổ (tổ x PO) của lệnh trên tem, mỗi PO 1 thẻ
  function veKeHoach(kh) {
    if (!kh.length) return '';
    const theoPO = new Map();
    kh.forEach((r) => { const k = `${r.lenhSX}|${r.po}`; (theoPO.get(k) || theoPO.set(k, []).get(k)).push(r); });
    return `<div class="qr-tem qr-kh"><div class="qr-tem-dau"><span class="tag">Phân bổ kế hoạch</span> <b>${App.esc([...new Set(kh.map((r) => r.lenhSX))].join(', '))}</b></div>
      <div class="qr-the-ds">${[...theoPO.values()].map((ds) => {
        const r0 = ds[0];
        const coKH = ds.filter((r) => r.maTo);
        return `<div class="qr-the"><div class="qr-the-dau">PO <b>${App.esc(r0.po)}</b> <span class="loc-dem">SL lệnh ${App.num(r0.slLenh)}</span>
          ${coKH.length ? '' : '<span class="tag warn">Chưa phân bổ</span>'}</div>
          ${coKH.map((r) => `<div class="qr-kh-dong"><b>Tổ ${App.esc(r.maTo)}</b> <span class="loc-dem">${App.esc(r.xn || '')}</span>
            <span>SL KH <b>${App.num(r.slKH)}</b></span><span class="loc-dem">${App.date(r.ngayBatDau)} → ${App.date(r.ngayKetThuc)}</span></div>`).join('')}</div>`;
      }).join('')}</div></div>`;
  }
  function veTem(ma, rows, giaCong = []) {
    const up = (v) => String(v ?? '').trim().toUpperCase();
    const theoTem = new Map();
    rows.forEach((r) => (theoTem.get(r.barcode) || theoTem.set(r.barcode, []).get(r.barcode)).push(r));
    const gcCua = new Map();
    giaCong.forEach((g) => (gcCua.get(up(g.temBTP)) || gcCua.set(up(g.temBTP), []).get(up(g.temBTP))).push(g));
    const laGoc = [...theoTem.keys()].some((b) => up(b) === up(ma));
    const gcQuet = giaCong.find((g) => up(g.temGC) === up(ma));
    const dau = laGoc ? ''
      : gcQuet ? `<div class="qr-ghi">Mã <b>${App.esc(ma)}</b> là tem gia công (${App.esc([gcQuet.loaiGC, gcQuet.donVi].filter(Boolean).join(' · '))}) của tem BTP <b>${App.esc(gcQuet.temBTP)}</b>:</div>`
        : `<div class="qr-ghi">Mã <b>${App.esc(ma)}</b> là tem cấp BTP mới, gồm ${theoTem.size} tem BTP:</div>`;
    // Có lượt gia công mà không thấy tem BTP gốc trong bảng tem cắt: vẫn hiện bảng gia công
    const leGC = [...gcCua.keys()].filter((k) => ![...theoTem.keys()].some((b) => up(b) === k));
    const theLe = leGC.map((k) => `<div class="qr-tem"><div class="qr-tem-dau"><span class="tag">Tem gia công</span> <b>${App.esc(k)}</b></div>
      <div class="qr-tieu">Gia công (${gcCua.get(k).length})</div>${bangGC(gcCua.get(k))}</div>`).join('');
    return dau + theLe + [...theoTem.values()].map((ds) => {
      const t = ds[0];
      const ton = t.slTem == null ? null : Number(t.slTem || 0) - Number(t.slThucXuat || 0);
      const xuat = ds.filter((r) => r.soPhieuCap || r.thoiGianXuat);
      return `<div class="qr-tem">
        <div class="qr-tem-dau"><span class="tag">${App.esc(t.loaiTem)}</span> <b>${App.esc(t.barcode)}</b></div>
        <div class="qr-o">
          ${o('Lệnh SX', t.lenhSX)}${o('Mã hàng', t.maHang)}${o('Mùa', t.mua)}
          ${o('Loại NL', t.loaiNL)}${o('Chi tiết', t.chiTiet)}${o('Size', t.size)}
          ${o('Bàn cắt', t.banCat)}
          ${o('Bàn may', t.banMay)}${o('Phiếu hoạch toán', t.phieuHoachToan)}${o('Vị trí', t.viTri)}
          ${o('Phòng ban', t.phongBan)}${o('Ngày tạo', App.datetime(t.ngayTao))}${o('SL tem', App.num(t.slTem))}
          ${o('SL thực xuất', App.num(t.slThucXuat))}${o('Tồn', App.num(ton))}
        </div>
        ${oMau('Màu SP', mauSPCua(t))}${oMau('Màu vải', mauVaiCua(t))}
        <div class="qr-tieu">Gia công (${(gcCua.get(up(t.barcode)) || []).length})</div>
        ${bangGC(gcCua.get(up(t.barcode)) || [])}
        <div class="qr-tieu">Lượt xuất cho may (${xuat.length})</div>
        ${xuat.length ? theXuat(xuat) : '<div class="empty">Tem chưa xuất cho may</div>'}
      </div>`;
    }).join('');
  }

  async function traTem(ma) {
    ma = String(ma || '').trim();
    if (!ma || dangTra) return;
    dangTra = true;
    nhap.value = ma;
    trangThai.innerHTML = `Mã đọc được: <b>${App.esc(ma)}</b>`;
    ketQua.innerHTML = '<div class="empty">Đang tra tem…</div>';
    try {
      const { rows, giaCong = [], lot = [], keHoach = [], maTra = ma } = await App.api('tem-tra', { ma });
      ketQua.innerHTML = rows.length || giaCong.length || lot.length
        ? (lot.length ? veLot(lot, rows, giaCong) + veKeHoach(keHoach) : veKeHoach(keHoach) + veTem(maTra, rows, giaCong))
        : `<div class="empty">Không tìm thấy tem <b>${App.esc(ma)}</b> trong tem BTP cắt, tem tổng hợp, tem cấp mới và tem gia công.</div>`;
    } catch (e) {
      App.error(ketQua, e);
    } finally {
      dangTra = false;
    }
  }

  // Ảnh chụp bằng camera của máy (dùng được cả trang http://)
  chup.addEventListener('change', async () => {
    const f = chup.files && chup.files[0];
    chup.value = '';
    if (!f) return;
    trangThai.textContent = 'Đang đọc ảnh…';
    try {
      const anh = await createImageBitmap(f);
      const ma = await docMa(anh, anh.width, anh.height);
      if (ma) traTem(ma);
      else trangThai.textContent = 'Không đọc được mã trong ảnh, chụp lại gần và rõ hơn.';
    } catch (e) { trangThai.textContent = `Không đọc được ảnh: ${e.message}`; }
  });

  $('qrTra').onclick = () => traTem(nhap.value);
  nhap.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); traTem(nhap.value); } });
  const chupMoi = () => { nhap.value = ''; ketQua.innerHTML = ''; trangThai.textContent = 'Chụp rõ mã QR của tem'; chup.click(); };
  $('qrQuetLai').onclick = chupMoi;
  const noi = hop.classList.contains('qr-noi'); // trang riêng /role/quet-tem.html: hộp nằm sẵn trong trang, không đóng
  const dong = () => { if (!noi) hop.hidden = true; };
  $('qrDong').onclick = dong;
  hop.addEventListener('click', (e) => { if (e.target === hop) dong(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !hop.hidden) dong(); });
  // Bấm nút QR: mở hộp và mở luôn camera chụp ảnh (cùng lần bấm nên trình duyệt cho mở)
  $('nutQR').onclick = () => { hop.hidden = false; chupMoi(); };
})();
