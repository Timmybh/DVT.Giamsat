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
  // footer: dòng tổng hiện ngay dưới tiêu đề và ở cuối bảng.
  table(el, cols, rows, { onClick, empty = 'Không có dữ liệu', footer } = {}) {
    if (!rows.length) { el.innerHTML = `<div class="empty">${empty}</div>`; return; }
    const cell = (c, r) => {
      if (c.render) return c.render(r);
      if (c.type === 'num') return App.num(r[c.key]);
      if (c.type === 'date') return App.date(r[c.key]);
      if (c.type === 'datetime') return App.datetime(r[c.key]);
      return App.esc(r[c.key]);
    };
    let totalRow = '';
    if (footer) {
      totalRow = `<tr class="total-row">${cols.map((c, i) => {
        if (c.total) return `<th>${c.total(rows)}</th>`;
        if (c.sum) return `<th class="num">${App.num(rows.reduce((s, r) => s + Number((c.value ? c.value(r) : r[c.key]) || 0), 0))}</th>`;
        return i === 0 ? `<th title="${App.num(rows.length)} dòng">Tổng</th>` : '<th></th>';
      }).join('')}</tr>`;
    }
    el.innerHTML = `<div class="table-wrap"><table>
      <thead><tr>${cols.map((c) => `<th class="${c.type === 'num' ? 'num' : ''}">${c.label}</th>`).join('')}</tr>${totalRow}</thead>
      <tbody>${rows.map((r, i) => `<tr data-i="${i}" class="${onClick ? 'clickable' : ''}">${cols.map((c) => `<td class="${c.type === 'num' ? 'num' : ''}">${cell(c, r)}</td>`).join('')}</tr>`).join('')}</tbody>
      ${totalRow ? `<tfoot>${totalRow}</tfoot>` : ''}</table></div>`;
    if (onClick) {
      el.querySelectorAll('tbody tr').forEach((tr) => tr.addEventListener('click', () => {
        el.querySelectorAll('tr.selected').forEach((x) => x.classList.remove('selected'));
        tr.classList.add('selected');
        onClick(rows[tr.dataset.i]);
      }));
    }
  },

  loading(el) { el.innerHTML = '<div class="empty">Đang tải…</div>'; },
  error(el, err) { el.innerHTML = `<div class="empty" style="color:var(--bad)">Lỗi: ${App.esc(err.message)}</div>`; },
};
