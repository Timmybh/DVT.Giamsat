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

  const o = (nhan, v) => (v == null || v === '' ? '' : `<div><span>${nhan}</span><b>${App.esc(v)}</b></div>`);
  const bangGC = (gc) => (gc.length ? `<div class="bang"><table class="bang-cb"><thead><tr><th>Phiếu GC</th><th>Đơn vị</th><th>Loại / mã GC</th><th>Tem gia công</th><th>SL xuất</th><th>Lúc xuất</th><th>Người xuất</th><th>SL nhận</th><th>Lúc nhận</th><th>Người nhận</th></tr></thead><tbody>
    ${gc.map((g) => `<tr><td>${App.esc(g.maPhieu)}</td><td>${App.esc(g.donVi)}</td><td>${App.esc([g.loaiGC, g.maGC].filter(Boolean).join(' / '))}</td><td>${App.esc(g.temGC)}</td>
      <td>${App.num(g.slXuat)}</td><td>${App.datetime(g.thoiGianXuat)}</td><td>${App.esc(g.nguoiXuat)}</td><td>${App.num(g.slNhan)}</td>
      <td>${App.datetime(g.thoiGianNhan) || '<span class="tag warn">Chưa nhận</span>'}</td><td>${App.esc(g.nguoiNhan)}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">Tem không đi gia công</div>');
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
          ${o('Loại NL', t.loaiNL)}${o('Chi tiết', t.chiTiet || (t.loaiTem.startsWith('Tem BTP') ? 'Thân chính' : ''))}${o('Size', t.size)}
          ${o('Màu SP', t.mau)}${o('Màu vải', t.mauVai)}${o('Bàn cắt', t.banCat)}
          ${o('Bàn may', t.banMay)}${o('Phiếu hoạch toán', t.phieuHoachToan)}${o('Vị trí', t.viTri)}
          ${o('Phòng ban', t.phongBan)}${o('Ngày tạo', App.datetime(t.ngayTao))}${o('SL tem', App.num(t.slTem))}
          ${o('SL thực xuất', App.num(t.slThucXuat))}${o('Tồn', App.num(ton))}
        </div>
        <div class="qr-tieu">Gia công (${(gcCua.get(up(t.barcode)) || []).length})</div>
        ${bangGC(gcCua.get(up(t.barcode)) || [])}
        <div class="qr-tieu">Lượt xuất cho may (${xuat.length})</div>
        ${xuat.length ? `<div class="bang"><table class="bang-cb"><thead><tr><th>Phiếu cấp</th><th>Tem xuất</th><th>Tem cấp</th><th>PO</th><th>Size</th><th>XN / tổ</th><th>SL xuất</th><th>Lúc xuất</th><th>Người xuất</th><th>SL nhận</th><th>Lúc nhận</th></tr></thead><tbody>
          ${xuat.map((r) => `<tr><td>${App.esc(r.soPhieuCap)}</td><td>${App.esc(r.temBTPXuat)}</td><td>${App.esc(r.temXuat)}</td><td>${App.esc(r.po)}</td><td>${App.esc(r.sizeDat)}</td>
            <td>${App.esc([r.xn, r.maTo].filter(Boolean).join(' / '))}</td><td>${App.num(r.slXuat)}</td><td>${App.datetime(r.thoiGianXuat)}</td>
            <td>${App.esc(r.nguoiXuat)}</td><td>${App.num(r.slNhan)}</td><td>${App.datetime(r.thoiGianNhan) || '<span class="tag warn">Chưa nhận</span>'}</td></tr>`).join('')}
          </tbody></table></div>` : '<div class="empty">Tem chưa xuất cho may</div>'}
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
      const { rows, giaCong = [] } = await App.api('tem-tra', { ma });
      ketQua.innerHTML = rows.length || giaCong.length ? veTem(ma, rows, giaCong)
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
  const dong = () => { hop.hidden = true; };
  $('qrDong').onclick = dong;
  hop.addEventListener('click', (e) => { if (e.target === hop) dong(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !hop.hidden) dong(); });
  // Bấm nút QR: mở hộp và mở luôn camera chụp ảnh (cùng lần bấm nên trình duyệt cho mở)
  $('nutQR').onclick = () => { hop.hidden = false; chupMoi(); };
})();
