// Quét tem bằng camera (trang tổ trưởng may): mở hộp #hopQR, quét QR / mã vạch, tra /api/tem-tra rồi hiện thông tin tem.
// Camera trực tiếp cần trang HTTPS hoặc localhost; trang http:// trong LAN thì dùng nút "Chụp ảnh tem" (mở camera của máy, đọc QR từ ảnh)
// hoặc gõ / bắn mã bằng súng quét vào ô nhập.
(() => {
  const $ = (id) => document.getElementById(id);
  const hop = $('hopQR');
  const video = $('qrVideo');
  const vung = $('qrVung');
  const trangThai = $('qrTrangThai');
  const ketQua = $('qrKetQua');
  const nhap = $('qrNhap');
  const chup = $('qrChup');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let stream = null;
  let hen = null;
  let dangTra = false;
  const coCamera = !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
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

  function tatCamera() {
    clearTimeout(hen); hen = null;
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    video.srcObject = null;
    vung.hidden = true;
  }

  async function batCamera() {
    ketQua.innerHTML = '';
    if (!coCamera) {
      vung.hidden = true;
      trangThai.innerHTML = 'Trang đang mở bằng http:// nên trình duyệt không cho bật camera trực tiếp. Bấm <b>Chụp ảnh tem</b> để chụp bằng camera của máy, hoặc gõ mã tem.';
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
    } catch (e) {
      trangThai.textContent = `Không bật được camera (${e.name || e.message}). Bấm Chụp ảnh tem hoặc gõ mã tem.`;
      return;
    }
    video.srcObject = stream;
    await video.play().catch(() => {});
    vung.hidden = false;
    trangThai.textContent = 'Đưa mã QR của tem vào khung';
    const vong = async () => {
      if (!stream) return;
      const ma = video.readyState >= 2 ? await docMa(video, video.videoWidth, video.videoHeight) : null;
      if (ma) { if (navigator.vibrate) navigator.vibrate(80); tatCamera(); traTem(ma); return; }
      hen = setTimeout(vong, 150);
    };
    vong();
  }

  const o = (nhan, v) => (v == null || v === '' ? '' : `<div><span>${nhan}</span><b>${App.esc(v)}</b></div>`);
  function veTem(ma, rows) {
    const theoTem = new Map();
    rows.forEach((r) => (theoTem.get(r.barcode) || theoTem.set(r.barcode, []).get(r.barcode)).push(r));
    const capMoi = !theoTem.has(ma) && ![...theoTem.keys()].some((b) => b.toUpperCase() === ma.toUpperCase());
    const dau = capMoi ? `<div class="qr-ghi">Mã <b>${App.esc(ma)}</b> là tem cấp BTP mới, gồm ${theoTem.size} tem BTP:</div>` : '';
    return dau + [...theoTem.values()].map((ds) => {
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
        <div class="qr-tieu">Lượt xuất cho may (${xuat.length})</div>
        ${xuat.length ? `<div class="bang"><table class="bang-cb"><thead><tr><th>Phiếu cấp</th><th>Tem cấp</th><th>PO</th><th>Size</th><th>XN / tổ</th><th>SL xuất</th><th>Lúc xuất</th><th>Người xuất</th><th>SL nhận</th><th>Lúc nhận</th></tr></thead><tbody>
          ${xuat.map((r) => `<tr><td>${App.esc(r.soPhieuCap)}</td><td>${App.esc(r.temXuat)}</td><td>${App.esc(r.po)}</td><td>${App.esc(r.sizeDat)}</td>
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
    trangThai.innerHTML = `Mã quét được: <b>${App.esc(ma)}</b>`;
    ketQua.innerHTML = '<div class="empty">Đang tra tem…</div>';
    try {
      const { rows } = await App.api('tem-tra', { ma });
      ketQua.innerHTML = rows.length ? veTem(ma, rows)
        : `<div class="empty">Không tìm thấy tem <b>${App.esc(ma)}</b> trong tem BTP cắt / tem tổng hợp. Tem gia công chưa tra được (đang khảo sát bảng dữ liệu).</div>`;
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
  $('qrQuetLai').onclick = () => { tatCamera(); nhap.value = ''; batCamera(); };
  const dong = () => { tatCamera(); hop.hidden = true; };
  $('qrDong').onclick = dong;
  hop.addEventListener('click', (e) => { if (e.target === hop) dong(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !hop.hidden) dong(); });
  $('nutQR').onclick = () => { hop.hidden = false; nhap.value = ''; batCamera(); };
})();
