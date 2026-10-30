/* CRM Contratos y Cobranzas — Grupo MG · interfaz */
(function () {
  'use strict';
  const { STAGES, STAGE, FIELDS, JEFATURA, derive, milestones, fdate, pd, iso, today, diff, num } = CRM;
  const LS = 'crm-mg-v1';
  const FIELD_LABEL = { ...CRM.FIELD_LABEL, usuario_alta: 'Alta de usuario', usuario_baja: 'Baja de usuario', cliente_baja: 'Cliente eliminado', permiso: 'Permiso' };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => (n == null || n === '') ? '—' : 'S/ ' + Number(n).toLocaleString('es-PE', { maximumFractionDigits: 0 });
  const colVar = (k) => `var(--c-${k})`;

  const CL = window.CLOUD || { enabled: false };
  let S, D = new Map();
  /* ---- estado de la nube ---- */
  let cloudState = 'boot', denyMsg = '', unsub = null, metaLoaded = false, opsLoaded = false, metaMissing = false, lastMeta = '', me = '', authEmail = '';
  const pendingOps = {}, cloudIds = new Set(), cloudSeg = new Set(), cloudLog = new Set();
  const emptyState = () => ({ version: 1, seedVersion: '0', ops: [], seguimientos: [], log: [], params: { ...CRM.DEFAULT_PARAMS }, users: [], perms: {}, adminPin: '', actor: null });
  const ui = { f: {}, sort: {}, tab: {}, tl: 'todo', proy: '' };
  const regions = {};

  /* ================= estado y persistencia ================= */
  function seedState() {
    const d = window.CRM_DATA || {};
    return {
      version: 1, seedVersion: d.version || '0',
      ops: (d.ops || []).map(o => CRM.normalize({ ...o })), seguimientos: d.seguimientos || [], log: d.log || [],
      params: { ...CRM.DEFAULT_PARAMS, ...(d.params || {}) }, users: d.users || CRM.DEFAULT_USERS.map(u => ({ ...u })), perms: d.perms || {}, adminPin: d.adminPin || '', actor: null
    };
  }
  function load() {
    if (!CL.enabled) { try { const raw = localStorage.getItem(LS); if (raw) S = JSON.parse(raw); } catch (e) { S = null; } }
    if (!S || !S.ops) S = CL.enabled ? emptyState() : seedState();
    S.params = { ...CRM.DEFAULT_PARAMS, ...S.params };
    S.ops.forEach(CRM.normalize);
    if (!CL.enabled) ensureUsers();
    S.perms = S.perms || {}; S.adminPin = S.adminPin || '';
    if (!S.users.some(u => u.admin)) { const j = S.users.find(u => u.stage === JEFATURA) || S.users[0]; if (j) j.admin = true; }
    if (!S.actor || !S.users.find(u => u.name === S.actor)) S.actor = S.users[0] && S.users[0].name;
    if (!CL.enabled && S.adminPin && isAdmin(S.actor) && !adminSession()) { const n = S.users.find(u => !u.admin); if (n) S.actor = n.name; }
    recompute();
  }
  function ensureUsers() {
    STAGES.forEach(s => {
      if (s.fixedOwner && !S.users.find(u => u.name === s.fixedOwner)) S.users.push({ name: s.fixedOwner, stage: s.key, rol: s.rol });
      if (s.ownerKey) S.ops.forEach(o => { const n = o[s.ownerKey]; if (n && !S.users.find(u => u.name === n)) S.users.push({ name: n, stage: s.key, rol: s.rol }); });
    });
  }
  let saveT;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => { if (CL.enabled) return syncLocal(); try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { /* sin almacenamiento */ } }, 150);
  }
  function recompute() { D = new Map(S.ops.map(o => [o.id, derive(o, S.params)])); }
  function commit() { recompute(); save(); }
  const getOp = (id) => S.ops.find(o => o.id === id);
  const user = (n) => S.users.find(u => u.name === n);

  /* ================= permisos (el administrador activa o desactiva pantallas y botones) ================= */
  const PERMS = [
    { g: 'v', k: 'v_mi', l: 'Mi día' }, { g: 'v', k: 'v_etapas', l: 'Etapas' }, { g: 'v', k: 'v_clientes', l: 'Clientes' }, { g: 'v', k: 'v_equipo', l: 'Equipo' },
    { g: 'v', k: 'v_actividad', l: 'Actividad' }, { g: 'v', k: 'v_agenda', l: 'Agenda' }, { g: 'v', k: 'v_config', l: 'Configurar' },
    { g: 'a', k: 'a_edit', l: 'Editar datos y marcar pasos' }, { g: 'a', k: 'a_seg', l: 'Registrar gestiones' }, { g: 'a', k: 'a_tomar', l: 'Tomar y repartir expedientes' },
    { g: 'a', k: 'a_newop', l: 'Nuevo cliente' }, { g: 'a', k: 'a_export', l: 'Descargar Excel' }, { g: 'a', k: 'a_users', l: 'Agregar / quitar usuarios' },
    { g: 'a', k: 'a_params', l: 'Cambiar plazos y metas' }, { g: 'a', k: 'a_import', l: 'Importar y respaldos' }, { g: 'a', k: 'a_delop', l: 'Eliminar clientes' }];
  const PERM_OFF = new Set(['v_config', 'a_users', 'a_params', 'a_import', 'a_delop']);
  const VIEW_PERM = { mi: 'v_mi', etapa: 'v_etapas', clientes: 'v_clientes', cliente: 'v_clientes', usuarios: 'v_equipo', usuario: 'v_equipo', actividad: 'v_actividad', agenda: 'v_agenda', config: 'v_config' };
  const ACT_PERM = { 'export-xlsx': 'a_export', 'export-json': 'a_import', 'export-js': 'a_import', import: 'a_import', reset: 'a_import', 'user-add': 'a_users', 'user-edit': 'a_users', 'user-del': 'a_users', newop: 'a_newop', 'op-del': 'a_delop', tomar: 'a_tomar', autoassign: 'a_tomar', 'seg-done': 'a_seg', quickseg: 'a_seg', step: 'a_edit' };
  const NOPERM = '🔒 Tu usuario no tiene permiso para esto. Pídeselo al administrador.';
  const isAdmin = (n) => { const u = user(n || S.actor); return !!(u && u.admin); };
  function can(k, n) { n = n || S.actor; const u = user(n); if (!u) return false; if (u.admin) return true; const p = S.perms && S.perms[n]; if (p && k in p) return !!p[k]; return !PERM_OFF.has(k); }
  const hashPin = (p) => { let h = 5381; const s = 'mg|' + p; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h); };
  const adminSession = () => { try { return sessionStorage.getItem('crm-mg-adm') === '1'; } catch (e) { return false; } };
  const setAdminSession = (v) => { try { v ? sessionStorage.setItem('crm-mg-adm', '1') : sessionStorage.removeItem('crm-mg-adm'); } catch (e) { } };
  function askPin(title, cb, onCancel) {
    modal({ title, ok: 'Entrar', body: '<div class="form"><label>PIN de administrador<input id="pin" type="password" inputmode="numeric" autocomplete="off"></label></div>',
      onOk: (dlg) => { if (hashPin(dlg.querySelector('#pin').value) !== S.adminPin) { toast('PIN incorrecto'); return false; } setAdminSession(true); cb(); }, onCancel });
    setTimeout(() => { const i = $('#pin'); i && i.focus(); }, 60);
  }

  /* ================= nube: sincronización en tiempo real ================= */
  const aclOf = (users) => ({ members: users.map(u => (u.email || '').toLowerCase()).filter(Boolean), admins: users.filter(u => u.admin).map(u => (u.email || '').toLowerCase()).filter(Boolean) });
  const metaOf = () => ({ params: S.params, users: S.users, perms: S.perms });
  function syncLocal() {
    if (!CL.enabled || cloudState !== 'ready') return;
    for (const id in pendingOps) { CL.updateDoc('ops', id, pendingOps[id]); delete pendingOps[id]; }
    S.ops.forEach(o => { if (!cloudIds.has(o.id)) { cloudIds.add(o.id); CL.setDoc('ops', o.id, o); } });
    S.log.forEach(l => { if (!l.id) { l.id = 'l' + l.ts.toString(36) + Math.random().toString(36).slice(2, 6); cloudLog.add(l.id); CL.setDoc('log', l.id, l); } });
    S.seguimientos.forEach(s => { if (!cloudSeg.has(s.id)) { cloudSeg.add(s.id); CL.setDoc('seguimientos', s.id, s); } });
    const m = JSON.stringify(metaOf()); if (m !== lastMeta) { lastMeta = m; CL.setMeta(metaOf()); CL.setAcl(aclOf(S.users)); }
  }
  function actorOf() { const u = S.users.find(x => (x.email || '').toLowerCase() === me); return u ? u.name : null; }
  function applyMeta(d) {
    S.params = { ...CRM.DEFAULT_PARAMS, ...(d.params || {}) }; S.users = d.users || []; S.perms = d.perms || {};
    lastMeta = JSON.stringify(metaOf());
    if (!ui.previewReal) S.actor = actorOf();
  }
  let rT;
  function scheduleRender() {
    clearTimeout(rT);
    rT = setTimeout(function tick() {
      const ae = document.activeElement, busy = $('#dlg').open || (ae && ae.closest && ae.closest('#view') && /INPUT|TEXTAREA|SELECT/.test(ae.tagName));
      if (busy) { rT = setTimeout(tick, 1500); return; }
      const r = route(); if (r.view === 'cliente' && $('#f-head') && getOp(r.arg)) { refreshFicha(r.arg); $('#nav').innerHTML = navHtml(r); renderTop(); } else render(true);
    }, 250);
  }
  function updGate() {
    if (cloudState === 'denied') return render();
    if (!metaLoaded || !opsLoaded) return;
    let st;
    if (metaMissing && !S.users.length) st = 'seed';
    else if (!S.actor) { st = 'denied'; denyMsg = `Tu correo (${authEmail}) no figura en el equipo. Pide a la administradora que te agregue en Equipo.`; }
    else st = 'ready';
    const was = cloudState; cloudState = st;
    if (st === 'ready' && was !== 'ready') { recompute(); try { if (!localStorage.getItem('crm-mg-welcome')) setTimeout(showWelcome, 350); } catch (e) { } }
    render(was === 'ready');
  }
  function stopCloud() { if (unsub) { unsub(); unsub = null; } clearTimeout(rT); S = emptyState(); recompute(); cloudIds.clear(); cloudSeg.clear(); cloudLog.clear(); metaLoaded = opsLoaded = metaMissing = false; lastMeta = ''; for (const k in pendingOps) delete pendingOps[k]; ui.previewReal = null; }
  function startCloud(email) {
    stopCloud(); cloudState = 'loading'; authEmail = email; me = (email || '').toLowerCase();
    const upsert = (arr, ch, set) => { let dirty = false; ch.forEach(c => { if (c.type === 'removed') return; set.add(c.id); const i = arr.findIndex(x => x.id === c.id); if (i >= 0) arr[i] = c.data; else arr.push(c.data); if (!c.pending) dirty = true; }); return dirty; };
    unsub = CL.listen({
      meta: (d) => { metaLoaded = true; metaMissing = !d; if (d) { applyMeta(d); recompute(); if (cloudState === 'ready') { if (!S.actor) { cloudState = 'denied'; denyMsg = 'Ya no tienes acceso al CRM.'; } scheduleRender(); } } updGate(); },
      ops: (ch) => { let dirty = false; ch.forEach(c => { if (c.type === 'removed') { S.ops = S.ops.filter(o => o.id !== c.id); cloudIds.delete(c.id); dirty = true; return; } cloudIds.add(c.id); const o = CRM.normalize({ ...c.data }); const i = S.ops.findIndex(x => x.id === c.id); if (i >= 0) S.ops[i] = o; else S.ops.push(o); if (!c.pending) dirty = true; }); recompute(); if (!opsLoaded) { opsLoaded = true; updGate(); } else if (dirty && cloudState === 'ready') scheduleRender(); },
      seg: (ch) => { if (upsert(S.seguimientos, ch, cloudSeg) && cloudState === 'ready') scheduleRender(); },
      log: (ch) => { if (upsert(S.log, ch, cloudLog) && cloudState === 'ready') scheduleRender(); },
      error: (c, e) => { cloudState = 'denied'; denyMsg = e && e.code === 'permission-denied' ? `Tu correo (${authEmail}) no tiene acceso. Pide a la administradora que te agregue en Equipo.` : 'No se pudo conectar: ' + (e && e.message); render(); }
    });
  }
  async function seedCloud() {
    const st = seedState(); let users = st.users.map(u => ({ ...u }));
    const boss = users.find(u => u.stage === JEFATURA) || users[0]; boss.email = me; boss.admin = true;
    toast('Subiendo datos a la nube…');
    try {
      await CL.setAcl(aclOf(users));
      await CL.batchSet('ops', st.ops); await CL.batchSet('seguimientos', st.seguimientos); await CL.batchSet('log', st.log.map((l, i) => ({ ...l, id: l.id || 'seed' + i })));
      await CL.setMeta({ params: st.params, users, perms: {} }); toast('✓ Datos subidos');
    } catch (e) { toast('No se pudo subir: ' + (e.code || e.message)); }
  }
  const AUTH_ERR = { 'auth/invalid-credential': 'Correo o contraseña incorrectos', 'auth/wrong-password': 'Correo o contraseña incorrectos', 'auth/user-not-found': 'Ese correo no tiene cuenta', 'auth/invalid-email': 'Correo no válido', 'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.', 'auth/network-request-failed': 'Sin conexión a internet' };
  function gateHtml() {
    const logo = '<div class="logo big">MG</div><h1>CRM Contratos y Cobranzas</h1>';
    if (cloudState === 'login') return `<div class="gcard">${logo}<p class="muted">Entra con tu correo para trabajar en equipo y en tiempo real.</p><form id="login-form" class="form"><label>Correo<input type="email" id="lg-e" autocomplete="username" required></label><label>Contraseña<input type="password" id="lg-p" autocomplete="current-password" required></label><button class="btn pri" type="submit">Entrar</button></form><button class="btn sm" data-act="login-reset" style="margin-top:10px">Olvidé mi contraseña / crear contraseña</button></div>`;
    if (cloudState === 'seed') return `<div class="gcard">${logo}<p>Todavía no hay datos en la nube.</p><p class="muted small">Si eres la administradora, sube ahora los 139 expedientes iniciales. Quedarás como administradora con el correo <b>${esc(authEmail)}</b>.</p><button class="btn pri" data-act="seed">Subir datos iniciales</button> <button class="btn" data-act="logout">Salir</button></div>`;
    if (cloudState === 'denied') return `<div class="gcard">${logo}<p>🔒 ${esc(denyMsg)}</p><button class="btn" data-act="logout">Cerrar sesión</button></div>`;
    return `<div class="gcard">${logo}<p class="muted">Conectando…</p></div>`;
  }
  function gateCheck() {
    const g = $('#gate'); if (!CL.enabled) { g.hidden = true; return true; }
    const ok = cloudState === 'ready'; g.hidden = ok; document.body.classList.toggle('gated', !ok);
    if (!ok) { if (!g.querySelector('#login-form') || cloudState !== 'login') g.innerHTML = gateHtml(); }
    return ok;
  }

  /* ================= componentes ================= */
  const initials = (n) => n.split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  const stageKeyOfUser = (u) => u.stage;
  const sbadge = (k) => { const s = STAGE[k]; return `<span class="sbadge" style="--sc:${colVar(k)}"><i>${s.n}</i>${s.name}</span>`; };
  const alertBadge = (a) => a ? alertChip(a) : '';
  const semBadge = (s) => ({ ROJO: `<span class="badge rojo">Vencido</span>`, AMARILLO: `<span class="badge amar">Por vencer</span>`, VERDE: `<span class="badge verde">En plazo</span>`, COMPLETADO: `<span class="badge verde">Completado</span>` }[s] || '<span class="muted">—</span>');
  const stateChip = (st) => st === 'culminada' ? `<span class="badge verde">Culminada</span>` : st === 'actual' ? `<span class="badge" style="background:var(--accent-soft);color:var(--accent)">En curso</span>` : `<span class="badge gris">Por llegar</span>`;
  const cumpBadge = (c) => c === 'FUERA DE PLAZO' ? `<span class="badge rojo">Fuera de plazo</span>` : c === 'PROXIMO A VENCER' ? `<span class="badge amar">Próximo a vencer</span>` : c ? `<span class="badge verde">Dentro del plazo</span>` : '<span class="muted">—</span>';
  const respCell = (n) => n === 'Sin asignar' ? `<span class="badge rojo plain">Sin asignar</span>` : (n === '—' ? '—' : userLink(n));
  const userLink = (n) => `<a href="#/usuario/${encodeURIComponent(n)}">${esc(n)}</a>`;
  const opLink = (o) => `<a href="#/cliente/${o.id}"><b>${esc(o.cliente)}</b></a><div class="small muted">${o.id} · ${esc(o.proyecto || '')} ${esc(o.unidad || '')}</div>`;
  const bar = (p) => `<div style="display:flex;gap:8px;align-items:center"><div class="bar" style="width:70px"><span style="width:${p}%"></span></div><span class="small muted">${p}%</span></div>`;

  /* ---------- lenguaje claro, iconos y gráficos ---------- */
  const ALERT_LABEL = { 'Inmediato': 'Urgente', 'Por acumulación': 'En riesgo', 'Bajo control': 'En orden', 'Cerrado': 'Cerrado' };
  const ALERT_HELP = { 'Inmediato': 'Sin responsable, carta fianza bloqueada o vencimiento pasado. Hay que actuar hoy.', 'Por acumulación': 'Fuera de plazo o con semáforo rojo. Si no se atiende, se vuelve urgente.', 'Bajo control': 'Avanza dentro de los plazos.', 'Cerrado': 'Pasó por las 5 etapas.' };
  const ALERT_CLS = { 'Inmediato': 'rojo', 'Por acumulación': 'amar', 'Bajo control': 'verde', 'Cerrado': 'gris' };
  const ALERT_FILL = { 'Inmediato': 'var(--f-rojo)', 'Por acumulación': 'var(--f-amar)', 'Bajo control': 'var(--f-verde)', 'Cerrado': 'var(--f-gris)' };
  const CUELLO_LABEL = { 'Interno - Legal': 'Equipo legal (fuera de plazo)', 'Banco': 'Banco (carta fianza / minuta)', 'Notaría': 'Notaría (trámite notarial)', 'Cliente': 'Cliente (cobranza demorada)' };
  const IC = {
    folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    open: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    alert: '<svg viewBox="0 0 24 24"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/></svg>',
    late: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M10 15l4 4M14 15l-4 4"/></svg>',
    nouser: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6M17 9l5 5M22 9l-5 5"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 21a2 2 0 0 0 4 0"/></svg>',
    help: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17v.5"/></svg>'
  };
  const tip = (t) => `<span class="tip" tabindex="0" data-tip="${esc(t)}">?</span>`;
  const hint = (t) => `<details class="hint"><summary>¿Cómo leer esta pantalla?</summary><div>${t}</div></details>`;
  const alertChip = (a) => `<span class="badge ${ALERT_CLS[a]}" title="${esc(ALERT_HELP[a] || '')}">${ALERT_LABEL[a] || a}</span>`;

  function donut(segs, big, small) {
    const tot = segs.reduce((x, s) => x + s.value, 0) || 1, R = 52, C = 2 * Math.PI * R; let off = 0;
    const arcs = segs.filter(s => s.value > 0).map(s => { const len = s.value / tot * C; const el = `<circle cx="70" cy="70" r="${R}" fill="none" style="stroke:${s.color}" stroke-width="20" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"><title>${esc(s.label)}: ${s.value}</title></circle>`; off += len; return el; }).join('');
    return `<svg viewBox="0 0 140 140" class="donut" role="img" aria-label="${esc(small)}"><circle cx="70" cy="70" r="${R}" fill="none" style="stroke:var(--gris-bg)" stroke-width="20"/>${arcs}<text x="70" y="70" text-anchor="middle" class="d-big">${big}</text><text x="70" y="88" text-anchor="middle" class="d-small">${esc(small)}</text></svg>`;
  }
  function monthsCols(P) {
    const T = today(), ms = []; for (let i = 5; i >= 0; i--) { const d = new Date(T.getFullYear(), T.getMonth() - i, 1); ms.push({ k: iso(d).slice(0, 7), l: d.toLocaleString('es-PE', { month: 'short' }).replace('.', '') }); }
    const cnt = ms.map(m => { const c = {}; STAGES.forEach(s => c[s.key] = P.filter(p => p.k === s.key && p.fin && p.fin.slice(0, 7) === m.k).length); return { ...m, c, t: Object.values(c).reduce((x, y) => x + y, 0) }; });
    const max = Math.max(1, ...cnt.map(m => m.t));
    return `<div class="months">${cnt.map(m => `<div class="mcol" title="${m.t} procesos culminados en ${m.l}"><span class="mt">${m.t || ''}</span><div class="mstack" style="height:${Math.round(m.t / max * 100)}%">${STAGES.map(s => m.c[s.key] ? `<i style="flex:${m.c[s.key]};background:${colVar(s.key)}" title="${s.name}: ${m.c[s.key]}"></i>` : '').join('')}</div><span class="ml">${m.l}</span></div>`).join('')}</div>`;
  }

  const rows = () => S.ops.filter(o => !ui.proy || o.proyecto === ui.proy).map(o => ({ o, d: D.get(o.id) }));

  function region(id, fn) { regions[id] = fn; return `<div id="${id}">${fn()}</div>`; }
  function refresh(id) { const el = document.getElementById(id); if (el && regions[id]) el.innerHTML = regions[id](); }
  function flt(view, def) { return ui.f[view] || (ui.f[view] = { ...def }); }

  function tbl(id, cols, data, emptyMsg) {
    const st = ui.sort[id]; let r = data.slice();
    if (st && cols[st.i] && cols[st.i].s) {
      const g = cols[st.i].s;
      r.sort((a, b) => { const x = g(a) ?? '', y = g(b) ?? ''; return (x > y ? 1 : x < y ? -1 : 0) * st.dir; });
    }
    if (!r.length) return `<div class="tw"><div class="empty">${emptyMsg || 'Sin resultados con estos filtros.'}</div></div>`;
    return `<div class="tw"><table><thead><tr>${cols.map((c, i) => `<th class="${c.cls || ''} ${c.s ? '' : 'ns'}" ${c.s ? `data-act="sort" data-t="${id}" data-i="${i}"` : ''}>${c.h}${st && st.i === i ? (st.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>${r.map(x => `<tr>${cols.map(c => `<td class="${c.cls || ''}" data-label="${esc(String(c.h).replace(/<[^>]+>/g, ''))}">${c.f(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  const uniq = (fn) => [...new Set(S.ops.map(fn).filter(Boolean))].sort();
  const match = (r, q) => !q || [r.o.cliente, r.o.id, r.o.dni, r.o.proyecto, r.o.unidad, r.o.vendedor, r.d.responsable].join(' ').toLowerCase().includes(q.toLowerCase());

  /* ================= toast / modal ================= */
  let toastT;
  function toast(msg, undo) {
    const t = $('#toast'); t.textContent = msg;
    if (undo) { const b = document.createElement('button'); b.textContent = 'Deshacer'; b.onclick = () => { t.classList.remove('show'); undo(); }; t.appendChild(b); }
    t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), undo ? 6500 : 2400);
  }
  function modal({ title, body, ok = 'Guardar', cancel = 'Cancelar', onOk, onCancel }) {
    const dlg = $('#dlg');
    dlg.innerHTML = `<form method="dialog"><div class="dlg-h">${esc(title)}</div><div class="dlg-b">${body}</div><div class="dlg-f">${cancel ? `<button type="button" class="btn" data-m="cancel">${cancel}</button>` : ''}<button type="button" class="btn pri" data-m="ok">${ok}</button></div></form>`;
    dlg.onclose = () => { if (onCancel && !dlg._ok) onCancel(); dlg._ok = false; };
    dlg.querySelector('[data-m=ok]').onclick = () => { if (onOk && onOk(dlg) === false) return; dlg._ok = true; dlg.close(); };
    const c = dlg.querySelector('[data-m=cancel]'); if (c) c.onclick = () => dlg.close();
    dlg.showModal();
  }
  const ask = (msg, ok) => new Promise(res => modal({ title: 'Confirmar', body: `<p>${esc(msg)}</p>`, ok: ok || 'Sí, continuar', onOk: () => res(true), onCancel: () => res(false) }));

  /* ================= edición de campos ================= */
  function fmtVal(k, v) {
    if (v === '' || v == null) return '(vacío)';
    const f = Object.values(FIELDS).flat().find(x => x.k === k);
    if (f && f.t === 'date') return fdate(v);
    if (f && f.t === 'number') return Number(v).toLocaleString('es-PE');
    return String(v);
  }
  function setField(id, k, raw) {
    const op = getOp(id); if (!op) return false;
    let v = raw; if (v === '' || v == null) v = undefined; else if (CRM.NUM_KEYS.has(k)) v = Number(v);
    if (op[k] === v) return false;
    const before = op[k];
    if (v === undefined) delete op[k]; else op[k] = v;
    (pendingOps[id] = pendingOps[id] || {})[k] = v === undefined ? CL.DEL : v;
    S.log.push({ ts: Date.now(), usuario: S.actor, opId: id, etapa: k.includes('_') ? k.split('_')[0] : 'gen', campo: k, antes: before ?? '', despues: v ?? '' });
    if (S.log.length > 6000) S.log.splice(0, S.log.length - 6000);
    commit(); return true;
  }

  /* ================= acciones de un toque ================= */
  const applyMany = (id, obj) => { const op = getOp(id); const prev = {}; let ch = false; for (const k in obj) { prev[k] = op[k] === undefined ? '' : op[k]; if (setField(id, k, obj[k])) ch = true; } return ch ? prev : null; };
  const rerenderOp = (id) => { if ($('#f-head')) { refreshFicha(id); $('#nav').innerHTML = navHtml(route()); } else render(true); };
  function pickStageUser(sk, cb) {
    const me = user(S.actor); if (me && me.stage === sk) return cb(S.actor);
    const us = S.users.filter(u => u.stage === sk);
    if (!us.length) return toast('No hay usuarios en esta etapa. Agrégalos en Equipo.');
    if (us.length === 1) return cb(us[0].name);
    bigChoice('¿Quién es el responsable?', us.map(u => [u.name, initials(u.name), u.name]), cb);
  }
  function bigChoice(title, opts, cb) {
    modal({ title, ok: 'Cerrar', cancel: '', body: `<div class="bigopts">${opts.map(([v, ic, l]) => `<button type="button" class="bigopt" data-val="${esc(v)}"><i>${esc(ic)}</i><span>${esc(l)}</span></button>`).join('')}</div>` });
    const dlg = $('#dlg'); dlg.querySelector('[data-m=ok]').hidden = true;
    dlg.querySelectorAll('.bigopt').forEach(b => b.onclick = () => { const v = b.dataset.val; dlg.close(); cb(v); });
  }
  function stepTap(opId, sk, i) {
    const d = D.get(opId), it = d && d.check[sk][i]; if (!it) return;
    const done = (prev, msg) => { if (!prev) return; rerenderOp(opId); toast(msg, () => { applyMany(opId, prev); rerenderOp(opId); }); };
    if (it.done) {
      if (it.set && !('cob_porRecibir' in it.set)) { const clr = {}; Object.keys(it.set).forEach(k => clr[k] = ''); return done(applyMany(opId, clr), 'Paso desmarcado'); }
      return openEditor(sk);
    }
    if (it.choose) return bigChoice(it.label, it.choose.opts, (v) => done(applyMany(opId, { [it.choose.k]: v }), 'Guardado'));
    if (it.set) {
      const needsMe = Object.values(it.set).includes('$me');
      const go = (who) => { const o = {}; for (const k in it.set) { const v = it.set[k]; o[k] = v === '$today' ? iso(today()) : v === '$me' ? who : v; } done(applyMany(opId, o), '✓ ' + it.label); };
      return needsMe ? pickStageUser(sk, go) : go();
    }
    openEditor(sk);
  }
  function openEditor(sk) {
    const sc = $('#sc-' + sk); if (!sc) { toast('Abre la ficha del cliente para completar este dato'); return; }
    sc.open = true; const fe = sc.querySelector('details.fe'); if (fe) fe.open = true;
    sc.scrollIntoView({ behavior: 'smooth', block: 'start' }); const f = sc.querySelector('[data-fk]'); if (f) setTimeout(() => f.focus({ preventScroll: true }), 300);
  }
  const OUTCOMES = { Llamada: ['Contestó, todo en orden', 'No contestó', 'Pidió más tiempo', 'Confirmó fecha de firma', 'Prometió pago'], WhatsApp: ['Envié mensaje', 'Cliente respondió', 'Envié documentos', 'Sin respuesta'], Correo: ['Envié correo', 'Cliente respondió', 'Envié documentos'], Reunión: ['Reunión realizada', 'Reunión reprogramada'], Trámite: ['Presenté documentos', 'Recogí documentos', 'Seguimiento en notaría', 'Seguimiento en banco'], Nota: [] };
  const TIPO_IC = { Llamada: '📞', WhatsApp: '💬', Correo: '✉️', Reunión: '🤝', Trámite: '📑', Nota: '📝' };
  function quickSeg(opId, tipo) {
    const o = getOp(opId), d = D.get(opId); let out = '', when = '';
    const days = (n) => { const x = new Date(today()); x.setDate(x.getDate() + n); return iso(x); };
    const DATES = [['', 'Sin fecha'], [days(1), 'Mañana'], [days(3), 'En 3 días'], [days(7), 'En 1 semana']];
    modal({ title: `${TIPO_IC[tipo]} ${tipo} · ${o.cliente}`, ok: 'Guardar', body: `<div class="qchips" id="q-out">${(OUTCOMES[tipo] || []).map(x => `<button type="button" class="chipb big" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      <label class="small muted">Detalle (opcional)<textarea id="q-det" rows="2" placeholder="Escribe solo si hace falta"></textarea></label>
      <div class="small muted" style="margin:10px 0 4px">¿Cuándo volver a contactar?</div><div class="qchips" id="q-when">${DATES.map(([v, l]) => `<button type="button" class="chipb big ${v === '' ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`,
      onOk: (dlg) => {
        const det = dlg.querySelector('#q-det').value.trim(), nota = [out, det].filter(Boolean).join('. ');
        if (!nota) { toast('Elige un resultado o escribe un detalle'); return false; }
        S.seguimientos.push({ id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), opId, ts: Date.now(), usuario: S.actor, tipo, etapa: d.etapa === 'cerrado' ? 'pos' : d.etapa, nota, proxima: when ? 'Volver a contactar' : '', fCompromiso: when, resuelto: false });
        save(); rerenderOp(opId); toast('✓ Gestión registrada'); } });
    const dlg = $('#dlg');
    const pick = (box, set) => box && box.querySelectorAll('.chipb').forEach(b => b.onclick = () => { box.querySelectorAll('.chipb').forEach(x => x.classList.remove('on')); b.classList.add('on'); set(b.dataset.v); });
    pick(dlg.querySelector('#q-out'), v => out = v); pick(dlg.querySelector('#q-when'), v => when = v);
  }
  function planAssign() {
    const plan = [], all = S.ops.map(o => ({ o, d: D.get(o.id) }));
    STAGES.filter(s => s.ownerKey).forEach(s => {
      const us = S.users.filter(u => u.stage === s.key); if (!us.length) return;
      const load = {}; us.forEach(u => load[u.name] = 0);
      all.forEach(r => { if (r.d.state[s.key] === 'actual' && load[r.d.owner[s.key]] !== undefined) load[r.d.owner[s.key]]++; });
      all.filter(r => r.d.state[s.key] === 'actual' && r.d.owner[s.key] === 'Sin asignar').sort((x, y) => (y.d.diasTotal || 0) - (x.d.diasTotal || 0)).forEach(r => {
        const n = us.reduce((m, u) => load[u.name] < load[m.name] ? u : m); load[n.name]++; plan.push({ op: r.o.id, key: s.ownerKey, who: n.name, stage: s.key }); });
    });
    return plan;
  }
  function autoAssign() {
    const plan = planAssign(); if (!plan.length) return toast('No hay expedientes sin responsable 🎉');
    const by = {}; plan.forEach(p => { (by[p.stage] = by[p.stage] || {})[p.who] = (by[p.stage][p.who] || 0) + 1; });
    modal({ title: `Repartir ${plan.length} expedientes`, ok: 'Repartir ahora', body: `<p class="muted" style="margin-top:0">Se asignan al colaborador con menos carga en cada etapa, empezando por los más antiguos.</p>${Object.keys(by).map(k => `<div style="margin:8px 0">${sbadge(k)}<div class="small" style="margin-top:4px">${Object.entries(by[k]).map(([n, c]) => `<b>${esc(n)}</b> +${c}`).join(' · ')}</div></div>`).join('')}`,
      onOk: () => { const prevAll = plan.map(p => ({ id: p.op, k: p.key })); plan.forEach(p => setField(p.op, p.key, p.who)); toast(`✓ ${plan.length} expedientes repartidos`, () => { prevAll.forEach(x => setField(x.id, x.k, '')); render(true); }); render(true); } });
  }
  function fabMenu() {
    const b = (act, ic, l, on) => on ? `<button type="button" class="bigopt" data-act="${act}" data-close><i>${ic}</i><span>${l}</span></button>` : '';
    modal({ title: '¿Qué quieres hacer?', ok: 'Cerrar', cancel: '', body: `<div class="bigopts">${b('fab-seg', '📞', 'Anotar una gestión', can('a_seg'))}${b('newop', '➕', 'Nuevo cliente', can('a_newop'))}${b('goto" data-href="#/mi', '☀️', 'Mi día', can('v_mi'))}${b('export-xlsx', '⬇️', 'Descargar Excel', can('a_export'))}</div>` });
    $('#dlg').querySelector('[data-m=ok]').hidden = true;
  }
  function pickList(q) {
    const box = $('#pk-list'); if (!box) return;
    const list = rows().filter(r => match(r, q)).sort((x, y) => (x.d.etapa === 'cerrado') - (y.d.etapa === 'cerrado')).slice(0, 8);
    box.innerHTML = list.length ? list.map(r => `<button type="button" class="pk" data-act="pick-client" data-op="${r.o.id}" data-close><b>${esc(r.o.cliente)}</b><span class="small muted">${esc(r.o.proyecto || '')} ${esc(r.o.unidad || '')} · ${r.d.etapa === 'cerrado' ? 'Cerrado' : STAGE[r.d.etapa].name}</span></button>`).join('') : '<div class="empty">Sin resultados</div>';
  }
  function clientPicker() { modal({ title: '¿De qué cliente?', ok: 'Cerrar', cancel: '', body: '<input type="search" id="pk-q" placeholder="Escribe el nombre, DNI o proyecto…" autocomplete="off"><div id="pk-list" class="pklist"></div>' }); $('#dlg').querySelector('[data-m=ok]').hidden = true; pickList(''); setTimeout(() => { const i = $('#pk-q'); i && i.focus(); }, 60); }

  /* ================= vistas ================= */
  function pageHead(title, sub, extra, tipText) { return `<div class="page-h"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div>${extra || ''}</div></div>${tipText ? hint(tipText) : ''}`; }

  /* ---- Resumen / torre de control ---- */
  function userStats(u) {
    const sk = u.stage;
    if (sk === JEFATURA) return { stage: sk, cartera: 0, cul: 0, crit: 0, fuera: 0, seg: S.seguimientos.filter(s => s.usuario === u.name && !s.resuelto).length, act7: activity7(u.name) };
    const mine = rows().filter(r => r.d.owner[sk] === u.name);
    const act = mine.filter(r => r.d.state[sk] === 'actual');
    return { stage: sk, cartera: act.length, cul: mine.filter(r => r.d.state[sk] === 'culminada').length, crit: act.filter(r => r.d.alerta === 'Inmediato').length,
      fuera: act.filter(r => r.d.conCump === 'FUERA DE PLAZO').length, seg: S.seguimientos.filter(s => s.usuario === u.name && !s.resuelto).length, act7: activity7(u.name) };
  }
  function activity7(n) {
    const lim = Date.now() - 7 * 86400000;
    return S.log.filter(l => l.usuario === n && l.ts >= lim).length + S.seguimientos.filter(s => s.usuario === n && s.ts >= lim).length;
  }
  function loadTable(id) {
    const cols = [
      { h: 'Usuario', f: u => `<div style="display:flex;gap:9px;align-items:center"><span class="avatar" style="--sc:${colVar(u.stage)};width:28px;height:28px;font-size:11px">${initials(u.name)}</span><div>${userLink(u.name)}<div class="small muted">${esc(u.rol || '')}</div></div></div>`, s: u => u.name },
      { h: 'Etapa', f: u => u.stage === JEFATURA ? '<span class="sbadge" style="--sc:var(--c-jef)">Jefatura</span>' : sbadge(u.stage), s: u => u.stage },
      { h: 'En cartera', cls: 'r', f: u => u.st.cartera, s: u => u.st.cartera },
      { h: 'Críticos', cls: 'r', f: u => u.st.crit ? `<span class="badge rojo plain">${u.st.crit}</span>` : 0, s: u => u.st.crit },
      { h: 'Culminados', cls: 'r', f: u => u.st.cul, s: u => u.st.cul },
      { h: 'Seguim. pendientes', cls: 'r', f: u => u.st.seg, s: u => u.st.seg },
      { h: 'Acciones 7 días', cls: 'r', f: u => u.st.act7, s: u => u.st.act7 }
    ];
    return tbl(id, cols, S.users.map(u => ({ ...u, st: userStats(u) })));
  }

  function vResumen() {
    const all = rows(), T = today(), h = new Date().getHours();
    const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches', nombre = (S.actor || '').split(' ')[0];
    const abiertos = all.filter(r => r.d.etapa !== 'cerrado');
    const crit = abiertos.filter(r => r.d.alerta === 'Inmediato'), riesgo = abiertos.filter(r => r.d.alerta === 'Por acumulación');
    const fuera = abiertos.filter(r => r.d.etapa === 'con' && r.d.conCump === 'FUERA DE PLAZO'), sinA = abiertos.filter(r => r.d.responsable === 'Sin asignar');
    const venc = agenda().filter(a => a.cat === 'vencido');
    const P = procesosRows();
    const go = (label, n, attrs, cls) => `<button class="todo ${cls || ''}" ${attrs}><b>${n}</b><span>${label}</span><i>Ver ›</i></button>`;
    const kpi = (ic, n, l, help, cls) => `<div class="card kpi ${cls || ''}"><div class="kic">${IC[ic]}</div><div><div class="n">${n}</div><div class="l">${l} ${tip(help)}</div></div></div>`;
    // Recorrido
    const flow = STAGES.map((s, i) => {
      const act = all.filter(r => r.d.state[s.key] === 'actual').length, cul = all.filter(r => r.d.state[s.key] === 'culminada').length, por = all.length - act - cul, n = all.length || 1;
      const act2 = all.filter(r => r.d.etapa === s.key).length;
      const who = S.users.filter(u => u.stage === s.key).map(u => u.name.split(' ')[0]).join(', ') || '—';
      return `<a class="fstage" href="#/etapa/${s.key}" style="--sc:${colVar(s.key)}"><div class="fs-top"><span class="fs-n">${s.n}</span><b>${s.name}</b></div>
        <div class="fs-num">${act2}</div><div class="fs-sub">expedientes aquí ahora</div>
        <div class="seg" title="${cul} ya pasaron · ${act2} aquí · ${por - (act - act2)} aún no llegan"><span style="width:${cul / n * 100}%;background:var(--f-verde)"></span><span style="width:${act2 / n * 100}%;background:var(--sc)"></span><span style="width:${(n - cul - act2) / n * 100}%"></span></div>
        <div class="fs-leg"><span><i style="background:var(--f-verde)"></i>${cul} listos</span><span><i style="background:var(--sc)"></i>${act2} aquí</span></div>
        <div class="fs-who">${IC.nouser.replace('<svg', '<svg class="mini"')}${esc(who)}</div></a>${i < 4 ? '<span class="arrow" aria-hidden="true">›</span>' : ''}`;
    }).join('');
    // Alertas
    const alertas = {}; all.forEach(r => alertas[r.d.alerta] = (alertas[r.d.alerta] || 0) + 1);
    const order = ['Inmediato', 'Por acumulación', 'Bajo control', 'Cerrado'];
    const legend = order.map(a => `<button class="lg" data-act="gofilter" data-view="clientes" data-k="alerta" data-val="${a}"><i style="background:${ALERT_FILL[a]}"></i><div><b>${ALERT_LABEL[a]}</b> <span class="muted">· ${alertas[a] || 0}</span><div class="small muted">${ALERT_HELP[a]}</div></div></button>`).join('');
    // Cuellos
    const cuello = {}; abiertos.forEach(r => { if (r.d.cuello !== 'N/A') cuello[r.d.cuello] = (cuello[r.d.cuello] || 0) + 1; });
    const maxCu = Math.max(1, ...Object.values(cuello));
    // Carga
    const team = S.users.filter(u => u.stage !== JEFATURA).map(u => ({ u, st: userStats(u) }));
    const maxCa = Math.max(1, sinA.length, ...team.map(t => t.st.cartera));
    const carga = team.map(t => `<a class="cbar" href="#/usuario/${encodeURIComponent(t.u.name)}" style="--sc:${colVar(t.u.stage)}"><span class="cn">${esc(t.u.name)}<small>${STAGE[t.u.stage].name}</small></span><div class="ctrack"><span style="width:${(t.st.cartera - t.st.crit) / maxCa * 100}%"></span><span class="red" style="width:${t.st.crit / maxCa * 100}%"></span></div><b>${t.st.cartera}</b></a>`).join('')
      + `<a class="cbar" href="javascript:void 0" data-act="gofilter" data-view="clientes" data-k="sin" data-val="1"><span class="cn">Sin responsable<small>todas las etapas</small></span><div class="ctrack"><span class="hatch" style="width:${sinA.length / maxCa * 100}%"></span></div><b>${sinA.length}</b></a>`;
    // Proyectos
    const proyectos = uniq(o => o.proyecto);
    const projRows = proyectos.map(p => { const rs = all.filter(r => r.o.proyecto === p); const c = {}; rs.forEach(r => c[r.d.etapa] = (c[r.d.etapa] || 0) + 1); return { p, t: rs.length, c }; }).filter(x => x.t).sort((x, y) => y.t - x.t);
    const maxP = Math.max(1, ...projRows.map(x => x.t));
    const proj = projRows.map(x => `<div class="pbar"><span class="pn">${esc(x.p)}</span><div class="ptrack" style="width:${x.t / maxP * 100}%">${[...STAGES.map(s => [s.key, colVar(s.key), s.name]), ['cerrado', 'var(--f-verde)', 'Cerrado']].map(([k, c, n]) => x.c[k] ? `<i style="flex:${x.c[k]};background:${c}" title="${n}: ${x.c[k]}"></i>` : '').join('')}</div><b>${x.t}</b></div>`).join('');
    const urg = crit.sort((x, y) => (y.d.diasTotal || 0) - (x.d.diasTotal || 0)).slice(0, 6);
    const Pm = indicadores(P, 'Total', rng({}), 0), semDesde = iso(new Date(T.getFullYear(), T.getMonth(), T.getDate() - 7));
    const cerr7 = P.filter(p => p.fin && p.fin >= semDesde && p.st === 'culminada').length;
    const gcol = (v, m) => v >= m ? 'var(--f-verde)' : v >= m * .75 ? 'var(--f-amar)' : 'var(--f-rojo)';
    const gauge = (pct, meta, big, label, sub) => { const v = Math.max(0, Math.min(100, Number(pct) || 0)), R = 38, C = 2 * Math.PI * R; return `<div class="gauge"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="${R}" fill="none" stroke-width="11" style="stroke:var(--gris-bg)"/><circle cx="50" cy="50" r="${R}" fill="none" stroke-width="11" stroke-linecap="round" stroke-dasharray="${v / 100 * C} ${C}" transform="rotate(-90 50 50)" style="stroke:${gcol(v, meta)}"/><text x="50" y="56" text-anchor="middle" class="g-big">${big}</text></svg><div><b>${label}</b><span class="small muted">${sub}</span><span class="small" style="color:${gcol(v, meta)}">${v >= meta ? '✔ Meta cumplida' : 'Meta: ' + meta + '%'}</span></div></div>`; };
    const ins = insights(all, abiertos, venc, Pm);
    const apps = homeApps(crit.length, venc.length);
    return `<div class="hero card"><div><h1>${saludo}, ${esc(nombre)} 👋</h1><p class="muted">${fdate(iso(T))} · ¿Qué quieres hacer?</p></div>
      <div class="apps">${apps}</div></div>
    <h2 class="sec">Resultados del área ${tip('Eficacia: de lo que se trabajó, cuánto se cerró. Eficiencia: % de procesos cerrados dentro del plazo. Productividad: procesos cerrados en los últimos 7 días frente a la meta semanal. Las metas se cambian en Configurar.')}</h2>
    <div class="grid three gauges">${gauge(Pm.eficacia, S.params.metaEficacia, (Pm.eficacia === '' ? '—' : Math.round(Pm.eficacia) + '%'), 'Eficacia', `${Pm.cul} cerrados de ${Pm.cul + Pm.curso}`)}${gauge(Pm.dentro, S.params.metaEficiencia, (Pm.dentro === '' ? '—' : Math.round(Pm.dentro) + '%'), 'Eficiencia', `${Pm.dentro === '' ? 'Sin datos' : 'cerrados dentro del plazo'}`)}${gauge(cerr7 / Math.max(1, S.params.metaSemana) * 100, 100, cerr7, 'Productividad', `cerrados en 7 días · meta ${S.params.metaSemana}`)}</div>
    ${ins.length ? `<h2 class="sec">Mejoras sugeridas ${tip('Ideas automáticas para ganar tiempo, según cómo están hoy los expedientes.')}</h2><div class="grid ucards">${ins.map(x => `<div class="card ins"><i>${x.ic}</i><div><b>${x.t}</b><p class="small muted">${x.d}</p>${x.btn || ''}</div></div>`).join('')}</div>` : ''}
    <div class="hero card" style="margin-top:14px"><div><b>Lo urgente de hoy</b></div>
      <div class="todos">${go('urgentes', crit.length, 'data-act="gofilter" data-view="clientes" data-k="alerta" data-val="Inmediato"', crit.length ? 'bad' : 'ok')}${go('sin responsable', sinA.length, 'data-act="gofilter" data-view="clientes" data-k="sin" data-val="1"', sinA.length ? 'warn' : 'ok')}${go('seguimientos vencidos', venc.length, 'data-act="goto" data-href="#/agenda"', venc.length ? 'bad' : 'ok')}</div></div>
    <details class="more" style="margin-top:14px"><summary>📊 Ver más detalle del área</summary>
    <div class="grid kpis" style="margin-top:12px">
      ${kpi('folder', all.length, 'Expedientes', 'Total de clientes registrados en el CRM.')}${kpi('open', abiertos.length, 'Abiertos', 'Expedientes que todavía no terminan las 5 etapas.')}
      ${kpi('alert', riesgo.length, 'En riesgo', 'Fuera de plazo o con semáforo rojo. Todavía no son urgentes, pero lo serán.', 'warn')}${kpi('late', fuera.length, 'Contratos fuera de plazo', 'Expedientes en Contratos que pasaron el plazo objetivo de ' + S.params.plazo + ' días desde la validación.', 'warn')}</div>
    <h2 class="sec">Recorrido del expediente ${tip('Cada cliente avanza de izquierda a derecha por 5 etapas. Un expediente solo pasa a la siguiente cuando cierra la anterior. Toca una etapa para ver sus clientes.')}</h2>
    <div class="flow">${flow}</div>
    <div class="grid two" style="margin-top:16px">
      <div class="card"><div class="card-h"><h2>¿Cómo van los expedientes? ${tip('Semáforo general. Toca una fila para ver esos clientes.')}</h2></div><div class="card-b donut-wrap">${donut(order.map(a => ({ label: ALERT_LABEL[a], value: alertas[a] || 0, color: ALERT_FILL[a] })), all.length, 'expedientes')}<div class="legend">${legend}</div></div></div>
      <div class="card"><div class="card-h"><h2>¿Dónde se traban? ${tip('Quién o qué está frenando a los expedientes que pasaron su plazo.')}</h2></div><div class="card-b">${Object.keys(cuello).length ? Object.entries(cuello).sort((x, y) => y[1] - x[1]).map(([k, n]) => `<div class="hb2"><span>${CUELLO_LABEL[k] || k}</span><div class="bar"><span style="width:${n / maxCu * 100}%"></span></div><b>${n}</b></div>`).join('') : '<div class="empty">Nada trabado por ahora 🎉</div>'}</div></div>
    </div>
    <div class="grid two" style="margin-top:16px">
      <div class="card"><div class="card-h"><h2>Carga por colaborador ${tip('Cuántos expedientes tiene cada persona en su etapa. La parte roja son los urgentes.')}</h2></div><div class="card-b">${carga}</div></div>
      <div class="card"><div class="card-h"><h2>Procesos culminados por mes ${tip('Cuántas etapas se cerraron cada mes, con el color de la etapa.')}</h2></div><div class="card-b">${monthsCols(P)}<div class="mleg">${STAGES.map(s => `<span><i style="background:${colVar(s.key)}"></i>${s.name}</span>`).join('')}</div></div></div>
    </div>
    <h2 class="sec">Para atender primero ${tip('Los expedientes urgentes más antiguos.')}</h2>
    ${urg.length ? `<div class="grid ucards">${urg.map(r => `<a class="card urg" href="#/cliente/${r.o.id}" style="--sc:${colVar(r.d.etapa)}"><div class="u-top">${sbadge(r.d.etapa)}<span class="small muted">${r.d.diasTotal ?? '—'} días</span></div><b>${esc(r.o.cliente)}</b><div class="small muted">${esc(r.o.proyecto || '')} ${esc(r.o.unidad || '')}</div><div class="u-need"><span class="small muted">Qué falta</span>${esc(r.d.siguiente)}</div><div class="small">Responsable: ${r.d.responsable === 'Sin asignar' ? '<span class="badge rojo plain">Sin asignar</span>' : esc(r.d.responsable)}</div></a>`).join('')}</div>` : '<div class="card"><div class="empty">No hay expedientes urgentes. ¡Buen trabajo! 🎉</div></div>'}
    <h2 class="sec">Expedientes por proyecto ${tip('Cada barra muestra en qué etapa está cada cliente del proyecto.')}</h2>
    <div class="card"><div class="card-b">${proj}<div class="mleg" style="margin-top:12px">${STAGES.map(s => `<span><i style="background:${colVar(s.key)}"></i>${s.name}</span>`).join('')}<span><i style="background:var(--f-verde)"></i>Cerrado</span></div></div></div>
    </details>
    <p style="margin-top:18px">${can('v_equipo') ? '<a href="#/usuarios">Ver detalle del equipo ›</a> · ' : ''}<a href="#/ayuda">¿Cómo funciona este CRM? ›</a></p>`;
  }
  function homeApps(nCrit, nVenc) {
    const t = (href, ic, l, n, cls) => `<a class="tile ${cls || ''}" href="${href}"><i>${ic}</i><span>${l}</span>${n ? `<em>${n}</em>` : ''}</a>`;
    const bt = (act, ic, l) => `<button class="tile" data-act="${act}"><i>${ic}</i><span>${l}</span></button>`;
    return [can('v_mi') && t('#/mi', '☀️', 'Mi día', nCrit || '', 'hot'), can('v_clientes') && t('#/clientes', '🗂️', 'Clientes'), can('v_etapas') && t('#/etapa/cob', '🧭', 'Etapas'), can('v_agenda') && t('#/agenda', '📅', 'Agenda', nVenc || '', 'hot'),
      can('v_equipo') && t('#/usuarios', '👥', 'Equipo'), can('v_actividad') && t('#/actividad', '📈', 'Actividad'), can('a_newop') && bt('newop', '➕', 'Nuevo cliente'), can('a_export') && bt('export-xlsx', '⬇️', 'Excel'), t('#/ayuda', '💡', 'Ayuda')].filter(Boolean).join('');
  }
  function insights(all, abiertos, venc, Pm) {
    const out = [], sinA = abiertos.filter(r => r.d.responsable === 'Sin asignar').length;
    if (sinA && can('a_tomar')) out.push({ ic: '⚖️', t: `${sinA} expedientes sin responsable`, d: 'Repártelos de forma pareja con un toque. Nadie debería quedarse esperando.', btn: '<button class="btn pri sm" data-act="autoassign">Repartir automáticamente</button>' });
    const cu = {}; abiertos.forEach(r => { if (r.d.cuello !== 'N/A') cu[r.d.cuello] = (cu[r.d.cuello] || 0) + 1; });
    const top = Object.entries(cu).sort((x, y) => y[1] - x[1])[0];
    if (top) out.push({ ic: '🚧', t: `Mayor traba: ${CUELLO_LABEL[top[0]] || top[0]}`, d: `${top[1]} expedientes pasaron su plazo por este motivo. Conviene una reunión o llamada de escalamiento esta semana.` });
    const team = S.users.filter(u => u.stage !== JEFATURA).map(u => ({ u, c: userStats(u).cartera }));
    for (const s of STAGES) { const g = team.filter(t => t.u.stage === s.key); if (g.length > 1) { const hi = g.reduce((m, x) => x.c > m.c ? x : m), lo = g.reduce((m, x) => x.c < m.c ? x : m); if (hi.c - lo.c >= 4 && hi.c >= lo.c * 2) { out.push({ ic: '📊', t: `Carga despareja en ${s.name}`, d: `${hi.u.name.split(' ')[0]} tiene ${hi.c} y ${lo.u.name.split(' ')[0]} tiene ${lo.c}. Equilibrar acelera el cierre.` }); break; } } }
    if (venc.length) out.push({ ic: '⏰', t: `${venc.length} compromisos vencidos`, d: 'Hay clientes esperando una respuesta. Ciérralos o reprograma la fecha.', btn: '<a class="btn sm" href="#/agenda">Ver agenda</a>' });
    if (Pm.venc) out.push({ ic: '📅', t: `${Pm.venc} procesos en curso fuera de plazo`, d: 'Prioriza estos primero: son los que más bajan la eficiencia del área.', btn: '<a class="btn sm" href="#/mi">Ir a Mi día</a>' });
    return out.slice(0, 4);
  }
  /* ---- Mi día: la cola de trabajo de la persona ---- */
  function vMiDia() {
    const me = user(S.actor), k = me.stage, T0 = new Date(today()).getTime();
    const hoy = S.log.filter(l => l.usuario === S.actor && l.ts >= T0).length + S.seguimientos.filter(s => s.usuario === S.actor && s.ts >= T0).length;
    const ord = { Inmediato: 0, 'Por acumulación': 1, 'Bajo control': 2 };
    const all = rows().filter(r => r.d.etapa !== 'cerrado');
    const mine = (k === JEFATURA ? all.filter(r => r.d.alerta !== 'Bajo control') : all.filter(r => r.d.state[k] === 'actual' && r.d.owner[k] === S.actor))
      .sort((x, y) => (ord[x.d.alerta] ?? 3) - (ord[y.d.alerta] ?? 3) || (y.d.diasTotal || 0) - (x.d.diasTotal || 0));
    const ag = agenda(S.actor).filter(x => x.cat === 'vencido' || x.cat === 'hoy');
    const st = k !== JEFATURA && STAGE[k].ownerKey ? STAGE[k] : null;
    const pool = st ? all.filter(r => r.d.state[k] === 'actual' && r.d.owner[k] === 'Sin asignar') : [];
    const meta = S.params.metaDia || 8, pct = Math.min(100, hoy / meta * 100), R = 38, C = 2 * Math.PI * R;
    const card = (r) => { const sk = k === JEFATURA ? r.d.etapa : k, items = r.d.check[sk] || [], i = items.findIndex(x => !x.done), it = items[i];
      const main = it && (it.set || it.choose) ? `<button class="btn pri" data-act="step" data-op="${r.o.id}" data-s="${sk}" data-i="${i}">✓ ${esc(it.label)}</button>` : `<a class="btn pri" href="#/cliente/${r.o.id}">${it ? esc(it.label) : 'Abrir'} ›</a>`;
      return `<div class="card midia" style="--sc:${colVar(sk)}"><div class="u-top">${sbadge(sk)}${alertBadge(r.d.alerta)}</div><a href="#/cliente/${r.o.id}"><b>${esc(r.o.cliente)}</b></a><div class="small muted">${esc(r.o.proyecto || '')} ${esc(r.o.unidad || '')} · ${r.d.diasTotal ?? '—'} días${k === JEFATURA ? ' · ' + esc(r.d.responsable) : ''}</div>
        <div class="m-act">${main}<button class="btn" data-act="quickseg" data-op="${r.o.id}" data-t="Llamada" title="Anotar llamada">📞</button><button class="btn" data-act="quickseg" data-op="${r.o.id}" data-t="WhatsApp" title="Anotar WhatsApp">💬</button></div></div>`; };
    return `<div class="hero card"><div><h1>☀️ Mi día</h1><p class="muted">${esc(S.actor)} · ${k === JEFATURA ? 'Lo que necesita tu atención' : 'Tus expedientes, del más urgente al menos urgente'}</p></div>
      <div class="gauge mini"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="${R}" fill="none" stroke-width="12" style="stroke:var(--gris-bg)"/><circle cx="50" cy="50" r="${R}" fill="none" stroke-width="12" stroke-linecap="round" stroke-dasharray="${pct / 100 * C} ${C}" transform="rotate(-90 50 50)" style="stroke:${pct >= 100 ? 'var(--f-verde)' : 'var(--accent)'}"/><text x="50" y="57" text-anchor="middle" class="g-big">${hoy}</text></svg><div><b>Acciones de hoy</b><span class="small muted">Meta: ${meta}</span></div></div></div>
    ${ag.length ? `<h2 class="sec">Compromisos para hoy <span class="badge rojo plain">${ag.length}</span></h2><div class="card"><div class="card-b">${ag.slice(0, 6).map(x => { const o = getOp(x.opId); return `<div class="agrow"><div><b>${o ? esc(o.cliente) : esc(x.opId)}</b><div class="small muted">${x.cat === 'vencido' ? '⚠️ Venció ' : 'Hoy · '}${fdate(x.fCompromiso)} · ${esc(x.proxima || x.nota)}</div></div><button class="btn sm" data-act="seg-done" data-id="${x.id}">✓ Cumplido</button></div>`; }).join('')}</div></div>` : ''}
    <h2 class="sec">Por atender <span class="muted small">(${mine.length})</span></h2>
    ${mine.length ? `<div class="grid ucards">${mine.slice(0, 18).map(card).join('')}</div>${mine.length > 18 ? `<p class="small muted">Mostrando 18 de ${mine.length}. Ve el resto en <a href="#/${st ? 'etapa/' + k : 'clientes'}">${st ? 'tu etapa' : 'Clientes'}</a>.</p>` : ''}` : '<div class="card"><div class="empty">¡Todo al día! 🎉 No tienes expedientes pendientes.</div></div>'}
    ${pool.length && can('a_tomar') ? `<h2 class="sec">Sin responsable en ${st.name} <span class="muted small">(${pool.length})</span></h2><div class="card"><div class="card-b">${pool.slice(0, 5).map(r => `<div class="agrow"><div><b>${esc(r.o.cliente)}</b><div class="small muted">${esc(r.d.siguiente)}</div></div><button class="btn sm pri" data-act="tomar" data-op="${r.o.id}" data-u="${esc(S.actor)}">Tomar</button></div>`).join('')}${pool.length > 5 ? `<p class="small muted">Y ${pool.length - 5} más. </p>` : ''}<button class="btn" data-act="autoassign">⚖️ Repartir todos entre el equipo</button></div></div>` : (k === JEFATURA && can('a_tomar') ? `<div style="margin-top:16px"><button class="btn" data-act="autoassign">⚖️ Repartir expedientes sin responsable</button></div>` : '')}`;
  }
  function vSinAcceso() { return `<div class="card"><div class="empty">🔒 Tu usuario no tiene acceso a esta pantalla.<br>Pídele al administrador que la active.<br><br><a class="btn pri" href="#/resumen">Ir al inicio</a></div></div>`; }

  /* ---- Etapa ---- */
  const SCOLS = {
    cob: [
      { h: 'Banco', f: r => esc(r.o.banco || '—'), s: r => r.o.banco }, { h: 'Inicio cobranza', f: r => fdate(r.o.cob_fInicio) || '—', s: r => r.o.cob_fInicio },
      { h: 'Por recibir', cls: 'r', f: r => money(r.o.cob_porRecibir || 0), s: r => r.o.cob_porRecibir || 0 }, { h: 'Días atención', cls: 'r', f: r => r.d.cobDiasAt ?? '—', s: r => r.d.cobDiasAt }],
    con: [
      { h: 'Atención', f: r => `<span class="nowrap">${esc(r.d.conEstado.charAt(0) + r.d.conEstado.slice(1).toLowerCase())}</span>`, s: r => r.d.conEstado }, { h: 'Firmas', f: r => esc(r.d.conFirma.replace('PENDIENTE', 'Pend.').replace('FIRMAS COMPLETAS', 'Completas')), s: r => r.d.conFirma },
      { h: 'Kardex', f: r => esc(r.o.con_estadoKardex || '—'), s: r => r.o.con_estadoKardex }, { h: 'Plazo', f: r => `${r.d.conDias ?? '—'}d ${cumpBadge(r.d.conCump)}`, s: r => r.d.conDias }],
    fin: [
      { h: 'Aplica', f: r => esc(r.o.fin_tipo || 'Por definir'), s: r => r.o.fin_tipo }, { h: 'Solicitud', f: r => fdate(r.o.fin_fSolicitud) || '—', s: r => r.o.fin_fSolicitud },
      { h: 'Vencimiento', f: r => fdate(r.o.fin_fVenc) || '—', s: r => r.o.fin_fVenc }, { h: 'Semáforo', f: r => semBadge(r.d.semCF || r.d.semMin) }],
    for: [
      { h: 'Lev. hipoteca', f: r => esc(r.o.for_aplicaLev || '—'), s: r => r.o.for_aplicaLev }, { h: 'Ingreso notaría', f: r => fdate(r.o.for_fIngresoNotaria) || '—', s: r => r.o.for_fIngresoNotaria },
      { h: 'Inscripción', f: r => fdate(r.o.for_fInscripcion) || '—', s: r => r.o.for_fInscripcion }, { h: 'Semáforo notarial', f: r => semBadge(r.d.semNot) }],
    pos: [
      { h: 'Derivado', f: r => esc(r.o.pos_derivado || '—'), s: r => r.o.pos_derivado }, { h: 'Entregada', f: r => esc(r.o.pos_entregada || '—'), s: r => r.o.pos_entregada }]
  };

  function vEtapa(key) {
    const st = STAGE[key], F = flt('etapa-' + key, { estado: 'actual', resp: '', proy: '', q: '' }), id = 'rg-etapa';
    const owners = [...new Set([...S.users.filter(u => u.stage === key).map(u => u.name), ...S.ops.map(o => st.ownerKey ? o[st.ownerKey] : st.fixedOwner).filter(Boolean)])];
    const build = () => {
      const all = rows().filter(r => (!F.proy || r.o.proyecto === F.proy) && (!F.resp || r.d.owner[key] === F.resp) && match(r, F.q));
      const cnt = { actual: 0, culminada: 0, porllegar: 0, todas: all.length }; all.forEach(r => cnt[r.d.state[key]]++);
      const list = F.estado === 'todas' ? all : all.filter(r => r.d.state[key] === F.estado);
      const cols = [
        { h: 'Cliente', f: r => opLink(r.o), s: r => r.o.cliente }, { h: 'Responsable', f: r => respCell(r.d.owner[key]), s: r => r.d.owner[key] },
        { h: 'Estado', f: r => stateChip(r.d.state[key]), s: r => r.d.state[key] }, ...SCOLS[key],
        { h: 'Avance', f: r => bar(r.d.progress[key]), s: r => r.d.progress[key] },
        { h: 'Siguiente paso', f: r => r.d.state[key] === 'culminada' ? '<span class="muted">—</span>' : esc((r.d.check[key].find(x => !x.done) || { label: st.accion }).label), },
        { h: 'Alerta', f: r => r.d.etapa === key ? alertBadge(r.d.alerta) : '<span class="muted">—</span>', s: r => r.d.alerta }];
      const chip = (v, l) => `<button class="chipb ${F.estado === v ? 'on' : ''}" data-act="chip" data-v="etapa-${key}" data-k="estado" data-val="${v}" data-r="${id}">${l}<b>${cnt[v]}</b></button>`;
      return `<div class="chips" style="margin-bottom:12px">${chip('actual', 'En curso en esta etapa')}${chip('culminada', 'Culminadas')}${chip('porllegar', 'Por llegar')}${chip('todas', 'Todas')}</div>${tbl(id, cols, list)}`;
    };
    return `<div class="crumb muted"><a href="#/resumen">Resumen</a> / Etapas</div>
    ${pageHead(`<span style="color:${colVar(key)}">Etapa ${st.n}</span> · ${st.name}`, esc(st.desc), '', `Cada fila es un cliente. <b>En curso</b> = está en esta etapa ahora; <b>Culminadas</b> = ya la cerró; <b>Por llegar</b> = aún no llega. La barra de avance muestra cuántos pasos de la etapa están hechos. Toca el nombre para abrir su ficha.`)}
    <div class="filters">
      <input type="search" placeholder="Buscar cliente, DNI, proyecto, unidad…" value="${esc(F.q)}" data-f="etapa-${key}" data-k="q" data-r="${id}">
      <select data-f="etapa-${key}" data-k="resp" data-r="${id}"><option value="">Todos los responsables</option><option value="Sin asignar" ${F.resp === 'Sin asignar' ? 'selected' : ''}>Sin asignar</option>${owners.map(n => `<option ${F.resp === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
      <select data-f="etapa-${key}" data-k="proy" data-r="${id}"><option value="">Todos los proyectos</option>${uniq(o => o.proyecto).map(p => `<option ${F.proy === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
    </div>
    <details class="card info" style="margin-bottom:14px"><summary>👥 Quién trabaja aquí y qué se hace</summary><div class="card-b" style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start"><div style="flex:1;min-width:260px"><h3>Quiénes trabajan esta etapa</h3><div style="margin-top:6px">${S.users.filter(u => u.stage === key).map(u => `<span class="badge plain" style="margin:0 6px 4px 0">${userLink(u.name)} · ${userStats(u).cartera} en cartera</span>`).join('') || '<span class="muted">Sin usuarios asignados</span>'}</div></div>
      <div style="flex:2;min-width:300px"><h3>Funciones de la etapa</h3><ul class="plain small" style="margin-top:6px">${st.funciones.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div></div></details>
    ${region(id, build)}`;
  }

  /* ---- Usuarios ---- */
  function vUsuarios() {
    return `${pageHead('Equipo', 'Cada persona, su etapa y lo que tiene en cartera.', `<button class="btn pri" data-act="user-add">+ Agregar usuario</button>`, 'Cada tarjeta es una persona del equipo. Los números muestran cuántos expedientes tiene ahora (<b>en cartera</b>), cuántos son urgentes y cuántos ya cerró. Toca una tarjeta para ver qué hace y qué le falta.')}
    <div class="grid ucards">${S.users.map(u => {
      const st = userStats(u), k = u.stage;
      return `<a class="card ucard" href="#/usuario/${encodeURIComponent(u.name)}" style="--sc:${colVar(k)}">
        <div style="display:flex;gap:12px;align-items:center"><span class="avatar">${initials(u.name)}</span><div><b>${esc(u.name)}</b><div class="small muted">${esc(u.rol || '')}</div></div></div>
        <div style="margin-top:10px">${k === JEFATURA ? '<span class="sbadge" style="--sc:var(--c-jef)">Supervisa todas las etapas</span>' : sbadge(k)}</div>
        <div class="nums">${k === JEFATURA ? `<div><b>${S.ops.length}</b><span class="small muted">expedientes</span></div>` : `<div><b>${st.cartera}</b><span class="small muted">en cartera</span></div><div><b style="color:${st.crit ? 'var(--rojo)' : 'inherit'}">${st.crit}</b><span class="small muted">críticos</span></div><div><b>${st.cul}</b><span class="small muted">culminados</span></div>`}<div><b>${st.seg}</b><span class="small muted">seguim.</span></div></div></a>`;
    }).join('')}</div>
    <h2 style="margin:22px 0 10px">Gestionar equipo</h2>${usersTable()}`;
  }
  function usersTable() {
    return tbl('rg-users', [
      { h: 'Nombre', f: u => userLink(u.name), s: u => u.name }, { h: 'Rol', f: u => esc(u.rol || '') },
      { h: 'Etapa', f: u => u.stage === JEFATURA ? 'Jefatura' : sbadge(u.stage), s: u => u.stage },
      { h: 'En cartera', cls: 'r', f: u => userStats(u).cartera, s: u => userStats(u).cartera },
      { h: '', cls: 'r nowrap', f: u => `<button class="btn sm" data-act="user-edit" data-u="${esc(u.name)}">Editar</button> <button class="btn sm danger" data-act="user-del" data-u="${esc(u.name)}">Quitar</button>` }], S.users);
  }

  function activityOf(name) {
    const items = [];
    S.log.filter(l => !name || l.usuario === name).forEach(l => items.push({ ts: l.ts, op: l.opId, usuario: l.usuario, tipo: 'Cambio', etapa: l.etapa, txt: `${FIELD_LABEL[l.campo] || l.campo}: ${fmtVal(l.campo, l.antes)} → ${fmtVal(l.campo, l.despues)}` }));
    S.seguimientos.filter(s => !name || s.usuario === name).forEach(s => items.push({ ts: s.ts, op: s.opId, usuario: s.usuario, tipo: s.tipo, etapa: s.etapa, txt: s.nota + (s.proxima ? ` — Próxima: ${s.proxima}` : '') }));
    return items.sort((a, b) => b.ts - a.ts);
  }
  const activityCols = (showUser) => [
    { h: 'Cuándo', f: a => new Date(a.ts).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }), s: a => a.ts },
    ...(showUser ? [{ h: 'Usuario', f: a => userLink(a.usuario), s: a => a.usuario }] : []),
    { h: 'Cliente', f: a => { const o = getOp(a.op); return o ? `<a href="#/cliente/${o.id}">${esc(o.cliente)}</a>` : esc(a.op); } },
    { h: 'Tipo', f: a => `<span class="badge plain gris">${esc(a.tipo)}</span>` }, { h: 'Etapa', f: a => STAGE[a.etapa] ? sbadge(a.etapa) : '—' }, { h: 'Detalle', f: a => esc(a.txt) }];

  function vUsuario(name) {
    const u = user(name); if (!u) return `<div class="empty">Usuario no encontrado. <a href="#/usuarios">Volver al equipo</a></div>`;
    const k = u.stage, T = ui.tab['u-' + name] || 'pend', st = userStats(u);
    if (k === JEFATURA) {
      return `<div class="crumb muted"><a href="#/usuarios">Equipo</a> / ${esc(u.name)}</div>
      ${pageHead(esc(u.name), esc(u.rol))}
      <div class="card"><div class="card-b"><h3>Qué hace</h3><ul class="plain" style="margin-top:6px"><li>Supervisa las 5 etapas del expediente desde la <a href="#/resumen">Torre de control</a>.</li><li>Reasigna expedientes y resuelve cuellos de botella (legal, banco, notaría, cliente).</li><li>Revisa la agenda de seguimientos vencidos de todo el equipo.</li><li>Define plazos (SLA) y el equipo en <a href="#/config">Configuración</a>.</li></ul></div></div>
      <h2 style="margin:22px 0 10px">Equipo</h2>${region('rg-carga', () => loadTable('rg-carga'))}
      <h2 style="margin:22px 0 10px">Actividad reciente del equipo</h2>${tbl('rg-act-all', activityCols(true), activityOf().slice(0, 60), 'Todavía no hay actividad registrada. Cada cambio o seguimiento aparecerá aquí.')}`;
    }
    const s = STAGE[k];
    const mine = rows().filter(r => r.d.owner[k] === name);
    const cartera = mine.filter(r => r.d.state[k] === 'actual'), cul = mine.filter(r => r.d.state[k] === 'culminada');
    const pool = s.ownerKey ? rows().filter(r => r.d.state[k] === 'actual' && r.d.owner[k] === 'Sin asignar') : [];
    const tab = (v, l, n) => `<button class="tab ${T === v ? 'on' : ''}" data-act="tab" data-t="u-${esc(name)}" data-val="${v}">${l}${n != null ? ` <span class="muted">(${n})</span>` : ''}</button>`;
    const base = [{ h: 'Cliente', f: r => opLink(r.o), s: r => r.o.cliente }, { h: 'Proyecto', f: r => esc(r.o.proyecto || '—'), s: r => r.o.proyecto }];
    let body;
    if (T === 'pend') {
      body = tbl('rg-u-pend', [...base, ...SCOLS[k].slice(0, 2), { h: 'Qué falta hacer', f: r => esc(r.d.siguiente) }, { h: 'Avance', f: r => bar(r.d.progress[k]), s: r => r.d.progress[k] }, { h: 'Alerta', f: r => alertBadge(r.d.alerta), s: r => r.d.alerta }], cartera, 'No tiene expedientes en cartera.')
        + (pool.length ? `<h2 style="margin:20px 0 8px">Sin asignar en ${s.name} <span class="muted small">(${pool.length}) — disponibles para tomar</span></h2>${tbl('rg-u-pool', [...base, { h: 'Siguiente paso', f: r => esc(r.d.siguiente) }, { h: '', cls: 'r', f: r => `<button class="btn sm pri" data-act="tomar" data-op="${r.o.id}" data-u="${esc(name)}">Tomar</button>` }], pool.slice(0, 60))}${pool.length > 60 ? `<p class="small muted">Mostrando 60 de ${pool.length}.</p>` : ''}` : '');
    } else if (T === 'cul') body = tbl('rg-u-cul', [...base, { h: 'Etapa actual del expediente', f: r => r.d.etapa === 'cerrado' ? 'Cerrado' : sbadge(r.d.etapa) }, { h: 'Responsable actual', f: r => respCell(r.d.responsable) }], cul, 'Aún no ha culminado expedientes.');
    else body = tbl('rg-u-act', activityCols(false), activityOf(name).slice(0, 100), 'Este usuario todavía no registró cambios ni seguimientos.');
    return `<div class="crumb muted"><a href="#/usuarios">Equipo</a> / ${esc(u.name)}</div>
    <div style="display:flex;gap:14px;align-items:center;margin-bottom:18px;--sc:${colVar(k)}"><span class="avatar" style="width:52px;height:52px;font-size:18px">${initials(u.name)}</span><div><h1>${esc(u.name)}</h1><div class="muted">${esc(u.rol || s.rol)} · ${sbadge(k)}</div></div></div>
    <div class="grid kpis">
      <div class="card kpi"><div class="n">${st.cartera}</div><div class="l">En cartera</div></div><div class="card kpi bad"><div class="n">${st.crit}</div><div class="l">Alerta inmediata</div></div>
      ${k === 'con' ? `<div class="card kpi warn"><div class="n">${st.fuera}</div><div class="l">Fuera de plazo</div></div>` : ''}
      <div class="card kpi"><div class="n">${st.cul}</div><div class="l">Culminados</div></div><div class="card kpi"><div class="n">${st.seg}</div><div class="l">Seguimientos pendientes</div></div><div class="card kpi"><div class="n">${st.act7}</div><div class="l">Acciones (7 días)</div></div></div>
    <div class="card" style="margin-top:14px"><div class="card-b"><h3>Qué hace en ${s.name}</h3><p class="muted small" style="margin:2px 0 6px">${esc(s.desc)}</p><ul class="plain">${s.funciones.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div></div>
    <div class="tabs">${tab('pend', 'En cartera', cartera.length)}${tab('cul', 'Culminados', cul.length)}${tab('act', 'Actividad')}</div>${body}`;
  }

  /* ---- Clientes ---- */
  function miniSteps(r) { return `<div style="display:flex;gap:4px">${STAGES.map(s => { const st = r.d.state[s.key]; return `<span title="${s.name}: ${st}" style="width:22px;height:8px;border-radius:4px;background:${st === 'culminada' ? 'var(--verde)' : st === 'actual' ? colVar(s.key) : 'var(--gris-bg)'}"></span>`; }).join('')}</div>`; }
  function vClientes() {
    const F = flt('clientes', { q: '', etapa: '', alerta: '', proy: '', banco: '', sin: '' }), id = 'rg-cli';
    const build = () => {
      const list = rows().filter(r => match(r, F.q) && (!F.etapa || r.d.etapa === F.etapa) && (!F.alerta || r.d.alerta === F.alerta) && (!F.proy || r.o.proyecto === F.proy) && (!F.banco || r.o.banco === F.banco) && (!F.sin || (r.d.etapa !== 'cerrado' && r.d.responsable === 'Sin asignar')));
      return `<p class="small muted" style="margin:0 0 8px">${list.length} de ${S.ops.length} clientes</p>` + tbl(id, [
        { h: 'Cliente', f: r => opLink(r.o), s: r => r.o.cliente }, { h: 'Banco', f: r => esc(r.o.banco || '—'), s: r => r.o.banco }, { h: 'Precio', cls: 'r', f: r => money(r.o.precio), s: r => r.o.precio || 0 },
        { h: 'Recorrido', f: r => miniSteps(r), s: r => r.d.hechas }, { h: 'Etapa actual', f: r => r.d.etapa === 'cerrado' ? '<span class="badge verde">Cerrado</span>' : sbadge(r.d.etapa), s: r => r.d.etapa },
        { h: 'Responsable', f: r => respCell(r.d.responsable), s: r => r.d.responsable }, { h: 'Siguiente paso', f: r => esc(r.d.siguiente) }, { h: 'Alerta', f: r => alertBadge(r.d.alerta), s: r => r.d.alerta }], list);
    };
    const sel = (k, label, opts) => `<select data-f="clientes" data-k="${k}" data-r="${id}"><option value="">${label}</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${F[k] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    return `${pageHead('Clientes', 'Seguimiento de cada cliente a lo largo de las 5 etapas.', `<button class="btn pri" data-act="newop">+ Nuevo cliente</button>`, 'Busca por nombre, DNI o proyecto. La barra de colores muestra por cuáles etapas ya pasó el cliente (verde = lista, color = etapa actual, gris = falta).')}
    <div class="filters"><input type="search" placeholder="Buscar cliente, DNI, ID, proyecto…" value="${esc(F.q)}" data-f="clientes" data-k="q" data-r="${id}">
      ${sel('etapa', 'Todas las etapas', [...STAGES.map(s => [s.key, s.name]), ['cerrado', 'Cerrado']])}${sel('alerta', 'Todas las alertas', ['Inmediato', 'Por acumulación', 'Bajo control', 'Cerrado'].map(a => [a, ALERT_LABEL[a]]))}${sel('sin', 'Con o sin responsable', [['1', 'Solo sin responsable']])}
      ${sel('proy', 'Todos los proyectos', uniq(o => o.proyecto).map(p => [p, p]))}${sel('banco', 'Todos los bancos', uniq(o => o.banco).map(p => [p, p]))}</div>
    ${region(id, build)}`;
  }

  /* ---- Ficha de cliente ---- */
  function fieldInput(op, f) {
    const v = op[f.k] ?? '', base = `data-fk="${f.k}" data-op="${op.id}"`;
    let inp;
    if (f.t === 'select') inp = `<select ${base}><option value=""></option>${[...new Set([...f.o, ...(v && !f.o.includes(v) ? [v] : [])])].map(x => `<option ${String(v) === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
    else if (f.t === 'owner') { const key = Object.keys(STAGE).find(s => STAGE[s].ownerKey === f.k); const names = [...new Set([...S.users.filter(u => u.stage === key).map(u => u.name), ...(v ? [v] : [])])]; inp = `<select ${base}><option value="">Sin asignar</option>${names.map(x => `<option ${v === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`; }
    else if (f.t === 'textarea') inp = `<textarea rows="2" ${base}>${esc(v)}</textarea>`;
    else inp = `<input type="${f.t === 'number' ? 'number' : f.t === 'date' ? 'date' : 'text'}" ${f.t === 'number' ? 'step="any"' : ''} ${f.list ? `list="dl-${f.list}"` : ''} value="${esc(v)}" ${base}>`;
    return `<label class="f ${f.w === 2 ? 'w2' : ''}">${f.l}${inp}</label>`;
  }
  function kvFor(key, o, d) {
    const kv = (a, b) => `<div><span>${a}</span><b>${b}</b></div>`;
    if (key === 'cob') return kv('Inicial recibido', money(d.cobRecibido)) + kv('Días de atención', d.cobDiasAt ?? '—') + kv('Plazo objetivo', S.params.plazo + ' días');
    if (key === 'con') return kv('Estado de atención', d.conEstado) + kv('Estado de firma', d.conFirma) + kv('Días desde validación', d.conDias ?? '—') + kv('Cumplimiento', cumpBadge(d.conCump));
    if (key === 'fin') return kv('Semáforo carta fianza', semBadge(d.semCF)) + kv('Límite carta fianza', o.fin_fSolicitud ? fdate(iso(CRM.addDays(pd(o.fin_fSolicitud), S.params.slaCF))) : '—');
    if (key === 'for') return kv('Semáforo minuta lev.', semBadge(d.semMin)) + kv('Semáforo notarial', semBadge(d.semNot)) + kv('Límite notarial', o.for_fIngresoNotaria ? fdate(iso(CRM.addDays(pd(o.for_fIngresoNotaria), S.params.slaNot))) : '—');
    return '';
  }
  const checkHtml = (key, d, o) => `<ul class="chk">${d.check[key].map((c, i) => `<li class="tap ${c.done ? 'ok' : ''}" data-act="step" data-op="${o.id}" data-s="${key}" data-i="${i}" role="button" tabindex="0"><span class="tk">${c.done ? '✓' : ''}</span><span class="cl">${esc(c.label)}</span><em>${c.done ? 'Deshacer' : (c.set || c.choose) ? 'Hecho ✓' : 'Completar'}</em></li>`).join('')}</ul><div class="kv">${kvFor(key, o, d)}</div>`;
  const stageHead = (key, d) => `${stateChip(d.state[key])}<span class="small muted">Responsable: <b style="color:var(--ink)">${respCell(d.owner[key])}</b></span>${bar(d.progress[key])}`;
  const headHtml = (o, d) => `<div class="t"><h1>${esc(o.cliente)}</h1>${d.etapa === 'cerrado' ? '<span class="badge verde">Cerrado</span>' : sbadge(d.etapa)}${alertBadge(d.alerta)}</div>
    <div class="meta"><span><b>ID</b>${o.id}</span><span><b>DNI</b>${esc(o.dni || '—')}</span><span><b>Proyecto</b>${esc(o.proyecto || '—')} ${esc(o.unidad || '')}</span><span><b>Vendedor</b>${esc(o.vendedor || '—')}</span><span><b>Banco</b>${esc(o.banco || '—')}</span><span><b>Precio</b>${money(o.precio)}</span><span><b>Financia banco</b>${money(o.montoBanco)}</span><span><b>Días en proceso</b>${d.diasTotal ?? '—'}</span></div>
    <div class="next" ${d.etapa !== 'cerrado' ? `style="--sc:${colVar(d.etapa)}"` : ''}><div><span class="nx-l">Qué sigue</span><b>${esc(d.siguiente)}</b></div><div><span class="nx-l">Responsable</span><b>${respCell(d.responsable)}</b></div>${d.cuello !== 'N/A' ? `<div><span class="nx-l">Se traba en</span><b>${esc(CUELLO_LABEL[d.cuello] || d.cuello)}</b></div>` : ''}${d.etapa !== 'cerrado' ? `<a class="btn pri sm" data-act="gostage" data-s="${d.etapa}" href="#/cliente/${o.id}">Ir a la etapa ›</a>` : ''}</div>`;
  const stepperHtml = (o, d) => STAGES.map(s => { const st = d.state[s.key]; return `<a class="step ${st}" style="--sc:${colVar(s.key)}" data-act="gostage" data-s="${s.key}" href="#/cliente/${o.id}"><span class="si">${st === 'culminada' ? '✓' : s.n}</span><div><div class="b">${s.name}</div><div class="c">${st === 'culminada' ? 'Listo' : st === 'actual' ? 'Aquí ahora' : 'Falta llegar'}</div><div class="a">${esc(d.owner[s.key])}</div></div></a>`; }).join('');

  function timelineItems(o) {
    const items = [];
    milestones(o).forEach(m => items.push({ ts: pd(m.date).getTime() + 12 * 3600000, kind: 'hito', stage: m.stage, head: 'Hito', txt: m.label, day: true }));
    S.seguimientos.filter(s => s.opId === o.id).forEach(s => items.push({ ts: s.ts, kind: 'seg', stage: s.etapa, head: `${s.tipo} · ${s.usuario}`, txt: s.nota, extra: [s.proxima ? `Próxima acción: ${s.proxima}` : '', s.fCompromiso ? `Compromiso: ${fdate(s.fCompromiso)}${s.resuelto ? ' (cumplido)' : ''}` : ''].filter(Boolean).join(' · ') }));
    S.log.filter(l => l.opId === o.id).forEach(l => items.push({ ts: l.ts, kind: 'log', stage: l.etapa, head: `Cambio · ${l.usuario}`, txt: `${FIELD_LABEL[l.campo] || l.campo}: ${fmtVal(l.campo, l.antes)} → ${fmtVal(l.campo, l.despues)}` }));
    return items.sort((a, b) => b.ts - a.ts);
  }
  function timelineHtml(o) {
    const items = timelineItems(o).filter(i => ui.tl === 'todo' || (ui.tl === 'seg' && i.kind === 'seg') || (ui.tl === 'log' && i.kind === 'log') || (ui.tl === 'hito' && i.kind === 'hito'));
    const chip = (v, l) => `<button class="chipb ${ui.tl === v ? 'on' : ''}" data-act="tlf" data-val="${v}" data-op="${o.id}">${l}</button>`;
    return `<div class="chips" style="margin-bottom:12px">${chip('todo', 'Todo')}${chip('seg', 'Seguimientos')}${chip('log', 'Cambios')}${chip('hito', 'Hitos')}</div>
    ${o.observaciones ? `<div class="small" style="background:var(--amar-bg);color:var(--amar);padding:8px 10px;border-radius:8px;margin-bottom:12px"><b>Observación del Excel:</b> ${esc(o.observaciones)}</div>` : ''}
    ${items.length ? `<ul class="tl">${items.slice(0, 80).map(i => `<li class="${i.kind}" style="--sc:${STAGE[i.stage] ? colVar(i.stage) : 'var(--muted)'}"><div class="w">${i.day ? fdate(iso(new Date(i.ts))) : new Date(i.ts).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })} · ${esc(i.head)}${STAGE[i.stage] ? ' · ' + STAGE[i.stage].name : ''}</div><div class="tx">${esc(i.txt)}</div>${i.extra ? `<div class="small muted">${esc(i.extra)}</div>` : ''}</li>`).join('')}</ul>` : '<div class="empty">Sin registros.</div>'}`;
  }

  function vCliente(id) {
    const o = getOp(id); if (!o) return `<div class="empty">Cliente no encontrado. <a href="#/clientes">Volver</a></div>`;
    const d = D.get(id);
    return `<div class="crumb muted"><a href="#/clientes">Clientes</a> / ${o.id}</div>
    <div class="card ficha-h"><div id="f-head">${headHtml(o, d)}</div><div class="stepper" id="f-step">${stepperHtml(o, d)}</div></div>
    <div class="ficha-grid"><div>
      ${STAGES.map(s => `<details class="sc" id="sc-${s.key}" style="--sc:${colVar(s.key)}" ${d.etapa === s.key ? 'open' : ''}><summary>${sbadge(s.key)}<span id="sh-${s.key}" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${stageHead(s.key, d)}</span><span class="grow"></span><span class="muted small">editar ▾</span></summary>
        <div class="sc-body"><div id="sk-${s.key}">${checkHtml(s.key, d, o)}</div><details class="fe"><summary>✏️ Editar datos a mano</summary><div class="f-grid">${FIELDS[s.key].map(f => fieldInput(o, f)).join('')}</div></details></div></details>`).join('')}
      <details class="sc" style="--sc:var(--c-jef)"><summary><b>Datos generales y comerciales</b><span class="grow"></span><span class="muted small">editar ▾</span></summary><div class="sc-body" style="grid-template-columns:1fr"><div class="f-grid">${FIELDS.gen.map(f => fieldInput(o, f)).join('')}</div></div></details>
    </div>
    <div class="card" style="position:sticky;top:70px"><div class="card-h"><h2>Seguimiento del cliente</h2></div><div class="card-b">
      <div class="qs">${['Llamada', 'WhatsApp', 'Correo', 'Reunión', 'Trámite', 'Nota'].map(t => `<button type="button" class="qb" data-act="quickseg" data-op="${o.id}" data-t="${t}"><i>${TIPO_IC[t]}</i><span>${t}</span></button>`).join('')}</div>
      <details class="more"><summary>✍️ Escribir con más detalle</summary><form class="form" id="seg-form" data-op="${o.id}">
        <div class="row2"><label>Tipo<select name="tipo">${['Llamada', 'WhatsApp', 'Correo', 'Reunión', 'Trámite', 'Nota'].map(t => `<option>${t}</option>`).join('')}</select></label>
        <label>Etapa<select name="etapa">${STAGES.map(s => `<option value="${s.key}" ${d.etapa === s.key ? 'selected' : ''}>${s.name}</option>`).join('')}</select></label></div>
        <label>¿Qué pasó?<textarea name="nota" required placeholder="Ej.: Se llamó al cliente, confirmó firma el viernes…"></textarea></label>
        <label>Próxima acción<input name="proxima" placeholder="Ej.: Enviar minuta a notaría"></label>
        <div class="row2"><label>Fecha compromiso<input type="date" name="fCompromiso"></label><label>Registra<input value="${esc(S.actor)}" disabled></label></div>
        <button class="btn pri" type="submit">Registrar seguimiento</button>
      </form></details><hr style="border:0;border-top:1px solid var(--line2);margin:16px 0"><div id="tl">${timelineHtml(o)}</div></div></div></div>
    <div style="margin-top:22px"><button class="btn danger sm" data-act="op-del" data-op="${o.id}">🗑️ Eliminar este cliente</button></div>`;
  }
  function refreshFicha(id) {
    const o = getOp(id), d = D.get(id); if (!o || !$('#f-head')) return;
    $('#f-head').innerHTML = headHtml(o, d); $('#f-step').innerHTML = stepperHtml(o, d); $('#tl').innerHTML = timelineHtml(o);
    STAGES.forEach(s => { $('#sh-' + s.key).innerHTML = stageHead(s.key, d); $('#sk-' + s.key).innerHTML = checkHtml(s.key, d, o); });
    $$('#view [data-fk]').forEach(el => { const v = o[el.dataset.fk]; if (document.activeElement !== el) el.value = v === undefined || v === null ? '' : v; });
    applyPerms();
  }

  /* ---- Agenda ---- */
  function agenda(u) {
    const T = iso(today());
    return S.seguimientos.filter(s => s.fCompromiso && !s.resuelto && (!u || s.usuario === u)).map(s => ({ ...s, cat: s.fCompromiso < T ? 'vencido' : s.fCompromiso === T ? 'hoy' : diff(pd(s.fCompromiso), today()) <= 7 ? 'semana' : 'despues' })).sort((a, b) => a.fCompromiso.localeCompare(b.fCompromiso));
  }
  function vAgenda() {
    const F = flt('agenda', { u: '' }), id = 'rg-ag';
    const build = () => {
      const items = agenda(F.u); const groups = [['vencido', 'Vencidos', 'rojo'], ['hoy', 'Para hoy', 'amar'], ['semana', 'Próximos 7 días', 'verde'], ['despues', 'Más adelante', 'gris']];
      if (!items.length) return `<div class="tw"><div class="empty">No hay seguimientos con fecha de compromiso pendientes.<br>Se crean desde la ficha de cada cliente.</div></div>`;
      return groups.map(([k, l, c]) => { const g = items.filter(i => i.cat === k); if (!g.length) return ''; return `<h2 style="margin:18px 0 8px">${l} <span class="badge ${c} plain">${g.length}</span></h2>` + tbl(id + '-' + k, [
        { h: 'Compromiso', f: i => fdate(i.fCompromiso) }, { h: 'Cliente', f: i => { const o = getOp(i.opId); return o ? opLink(o) : esc(i.opId); } }, { h: 'Etapa', f: i => STAGE[i.etapa] ? sbadge(i.etapa) : '' },
        { h: 'Responsable', f: i => userLink(i.usuario) }, { h: 'Pendiente', f: i => `${esc(i.proxima || i.nota)}` }, { h: '', cls: 'r', f: i => `<button class="btn sm" data-act="seg-done" data-id="${i.id}">Marcar cumplido</button>` }], g); }).join('');
    };
    return `${pageHead('Agenda de seguimiento', 'Compromisos pendientes con clientes, por responsable.', '', 'Se llena cuando registras un seguimiento con <b>fecha compromiso</b>. Rojo = ya venció. Toca "Marcar cumplido" cuando lo resuelvas.')}
    <div class="filters"><select data-f="agenda" data-k="u" data-r="${id}"><option value="">Todo el equipo</option>${S.users.map(u => `<option ${F.u === u.name ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>${region(id, build)}`;
  }

  /* ---- Configuración ---- */
  function vConfig() {
    const P = S.params, pf = (k, l, h) => `<label class="f">${l}<input type="number" min="0" value="${P[k]}" data-pk="${k}"><span class="small">${h}</span></label>`;
    return `${pageHead('Configuración', 'Permisos, plazos, equipo y datos.')}
    ${isAdmin() ? permsPanel() : ''}
    <div class="grid two" style="margin-top:14px">
      <div class="card"><div class="card-h"><h2>Plazos (SLA)</h2></div><div class="card-b f-grid" style="grid-template-columns:1fr 1fr">${pf('plazo', 'Plazo objetivo de atención (días)', 'Contratos: desde validación')}${pf('anticipo', 'Días de anticipación (por vencer)', 'Alerta amarilla')}${pf('slaCF', 'SLA carta fianza (días)', 'Desde solicitud')}${pf('slaMin', 'SLA minuta de levantamiento (días)', 'Desde desembolso')}${pf('slaNot', 'SLA trámite notarial (días)', 'Desde ingreso a notaría')}${pf('metaEficacia', 'Meta de eficacia (%)', 'Cerrados ÷ trabajados')}${pf('metaEficiencia', 'Meta de eficiencia (%)', 'Cerrados dentro del plazo')}${pf('metaSemana', 'Meta de cierres por semana', 'Procesos de toda el área')}${pf('metaDia', 'Meta de acciones por día', 'Por persona (Mi día)')}</div></div>
      <div class="card"><div class="card-h"><h2>Datos</h2></div><div class="card-b" style="display:grid;gap:10px">
        <div><button class="btn pri" data-act="export-xlsx">Exportar a Excel (por etapa y por usuario)</button></div>
        <div><button class="btn" data-act="export-json">Descargar respaldo (.json)</button> <button class="btn" data-act="export-js">Descargar datos para el repositorio (operaciones.js)</button></div>
        <div><button class="btn" data-act="import">Importar Excel original o respaldo…</button><input type="file" id="file" accept=".xlsx,.xlsm,.json" hidden></div>
        <div><button class="btn danger" data-act="reset">Volver a los datos del repositorio</button></div>
        <p class="small muted" style="margin:0">Los cambios se guardan en este navegador. Para compartirlos con el equipo, descarga <b>operaciones.js</b> y súbelo a la carpeta <code>data/</code> del repositorio (ver README).</p></div></div>
    </div>
    <div class="card" style="margin-top:14px"><div class="card-h"><h2>Equipo</h2><button class="btn sm pri" data-act="user-add">+ Agregar usuario</button></div><div class="card-b">${usersTable()}</div></div>`;
  }


  function permsPanel() {
    const people = S.users.filter(u => !u.admin);
    if (!ui.permU || !people.find(u => u.name === ui.permU)) ui.permU = people[0] && people[0].name;
    const sel = ui.permU;
    const sw = (g) => PERMS.filter(p => p.g === g).map(p => `<label class="sw"><input type="checkbox" data-perm="${p.k}" data-u="${esc(sel)}" ${can(p.k, sel) ? 'checked' : ''}><span class="knob"></span><span class="swl">${p.l}</span></label>`).join('');
    return `<div class="card perms"><div class="card-h"><h2>🔐 Permisos: qué puede ver y usar cada persona ${tip('Apaga un botón o una pantalla y esa persona deja de verlo. Tú, como administrador, siempre tienes todo.')}</h2></div><div class="card-b">
      ${people.length ? `<div class="chips" style="margin-bottom:12px">${people.map(u => `<button class="chipb ${u.name === sel ? 'on' : ''}" data-act="perm-user" data-u="${esc(u.name)}">${esc(u.name.split(' ').slice(0, 2).join(' '))}</button>`).join('')}</div>
      <div class="tpls"><span class="small muted">Plantillas rápidas:</span> <button class="btn sm" data-act="perm-tpl" data-val="view">👁️ Solo consulta</button> <button class="btn sm" data-act="perm-tpl" data-val="ops">🛠️ Operativo</button> <button class="btn sm" data-act="perm-tpl" data-val="all">⭐ Todo</button> <button class="btn sm" data-act="perm-try">▶ Probar como ${esc(sel.split(' ')[0])}</button></div>
      <h3 style="margin:14px 0 6px">Pantallas</h3><div class="switches">${sw('v')}</div><h3 style="margin:14px 0 6px">Botones</h3><div class="switches">${sw('a')}</div>` : '<div class="empty">Agrega usuarios en Equipo para darles permisos.</div>'}
      ${CL.enabled ? '<p class="small muted" style="margin:14px 0 0">🔒 En modo nube, el acceso lo protege el correo y la contraseña de cada persona.</p><!--' : ''}<hr style="border:0;border-top:1px solid var(--line2);margin:16px 0"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><b>PIN de administrador:</b> ${S.adminPin ? '<span class="badge verde">Activado</span> <button class="btn sm" data-act="pin-set">Cambiar PIN</button> <button class="btn sm danger" data-act="pin-clear">Quitar PIN</button>' : '<span class="badge amar">Sin PIN</span> <button class="btn sm pri" data-act="pin-set">Crear PIN</button>'}</div>
      <p class="small muted" style="margin:8px 0 0">El PIN protege la cuenta de administrador al cambiar de usuario. Es una barrera de uso, no seguridad bancaria: los datos viven en el navegador y en el repositorio.</p>${CL.enabled ? '-->' : ''}</div></div>`;
  }
  function setPin() {
    modal({ title: 'PIN de administrador', ok: 'Guardar PIN', body: '<div class="form"><label>Nuevo PIN (4 a 8 números)<input id="pin1" type="password" inputmode="numeric" autocomplete="off"></label><label>Repítelo<input id="pin2" type="password" inputmode="numeric" autocomplete="off"></label></div>',
      onOk: (dlg) => { const a1 = dlg.querySelector('#pin1').value, a2 = dlg.querySelector('#pin2').value; if (!/^\d{4,8}$/.test(a1)) { toast('Usa de 4 a 8 números'); return false; } if (a1 !== a2) { toast('Los PIN no coinciden'); return false; } S.adminPin = hashPin(a1); setAdminSession(true); save(); toast('PIN guardado'); render(true); } });
  }
  function setPerm(u, k, v) { S.perms[u] = { ...(S.perms[u] || {}), [k]: v }; S.log.push({ ts: Date.now(), usuario: S.actor, opId: '—', etapa: 'gen', campo: 'permiso', antes: u + ' · ' + k, despues: v ? 'Activado' : 'Desactivado' }); save(); }
  function applyPerms() {
    $$('[data-act]').forEach(el => { const k = ACT_PERM[el.dataset.act]; if (k && el.dataset.act !== 'step') el.hidden = !can(k); });
    $$('#view [data-fk]').forEach(el => el.disabled = !can('a_edit'));
    $$('#view [data-pk]').forEach(el => el.disabled = !can('a_params'));
    const f = $('#seg-form'); if (f) f.closest('details').hidden = !can('a_seg');
    $$('#view .chk li.tap').forEach(li => li.classList.toggle('ro', !can('a_edit')));
    if (CL.enabled) $$('[data-act=reset],[data-act=export-js],[data-act=dismiss-banner]').forEach(el => el.hidden = true);
    const fab = $('#fab'); if (fab) fab.hidden = !(can('a_seg') || can('a_newop'));
  }

  /* ---- Actividad por colaborador ---- */
  function vActividad() {
    const F = flt('actividad', { u: '', tipo: '', desde: '', hasta: '' }), id = 'rg-actv';
    const inRange = (ts) => !(F.desde && ts < new Date(F.desde + 'T00:00:00').getTime()) && !(F.hasta && ts > new Date(F.hasta + 'T23:59:59').getTime());
    const build = () => {
      const base = (n) => activityOf(n).filter(a => inRange(a.ts));
      const items = base(F.u).filter(a => !F.tipo || (F.tipo === 'cambio' ? a.tipo === 'Cambio' : a.tipo !== 'Cambio'));
      const sum = S.users.filter(u => !F.u || u.name === F.u).map(u => { const its = base(u.name); return { u, cambios: its.filter(a => a.tipo === 'Cambio').length, seg: its.filter(a => a.tipo !== 'Cambio').length, exp: new Set(its.map(a => a.op)).size, ult: its[0] ? its[0].ts : 0, pend: S.seguimientos.filter(s => s.usuario === u.name && !s.resuelto).length }; });
      return `<h2 style="margin:6px 0 8px">Resumen por colaborador</h2>` + tbl(id + '-sum', [
        { h: 'Colaborador', f: r => userLink(r.u.name), s: r => r.u.name }, { h: 'Etapa', f: r => r.u.stage === JEFATURA ? 'Jefatura' : sbadge(r.u.stage), s: r => r.u.stage },
        { h: 'Cambios de datos', cls: 'r', f: r => r.cambios, s: r => r.cambios }, { h: 'Seguimientos registrados', cls: 'r', f: r => r.seg, s: r => r.seg },
        { h: 'Total acciones', cls: 'r', f: r => `<b>${r.cambios + r.seg}</b>`, s: r => r.cambios + r.seg }, { h: 'Expedientes trabajados', cls: 'r', f: r => r.exp, s: r => r.exp },
        { h: 'Compromisos pendientes', cls: 'r', f: r => r.pend, s: r => r.pend }, { h: 'Última actividad', f: r => r.ult ? new Date(r.ult).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '<span class="muted">—</span>', s: r => r.ult }], sum)
        + `<h2 style="margin:22px 0 8px">Detalle de acciones <span class="muted small">(${items.length}${items.length > 300 ? ', se muestran 300' : ''})</span></h2>`
        + tbl(id + '-det', activityCols(true), items.slice(0, 300), 'Aún no hay acciones registradas en este rango. Cada cambio de datos o seguimiento aparecerá aquí con el nombre de quien lo hizo.');
    };
    return `${pageHead('Actividad del equipo', 'Qué acciones realizó cada colaborador, cuándo y sobre qué expediente.', `<button class="btn" data-act="export-xlsx">Descargar Excel</button>`, 'Aquí queda el rastro de lo que hizo cada colaborador: cambios de datos y seguimientos registrados, con fecha y cliente.')}
    <div class="filters"><select data-f="actividad" data-k="u" data-r="${id}"><option value="">Todos los colaboradores</option>${S.users.map(u => `<option ${F.u === u.name ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>
      <select data-f="actividad" data-k="tipo" data-r="${id}"><option value="">Cambios y seguimientos</option><option value="cambio" ${F.tipo === 'cambio' ? 'selected' : ''}>Solo cambios de datos</option><option value="seg" ${F.tipo === 'seg' ? 'selected' : ''}>Solo seguimientos</option></select>
      <label class="small muted">Desde <input type="date" value="${esc(F.desde)}" data-f="actividad" data-k="desde" data-r="${id}"></label>
      <label class="small muted">Hasta <input type="date" value="${esc(F.hasta)}" data-f="actividad" data-k="hasta" data-r="${id}"></label></div>
    ${region(id, build)}`;
  }

  /* ---- Gestión de usuarios ---- */
  function userForm(u) {
    return `<div class="form"><label>Nombre<input id="u-n" value="${esc(u ? u.name : '')}"></label><label>Rol / cargo<input id="u-r" value="${esc(u ? u.rol || '' : '')}" placeholder="Ej.: Asistente Legal"></label>
      <label>Etapa en la que trabaja<select id="u-s">${STAGES.map(s => `<option value="${s.key}" ${u && u.stage === s.key ? 'selected' : ''}>${s.n}. ${s.name}</option>`).join('')}<option value="${JEFATURA}" ${u && u.stage === JEFATURA ? 'selected' : ''}>Jefatura (supervisa todo)</option></select></label>
      <label>Correo de acceso${CL.enabled ? ' (obligatorio)' : ' (opcional)'}<input id="u-e" type="email" value="${esc(u ? u.email || '' : '')}" placeholder="nombre@correo.com"></label>
      <label class="swrow"><input type="checkbox" id="u-a" ${u && u.admin ? 'checked' : ''}> Es administrador (da y quita permisos)</label></div>`;
  }
  function addUser() {
    modal({ title: 'Agregar usuario', body: userForm(null), ok: 'Agregar', onOk: (dlg) => {
      const n = dlg.querySelector('#u-n').value.trim(), s = dlg.querySelector('#u-s').value;
      if (!n) { toast('Escribe el nombre'); return false; } if (user(n)) { toast('Ya existe un usuario con ese nombre'); return false; }
      const em = dlg.querySelector('#u-e').value.trim().toLowerCase();
      if (CL.enabled && !/^\S+@\S+\.\S+$/.test(em)) { toast('Escribe un correo válido'); return false; }
      if (em && S.users.some(x => (x.email || '').toLowerCase() === em)) { toast('Ese correo ya está en el equipo'); return false; }
      S.users.push({ name: n, stage: s, rol: dlg.querySelector('#u-r').value.trim() || (STAGE[s] ? STAGE[s].rol : 'Jefatura'), admin: dlg.querySelector('#u-a').checked || undefined, email: em || undefined });
      if (CL.enabled) { const pw = Math.random().toString(36).slice(2) + 'Aa1!' + Math.random().toString(36).slice(2); CL.createAccount(em, pw).catch(x => { if (x.code !== 'auth/email-already-in-use') throw x; }).then(() => CL.reset(em)).then(() => toast('📧 Se envió un correo a ' + em + ' para crear su contraseña')).catch(x => toast('Usuario agregado, pero no se pudo crear la cuenta: ' + (x.code || x.message))); }
      S.log.push({ ts: Date.now(), usuario: S.actor, opId: '—', etapa: 'gen', campo: 'usuario_alta', antes: '', despues: n }); save(); toast('Usuario agregado'); render(true); } });
  }
  function editUser(name) {
    const u = user(name); if (!u) return;
    modal({ title: 'Editar usuario', body: userForm(u) + `<p class="small muted">Si cambias el nombre, se actualiza en los expedientes y en el historial. Si cambias la etapa, sus expedientes de la etapa anterior siguen a su nombre.</p>`, ok: 'Guardar', onOk: (dlg) => {
      const n = dlg.querySelector('#u-n').value.trim(), s = dlg.querySelector('#u-s').value;
      if (!n) { toast('Escribe el nombre'); return false; } if (n !== u.name && user(n)) { toast('Ya existe un usuario con ese nombre'); return false; }
      if (CL.enabled && n !== u.name) { toast('En modo nube no se puede cambiar el nombre. Crea un usuario nuevo.'); return false; }
      const em2 = dlg.querySelector('#u-e').value.trim().toLowerCase(); if (CL.enabled && !/^\S+@\S+\.\S+$/.test(em2)) { toast('Escribe un correo válido'); return false; }
      if (n !== u.name) {
        STAGES.forEach(st => { if (st.ownerKey) S.ops.forEach(o => { if (o[st.ownerKey] === u.name) o[st.ownerKey] = n; }); });
        S.seguimientos.forEach(x => { if (x.usuario === u.name) x.usuario = n; }); S.log.forEach(x => { if (x.usuario === u.name) x.usuario = n; });
        if (S.perms[u.name]) { S.perms[n] = S.perms[u.name]; delete S.perms[u.name]; }
        if (S.actor === u.name) S.actor = n;
      }
      const adm = dlg.querySelector('#u-a').checked; if (u.admin && !adm && S.users.filter(x => x.admin).length < 2) { toast('Debe quedar al menos un administrador'); return false; }
      u.name = n; u.stage = s; u.rol = dlg.querySelector('#u-r').value.trim(); u.admin = adm || undefined; u.email = em2 || undefined; commit(); toast('Usuario actualizado'); render(true); } });
  }
  function removeUser(name) {
    const u = user(name); if (!u) return;
    if (u.admin && S.users.filter(x => x.admin).length < 2) return toast('Debe quedar al menos un administrador');
    const k = u.stage, st = STAGE[k];
    const enCurso = st && st.ownerKey ? rows().filter(r => r.d.owner[k] === name && r.d.state[k] === 'actual').length : 0;
    const otros = S.users.filter(x => x.stage === k && x.name !== name);
    modal({ title: `Quitar a ${name}`, ok: 'Quitar usuario', body: `<p>${enCurso ? `Tiene <b>${enCurso}</b> expedientes en curso en ${st.name}.` : 'No tiene expedientes en curso.'} Su historial de acciones se conserva.</p>
      ${enCurso ? `<div class="form"><label>¿Qué hacemos con sus expedientes en curso?<select id="rm-mode"><option value="keep">Dejarlos a su nombre</option><option value="none">Pasarlos a "Sin asignar"</option>${otros.map(o => `<option value="${esc(o.name)}">Reasignar a ${esc(o.name)}</option>`).join('')}</select></label></div>` : ''}`,
      onOk: (dlg) => {
        const mode = dlg.querySelector('#rm-mode') ? dlg.querySelector('#rm-mode').value : 'keep';
        if (mode !== 'keep' && enCurso) rows().filter(r => r.d.owner[k] === name && r.d.state[k] === 'actual').forEach(r => setField(r.o.id, st.ownerKey, mode === 'none' ? '' : mode));
        S.users = S.users.filter(x => x.name !== name); delete S.perms[name]; if (S.actor === name) S.actor = S.users[0] && S.users[0].name;
        S.log.push({ ts: Date.now(), usuario: S.actor, opId: '—', etapa: 'gen', campo: 'usuario_baja', antes: name, despues: '' }); commit(); toast('Usuario quitado'); render(true); } });
  }

  /* ---- Ayuda ---- */
  function vAyuda() {
    const step = (n, t, d) => `<div class="how"><span class="hn">${n}</span><div><b>${t}</b><p class="muted">${d}</p></div></div>`;
    return `${pageHead('Ayuda', 'Cómo funciona el CRM en 2 minutos.', `<button class="btn" data-act="welcome">Ver la bienvenida</button>`)}
    <h2 class="sec" style="margin-top:0">El camino de cada cliente</h2>
    <div class="flow help-flow">${STAGES.map((s, i) => `<div class="fstage" style="--sc:${colVar(s.key)}"><div class="fs-top"><span class="fs-n">${s.n}</span><b>${s.name}</b></div><p class="small muted" style="margin:6px 0">${esc(s.desc)}</p><div class="fs-who">${IC.nouser.replace('<svg', '<svg class="mini"')}${esc(s.rol)}</div></div>${i < 4 ? '<span class="arrow">›</span>' : ''}`).join('')}</div>
    <h2 class="sec">¿Qué significan los colores?</h2>
    <div class="grid two"><div class="card"><div class="card-b">${['Inmediato', 'Por acumulación', 'Bajo control', 'Cerrado'].map(a => `<div class="lg2">${alertChip(a)}<span>${ALERT_HELP[a]}</span></div>`).join('')}</div></div>
    <div class="card"><div class="card-b"><div class="lg2"><span class="badge verde">En plazo</span><span>Está dentro del tiempo permitido (SLA).</span></div><div class="lg2"><span class="badge amar">Por vencer</span><span>Faltan ${S.params.anticipo} días o menos para el límite.</span></div><div class="lg2"><span class="badge rojo">Vencido</span><span>Ya pasó el plazo.</span></div><div class="lg2"><span class="badge rojo plain">Sin asignar</span><span>Nadie es responsable todavía. Asígnalo desde la ficha o con "Tomar".</span></div></div></div></div>
    <h2 class="sec">Lo más común, paso a paso</h2>
    <div class="grid two">
      <div class="card"><div class="card-b">${step(1, 'Registrar una llamada o gestión', 'Entra a <b>Clientes</b>, abre al cliente y completa "Seguimiento del cliente": qué pasó, próxima acción y fecha compromiso.')}${step(2, 'Avanzar una etapa', 'En la ficha abre la etapa y completa las fechas (por ejemplo, firma del cliente). El CRM mueve solo al expediente cuando la etapa se completa.')}${step(3, 'Asignar un responsable', 'En la ficha elige el nombre en "Responsable", o entra al usuario y toca <b>Tomar</b> en los expedientes sin asignar.')}</div></div>
      <div class="card"><div class="card-b">${step(4, 'Ver qué hace cada persona', 'Ve a <b>Actividad</b>: muestra cada cambio y seguimiento con el nombre de quien lo hizo.')}${step(5, 'Agregar o quitar usuarios', 'Ve a <b>Equipo</b>, abajo en "Gestionar equipo".')}${step(6, 'Descargar indicadores', 'Toca <b>Descargar Excel</b> arriba: trae productividad, eficiencia y eficacia por persona y por etapa.')}</div></div>
    </div>
    <h2 class="sec">Glosario</h2>
    <div class="card"><div class="card-b gloss">
      ${[['Kardex', 'Número de registro del documento en la notaría.'], ['Minuta', 'Borrador del contrato de compraventa que firman las partes.'], ['Carta fianza', 'Garantía del banco que respalda el desembolso.'], ['Levantamiento de hipoteca', 'Trámite para liberar la hipoteca previa del inmueble.'], ['SUNARP', 'Registro público donde se inscribe la propiedad.'], ['Independización', 'Inscripción de la unidad como inmueble propio.'], ['SLA / plazo objetivo', 'Días máximos para completar una etapa.'], ['Cuello de botella', 'Quién o qué está frenando un expediente.'], ['Eficacia', 'De lo asignado, cuánto se llegó a cerrar.'], ['Eficiencia', 'Si se atiende en menos o más días que el plazo objetivo.'], ['Productividad', 'Procesos cerrados por día hábil.']].map(([t, d]) => `<div><b>${t}</b><span class="muted">${d}</span></div>`).join('')}</div></div>`;
  }
  function showWelcome() {
    const s = (n, t, d) => `<div class="how"><span class="hn">${n}</span><div><b>${t}</b><p class="muted">${d}</p></div></div>`;
    modal({ title: '👋 Bienvenida al CRM de Contratos y Cobranzas', ok: 'Entendido, empezar', cancel: '', body: `<p class="muted" style="margin-top:0">Cada cliente pasa por <b>5 etapas</b>: Cobranzas → Contratos → Finanzas → Formalización → Postventa.</p>
      ${s(1, 'Elige quién eres', 'Arriba, en "Trabajando como". Así queda registrado quién hizo cada acción.')}${s(2, 'Abre Mi día', 'Ahí ves tus expedientes del más urgente al menos urgente, con un botón para el siguiente paso.')}${s(3, 'Toca, no escribas', 'En cada cliente toca el paso que hiciste (queda con la fecha de hoy) y usa 📞 💬 para anotar una gestión en 2 toques.')}${s(4, 'Mide resultados', 'Con "Descargar Excel" obtienes productividad, eficiencia y eficacia.')}
      <p class="small muted">Tip: el botón <b>☾ / ☀</b> cambia entre modo noche y día. Puedes volver a esta guía en <b>Ayuda</b>.</p>`, onOk: () => { try { localStorage.setItem('crm-mg-welcome', '1'); } catch (e) { } }, onCancel: () => { try { localStorage.setItem('crm-mg-welcome', '1'); } catch (e) { } } });
  }

  /* ================= router ================= */
  function route() { const [, view, arg] = location.hash.slice(1).split('/'); return { view: view || 'resumen', arg: arg ? decodeURIComponent(arg) : '' }; }
  function navHtml(r) {
    const all = rows();
    const item = (href, label, extra, on, dot) => `<a href="${href}" class="${on ? 'on' : ''}">${dot ? `<span class="dot" style="background:${dot}"></span>` : ''}${label}${extra || ''}</a>`;
    const venc = agenda().filter(a => a.cat === 'vencido').length;
    const I = { help: IC.help, act: '<svg viewBox="0 0 24 24"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>', home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>', sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>', users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M17 5a3.5 3.5 0 0 1 0 7M22 21c0-3-2-5-5-5.5"/></svg>', cli: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/></svg>', cal: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>', cfg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/></svg>' };
    const seg = [can('v_clientes') && item('#/clientes', I.cli + 'Clientes', `<span class="cnt">${all.length}</span>`, r.view === 'clientes' || r.view === 'cliente'), can('v_equipo') && item('#/usuarios', I.users + 'Equipo', '', r.view === 'usuarios' || r.view === 'usuario'), can('v_actividad') && item('#/actividad', I.act + 'Actividad', '', r.view === 'actividad'), can('v_agenda') && item('#/agenda', I.cal + 'Agenda', venc ? `<span class="cnt hot">${venc}</span>` : '', r.view === 'agenda')].filter(Boolean).join('');
    return `<div class="nav-h">Menú</div>${item('#/resumen', I.home + 'Inicio', '', r.view === 'resumen')}${can('v_mi') ? item('#/mi', I.sun + 'Mi día', '', r.view === 'mi') : ''}
      ${can('v_etapas') ? `<div class="nav-h">Gestión por etapa</div>${STAGES.map(s => { const n = all.filter(x => x.d.etapa === s.key).length; return item('#/etapa/' + s.key, `${s.n}. ${s.name}`, `<span class="cnt">${n}</span>`, r.view === 'etapa' && r.arg === s.key, colVar(s.key)); }).join('')}` : ''}
      ${seg ? `<div class="nav-h">Seguimiento</div>${seg}` : ''}
      <div class="nav-h">Más</div>${item('#/ayuda', I.help + 'Ayuda', '', r.view === 'ayuda')}${can('v_config') ? item('#/config', I.cfg + 'Configurar', '', r.view === 'config') : ''}`;
  }
  function tabbarHtml(r) {
    const t = (href, ic, l, on, act) => `<a href="${href}" class="${on ? 'on' : ''}" ${act ? `data-act="${act}"` : ''}>${ic}<span>${l}</span></a>`;
    const svg = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
    return [t('#/resumen', svg('<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>'), 'Inicio', r.view === 'resumen'),
      can('v_mi') && t('#/mi', svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'), 'Mi día', r.view === 'mi'),
      can('v_clientes') && t('#/clientes', svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/>'), 'Clientes', r.view === 'clientes' || r.view === 'cliente'),
      can('v_agenda') && t('#/agenda', svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>'), 'Agenda', r.view === 'agenda'),
      t('javascript:void 0', svg('<path d="M4 6h16M4 12h16M4 18h16"/>'), 'Más', false, 'nav-toggle')].filter(Boolean).join('');
  }
  function renderDatalists() {
    const dl = (id, vals) => `<datalist id="dl-${id}">${vals.map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
    $('#dls').innerHTML = dl('proyecto', uniq(o => o.proyecto)) + dl('vendedor', uniq(o => o.vendedor)) + dl('jefeVentas', uniq(o => o.jefeVentas)) + dl('banco', uniq(o => o.banco)) + dl('notaria', uniq(o => o.con_notaria)) + dl('abogado', uniq(o => o.con_abogado));
  }
  let lastKey = '';
  function render(keepScroll) {
    if (!gateCheck()) return;
    const r = route(); let html;
    if (!S.ops.length && r.view !== 'config') html = `${pageHead('Bienvenida', 'Todavía no hay datos cargados.')}<div class="card"><div class="card-b"><p>Importa tu Excel <b>SEGUIMIENTOS.xlsx</b> (hoja BASE_MAESTRA) o un respaldo desde <a href="#/config">Configuración</a>.</p></div></div>`;
    else {
      try {
        html = (VIEW_PERM[r.view] && !can(VIEW_PERM[r.view])) ? vSinAcceso() : r.view === 'mi' ? vMiDia() : r.view === 'etapa' && STAGE[r.arg] ? vEtapa(r.arg) : r.view === 'usuarios' ? vUsuarios() : r.view === 'usuario' ? vUsuario(r.arg) : r.view === 'clientes' ? vClientes()
          : r.view === 'cliente' ? vCliente(r.arg) : r.view === 'agenda' ? vAgenda() : r.view === 'actividad' ? vActividad() : r.view === 'ayuda' ? vAyuda() : r.view === 'config' ? vConfig() : vResumen();
      } catch (e) { console.error(e); html = `<div class="empty">Error al mostrar la vista: ${esc(e.message)}</div>`; }
    }
    $('#view').innerHTML = html;
    $('#nav').innerHTML = navHtml(r); $('#tabbar').innerHTML = tabbarHtml(r);
    const key = location.hash;
    if (!keepScroll && key !== lastKey) window.scrollTo(0, 0);
    lastKey = key;
    renderDatalists(); renderTop(); applyPerms();
    $('.side').classList.remove('open');
  }
  function renderTop() {
    $('#gproy').innerHTML = `<option value="">Todos los proyectos</option>` + uniq(o => o.proyecto).map(p => `<option ${ui.proy === p ? 'selected' : ''}>${esc(p)}</option>`).join('');
    $('#actor').innerHTML = (CL.enabled ? S.users.filter(u => u.name === S.actor) : S.users).map(u => `<option ${u.name === S.actor ? 'selected' : ''}>${esc(u.name)}</option>`).join('');
    $('#actor').disabled = CL.enabled; $('#logoutBtn').hidden = !CL.enabled;
    const nuevo = !CL.enabled && window.CRM_DATA && window.CRM_DATA.version && S.seedVersion !== window.CRM_DATA.version;
    if (ui.previewReal) { $('#banner').innerHTML = `<div class="banner">👁️ Estás probando el CRM como <b>${esc(S.actor)}</b>. <button class="btn sm" data-act="perm-back">Volver a mi usuario</button></div>`; return; }
    $('#banner').innerHTML = nuevo ? `<div class="banner">El repositorio tiene datos más recientes que los de este navegador. <button class="btn sm" data-act="reset">Cargar datos del repositorio</button> <button class="btn sm" data-act="dismiss-banner">Mantener los míos</button></div>` : '';
  }

  /* ================= exportación / importación ================= */
  function download(name, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  /* ---------- Excel de procesos e indicadores ---------- */
  const bdays = (a, b) => { let n = 0; for (let d = new Date(a); d <= b; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) { const w = d.getDay(); if (w && w < 6) n++; } return n; };
  const ESTADO = { culminada: 'Culminada', actual: 'En curso', porllegar: 'Por llegar' };
  function procesosRows() {
    const T = today(), P = S.params, out = [];
    rows().forEach(({ o, d }) => STAGES.forEach(s => {
      const k = s.key; let ini = '', fin = '', sla = null, aplica = true;
      if (k === 'cob') { ini = o.cob_fInicio; fin = o.cob_fCulm; sla = P.plazo; }
      else if (k === 'con') { ini = o.con_fValidacion; fin = o.con_fCulm || (d.done.con ? (o.con_fFirmaCliente > o.con_fFirmaRL ? o.con_fFirmaCliente : o.con_fFirmaRL) : ''); sla = P.plazo; }
      else if (k === 'fin') { if (o.fin_tipo === 'No aplica') aplica = false; else if (o.fin_tipoSolicitud === 'MINUTA DE LEVANTAMIENTO') { ini = o.fin_fDesembolso; fin = o.for_fFirmaMinuta; sla = P.slaMin; } else { ini = o.fin_fSolicitud; fin = o.fin_fEmision; sla = P.slaCF; } }
      else if (k === 'for') { ini = o.for_fInicio || o.for_fIngresoNotaria; fin = o.for_fIndep; sla = P.slaNot; }
      const st = d.state[k]; ini = ini || ''; fin = (st === 'culminada' && fin) ? fin : '';
      let dias = null; if (ini && fin) dias = Math.max(0, diff(pd(fin), pd(ini))); else if (ini && st === 'actual') dias = Math.max(0, diff(T, pd(ini)));
      let cumple = ''; if (dias != null && sla != null) cumple = fin ? (dias <= sla ? 'Sí' : 'No') : (dias <= sla ? 'En plazo' : 'Vencido');
      out.push({ o, d, k, stage: s, owner: d.owner[k], estado: aplica ? ESTADO[st] : 'No aplica', st, aplica, ini, fin, dias, sla, cumple });
    }));
    return out;
  }
  const rng = (opts) => { const desde = opts.desde ? pd(opts.desde) : null, hasta = opts.hasta ? pd(opts.hasta) : null; return { desde, hasta, ts0: desde ? desde.getTime() : 0, ts1: hasta ? hasta.getTime() + 86399999 : Infinity }; };
  function indicadores(list, name, R, accionesCount) {
    const apl = list.filter(p => p.aplica);
    const cul = apl.filter(p => p.st === 'culminada'), curso = apl.filter(p => p.st === 'actual');
    const finP = cul.filter(p => p.fin && pd(p.fin).getTime() >= R.ts0 && pd(p.fin).getTime() <= R.ts1);
    const fines = cul.filter(p => p.fin).map(p => pd(p.fin).getTime());
    const d0 = R.desde || (fines.length ? new Date(Math.min(...fines)) : today()), d1 = R.hasta || today();
    const hab = Math.max(1, bdays(d0, d1));
    const med = cul.filter(p => p.dias != null && p.sla != null);
    const avg = med.length ? med.reduce((x, p) => x + p.dias, 0) / med.length : null;
    const slaAvg = med.length ? med.reduce((x, p) => x + p.sla, 0) / med.length : null;
    const dentro = med.filter(p => p.dias <= p.sla).length;
    const venc = curso.filter(p => p.cumple === 'Vencido').length;
    const r1 = (v) => v == null ? '' : Math.round(v * 10) / 10;
    return { name, asignados: apl.length - apl.filter(p => p.st === 'porllegar').length, cul: cul.length, curso: curso.length,
      eficacia: (cul.length + curso.length) ? r1(cul.length / (cul.length + curso.length) * 100) : '',
      culP: finP.length, hab, prod: r1(finP.length / hab), acc: accionesCount, accHab: r1(accionesCount / hab),
      medibles: med.length, avg: r1(avg), sla: r1(slaAvg), dentro: med.length ? r1(dentro / med.length * 100) : '', venc, idx: avg ? r1(slaAvg / avg) : '' };
  }
    function exportModal() {
    modal({ title: 'Descargar Excel de procesos e indicadores', ok: 'Descargar Excel', body: `<p class="muted" style="margin-top:0">Incluye una fila por expediente y etapa (para medir <b>productividad, eficiencia y eficacia</b>), indicadores por colaborador y por etapa, culminados por mes, la actividad registrada y las definiciones de cada indicador.</p>
      <div class="form"><div class="row2"><label>Desde (opcional)<input type="date" id="x-d"></label><label>Hasta (opcional)<input type="date" id="x-h"></label></div>
      <label>Proyecto<select id="x-p"><option value="">Todos los proyectos</option>${uniq(o => o.proyecto).map(p => `<option ${ui.proy === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
      <p class="small muted" style="margin:0">El período se usa para productividad (culminados y acciones por día hábil). Vacío = todo el historial.</p></div>`,
      onOk: (dlg) => { const prev = ui.proy; ui.proy = dlg.querySelector('#x-p').value; try { exportExcel({ desde: dlg.querySelector('#x-d').value, hasta: dlg.querySelector('#x-h').value }); } finally { ui.proy = prev; } } });
  }
  function exportExcel(opts) {
    opts = opts || {};
    if (typeof XLSX === 'undefined') return toast('No se cargó la librería de Excel.');
    const R = rng(opts), wb = XLSX.utils.book_new();
    const add = (name, data, o) => { const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ 'Sin datos': '' }], o || {}); ws['!cols'] = Object.keys(data[0] || { x: 1 }).map(k => ({ wch: Math.min(40, Math.max(10, k.length + 2)) })); XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31)); };
    const fv = (f, v) => v == null ? '' : f.t === 'date' ? fdate(v) : v;
    const dt = (s) => s ? pd(s) : '';
    const P = procesosRows();
    const inP = (ts) => ts >= R.ts0 && ts <= R.ts1;
    const accCount = (n) => S.log.filter(l => l.usuario === n && inP(l.ts)).length + S.seguimientos.filter(s => s.usuario === n && inP(s.ts)).length;

    // Indicadores por colaborador
    const rowsInd = [], porUser = [];
    STAGES.forEach(s => {
      const names = [...new Set([...S.users.filter(u => u.stage === s.key).map(u => u.name), ...P.filter(p => p.k === s.key && p.owner === 'Sin asignar' && p.aplica && p.st !== 'porllegar').map(p => p.owner)])];
      names.forEach(n => { const u = user(n); const x = indicadores(P.filter(p => p.k === s.key && p.owner === n), n, R, accCount(n)); rowsInd.push({ s, u, x }); });
    });
    const fmtInd = (x) => ({ 'Expedientes asignados (culminados + en curso)': x.asignados, 'Culminados': x.cul, 'En curso': x.curso, 'EFICACIA % (culminados / asignados)': x.eficacia,
      'Culminados en el período': x.culP, 'Días hábiles del período': x.hab, 'PRODUCTIVIDAD (culminados por día hábil)': x.prod, 'Acciones registradas en el CRM (período)': x.acc, 'Acciones por día hábil': x.accHab,
      'Procesos medibles (con fechas)': x.medibles, 'Días promedio de atención': x.avg, 'Plazo objetivo promedio (días)': x.sla, 'Dentro de plazo %': x.dentro, 'En curso fuera de plazo': x.venc, 'EFICIENCIA (plazo objetivo ÷ días promedio)': x.idx });
    add('Indicadores por colaborador', rowsInd.map(({ s, u, x }) => ({ Colaborador: x.name, Rol: u ? u.rol : '', Etapa: s.name, ...fmtInd(x) })));
    add('Indicadores por etapa', STAGES.map(s => { const x = indicadores(P.filter(p => p.k === s.key), s.name, R, 0); const f = fmtInd(x); delete f['Acciones registradas en el CRM (período)']; delete f['Acciones por día hábil']; return { Etapa: s.name, ...f }; }));

    // Culminados por mes y colaborador
    const meses = [...new Set(P.filter(p => p.fin).map(p => p.fin.slice(0, 7)))].sort();
    add('Culminados por mes', rowsInd.map(({ s, x }) => { const r = { Colaborador: x.name, Etapa: s.name }; meses.forEach(m => r[m] = P.filter(p => p.k === s.key && p.owner === x.name && p.fin && p.fin.slice(0, 7) === m).length); r.Total = meses.reduce((t, m) => t + r[m], 0); return r; }));

    // Procesos (1 fila = 1 expediente × etapa) — base para tablas dinámicas
    add('Procesos', P.map(p => ({ ID: p.o.id, Cliente: p.o.cliente, Proyecto: p.o.proyecto, Unidad: p.o.unidad, Etapa: p.stage.name, 'N° etapa': p.stage.n, Responsable: p.owner, 'Estado de la etapa': p.estado,
      'Fecha inicio': dt(p.ini), 'Fecha fin': dt(p.fin), 'Mes de culminación': p.fin ? p.fin.slice(0, 7) : '', 'Días': p.dias ?? '', 'Plazo objetivo (días)': p.sla ?? '', 'Cumple plazo': p.cumple, 'Alerta del expediente': p.d.alerta, 'Etapa actual del expediente': p.d.etapa === 'cerrado' ? 'Cerrado' : STAGE[p.d.etapa].name })), { cellDates: true, dateNF: 'dd/mm/yyyy' });

    // Acciones por colaborador
    const its = (n) => activityOf(n).filter(a => inP(a.ts));
    add('Acciones por colaborador', S.users.map(u => { const l = its(u.name); return { Colaborador: u.name, Rol: u.rol, Etapa: u.stage === JEFATURA ? 'Jefatura' : STAGE[u.stage].name, 'Cambios de datos': l.filter(a => a.tipo === 'Cambio').length, 'Seguimientos': l.filter(a => a.tipo !== 'Cambio').length, 'Total acciones': l.length, 'Expedientes trabajados': new Set(l.map(a => a.op)).size, 'Compromisos pendientes': S.seguimientos.filter(s => s.usuario === u.name && !s.resuelto).length }; }));
    add('Detalle de actividad', activityOf().filter(a => inP(a.ts)).map(a => { const o = getOp(a.op) || {}; return { Fecha: new Date(a.ts).toLocaleString('es-PE'), Colaborador: a.usuario, ID: a.op, Cliente: o.cliente || '', Etapa: STAGE[a.etapa] ? STAGE[a.etapa].name : 'General', Tipo: a.tipo, Detalle: a.txt }; }));

    // Clientes y una hoja por etapa (datos operativos)
    add('Clientes', rows().map(({ o, d }) => ({ ID: o.id, Cliente: o.cliente, DNI: o.dni, Proyecto: o.proyecto, Unidad: o.unidad, Vendedor: o.vendedor, Banco: o.banco, Precio: o.precio, 'Etapa actual': d.etapa === 'cerrado' ? 'Cerrado' : STAGE[d.etapa].name, Responsable: d.responsable, Alerta: d.alerta, 'Siguiente paso': d.siguiente, 'Cuello de botella': d.cuello, 'Días en proceso': d.diasTotal, Observaciones: o.observaciones })));
    STAGES.forEach(s => add(`Datos ${s.n}-${s.name}`.replace('ó', 'o'), rows().map(({ o, d }) => { const r = { ID: o.id, Cliente: o.cliente, Proyecto: o.proyecto, Unidad: o.unidad, 'Estado en la etapa': ESTADO[d.state[s.key]], Responsable: d.owner[s.key], 'Avance %': d.progress[s.key] }; FIELDS[s.key].forEach(f => r[f.l] = fv(f, o[f.k])); return r; })));

    // Definiciones
    const per = (opts.desde || opts.hasta) ? `${opts.desde ? fdate(opts.desde) : 'inicio'} a ${opts.hasta ? fdate(opts.hasta) : fdate(iso(today()))}` : 'todo el historial';
    add('Definiciones', [
      { Indicador: 'Período analizado', Definición: per, 'Cómo leerlo': 'Afecta a productividad y a las acciones registradas.' },
      { Indicador: 'EFICACIA', Definición: 'Culminados ÷ (Culminados + En curso), por colaborador y etapa. Mide cuánto de lo que le tocó trabajar llegó a cierre.', 'Cómo leerlo': 'Mayor es mejor. 100 % = todo lo asignado está cerrado.' },
      { Indicador: 'PRODUCTIVIDAD', Definición: 'Procesos culminados dentro del período ÷ días hábiles (lun–vie) del período. También se muestran las acciones registradas por día hábil.', 'Cómo leerlo': 'Mayor es mejor. Compara colaboradores de una misma etapa.' },
      { Indicador: 'EFICIENCIA', Definición: 'Plazo objetivo promedio ÷ días promedio de atención de los procesos culminados con fechas. Se acompaña del % de procesos culminados dentro del plazo.', 'Cómo leerlo': '≥ 1 = atiende en menos tiempo que el plazo objetivo; < 1 = excede el plazo.' },
      { Indicador: 'Días de un proceso', Definición: 'Fecha fin − fecha inicio de la etapa. Si sigue en curso: hoy − fecha inicio. Inicio: Cobranzas = inicio de cobranza; Contratos = fecha de validación; Finanzas = solicitud de carta fianza (o desembolso si es minuta); Formalización = inicio de formalización o ingreso a notaría.', 'Cómo leerlo': 'Fin: culminación de cobranza; firmas completas; emisión de carta fianza o firma de minuta; independización.' },
      { Indicador: 'Plazos objetivo', Definición: `Cobranzas y Contratos ${S.params.plazo} d · Carta fianza ${S.params.slaCF} d · Minuta de levantamiento ${S.params.slaMin} d · Formalización ${S.params.slaNot} d (SLA notarial aplicado a la etapa).`, 'Cómo leerlo': 'Se cambian en Configuración.' },
      { Indicador: 'Alcance', Definición: 'Los indicadores solo usan expedientes con fechas registradas. Las acciones registradas empiezan a contarse desde que el equipo trabaja en el CRM.', 'Cómo leerlo': 'La hoja "Procesos" permite armar tablas dinámicas propias.' }]);
    XLSX.writeFile(wb, `CRM_Procesos_Indicadores_${iso(today())}.xlsx`, { cellDates: true }); toast('Excel generado');
  }
  const snapshot = () => ({ version: new Date().toISOString(), ops: S.ops, seguimientos: S.seguimientos, log: S.log, params: S.params, users: S.users, perms: S.perms, adminPin: S.adminPin });
  async function doImport(file) {
    try {
      if (CL.enabled && /\.json$/i.test(file.name)) return toast('En modo nube importa el Excel original (SEGUIMIENTOS.xlsx).');
      if (/\.json$/i.test(file.name)) {
        const j = JSON.parse(await file.text()); if (!j.ops) throw new Error('El archivo no tiene el formato de respaldo del CRM.');
        if (!await ask(`Se reemplazarán los datos actuales por el respaldo (${j.ops.length} expedientes). ¿Continuar?`)) return;
        S = { ...seedState(), ...j, seedVersion: S.seedVersion, actor: S.actor }; S.ops.forEach(CRM.normalize);
      } else {
        const ops = CRM.importWorkbook(XLSX, await file.arrayBuffer());
        if (!ops.length) throw new Error('No se encontraron expedientes en BASE_MAESTRA.');
        if (!await ask(`Se importarán ${ops.length} expedientes del Excel y reemplazarán los actuales (los seguimientos registrados se conservan). ¿Continuar?`)) return;
        S.ops = ops;
      }
      ensureUsers(); commit(); if (CL.enabled) CL.batchSet('ops', S.ops); toast('Datos importados'); render();
    } catch (e) { toast('No se pudo importar: ' + e.message); console.error(e); }
  }

  /* ================= eventos ================= */
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const a = el.dataset.act;
    if (ACT_PERM[a] && !can(ACT_PERM[a])) return toast(NOPERM);
    if (el.hasAttribute('data-close') && $('#dlg').open) $('#dlg').close();
    if (a === 'op-del') {
      const o = getOp(el.dataset.op); if (!o) return;
      if (!await ask(`¿Eliminar a ${o.cliente} (${o.id}) con todos sus seguimientos? ${CL.enabled ? 'Esta acción no se puede deshacer.' : ''}`, 'Sí, eliminar')) return;
      const segs = S.seguimientos.filter(s => s.opId === o.id), id = o.id;
      S.ops = S.ops.filter(x => x.id !== id); S.seguimientos = S.seguimientos.filter(s => s.opId !== id); delete pendingOps[id];
      S.log.push({ ts: Date.now(), usuario: S.actor, opId: '—', etapa: 'gen', campo: 'cliente_baja', antes: `${o.cliente} (${id})`, despues: '' });
      if (CL.enabled) { cloudIds.delete(id); CL.deleteDoc('ops', id); segs.forEach(s => { cloudSeg.delete(s.id); CL.deleteDoc('seguimientos', s.id); }); }
      commit(); location.hash = '#/clientes';
      return toast('Cliente eliminado', CL.enabled ? null : () => { S.ops.push(o); segs.forEach(s => S.seguimientos.push(s)); commit(); render(true); });
    }
    if (a === 'logout') return CL.signOut();
    if (a === 'seed') return seedCloud();
    if (a === 'login-reset') { const e = ($('#lg-e') || {}).value; if (!e) return toast('Escribe tu correo arriba y vuelve a tocar'); return CL.reset(e.trim()).then(() => toast('Te enviamos un correo para crear o cambiar tu contraseña')).catch(x => toast(AUTH_ERR[x.code] || x.message)); }
    if (a === 'fab') return fabMenu();
    if (a === 'fab-seg') return clientPicker();
    if (a === 'pick-client') return location.hash = '#/cliente/' + el.dataset.op;
    if (a === 'step') return stepTap(el.dataset.op, el.dataset.s, +el.dataset.i);
    if (a === 'quickseg') return quickSeg(el.dataset.op, el.dataset.t);
    if (a === 'autoassign') return autoAssign();
    if (a === 'perm-user') { ui.permU = el.dataset.u; return render(true); }
    if (a === 'perm-tpl') { const u = ui.permU, v = el.dataset.val; PERMS.forEach(p => { S.perms[u] = S.perms[u] || {}; S.perms[u][p.k] = v === 'all' ? true : v === 'ops' ? !PERM_OFF.has(p.k) : (p.g === 'v' && p.k !== 'v_config'); }); S.log.push({ ts: Date.now(), usuario: S.actor, opId: '—', etapa: 'gen', campo: 'permiso', antes: u, despues: 'Plantilla: ' + el.textContent.trim() }); save(); toast('Permisos aplicados'); return render(true); }
    if (a === 'perm-back') { ui.previewReal = null; S.actor = actorOf(); toast('Volviste a tu usuario'); location.hash = '#/config'; return render(); }
    if (a === 'perm-try') { if (CL.enabled) ui.previewReal = S.actor; S.actor = ui.permU; if (!CL.enabled) save(); toast('Ahora ves el CRM como ' + S.actor); location.hash = '#/resumen'; return render(); }
    if (a === 'pin-set') return setPin();
    if (a === 'pin-clear') { if (await ask('¿Quitar el PIN de administrador?')) { S.adminPin = ''; save(); toast('PIN quitado'); render(true); } return; }
    if (a === 'nav-toggle') return $('.side').classList.toggle('open');
    if (a === 'chip') { flt(el.dataset.v, {})[el.dataset.k] = el.dataset.val; return refresh(el.dataset.r); }
    if (a === 'sort') { const id = el.dataset.t, i = +el.dataset.i, s = ui.sort[id]; ui.sort[id] = s && s.i === i ? { i, dir: -s.dir } : { i, dir: 1 }; const rg = Object.keys(regions).find(r => id === r || id.startsWith(r + '-')) || id; return regions[rg] ? refresh(rg) : render(true); }
    if (a === 'tab') { ui.tab[el.dataset.t] = el.dataset.val; return render(true); }
    if (a === 'help') return location.hash = '#/ayuda';
    if (a === 'welcome') return showWelcome();
    if (a === 'goto') return location.hash = el.dataset.href;
    if (a === 'gofilter') { ui.f[el.dataset.view] = { q: '', etapa: '', alerta: '', proy: '', banco: '', sin: '', [el.dataset.k]: el.dataset.val }; return location.hash = '#/' + el.dataset.view; }
    if (a === 'theme') return applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true);
    if (a === 'gostage') { const d = $('#sc-' + el.dataset.s); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } e.preventDefault(); return; }
    if (a === 'tlf') { ui.tl = el.dataset.val; return $('#tl') && ($('#tl').innerHTML = timelineHtml(getOp(el.dataset.op))); }
    if (a === 'tomar') { const st = STAGE[user(el.dataset.u).stage]; setField(el.dataset.op, st.ownerKey, el.dataset.u); toast('Expediente asignado a ' + el.dataset.u, () => { setField(el.dataset.op, st.ownerKey, ''); render(true); }); return render(true); }
    if (a === 'seg-done') { const s = S.seguimientos.find(x => x.id === el.dataset.id); if (s) { s.resuelto = true; if (CL.enabled) CL.updateDoc('seguimientos', s.id, { resuelto: true }); save(); toast('Seguimiento cumplido'); render(true); } return; }
    if (a === 'export-xlsx') return exportModal();
    if (a === 'export-json') return download(`respaldo_crm_${iso(today())}.json`, JSON.stringify(snapshot(), null, 1), 'application/json');
    if (a === 'export-js') { download('operaciones.js', 'window.CRM_DATA = ' + JSON.stringify(snapshot()) + ';\n', 'text/javascript'); return toast('Sube este archivo a la carpeta data/ del repositorio'); }
    if (a === 'import') return $('#file').click();
    if (a === 'dismiss-banner') { S.seedVersion = window.CRM_DATA.version; save(); return renderTop(); }
    if (a === 'reset') { if (!await ask('Se reemplazarán todos los datos de este navegador por los del repositorio. Los cambios locales no exportados se perderán.', 'Sí, reemplazar')) return; const actor = S.actor; S = seedState(); S.actor = actor; ensureUsers(); commit(); toast('Datos del repositorio cargados'); return render(); }
    if (a === 'user-del') return removeUser(el.dataset.u);
    if (a === 'user-edit') return editUser(el.dataset.u);
    if (a === 'user-add') return addUser();
    if (a === 'newop') return modal({ title: 'Nuevo cliente', ok: 'Crear', body: `<div class="form"><div class="row2"><label>Cliente<input id="n-cliente"></label><label>DNI<input id="n-dni"></label></div><div class="row2"><label>Proyecto<input id="n-proyecto" list="dl-proyecto"></label><label>Unidad<input id="n-unidad"></label></div><div class="row2"><label>Vendedor<input id="n-vendedor" list="dl-vendedor"></label><label>Banco<input id="n-banco" list="dl-banco"></label></div><div class="row2"><label>Precio (S/)<input id="n-precio" type="number"></label><label>Monto a financiar (S/)<input id="n-monto" type="number"></label></div></div>`,
      onOk: (dlg) => { const v = (i) => dlg.querySelector('#n-' + i).value.trim(); if (!v('cliente')) { toast('Escribe el nombre del cliente'); return false; }
        const max = Math.max(0, ...S.ops.map(o => +String(o.id).replace(/\D/g, '') || 0)); const op = { id: 'OP-' + String(max + 1).padStart(4, '0'), fechaInicio: iso(today()), cliente: v('cliente') };
        ['dni', 'proyecto', 'unidad', 'vendedor', 'banco'].forEach(k => v(k) && (op[k] = v(k))); if (v('precio')) op.precio = +v('precio'); if (v('monto')) op.montoBanco = +v('monto');
        S.ops.push(CRM.normalize(op)); S.log.push({ ts: Date.now(), usuario: S.actor, opId: op.id, etapa: 'gen', campo: 'cliente', antes: '', despues: op.cliente }); commit(); location.hash = '#/cliente/' + op.id; } });
  });
  document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role=button]')) { e.preventDefault(); e.target.click(); } });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'pk-q') return pickList(e.target.value);
    const el = e.target.closest('[data-f]'); if (!el) return;
    flt(el.dataset.f, {})[el.dataset.k] = el.value; refresh(el.dataset.r);
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.perm) { setPerm(t.dataset.u, t.dataset.perm, t.checked); return toast('Permiso guardado'); }
    if (t.dataset.fk) { if (!can('a_edit')) { toast(NOPERM); return render(true); } if (setField(t.dataset.op, t.dataset.fk, t.value)) { refreshFicha(t.dataset.op); $('#nav').innerHTML = navHtml(route()); toast('Guardado'); } return; }
    if (t.dataset.pk) { if (!can('a_params')) { toast(NOPERM); return render(true); } S.params[t.dataset.pk] = Math.max(0, Number(t.value) || 0); commit(); return toast('Plazo actualizado'); }
    if (t.id === 'gproy') { ui.proy = t.value; return render(true); }
    if (t.id === 'actor') {
      const to = t.value, go = () => { S.actor = to; save(); render(true); };
      if (isAdmin(to) && S.adminPin && !adminSession()) return askPin('Entrar como ' + to, go, () => renderTop());
      return go();
    }
    if (t.id === 'file' && t.files[0]) { doImport(t.files[0]); t.value = ''; }
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'login-form') { e.preventDefault(); const em = $('#lg-e').value.trim(), pw = $('#lg-p').value; CL.signIn(em, pw).catch(x => toast(AUTH_ERR[x.code] || 'No se pudo entrar: ' + x.message)); return; }
    const f = e.target.closest('#seg-form'); if (!f) return; e.preventDefault();
    if (!can('a_seg')) return toast(NOPERM);
    const fd = new FormData(f), nota = (fd.get('nota') || '').trim(); if (!nota) return;
    S.seguimientos.push({ id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), opId: f.dataset.op, ts: Date.now(), usuario: S.actor, tipo: fd.get('tipo'), etapa: fd.get('etapa'), nota, proxima: (fd.get('proxima') || '').trim(), fCompromiso: fd.get('fCompromiso') || '', resuelto: false });
    save(); f.reset(); refreshFicha(f.dataset.op); $('#nav').innerHTML = navHtml(route()); toast('Seguimiento registrado');
  });
  window.addEventListener('hashchange', () => render());

  /* ================= arranque ================= */
  function applyTheme(t, save) {
    document.documentElement.dataset.theme = t;
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = t === 'dark' ? '#13293b' : '#214e75';
    if (save) { try { localStorage.setItem('crm-mg-theme', t); } catch (e) { } }
  }
  (function initTheme() {
    let t = null; try { t = localStorage.getItem('crm-mg-theme'); } catch (e) { }
    const mq = matchMedia('(prefers-color-scheme:dark)');
    applyTheme(t || (mq.matches ? 'dark' : 'light'));
    mq.addEventListener && mq.addEventListener('change', (e) => { let s = null; try { s = localStorage.getItem('crm-mg-theme'); } catch (x) { } if (!s) applyTheme(e.matches ? 'dark' : 'light'); });
  })();
  load();
  if (CL.enabled) { CL.onAuth((u) => { if (!u) { stopCloud(); cloudState = 'login'; render(); } else startCloud(u.email); }); render(); }
  else { render(); try { if (!localStorage.getItem('crm-mg-welcome')) setTimeout(showWelcome, 350); } catch (e) { } }
  window.__CRM = { get state() { return S; }, derived: () => D };
})();
