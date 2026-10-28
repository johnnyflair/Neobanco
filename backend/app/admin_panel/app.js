// Panel de la cooperativa: Resumen (entrada), Bandeja de trabajo, Asociados (ficha 360°) y Bitácora.
// Sin dependencias. Todo texto se inserta como texto (nunca HTML) para evitar inyección.
'use strict';

const $app = document.getElementById('app');
const KEY = 'panel_session';
let session = null;
try { session = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { session = null; }
const state = { range: 'today', queueKind: 'all', counts: null };

// ---------- utilidades ----------
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'style') n.style.cssText = v; // por CSSOM: la política de seguridad no permite style en línea
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
}
const AV = [['#FAECE7', '#712B13'], ['#EEEDFE', '#3C3489'], ['#FAEEDA', '#633806'], ['#E1F5EE', '#085041'], ['#E7F0FD', '#1D4E89']];
function initials(name) { return name.replace(/\./g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase(); }
function avatar(name, big) {
  const h = [...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7);
  const [bg, fg] = AV[h % AV.length];
  return el('div', { class: 'av' + (big ? ' big' : ''), style: `background:${bg};color:${fg}` }, initials(name));
}
const fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function money(amount, currency = 'CRC', signed = false) {
  const n = Number(amount);
  const sign = n < 0 ? '−' : signed && n > 0 ? '+' : '';
  return `${sign}${currency === 'USD' ? '$' : '₡'}${fmt.format(Math.abs(n))}`;
}
function when(iso) {
  const d = new Date(iso);
  const today = new Date();
  const time = d.toLocaleTimeString('es-CR', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Hoy ${time}`;
  const y = new Date(today); y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Ayer ${time}`;
  return `${d.toLocaleDateString('es-CR', { day: 'numeric', month: 'short' }).replace('.', '')} ${time}`;
}
let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
const canAct = () => session && session.staff.role !== 'lectura';
const KYC = { verified: ['Verificada', ''], in_review: ['En revisión', 'o'], rejected: ['Rechazada', 'r'], pending: ['Pendiente', 'n'] };

async function api(path, opts = {}) {
  const res = await fetch(`/admin/api${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && session) { logout('Tu sesión expiró. Ingresá de nuevo.'); throw new Error('expired'); }
  if (!res.ok) throw new Error(data.title || 'Algo salió mal. Probá de nuevo.');
  return data;
}

function logout(msg) {
  session = null;
  try { sessionStorage.removeItem(KEY); } catch { /* sin almacenamiento */ }
  renderLogin(msg);
}

// ---------- ingreso ----------
function renderLogin(msg) {
  const err = el('div', { class: 'err' }, msg || '');
  const email = el('input', { type: 'email', id: 'email', autocomplete: 'username', required: true });
  const pass = el('input', { type: 'password', id: 'pass', autocomplete: 'current-password', required: true });
  const btn = el('button', { class: 'btn wide', type: 'submit' }, 'Ingresar');
  const form = el('form', {
    onsubmit: async (e) => {
      e.preventDefault(); err.textContent = ''; btn.disabled = true;
      try {
        const r = await api('/auth/login', { method: 'POST', body: { email: email.value.trim(), password: pass.value } });
        session = { token: r.token, staff: r.staff, until: Date.now() + r.expires_in * 1000 };
        try { sessionStorage.setItem(KEY, JSON.stringify(session)); } catch { /* sin almacenamiento */ }
        if (!location.hash || location.hash === '#/') location.hash = '#/resumen'; else route();
      } catch (ex) { err.textContent = ex.message; } finally { btn.disabled = false; }
    },
  },
  el('h2', {}, 'Panel de la cooperativa'),
  el('p', { class: 'sub' }, 'Ingresá con tu correo del equipo.'),
  el('div', { class: 'field' }, el('label', { for: 'email' }, 'Correo'), email),
  el('div', { class: 'field' }, el('label', { for: 'pass' }, 'Contraseña'), pass),
  err, btn);
  $app.replaceChildren(el('div', { class: 'login' },
    el('div', { class: 'login-art' }, el('div', { class: 'logo' }, el('i'), 'App · Panel'),
      el('div', {}, el('h1', {}, 'Todo lo de tus asociados, en un solo lugar.'),
        el('p', {}, 'Verificaciones, fraude, préstamos y la ficha completa de cada asociado. Cada acción queda en la bitácora.'))),
    el('div', { class: 'login-form' }, form)));
  email.focus();
}

// ---------- estructura ----------
function shell(active, ...content) {
  const total = state.counts ? state.counts.kyc + state.counts.case + state.counts.loan : null;
  const item = (id, label, badge) => el('a', { class: 'nav' + (active === id ? ' on' : ''), href: `#/${id}` },
    el('span', {}, label), badge ? el('b', {}, badge) : null);
  const s = session.staff;
  const roles = { admin: 'Administración', operaciones: 'Operaciones', lectura: 'Solo lectura' };
  $app.replaceChildren(el('div', { class: 'shell' },
    el('nav', { class: 'side', 'aria-label': 'Menú del panel' },
      el('div', { class: 'logo' }, el('i'), 'App · Panel'),
      item('resumen', 'Resumen'),
      item('bandeja', 'Bandeja', total ? String(total) : null),
      item('asociados', 'Asociados'),
      el('div', { class: 'grp' }, 'CONTROL'),
      item('bitacora', 'Bitácora'),
      el('div', { class: 'who' }, avatar(s.full_name), el('div', {}, s.full_name, el('small', {}, roles[s.role])),
        el('button', { onclick: () => logout('Cerraste sesión.') }, 'Salir'))),
    el('main', { class: 'main' }, ...content)));
}
const loading = () => el('div', { class: 'empty' }, 'Cargando…');
function fail(e) { return el('div', { class: 'card empty' }, e.message || 'No se pudo cargar.'); }
async function refreshCounts() {
  try { state.counts = (await api('/queue')).counts; } catch { /* el contador es opcional */ }
}

// ---------- Resumen ----------
async function viewSummary() {
  shell('resumen', loading());
  let d;
  try { [d] = await Promise.all([api(`/summary?range=${state.range}`), refreshCounts()]); } catch (e) { return shell('resumen', fail(e)); }
  const hour = new Date().getHours();
  const hi = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const q = el('input', { placeholder: 'Buscar asociado por nombre, cédula, celular o IBAN', 'aria-label': 'Buscar asociado' });
  const range = (id, label) => el('button', { class: 'chip' + (state.range === id ? ' on' : ''), onclick: () => { state.range = id; viewSummary(); } }, label);
  const max = Math.max(1, ...d.new_per_day);
  const kindRoute = { kyc: 'kyc', case: 'case', loan: 'loan' };
  shell('resumen',
    el('div', { class: 'top' },
      el('div', {}, el('div', { class: 'h1' }, `${hi}, ${session.staff.full_name.split(' ')[0]}`),
        el('div', { class: 'sub' }, new Date().toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' }))),
      el('form', { class: 'search', onsubmit: (e) => { e.preventDefault(); location.hash = `#/asociados?q=${encodeURIComponent(q.value.trim())}`; } }, '🔍', q),
      el('div', { class: 'chips' }, range('today', 'Hoy'), range('7d', '7 días'), range('30d', '30 días'))),
    el('div', { class: 'grid g5' }, d.kpis.map((k) => el('div', { class: 'card' }, el('div', { class: 'k' }, k.label), el('div', { class: 'v' }, k.value), el('div', { class: 'up' }, k.note)))),
    el('div', { class: 'grid g-main', style: 'margin-top:16px' },
      el('div', { class: 'card' }, el('div', { class: 'cap' }, 'Para hoy'), el('div', { class: 'glow' }),
        d.today.map((t) => el('div', { class: 'row' },
          el('span', { class: `tag ${t.count ? t.tone : ''}`, style: 'min-width:34px;text-align:center' }, String(t.count)),
          el('div', { class: 'grow' }, el('div', { style: 'font-weight:700' }, t.label), el('div', { class: 'sub' }, t.note)),
          t.count ? el('a', { class: 'link', href: `#/bandeja/${kindRoute[t.kind]}` }, 'Atender →') : el('span', { class: 'tag' }, 'Al día')))),
      el('div', { class: 'card' },
        el('div', { style: 'display:flex;justify-content:space-between' }, el('div', { class: 'cap' }, 'Cuentas nuevas por día'), el('span', { class: 'sub' }, 'últimos 14 días')),
        el('div', { class: 'bars', style: 'margin-top:22px' }, d.new_per_day.map((n) => el('div', { style: `height:${(n / max) * 100}%`, title: `${n} cuentas` }, n ? el('span', {}, String(n)) : null))))),
    el('div', { class: 'grid g3', style: 'margin-top:16px' },
      el('div', { class: 'card' }, el('div', { class: 'cap' }, 'Uso de la App'), d.usage.map((u) => el('div', { class: 'row' }, el('span', { class: 'grow' }, u.label), el('b', {}, u.value)))),
      el('div', { class: 'card' }, el('div', { class: 'cap' }, 'Recompensas'), d.rewards.map((u) => el('div', { class: 'row' }, el('span', { class: 'grow' }, u.label), el('b', {}, u.value)))),
      el('div', { class: 'card' }, el('div', { class: 'cap' }, 'Sistemas'), d.systems.map((u) => el('div', { class: 'row' }, el('span', { class: 'grow' }, u.label), el('span', { class: `tag ${u.tone}` }, u.status))))));
}

// ---------- Bandeja ----------
async function viewQueue(kind, id) {
  state.queueKind = kind || 'all';
  shell('bandeja', loading());
  let q;
  try { q = await api(`/queue?kind=${state.queueKind}`); if (state.queueKind === 'all') state.counts = q.counts; else await refreshCounts(); } catch (e) { return shell('bandeja', fail(e)); }
  const c = state.counts || { kyc: 0, case: 0, loan: 0 };
  const chip = (k, label, n) => el('a', { class: 'chip' + (state.queueKind === k ? ' on' : ''), href: `#/bandeja/${k}` }, `${label} ${n}`);
  const selected = id ? q.items.find((i) => i.id === id) : q.items[0];
  const detail = el('section', { class: 'detail' });
  shell('bandeja', el('div', { class: 'inbox' },
    el('aside', { class: 'queue' },
      el('div', { class: 'h1' }, 'Bandeja'),
      el('div', { class: 'sub', style: 'margin-bottom:12px' }, q.items.length ? `${q.items.length} pendientes · fraude primero, luego lo más antiguo` : 'Nada pendiente'),
      el('div', { class: 'chips', style: 'margin-bottom:12px' }, chip('all', 'Todo', c.kyc + c.case + c.loan), chip('case', 'Fraude', c.case), chip('kyc', 'Verificaciones', c.kyc), chip('loan', 'Préstamos', c.loan)),
      q.items.length ? q.items.map((i) => el('a', { class: 'qitem' + (selected && i.id === selected.id ? ' on' : ''), href: `#/bandeja/${state.queueKind}/${i.kind}:${i.id}` },
        avatar(i.name),
        el('div', { style: 'flex:1;min-width:0' }, el('div', { class: 't' }, el('b', {}, i.name), el('span', { class: `tag ${i.tone}` }, i.label)),
          el('div', { class: 'sub', style: 'margin-top:3px' }, i.sub)))) : el('div', { class: 'empty' }, '¡Todo al día! 🎉')),
    detail));
  if (selected) renderItem(detail, selected.kind, selected.id);
  else detail.replaceChildren(el('div', { class: 'empty' }, 'Elegí un pendiente para trabajarlo.'));
}

async function renderItem(box, kind, id) {
  box.replaceChildren(loading());
  let d;
  try { d = await api(`/queue/${kind}/${id}`); } catch (e) { return box.replaceChildren(fail(e)); }
  const m = d.member;
  const titles = { kyc: ['Verificación en revisión', 'o'], case: ['Caso de fraude abierto', 'r'], loan: ['Solicitud de préstamo', 'n'] };
  const note = el('textarea', { id: 'note', placeholder: kind === 'case' ? 'Qué se hizo para resolverlo (obligatorio)' : 'Nota interna (opcional)' });
  const err = el('div', { class: 'err' });
  async function act(path, body, okMsg) {
    err.textContent = '';
    try { await api(path, { method: 'POST', body }); toast(okMsg); viewQueue(state.queueKind); } catch (e) { err.textContent = e.message; }
  }
  const noteVal = () => note.value.trim() || undefined;
  const facts = (rows) => el('div', { class: 'card' }, rows.map(([k, v]) => el('div', { class: 'row' }, el('span', { class: 'grow sub', style: 'font-size:13px' }, k), el('b', {}, v))));
  let body, buttons;
  if (kind === 'kyc') {
    body = el('div', { class: 'grid g-wide' },
      el('div', { class: 'card' }, el('div', { class: 'cap' }, 'Datos de la solicitud'),
        [['Cédula', m.cedula], ['Celular', m.phone], ['Correo', m.email], ['Lugar', m.place], ['Solicitó', when(m.since)]].map(([k, v]) => el('div', { class: 'row' }, el('span', { class: 'grow sub', style: 'font-size:13px' }, k), el('b', {}, v)))),
      el('div', { class: 'card' }, el('div', { class: 'cap' }, 'Ley 8204'),
        d.kyc.length ? d.kyc.map((x) => el('div', { class: 'row' }, el('span', { class: 'grow sub', style: 'font-size:13px' }, x.label), el('b', {}, x.value))) : el('div', { class: 'sub' }, 'Sin respuestas registradas.'),
        el('div', { class: 'cap', style: 'margin-top:14px' }, 'Verificación automática'),
        d.checks.map((x) => el('div', { class: 'row' }, el('span', { class: 'grow' }, x.label), el('span', { class: `tag ${x.tone}` }, x.value))),
        el('div', { class: 'sub', style: 'margin-top:8px' }, 'La revisión automática no pudo confirmar la identidad. Las fotos de cédula y selfie aparecen aquí cuando se integre Didit.')));
    buttons = [el('button', { class: 'btn r', onclick: () => confirm(`¿Rechazar la cuenta de ${m.full_name}?`) && act(`/members/${m.id}/kyc`, { decision: 'reject', note: noteVal() }, 'Verificación rechazada') }, 'Rechazar'),
      el('button', { class: 'btn', onclick: () => act(`/members/${m.id}/kyc`, { decision: 'approve', note: noteVal() }, 'Cuenta aprobada · le avisamos por WhatsApp') }, 'Aprobar cuenta')];
  } else if (kind === 'case') {
    body = facts(d.facts);
    buttons = [el('button', { class: 'btn', onclick: () => (noteVal() ? act(`/cases/${id}/close`, { note: noteVal() }, 'Caso cerrado') : (err.textContent = 'Escribí qué se hizo para cerrar el caso.')) }, 'Cerrar caso')];
  } else {
    body = facts(d.facts);
    buttons = [el('button', { class: 'btn r', onclick: () => confirm('¿Rechazar esta solicitud?') && act(`/loans/${id}/decision`, { decision: 'reject', note: noteVal() }, 'Solicitud rechazada') }, 'Rechazar'),
      el('button', { class: 'btn', onclick: () => act(`/loans/${id}/decision`, { decision: 'approve', note: noteVal() }, 'Préstamo aprobado · le avisamos') }, 'Aprobar')];
  }
  box.replaceChildren(
    el('div', { style: 'display:flex;align-items:center;gap:14px' }, avatar(m.full_name, true),
      el('div', { style: 'flex:1;min-width:0' }, el('div', { class: 'h1' }, m.full_name), el('div', { class: 'sub' }, `Cédula ${m.cedula} · celular ${m.phone}`)),
      el('span', { class: `tag ${titles[kind][1]}`, style: 'font-size:13px' }, titles[kind][0])),
    el('div', { class: 'glow', style: 'margin:16px 0' }),
    body,
    canAct() ? el('div', { class: 'card', style: 'margin-top:16px' }, el('div', { class: 'field' }, el('label', { for: 'note' }, 'Nota interna · queda en la bitácora con tu nombre'), note), err) : null,
    el('div', { class: 'actions' }, el('a', { class: 'btn o', href: `#/asociado/${m.id}` }, 'Ver ficha completa'),
      canAct() ? buttons : el('span', { class: 'tag n' }, 'Tu rol es de solo lectura')));
}

// ---------- Asociados ----------
async function viewMembers(q) {
  const input = el('input', { value: q || '', placeholder: 'Nombre, cédula, celular o IBAN', 'aria-label': 'Buscar asociado' });
  const list = el('div', { class: 'card', style: 'padding:6px 6px 0' }, loading());
  shell('asociados',
    el('div', { class: 'top' }, el('div', {}, el('div', { class: 'h1' }, 'Asociados'), el('div', { class: 'sub' }, 'Buscá y abrí la ficha 360° de cada asociado')),
      el('form', { class: 'search', onsubmit: (e) => { e.preventDefault(); location.hash = `#/asociados?q=${encodeURIComponent(input.value.trim())}`; } }, '🔍', input)),
    list);
  input.focus();
  try {
    const r = await api(`/members?q=${encodeURIComponent(q || '')}`);
    if (!r.items.length) return list.replaceChildren(el('div', { class: 'empty' }, 'No encontramos asociados con esa búsqueda.'));
    list.replaceChildren(el('table', {},
      el('thead', {}, el('tr', {}, ['Asociado', 'Cédula', 'Celular', 'Lugar', 'Identidad', 'Nivel'].map((h) => el('th', {}, h)))),
      el('tbody', {}, r.items.map((m) => el('tr', { class: 'click', onclick: () => { location.hash = `#/asociado/${m.id}`; } },
        el('td', {}, el('div', { style: 'display:flex;gap:10px;align-items:center' }, avatar(m.full_name), el('b', {}, m.full_name))),
        el('td', {}, m.cedula), el('td', {}, m.phone), el('td', {}, m.place),
        el('td', {}, el('span', { class: `tag ${KYC[m.kyc_status][1]}` }, KYC[m.kyc_status][0])),
        el('td', {}, m.level))))));
  } catch (e) { list.replaceChildren(fail(e)); }
}

async function viewMember(id) {
  shell('asociados', loading());
  let d;
  try { d = await api(`/members/${id}`); } catch (e) { return shell('asociados', fail(e)); }
  const m = d.member;
  const act = async (path, question, ok) => {
    if (!confirm(question)) return;
    try { const r = await api(path, { method: 'POST' }); toast(ok(r)); viewMember(id); } catch (e) { toast(e.message); }
  };
  const noteBox = el('textarea', { id: 'newnote', placeholder: 'Ej.: prefiere que lo contacten por WhatsApp' });
  const noteErr = el('div', { class: 'err' });
  const kv = (rows) => rows.map((x) => el('div', { class: 'row' }, el('span', { class: 'grow sub', style: 'font-size:13px' }, x.label), el('span', { class: `tag ${x.tone || ''}` }, x.value)));
  shell('asociados',
    el('div', { class: 'crumb' }, el('a', { href: '#/asociados' }, 'Asociados'), ' › ', m.full_name),
    el('div', { class: 'card', style: 'display:flex;align-items:center;gap:18px;flex-wrap:wrap' }, avatar(m.full_name, true),
      el('div', { style: 'flex:1;min-width:240px' },
        el('div', { class: 'h1' }, m.full_name, ' ', el('span', { class: 'tag', style: 'vertical-align:middle' }, `Nivel ${m.level}`)),
        el('div', { class: 'sub', style: 'margin-top:4px' }, `Cédula ${m.cedula} · ${m.phone} · ${m.email} · ${m.place} · asociado desde ${new Date(m.since).toLocaleDateString('es-CR', { month: 'short', year: 'numeric' })}`)),
      canAct() ? [
        el('button', { class: 'btn r', onclick: () => act(`/members/${id}/lock-cards`, `¿Bloquear todas las tarjetas activas de ${m.full_name}?`, (r) => `${r.cards_locked} tarjeta(s) bloqueada(s)`) }, 'Bloquear tarjetas'),
        el('button', { class: 'btn o', onclick: () => act(`/members/${id}/logout-all`, `¿Cerrar todas las sesiones de ${m.full_name}? Va a tener que ingresar de nuevo.`, (r) => `${r.sessions_closed} sesión(es) cerrada(s)`) }, 'Cerrar sesiones'),
      ] : el('span', { class: 'tag n' }, 'Solo lectura')),
    el('div', { class: 'grid g4', style: 'margin-top:16px' }, d.totals.map((t) => el('div', { class: 'card' }, el('div', { class: 'k' }, t.label), el('div', { class: 'v' }, t.value)))),
    el('div', { class: 'grid g-wide', style: 'margin-top:16px' },
      el('div', { class: 'card' }, el('div', { class: 'cap' }, 'Línea de tiempo'), el('div', { class: 'glow' }),
        d.timeline.length ? d.timeline.map((t) => el('div', { class: 'row' }, el('span', { class: 'sub', style: 'width:118px;flex-shrink:0' }, when(t.at)),
          el('span', { class: 'grow' }, t.title, el('div', { class: 'sub' }, t.account)), el('b', { style: Number(t.amount) > 0 ? 'color:#17806C' : '' }, money(t.amount, t.currency, true))))
          : el('div', { class: 'sub' }, 'Sin movimientos todavía.')),
      el('div', {},
        el('div', { class: 'card' }, el('div', { class: 'cap' }, 'Seguridad y cumplimiento'), kv(d.security),
          d.kyc.length ? [el('div', { class: 'cap', style: 'margin-top:14px' }, 'Ley 8204'), d.kyc.map((x) => el('div', { class: 'row' }, el('span', { class: 'grow sub', style: 'font-size:13px' }, x.label), el('b', {}, x.value)))] : null),
        el('div', { class: 'card', style: 'margin-top:16px' }, el('div', { class: 'cap' }, 'Notas internas'),
          d.notes.length ? d.notes.map((n) => el('div', { class: 'row', style: 'display:block' }, el('div', { class: 'note' }, n.text), el('div', { class: 'sub', style: 'margin-top:4px' }, `${n.by} · ${when(n.at)}`)))
            : el('div', { class: 'sub' }, 'Sin notas.'),
          canAct() ? el('form', { style: 'margin-top:12px', onsubmit: async (e) => {
            e.preventDefault(); noteErr.textContent = '';
            if (noteBox.value.trim().length < 2) { noteErr.textContent = 'Escribí la nota.'; return; }
            try { await api(`/members/${id}/notes`, { method: 'POST', body: { text: noteBox.value.trim() } }); toast('Nota guardada'); viewMember(id); } catch (ex) { noteErr.textContent = ex.message; }
          } }, el('div', { class: 'field' }, noteBox), noteErr, el('button', { class: 'btn', type: 'submit', style: 'margin-top:8px' }, 'Guardar nota')) : null))),
    el('div', { class: 'grid g3', style: 'margin-top:16px' },
      el('div', { class: 'card' }, el('div', { class: 'cap' }, 'Cuentas'), d.accounts.map((a) => el('div', { class: 'row' }, el('span', { class: 'grow' }, a.name, a.iban ? el('div', { class: 'sub' }, a.iban) : null), el('b', {}, money(a.balance, a.currency))))),
      el('div', { class: 'card' }, el('div', { class: 'cap' }, 'Tarjetas'), d.cards.length ? d.cards.map((c) => el('div', { class: 'row' }, el('span', { class: 'grow' }, `${c.name} •••• ${c.last4}`),
        el('span', { class: `tag ${c.status === 'locked' ? 'r' : ''}` }, c.status === 'locked' ? 'Bloqueada' : 'Activa'))) : el('div', { class: 'sub' }, 'Sin tarjetas.')),
      el('div', { class: 'card' }, el('div', { class: 'cap' }, 'Préstamos y casos'),
        d.loans.map((l) => el('div', { class: 'row' }, el('span', { class: 'grow' }, `Préstamo ${money(l.amount)} · ${l.term_months} meses`), el('span', { class: 'tag n' }, { disbursed: 'Desembolsado', received: 'En revisión', approved: 'Aprobado', rejected: 'Rechazado' }[l.status] || l.status))),
        d.cases.map((c) => el('div', { class: 'row' }, el('span', { class: 'grow' }, `Caso ${c.number} · ${c.reason}`), el('span', { class: `tag ${c.status === 'open' ? 'r' : ''}` }, c.status === 'open' ? 'Abierto' : 'Cerrado'))),
        !d.loans.length && !d.cases.length ? el('div', { class: 'sub' }, 'Sin préstamos ni casos.') : null)));
}

// ---------- Bitácora ----------
async function viewAudit() {
  shell('bitacora', loading());
  let r;
  try { r = await api('/audit'); } catch (e) { return shell('bitacora', fail(e)); }
  shell('bitacora',
    el('div', { class: 'top' }, el('div', {}, el('div', { class: 'h1' }, 'Bitácora'), el('div', { class: 'sub' }, 'Todo lo que hace el equipo en el panel. No se puede editar ni borrar.'))),
    el('div', { class: 'card', style: 'padding:6px 6px 0' }, r.items.length ? el('table', {},
      el('thead', {}, el('tr', {}, ['Cuándo', 'Quién', 'Qué hizo', 'Asociado'].map((h) => el('th', {}, h)))),
      el('tbody', {}, r.items.map((a) => el('tr', { class: a.member_id ? 'click' : '', onclick: a.member_id ? () => { location.hash = `#/asociado/${a.member_id}`; } : null },
        el('td', {}, when(a.at)), el('td', {}, a.who), el('td', {}, a.action), el('td', {}, a.member || '—')))))
      : el('div', { class: 'empty' }, 'Todavía no hay acciones registradas.')));
}

// ---------- rutas ----------
function route() {
  if (!session || (session.until && Date.now() > session.until)) return logout(session ? 'Tu sesión expiró. Ingresá de nuevo.' : '');
  const [path, query] = location.hash.replace(/^#\//, '').split('?');
  const parts = path.split('/');
  const params = new URLSearchParams(query || '');
  if (parts[0] === 'bandeja') {
    const [kind, id] = (parts[2] || '').split(':');
    return viewQueue(parts[1] || 'all', id || null, kind);
  }
  if (parts[0] === 'asociados') return viewMembers(params.get('q') || '');
  if (parts[0] === 'asociado' && parts[1]) return viewMember(parts[1]);
  if (parts[0] === 'bitacora') return viewAudit();
  return viewSummary();
}
window.addEventListener('hashchange', route);
route();
