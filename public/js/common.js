// Tiện ích dùng chung cho mọi trang
const App = {
  get xn() {
    return new URLSearchParams(location.search).get('xn') || localStorage.getItem('xn') || '';
  },
  set xn(v) { localStorage.setItem('xn', v); },

  async api(path, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`/api/${path}${qs ? '?' + qs : ''}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  },

  // Gắn header: tên ứng dụng, đường dẫn, chọn xí nghiệp
  async header(crumbs = [], onXnChange) {
    const h = document.createElement('header');
    h.innerHTML = `
      <a class="brand" href="/">DVT Giám sát</a>
      <div class="crumbs">${crumbs.map(([t, u]) => (u ? `<a href="${u}">${t}</a>` : t)).join(' › ')}</div>
      <span id="mock"></span>
      <label>Xí nghiệp: <select id="xnSelect"></select></label>`;
    document.body.prepend(h);
    const f = document.createElement('footer');
    f.className = 'chan-trang';
    f.textContent = 'Author Nguyễn Vĩnh Thịnh - Phòng IT - Dovitec';
    document.body.appendChild(f);
    const sel = h.querySelector('#xnSelect');
    const [list, status] = await Promise.all([App.api('xi-nghiep'), App.api('status')]);
    if (status.mock) h.querySelector('#mock').innerHTML = '<span class="mock-badge">Dữ liệu mẫu</span>';
    sel.innerHTML = list.map((x) => `<option value="${x.ma}">${x.ten}</option>`).join('');
    if (!list.some((x) => x.ma === App.xn) && list.length) App.xn = list[0].ma;
    sel.value = App.xn;
    App.xn = sel.value;
    sel.onchange = () => { App.xn = sel.value; onXnChange && onXnChange(sel.value); };
    return sel.value;
  },

  num: (v) => (v == null ? '' : Number(v).toLocaleString('vi-VN')),
  date: (v) => (v ? new Date(v).toLocaleDateString('vi-VN') : ''),
  datetime: (v) => (v ? new Date(v).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : ''),
  pct: (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '-'),
  pctTag: (a, b) => {
    if (!b) return '<span class="tag">-</span>';
    const p = (a / b) * 100;
    return `<span class="tag ${p >= 100 ? 'ok' : p >= 85 ? 'warn' : 'bad'}">${p.toFixed(0)}%</span>`;
  },
  // Ô số liệu: cards(el, [{ label, value, sub }])
  cards(el, items) {
    el.innerHTML = items.map((c) => `<div class="card"><div class="label">${c.label}</div><div class="value">${c.value}</div>${c.sub ? `<div class="sub">${c.sub}</div>` : ''}</div>`).join('');
  },
  // Ngày theo giờ máy người xem (YYYY-MM-DD)
  ymd: (v) => { const d = new Date(v); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); },
  today: () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); },
  esc: (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),

  // Vẽ bảng. cols: [{ key, label, type: 'num'|'date'|'datetime', render(row), sum, value(row), total(rows) }]
  // sum: cộng cột (theo value(row) nếu có); total(rows): HTML tự tính cho ô tổng.
  // footer: dòng tổng hiện ngay dưới tiêu đề và ở cuối bảng (tính trên các dòng đang hiện).
  // filter (mặc định bật, filter: false để tắt): mỗi cột có nút ▾ để lọc giá trị / sắp xếp như Excel. Bộ lọc giữ nguyên khi vẽ lại cùng bảng.
  // chonCot: 'khóa' -> nút chọn cột hiển thị, nhớ theo máy (cột có an: true mặc định ẩn).
  // coDinh: số cột đầu đứng yên khi cuộn ngang. onData(data): gọi lại với các dòng đang hiện sau khi lọc.
  table(el, cols, rows, opts = {}) {
    el._tbl = { cols, rows, opts };
    if (!el._loc || el._loc.cols !== cols.map((c) => c.key).join('|')) el._loc = { cols: cols.map((c) => c.key).join('|'), an: {}, sort: null };
    if (opts.chonCot && !el._hien) {
      let luu = null;
      try { luu = JSON.parse(localStorage.getItem(`cot:${opts.chonCot}`)); } catch (e) { /* bỏ qua */ }
      el._hien = new Set(luu || cols.filter((c) => !c.an).map((c) => c.key));
    }
    App._veBang(el);
  },

  // Chữ hiển thị của 1 ô (dùng cho bộ lọc)
  _chu(c, r) {
    if (c.type === 'num') return App.num(c.value ? c.value(r) : r[c.key]);
    if (c.type === 'date') return App.date(r[c.key]);
    if (c.type === 'datetime') return App.datetime(r[c.key]);
    if (c.render) { const d = document.createElement('div'); d.innerHTML = c.render(r); return d.textContent; }
    return String(r[c.key] ?? '');
  },

  _veBang(el) {
    const { cols: tatCaCot, rows, opts: { onClick, empty = 'Không có dữ liệu', footer, filter = true, maxRows, chonCot, coDinh, onData } } = el._tbl;
    if (!rows.length) { el.innerHTML = `<div class="empty">${empty}</div>`; if (onData) onData([]); return; }
    // Bộ lọc giữ theo vị trí trong tatCaCot; cols chỉ gồm các cột đang hiện
    const viTri = new Map(tatCaCot.map((c, i) => [c, i]));
    const cols = el._hien ? tatCaCot.filter((c) => el._hien.has(c.key)) : tatCaCot;
    const loc = el._loc;
    let data = rows.filter((r) => tatCaCot.every((c, i) => !loc.an[i] || !loc.an[i].has(App._chu(c, r))));
    if (loc.sort) {
      const c = tatCaCot[loc.sort.i];
      const v = (r) => (c.value ? c.value(r) : r[c.key]);
      const cmp = c.type === 'num' ? (a, b) => Number(v(a) || 0) - Number(v(b) || 0)
        : (c.type === 'date' || c.type === 'datetime') ? (a, b) => new Date(v(a) || 0) - new Date(v(b) || 0)
          : (a, b) => App._chu(c, a).localeCompare(App._chu(c, b), 'vi', { numeric: true });
      data = [...data].sort((a, b) => cmp(a, b) * loc.sort.dir);
    }
    const cell = (c, r) => {
      if (c.render) return c.render(r);
      if (c.type === 'num') return App.num(r[c.key]);
      if (c.type === 'date') return App.date(r[c.key]);
      if (c.type === 'datetime') return App.datetime(r[c.key]);
      return App.esc(r[c.key]);
    };
    const dangLoc = Object.values(loc.an).some((x) => x && x.size);
    let totalRow = '';
    if (footer) {
      totalRow = `<tr class="total-row">${cols.map((c, i) => {
        if (c.total) return `<th>${c.total(data)}</th>`;
        if (c.sum) return `<th class="num">${App.num(data.reduce((s, r) => s + Number((c.value ? c.value(r) : r[c.key]) || 0), 0))}</th>`;
        return i === 0 ? `<th title="${App.num(data.length)} dòng">Tổng${dangLoc ? ` <span class="loc-dem">(${App.num(data.length)}/${App.num(rows.length)} dòng)</span>` : ''}</th>` : '<th></th>';
      }).join('')}</tr>`;
    }
    const head = cols.map((c) => {
      const i = viTri.get(c);
      const nut = filter ? `<button class="loc-nut${(loc.an[i] && loc.an[i].size) || (loc.sort && loc.sort.i === i) ? ' on' : ''}" data-c="${i}" title="Lọc / sắp xếp">${loc.sort && loc.sort.i === i ? (loc.sort.dir > 0 ? '▲' : '▼') : '▾'}</button>` : '';
      return `<th class="${c.type === 'num' ? 'num' : ''}">${c.label}${nut}</th>`;
    }).join('');
    const dangAn = tatCaCot.length - cols.length;
    const thanhCot = chonCot ? `<div class="thanh-bang"><button class="nut-cot">Cột hiển thị (${cols.length}/${tatCaCot.length}) ▾</button>${dangAn ? `<span class="loc-dem">${dangAn} cột đang ẩn</span>` : ''}</div>` : '';
    el.innerHTML = `${thanhCot}<div class="table-wrap"><table>
      <thead><tr>${head}</tr>${totalRow}</thead>
      <tbody>${data.length ? (maxRows ? data.slice(0, maxRows) : data).map((r, i) => `<tr data-i="${i}" class="${onClick ? 'clickable' : ''}">${cols.map((c) => `<td class="${c.type === 'num' ? 'num' : ''}">${cell(c, r)}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${cols.length}" class="empty">Không có dòng nào khớp bộ lọc</td></tr>`}
      ${maxRows && data.length > maxRows ? `<tr><td colspan="${cols.length}" class="empty">Đang hiện ${App.num(maxRows)} / ${App.num(data.length)} dòng. Lọc cột để thu hẹp; dòng Tổng vẫn tính đủ ${App.num(data.length)} dòng.</td></tr>` : ''}</tbody>
      ${totalRow ? `<tfoot>${totalRow}</tfoot>` : ''}</table></div>`;
    if (onClick) {
      el.querySelectorAll('tbody tr[data-i]').forEach((tr) => tr.addEventListener('click', () => {
        el.querySelectorAll('tr.selected').forEach((x) => x.classList.remove('selected'));
        tr.classList.add('selected');
        onClick(data[tr.dataset.i]);
      }));
    }
    const th = el.querySelector('thead tr:first-child th');
    if (th) el.style.setProperty('--th-cao', `${th.offsetHeight}px`);
    if (coDinh) {
      const ths = [...el.querySelectorAll('thead tr:first-child th')].slice(0, coDinh);
      let trai = 0;
      ths.forEach((h, k) => {
        el.querySelectorAll(`tr > :nth-child(${k + 1})`).forEach((o) => { o.classList.add('co-dinh'); o.style.left = `${trai}px`; });
        trai += h.offsetWidth;
      });
    }
    if (chonCot) el.querySelector('.nut-cot').onclick = (e) => { e.stopPropagation(); App._moCot(el, e.target); };
    if (onData) onData(data);
    el.querySelectorAll('.loc-nut').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); App._moLoc(el, Number(b.dataset.c), b); }));
  },

  // Hộp chọn cột hiển thị
  _moCot(el, nut) {
    document.querySelectorAll('.loc-hop').forEach((x) => x.remove());
    const { cols, opts } = el._tbl;
    const hop = document.createElement('div');
    hop.className = 'loc-hop';
    hop.innerHTML = `<div class="loc-ds" style="max-height:360px">${cols.map((c) => `<label><input type="checkbox" value="${c.key}"${el._hien.has(c.key) ? ' checked' : ''}> ${c.label}</label>`).join('')}</div>
      <div class="loc-cuoi"><button class="phu" data-md>Mặc định</button><button data-ok>OK</button></div>`;
    document.body.appendChild(hop);
    const r = nut.getBoundingClientRect();
    hop.style.top = `${r.bottom + window.scrollY + 4}px`;
    hop.style.left = `${r.left + window.scrollX}px`;
    const dong = () => { hop.remove(); document.removeEventListener('mousedown', ngoai); };
    const ngoai = (e) => { if (!hop.contains(e.target)) dong(); };
    setTimeout(() => document.addEventListener('mousedown', ngoai));
    const luu = (keys) => {
      el._hien = new Set(keys);
      try { localStorage.setItem(`cot:${opts.chonCot}`, JSON.stringify(keys)); } catch (e) { /* bỏ qua */ }
      dong(); App._veBang(el);
    };
    hop.querySelector('[data-ok]').onclick = () => luu([...hop.querySelectorAll('input:checked')].map((x) => x.value));
    hop.querySelector('[data-md]').onclick = () => {
      try { localStorage.removeItem(`cot:${opts.chonCot}`); } catch (e) { /* bỏ qua */ }
      el._hien = new Set(cols.filter((c) => !c.an).map((c) => c.key));
      dong(); App._veBang(el);
    };
  },

  // Hộp lọc kiểu Excel cho cột i. Danh sách giá trị chỉ vẽ tối đa 500 dòng khớp ô tìm.
  _moLoc(el, i, nut) {
    document.querySelectorAll('.loc-hop').forEach((x) => x.remove());
    const { cols, rows } = el._tbl;
    const c = cols[i];
    const loc = el._loc;
    const giaTri = [...new Set(rows.map((r) => App._chu(c, r)))];
    const so = (x) => Number(x.replace(/\./g, '').replace(',', '.') || 0);
    giaTri.sort(c.type === 'num' ? (a, b) => so(a) - so(b) : (a, b) => a.localeCompare(b, 'vi', { numeric: true }));
    const bo = new Set(loc.an[i] || []); // giá trị bị bỏ tick
    const hop = document.createElement('div');
    hop.className = 'loc-hop';
    hop.innerHTML = `
      <button data-s="1">Sắp xếp tăng dần</button><button data-s="-1">Sắp xếp giảm dần</button>
      <input class="loc-tim" placeholder="Tìm…">
      <label class="loc-all"><input type="checkbox"> (Chọn tất cả)</label>
      <div class="loc-ds"></div>
      <div class="loc-cuoi"><button class="phu" data-x>Xóa lọc</button><button data-ok>OK</button></div>`;
    document.body.appendChild(hop);
    const r = nut.getBoundingClientRect();
    hop.style.top = `${r.bottom + window.scrollY + 4}px`;
    hop.style.left = `${Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - hop.offsetWidth - 8))}px`;
    const ds = hop.querySelector('.loc-ds');
    const all = hop.querySelector('.loc-all input');
    const tim = hop.querySelector('.loc-tim');
    let khop = giaTri;
    const capNhatAll = () => {
      const chon = khop.filter((v) => !bo.has(v)).length;
      all.checked = chon === khop.length; all.indeterminate = chon > 0 && chon < khop.length;
    };
    const ve = () => {
      const q = tim.value.trim().toLowerCase();
      khop = q ? giaTri.filter((v) => v.toLowerCase().includes(q)) : giaTri;
      ds.innerHTML = khop.slice(0, 500).map((v, k) => `<label><input type="checkbox" data-k="${k}"${bo.has(v) ? '' : ' checked'}> ${App.esc(v === '' ? '(Trống)' : v)}</label>`).join('')
        + (khop.length > 500 ? `<div class="loc-them">… còn ${App.num(khop.length - 500)} giá trị, gõ thêm để tìm</div>` : '');
      ds.querySelectorAll('input').forEach((b) => (b.onchange = () => { const v = khop[b.dataset.k]; if (b.checked) bo.delete(v); else bo.add(v); capNhatAll(); }));
      capNhatAll();
    };
    all.onchange = () => { khop.forEach((v) => (all.checked ? bo.delete(v) : bo.add(v))); ve(); };
    // Gõ tìm rồi OK: chỉ giữ các giá trị khớp (như Excel)
    tim.oninput = ve;
    ve();
    tim.focus();
    const dong = () => { hop.remove(); document.removeEventListener('mousedown', ngoai); };
    const ngoai = (e) => { if (!hop.contains(e.target)) dong(); };
    setTimeout(() => document.addEventListener('mousedown', ngoai));
    hop.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { loc.sort = { i, dir: Number(b.dataset.s) }; dong(); App._veBang(el); }));
    hop.querySelector('[data-x]').onclick = () => { delete loc.an[i]; if (loc.sort && loc.sort.i === i) loc.sort = null; dong(); App._veBang(el); };
    hop.querySelector('[data-ok]').onclick = () => {
      if (tim.value.trim()) { const k = new Set(khop); giaTri.forEach((v) => { if (!k.has(v)) bo.add(v); }); }
      if (bo.size) loc.an[i] = bo; else delete loc.an[i];
      dong(); App._veBang(el);
    };
    tim.onkeydown = (e) => { if (e.key === 'Enter') hop.querySelector('[data-ok]').click(); if (e.key === 'Escape') dong(); };
  },

  loading(el) { el.innerHTML = '<div class="empty">Đang tải…</div>'; },
  error(el, err) { el.innerHTML = `<div class="empty" style="color:var(--bad)">Lỗi: ${App.esc(err.message)}</div>`; },
};
