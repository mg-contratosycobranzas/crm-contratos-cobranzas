/* CRM Contratos y Cobranzas — Grupo MG · interfaz */
(function () {
  'use strict';
  const { STAGES, STAGE, FIELDS, JEFATURA, derive, milestones, fdate, pd, iso, today, diff, num } = CRM;
  const LS = 'crm-mg-v1';
  const FIELD_LABEL = { ...CRM.FIELD_LABEL, usuario_alta: 'Alta de usuario', usuario_baja: 'Baja de usuario', permiso: 'Permiso', evolta: 'Estado de cuenta Evolta', cliente_baja: 'Cliente eliminado', devolucion: 'Devolución', minuta: 'Minuta Evolta', clausula: 'Cláusula adicional', nkb: 'Cotejo Notaría y Kardex/Banco', cotejo_nkb: 'Cotejo Notaría y Kardex/Banco', cotejo_cf: 'Cotejo Carta Fianza', paso_manual: 'Paso marcado a mano (excepción)', constancia: 'Constancia de cierre', cierre: 'Cierre de etapa', ingreso: 'V°B° de ingreso del cliente', acta: 'Acta de entrega', usuario_nombre: 'Cambio de nombre de usuario' };
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
  function commit() { const antes = D; recompute(); save(); if (S.actor) autoAsignarLlegadas(antes); }
  const getOp = (id) => S.ops.find(o => o.id === id);
  const user = (n) => S.users.find(u => u.name === n);

  /* ================= permisos (el administrador activa o desactiva pantallas y botones) ================= */
  const PERMS = [
    { g: 'v', k: 'v_mi', l: 'Mi día' }, { g: 'v', k: 'v_clientes', l: 'Clientes' }, { g: 'v', k: 'v_equipo', l: 'Equipo' },
    { g: 'v', k: 'v_actividad', l: 'Actividad' }, { g: 'v', k: 'v_agenda', l: 'Agenda' }, { g: 'v', k: 'v_config', l: 'Configurar' },
    { g: 'a', k: 'a_edit', l: 'Editar datos' }, { g: 'a', k: 'a_pasos', l: 'Marcar pasos a mano (excepción)' }, { g: 'a', k: 'a_seg', l: 'Registrar gestiones' }, { g: 'a', k: 'a_tomar', l: 'Tomar y repartir expedientes' },
    { g: 'a', k: 'a_newop', l: 'Nuevo cliente' }, { g: 'a', k: 'a_export', l: 'Descargar Excel' }, { g: 'a', k: 'a_users', l: 'Agregar / quitar usuarios' },
    { g: 'a', k: 'a_params', l: 'Cambiar plazos y metas' }, { g: 'a', k: 'a_import', l: 'Importar y respaldos' }, { g: 'a', k: 'a_delop', l: 'Eliminar clientes' }, { g: 'v', k: 'v_ops', l: 'Resumen de operaciones' }, { g: 'v', k: 'v_cartas', l: 'Cartas fianza' }, { g: 'v', k: 'v_ins', l: 'Inscripciones' }, { g: 'v', k: 'v_dev', l: 'Devoluciones' },
    // etapas que cada persona puede ver (por defecto todas; la jefatura las restringe)
    ...[['cob', 'Cobranzas'], ['con', 'Contratos'], ['fin', 'Finanzas'], ['for', 'Formalización'], ['pos', 'Postventa']].map(([s, l]) => ({ g: 'e', k: 'e_' + s, l }))];
  // apagados salvo que la jefatura los active; los pasos se marcan solos al completar los datos
  const PERM_OFF = new Set(['v_config', 'a_users', 'a_params', 'a_import', 'a_delop', 'v_ops', 'a_pasos', 'v_dev']);
  const verEtapa = (k, n) => can('e_' + k, n);
  // el acceso a etapas lo deciden solo los interruptores de "Etapas que puede ver"
  // mensaje corto del día para el equipo (cambia cada día, igual para todos)
  const MOTIVA = [
    'Cada expediente cerrado es una familia más cerca de su hogar. 🏡',
    'Paso a paso se llega lejos: hoy cierra al menos uno. 💪',
    'Lo que se anota hoy, no se olvida mañana. ✍️',
    'Un buen seguimiento vale más que mil urgencias. 📞',
    'Somos un equipo: si alguien se traba, le damos una mano. 🤝',
    'Hecho es mejor que perfecto. ¡A avanzar! 🚀',
    'Tu orden de hoy es la tranquilidad del cliente mañana. ✨',
    'Primero lo urgente, luego lo importante, siempre con calma. 🧭',
    'Cada dato bien registrado ahorra una llamada. ✅',
    'Las metas grandes se logran con días pequeños bien hechos. 📈',
    'Una sonrisa también se nota por teléfono. 😊',
    'Hoy es un buen día para dejar algo cerrado. 🔒',
    'La constancia gana a la prisa. 🐢',
    'Revisa, confirma y avanza: así trabajamos. 🔍',
    'Lo que hacemos bien se nota en cada entrega. 🔑',
    'Pequeños avances diarios, grandes resultados al mes. 🌱',
    'Pregunta sin miedo: entre todos sabemos más. 💬',
    'Un expediente al día es un problema menos. 📂',
    'Gracias por tu esfuerzo: se ve y se valora. 🙌',
    'Empieza por lo que más tiempo lleva esperando. ⏳'
  ];
  const motivaHoy = () => { const T = new Date(), d = Math.floor((Date.UTC(T.getFullYear(), T.getMonth(), T.getDate()) - Date.UTC(T.getFullYear(), 0, 1)) / 864e5); return MOTIVA[(d + T.getFullYear()) % MOTIVA.length]; };
  const primeraEtapa = (n) => (STAGES.find(s => verEtapa(s.key, n)) || {}).key;
  const VIEW_PERM = { operaciones: 'v_ops', cartas: 'v_cartas', inscripciones: 'v_ins', devoluciones: 'v_dev', devolucion: 'v_dev', mi: 'v_mi', clientes: 'v_clientes', cliente: 'v_clientes', usuarios: 'v_equipo', usuario: 'v_equipo', actividad: 'v_actividad', agenda: 'v_agenda', config: 'v_config' };
  const ACT_PERM = { 'export-xlsx': 'a_export', 'export-json': 'a_import', 'export-js': 'a_import', import: 'a_import', reset: 'a_import', 'user-add': 'a_users', 'user-edit': 'a_users', 'user-del': 'a_users', newop: 'a_newop', tomar: 'a_tomar', autoassign: 'a_tomar', 'seg-done': 'a_seg', quickseg: 'a_seg', step: 'a_edit', evolta: 'a_edit', 'op-del': 'a_delop', clausula: 'a_edit', evtab: 'a_edit', 'export-ops': 'v_ops', 'cf-renovar': 'a_edit', 'cf-devolver': 'a_edit', 'export-cf': 'v_cartas', 'export-ins': 'v_ins' };
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
  // lista de correos que Firebase usa para dar acceso: miembros, administradores y jefatura (quien puede dar V°B°)
  const aclOf = (users) => { const em = (L) => L.map(u => (u.email || '').toLowerCase()).filter(Boolean);
    return { members: em(users), admins: em(users.filter(u => u.admin)), jefes: em(users.filter(u => u.admin || u.stage === JEFATURA)) }; };
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
    if (st === 'ready' && was !== 'ready') { startBuzon(); startDev(); }
    if (st === 'ready' && was !== 'ready' && isAdmin()) CL.setAcl(aclOf(S.users)); // mantiene al día quién es jefatura para las reglas de Firebase
    if (st === 'ready' && was !== 'ready') { recompute(); try { if (!localStorage.getItem('crm-mg-welcome')) setTimeout(showWelcome, 350); } catch (e) { } }
    render(was === 'ready');
  }
  function stopCloud() { stopBuzon(); stopDev(); if (unsub) { unsub(); unsub = null; } clearTimeout(rT); S = emptyState(); recompute(); cloudIds.clear(); cloudSeg.clear(); cloudLog.clear(); metaLoaded = opsLoaded = metaMissing = false; lastMeta = ''; for (const k in pendingOps) delete pendingOps[k]; ui.previewReal = null; }
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
    const logo = '<h1>CRM</h1>';
    if (cloudState === 'login') return `<div class="gcard">${logo}<p class="muted">Entra con tu correo para trabajar en equipo y en tiempo real.</p><form id="login-form" class="form"><label>Correo<input type="email" id="lg-e" autocomplete="username" required></label><label>Contraseña<input type="password" id="lg-p" autocomplete="current-password" required></label>${idleMsg ? `<p class="small cl-wait" style="margin:0">⏱️ ${esc(idleMsg)}</p>` : ''}<button class="btn pri" type="submit">Entrar</button></form><button class="btn sm" data-act="login-reset" style="margin-top:10px">Olvidé mi contraseña / crear contraseña</button><p class="gfoot">Creado por el Área de Contratos y Cobranzas</p></div>`;
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

  // clientes ingresados por asistentes quedan pendientes hasta el V°B° de la administración: no entran a etapas, resúmenes ni reparto
  const pendienteIngreso = (o) => !!(o.aprob && o.aprob.estado !== 'aprobado');
  const rows = (conPendientes) => S.ops.filter(o => (!ui.proy || o.proyecto === ui.proy) && (conPendientes || !pendienteIngreso(o))).map(o => ({ o, d: D.get(o.id) }));

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
  function modal({ title, body, ok = 'Guardar', cancel = 'Cancelar', onOk, onCancel, wide }) {
    const dlg = $('#dlg'); dlg.classList.toggle('wide', !!wide);
    dlg.innerHTML = `<form method="dialog" autocomplete="off"><div class="dlg-h"><span>${esc(title)}</span><button type="button" class="dlg-x" data-m="x" aria-label="Cerrar" title="Cerrar">✕</button></div><div class="dlg-b">${body}</div><div class="dlg-f">${cancel ? `<button type="button" class="btn" data-m="cancel">${cancel}</button>` : ''}<button type="button" class="btn pri" data-m="ok">${ok}</button></div></form>`;
    dlg.onclose = () => { if (onCancel && !dlg._ok) onCancel(); dlg._ok = false; };
    dlg.querySelector('[data-m=ok]').onclick = () => { if (onOk && onOk(dlg) === false) return; dlg._ok = true; dlg.close(); };
    const c = dlg.querySelector('[data-m=cancel]'); if (c) c.onclick = () => dlg.close();
    dlg.querySelector('[data-m=x]').onclick = () => dlg.close();
    dlg.onclick = (e) => { if (e.target === dlg) dlg.close(); }; // tocar fuera de la ventana la cierra
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
    // Los pasos se marcan solos al completar los datos. Marcarlos (o desmarcarlos) a mano es una excepción de jefatura.
    // Elegir una opción (p. ej. "¿aplica carta fianza?") sí es completar un dato.
    if (!can('a_pasos') && !(it.choose && !it.done)) {
      toast(it.done ? 'Este paso se completó con los datos. Para cambiarlo, corrige el dato en "Editar datos a mano".' : 'Este paso se marca solo al completar su dato. Marcarlo a mano requiere autorización de jefatura.');
      return openEditor(sk, it.set && Object.keys(it.set)[0]);
    }
    if (it.done) {
      if (it.set && !('cob_porRecibir' in it.set)) { const clr = {}; Object.keys(it.set).forEach(k => clr[k] = ''); return done(applyMany(opId, clr), 'Paso desmarcado'); }
      return openEditor(sk);
    }
    if (it.choose) return bigChoice(it.label, it.choose.opts, (v) => done(applyMany(opId, { [it.choose.k]: v }), 'Guardado'));
    if (it.set) {
      const needsMe = Object.values(it.set).includes('$me');
      const go = (who) => { const o = {}; for (const k in it.set) { const v = it.set[k]; o[k] = v === '$today' ? iso(today()) : v === '$me' ? who : v; }
        const prev = applyMany(opId, o);
        if (prev) { S.log.push({ ts: Date.now(), usuario: S.actor, opId, etapa: sk, campo: 'paso_manual', antes: '', despues: it.label }); commit(); } // queda constancia de la excepción
        done(prev, '✓ ' + it.label); };
      return needsMe ? pickStageUser(sk, go) : go();
    }
    openEditor(sk);
  }
  function openEditor(sk, campo) {
    const sc = $('#sc-' + sk); if (!sc) { toast('Abre la ficha del cliente para completar este dato'); return; }
    sc.open = true; const fe = sc.querySelector('details.fe'); if (fe) fe.open = true;
    sc.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const f = (campo && sc.querySelector(`[data-fk="${campo}"]`)) || sc.querySelector('[data-fk]'); // directo al dato de ese paso
    if (f) setTimeout(() => { f.focus({ preventScroll: true }); const lb = f.closest('.f'); if (lb) { lb.classList.add('resalta'); setTimeout(() => lb.classList.remove('resalta'), 2500); } }, 300);
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
  /* Reparto. En Contratos: 1) cartera — el expediente va a quien tiene ese proyecto a cargo, salvo que ya tenga
     `topeCarga` expedientes más que el menos cargado; 2) si no, al de menos carga; 3) se reparte primero lo más urgente
     (desembolso más cercano). En las demás etapas: al de menos carga, empezando por el más antiguo. */
  const SMART = new Set(['con']);
  const urgencia = (r) => desembolsoEsperado(r.o, null, r.d).fecha || '9999';
  function elegir(us, load, o, k) {
    const min = Math.min(...us.map(u => load[u.name])), menos = us.reduce((m, u) => load[u.name] < load[m.name] ? u : m);
    if (!SMART.has(k)) return { u: menos, por: 'menor carga' };
    const duenos = us.filter(u => (u.proyectos || []).includes(o.proyecto));
    if (duenos.length) {
      const d = duenos.reduce((m, u) => load[u.name] < load[m.name] ? u : m);
      if (load[d.name] - min < (S.params.topeCarga || 5)) return { u: d, por: `cartera ${o.proyecto}` };
      return { u: menos, por: `${d.name} superó el tope de carga` };
    }
    return { u: menos, por: 'menor carga (proyecto sin responsable)' };
  }
  function cargaDe(k, us) { const load = {}; us.forEach(u => load[u.name] = 0); S.ops.forEach(o => { const d = D.get(o.id); if (d && d.state[k] === 'actual' && load[d.owner[k]] !== undefined) load[d.owner[k]]++; }); return load; }
  function planAssign(soloIds) {
    const plan = [], all = S.ops.filter(o => !pendienteIngreso(o) && (!soloIds || soloIds.has(o.id))).map(o => ({ o, d: D.get(o.id) }));
    STAGES.filter(s => s.ownerKey).forEach(s => {
      const us = S.users.filter(u => u.stage === s.key); if (!us.length) return;
      const load = cargaDe(s.key, us);
      const pend = all.filter(r => r.d.state[s.key] === 'actual' && r.d.owner[s.key] === 'Sin asignar');
      pend.sort(SMART.has(s.key) ? (x, y) => urgencia(x) < urgencia(y) ? -1 : urgencia(x) > urgencia(y) ? 1 : (y.d.diasTotal || 0) - (x.d.diasTotal || 0) : (x, y) => (y.d.diasTotal || 0) - (x.d.diasTotal || 0));
      pend.forEach(r => { const e = elegir(us, load, r.o, s.key); load[e.u.name]++; plan.push({ op: r.o.id, key: s.ownerKey, who: e.u.name, stage: s.key, por: e.por }); });
    });
    return plan;
  }
  const applyPlan = (plan) => plan.forEach(p => { setField(p.op, p.key, p.who); if (p.stage === 'con' && !getOp(p.op).con_fAsignacion) setField(p.op, 'con_fAsignacion', iso(today())); });
  /* Al llegar a Contratos (por un cambio hecho aquí) el expediente se asigna solo */
  let autoBusy = false;
  function autoAsignarLlegadas(antes) {
    if (autoBusy || !S.params.autoAsignar) return;
    const llegan = new Set(S.ops.filter(o => { const d = D.get(o.id), a = antes.get(o.id); return d && a && SMART.has(d.etapa) && a.etapa !== d.etapa && d.owner[d.etapa] === 'Sin asignar'; }).map(o => o.id));
    if (!llegan.size) return;
    autoBusy = true;
    try { const plan = planAssign(llegan).filter(p => SMART.has(p.stage)); applyPlan(plan); const msg = plan.map(p => `📥 ${getOp(p.op).cliente} pasó a ${STAGE[p.stage].name} y se asignó a ${p.who} (${p.por})`).join(' · ');
      if (msg) setTimeout(() => toast(msg), 300); } // después del "Guardado" para que se alcance a leer
    finally { autoBusy = false; }
  }
  function autoAssign() {
    const plan = planAssign(); if (!plan.length) return toast('No hay expedientes sin responsable 🎉');
    const by = {}; plan.forEach(p => { (by[p.stage] = by[p.stage] || {})[p.who] = (by[p.stage][p.who] || 0) + 1; });
    const det = plan.filter(p => SMART.has(p.stage)).map(p => `<tr><td>${esc(getOp(p.op).cliente)}</td><td>${esc(getOp(p.op).proyecto || '')}</td><td><b>${esc(p.who)}</b></td><td class="small muted">${esc(p.por)}</td></tr>`).join('');
    modal({ title: `Repartir ${plan.length} expedientes`, ok: 'Repartir ahora', wide: !!det, body: `<p class="muted" style="margin-top:0"><b>Contratos:</b> cada expediente va a quien tiene su proyecto a cargo (salvo que ya tenga ${S.params.topeCarga || 5} o más expedientes que el otro), y se reparte primero lo de desembolso más cercano. <b>Otras etapas:</b> al de menos carga, empezando por los más antiguos.</p>${Object.keys(by).map(k => `<div style="margin:8px 0">${sbadge(k)}<div class="small" style="margin-top:4px">${Object.entries(by[k]).map(([n, c]) => `<b>${esc(n)}</b> +${c}`).join(' · ')}</div></div>`).join('')}
      ${det ? `<details><summary class="small">Ver detalle de Contratos</summary><div class="ev-tw"><table class="ev-t"><thead><tr><th>Cliente</th><th>Proyecto</th><th>Asignado a</th><th>Motivo</th></tr></thead><tbody>${det}</tbody></table></div></details>` : ''}`,
      onOk: () => { const prevAll = plan.map(p => ({ id: p.op, k: p.key })); applyPlan(plan); toast(`✓ ${plan.length} expedientes repartidos`, () => { prevAll.forEach(x => setField(x.id, x.k, '')); render(true); }); render(true); } });
  }
  function fabMenu() {
    const b = (act, ic, l, on) => on ? `<button type="button" class="bigopt" data-act="${act}" data-close><i>${ic}</i><span>${l}</span></button>` : '';
    modal({ title: '¿Qué quieres hacer?', ok: 'Cerrar', cancel: '', body: `<div class="bigopts">${b('fab-seg', '📞', 'Anotar una gestión', can('a_seg'))}${b('newop', '➕', 'Nuevo cliente', can('a_newop'))}${b('goto" data-href="#/mi', '☀️', 'Mi día', can('v_mi'))}${b('export-xlsx', '⬇️', 'Descargar Excel', can('a_export'))}</div>` });
    $('#dlg').querySelector('.dlg-f').hidden = true; // se cierra con la ✕ o tocando fuera
  }
  function pickList(q) {
    const box = $('#pk-list'); if (!box) return;
    const list = rows(true).filter(r => match(r, q)).sort((x, y) => (x.d.etapa === 'cerrado') - (y.d.etapa === 'cerrado')).slice(0, 8);
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
    const lim = Date.now() - 7 * 86400000, u = user(n), ns = [n, ...((u && u.antes) || [])];
    return S.log.filter(l => ns.includes(l.usuario) && l.ts >= lim).length + S.seguimientos.filter(s => s.usuario === n && s.ts >= lim).length;
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
    return `<div class="hero card"><div><h1>${saludo}, ${esc(nombre)} 👋</h1><p class="muted">${fdate(iso(T))} · ¿Qué quieres hacer?</p><p class="motiva">${esc(motivaHoy())}</p></div>
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
    return [can('v_mi') && t('#/mi', '☀️', 'Mi día', nCrit || '', 'hot'), can('v_clientes') && t('#/clientes', '🗂️', 'Clientes'), primeraEtapa() && t('#/etapa/' + primeraEtapa(), '🧭', 'Etapas'), can('v_agenda') && t('#/agenda', '📅', 'Agenda', nVenc || '', 'hot'),
      can('v_equipo') && t('#/usuarios', '👥', 'Equipo'), can('v_actividad') && t('#/actividad', '📈', 'Actividad'), can('a_newop') && bt('newop', '➕', 'Nuevo cliente'), can('a_export') && bt('export-xlsx', '⬇️', 'Excel'), t('#/buzon', '📬', 'Buzón', isJefe() ? bzNuevos() || '' : '', 'hot'), t('#/ayuda', '💡', 'Ayuda')].filter(Boolean).join('');
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
      .sort(SMART.has(k) ? (x, y) => urgencia(x) < urgencia(y) ? -1 : urgencia(x) > urgencia(y) ? 1 : (ord[x.d.alerta] ?? 3) - (ord[y.d.alerta] ?? 3) // Contratos: primero el desembolso más cercano
        : (x, y) => (ord[x.d.alerta] ?? 3) - (ord[y.d.alerta] ?? 3) || (y.d.diasTotal || 0) - (x.d.diasTotal || 0));
    const desTxt = (r) => { const e = desembolsoEsperado(r.o, null, r.d); if (!e.fecha) return '';
      if (e.orig) return ` · <span class="cl-wait">⏰ pasó la fecha estimada de desembolso (${fdate(e.orig)})</span>`;
      const n = diff(pd(e.fecha), today());
      return ` · <span class="${n <= 15 ? 'cl-wait' : ''}">⏰ desembolso ${n < 0 ? `vencido hace ${-n} d` : n === 0 ? 'hoy' : `en ${n} días`} (${e.tipo.toLowerCase()})</span>`; };
    const ag = agenda(S.actor).filter(x => x.cat === 'vencido' || x.cat === 'hoy');
    const st = k !== JEFATURA && STAGE[k].ownerKey ? STAGE[k] : null;
    const pool = st ? all.filter(r => r.d.state[k] === 'actual' && r.d.owner[k] === 'Sin asignar') : [];
    const meta = S.params.metaDia || 8, pct = Math.min(100, hoy / meta * 100), R = 38, C = 2 * Math.PI * R;
    const card = (r) => { const sk = k === JEFATURA ? r.d.etapa : k, items = r.d.check[sk] || [], i = items.findIndex(x => !x.done), it = items[i];
      const main = it && (it.choose || (it.set && can('a_pasos'))) ? `<button class="btn pri" data-act="step" data-op="${r.o.id}" data-s="${sk}" data-i="${i}">✓ ${esc(it.label)}</button>` : `<a class="btn pri" href="#/cliente/${r.o.id}">${it ? esc(it.label) : 'Abrir'} ›</a>`;
      return `<div class="card midia" style="--sc:${colVar(sk)}"><div class="u-top">${sbadge(sk)}${alertBadge(r.d.alerta)}</div><a href="#/cliente/${r.o.id}"><b>${esc(r.o.cliente)}</b></a><div class="small muted">${esc(r.o.proyecto || '')} ${esc(r.o.unidad || '')} · ${r.d.diasTotal ?? '—'} días${k === JEFATURA ? ' · ' + esc(r.d.responsable) : ''}${SMART.has(k) ? desTxt(r) : ''}</div>
        <div class="m-act">${main}<button class="btn" data-act="quickseg" data-op="${r.o.id}" data-t="Llamada" title="Anotar llamada">📞</button><button class="btn" data-act="quickseg" data-op="${r.o.id}" data-t="WhatsApp" title="Anotar WhatsApp">💬</button></div></div>`; };
    return `<div class="hero card"><div><h1>☀️ Mi día</h1><p class="muted">${esc(S.actor)} · ${k === JEFATURA ? 'Lo que necesita tu atención' : SMART.has(k) ? 'Tus expedientes, del desembolso más cercano al más lejano' : 'Tus expedientes, del más urgente al menos urgente'}</p></div>
      <div class="gauge mini"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="${R}" fill="none" stroke-width="12" style="stroke:var(--gris-bg)"/><circle cx="50" cy="50" r="${R}" fill="none" stroke-width="12" stroke-linecap="round" stroke-dasharray="${pct / 100 * C} ${C}" transform="rotate(-90 50 50)" style="stroke:${pct >= 100 ? 'var(--f-verde)' : 'var(--accent)'}"/><text x="50" y="57" text-anchor="middle" class="g-big">${hoy}</text></svg><div><b>Acciones de hoy</b><span class="small muted">Meta: ${meta}</span></div></div></div>
    ${ag.length ? `<h2 class="sec">Compromisos para hoy <span class="badge rojo plain">${ag.length}</span></h2><div class="card"><div class="card-b">${ag.slice(0, 6).map(x => { const o = getOp(x.opId); return `<div class="agrow"><div><b>${o ? esc(o.cliente) : esc(x.opId)}</b><div class="small muted">${x.cat === 'vencido' ? '⚠️ Venció ' : 'Hoy · '}${fdate(x.fCompromiso)} · ${esc(x.proxima || x.nota)}</div></div><button class="btn sm" data-act="seg-done" data-id="${x.id}">✓ Cumplido</button></div>`; }).join('')}</div></div>` : ''}
    ${(() => { // jefatura: cierres firmados que esperan V°B° · responsable: sus cierres observados
      const ing = S.ops.filter(o => pendienteIngreso(o) && (isJefe() ? o.aprob.estado === 'pendiente' : o.aprob.por === S.actor));
      const ingHtml = ing.length ? `<h2 class="sec">${isJefe() ? 'Clientes nuevos por aprobar' : 'Mis clientes ingresados'} <span class="badge amar plain">${ing.length}</span></h2><div class="card"><div class="card-b">${ing.map(o => `<div class="agrow"><div><a href="#/cliente/${o.id}"><b>${esc(o.cliente)}</b></a> <span class="small muted">${esc(o.proyecto || '')} ${esc(o.unidad || '')}</span><div class="small muted">${o.aprob.estado === 'observado' ? `↩️ Observado: ${esc(o.aprob.obs.motivo)}` : `${isJefe() ? `Ingresado por ${esc(o.aprob.nombre || o.aprob.por)} · ` : '⏳ Esperando V°B° · '}${fechaHora(o.aprob.ts)}`}</div></div>${isJefe() ? `<button class="btn sm pri" data-act="ing-ok" data-op="${o.id}">✅ V°B°</button> <a class="btn sm" href="#/cliente/${o.id}">Revisar</a>` : `<a class="btn sm" href="#/cliente/${o.id}">Abrir</a>`}</div>`).join('')}</div></div>` : '';
      const vb = isJefe() ? pendientesVB() : [], obs = S.ops.flatMap(o => Object.entries(o.cierres || {}).filter(([, c]) => c.estado === 'observado' && c.firma.por === S.actor).map(([k, c]) => ({ o, k, c })));
      const row = (x, extra) => `<div class="agrow"><div><a href="#/cliente/${x.o.id}"><b>${esc(x.o.cliente)}</b></a> ${sbadge(x.k)}<div class="small muted">${extra}</div></div><a class="btn sm pri" href="#/cliente/${x.o.id}">Revisar ›</a></div>`;
      return ingHtml + (vb.length ? `<h2 class="sec">Cierres por dar V°B° <span class="badge amar plain">${vb.length}</span></h2><div class="card"><div class="card-b">${vb.map(x => row(x, `✍️ Firmado por ${esc(x.c.firma.nombre || fullName(x.c.firma.por))} · ${fechaHora(x.c.firma.ts)}`)).join('')}</div></div>` : '')
        + (obs.length ? `<h2 class="sec">Cierres observados por jefatura <span class="badge rojo plain">${obs.length}</span></h2><div class="card"><div class="card-b">${obs.map(x => row(x, `↩️ ${esc(x.c.obs.por)}: ${esc(x.c.obs.motivo)}`)).join('')}</div></div>` : '');
    })()}
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
    if (!verEtapa(key)) return vSinAcceso();
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
    ${pageHead(`<span style="color:${colVar(key)}">Etapa ${st.n}</span> · ${st.name}`, esc(st.desc), key === 'pos' ? `<a class="btn" href="${ACTAS_URL}" target="_blank" rel="noopener">📝 Generador de actas ↗</a>` : '', `${key === 'pos' ? 'Para un acta con los datos ya llenos, ábrela desde la ficha del cliente → 5 Postventa → "Generar acta de entrega". ' : ''}Cada fila es un cliente. <b>En curso</b> = está en esta etapa ahora; <b>Culminadas</b> = ya la cerró; <b>Por llegar</b> = aún no llega. La barra de avance muestra cuántos pasos de la etapa están hechos. Toca el nombre para abrir su ficha.`)}
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
      { h: 'Proyectos a cargo', f: u => (u.proyectos || []).length ? esc(u.proyectos.join(', ')) : '<span class="muted">—</span>' },
      { h: 'En cartera', cls: 'r', f: u => userStats(u).cartera, s: u => userStats(u).cartera },
      { h: '', cls: 'r nowrap', f: u => `<button class="btn sm" data-act="user-edit" data-u="${esc(u.name)}">Editar</button> <button class="btn sm danger" data-act="user-del" data-u="${esc(u.name)}">Quitar</button>` }], S.users);
  }

  function activityOf(name) {
    const items = [], u = name && user(name), ns = name ? [name, ...((u && u.antes) || [])] : null;
    S.log.filter(l => !ns || ns.includes(l.usuario)).forEach(l => items.push({ ts: l.ts, op: l.opId, usuario: l.usuario, tipo: 'Cambio', etapa: l.etapa, txt: `${FIELD_LABEL[l.campo] || l.campo}: ${fmtVal(l.campo, l.antes)} → ${fmtVal(l.campo, l.despues)}` }));
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
      const list = rows(true).filter(r => match(r, F.q) && (!F.etapa || r.d.etapa === F.etapa) && (!F.alerta || r.d.alerta === F.alerta) && (!F.proy || r.o.proyecto === F.proy) && (!F.banco || r.o.banco === F.banco) && (!F.sin || (r.d.etapa !== 'cerrado' && r.d.responsable === 'Sin asignar')));
      return `<p class="small muted" style="margin:0 0 8px">${list.length} de ${S.ops.length} clientes</p>` + tbl(id, [
        { h: 'Cliente', f: r => opLink(r.o) + (pendienteIngreso(r.o) ? ` <span class="badge amar">${r.o.aprob.estado === 'observado' ? '↩️ Ingreso observado' : '⏳ Ingreso por aprobar'}</span>` : ''), s: r => r.o.cliente }, { h: 'Banco', f: r => esc(r.o.banco || '—'), s: r => r.o.banco }, { h: 'Precio', cls: 'r', f: r => money(r.o.precio), s: r => r.o.precio || 0 },
        { h: 'Recorrido', f: r => miniSteps(r), s: r => r.d.hechas }, { h: 'Etapa actual', f: r => r.d.etapa === 'cerrado' ? '<span class="badge verde">Cerrado</span>' : sbadge(r.d.etapa), s: r => r.d.etapa },
        { h: 'Responsable', f: r => respCell(r.d.responsable), s: r => r.d.responsable }, { h: 'Siguiente paso', f: r => esc(r.d.siguiente) }, { h: 'Alerta', f: r => alertBadge(r.d.alerta), s: r => r.d.alerta }], list);
    };
    const sel = (k, label, opts) => `<select data-f="clientes" data-k="${k}" data-r="${id}"><option value="">${label}</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${F[k] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    return `${pageHead('Clientes', 'Seguimiento de cada cliente a lo largo de las 5 etapas.', `<button class="btn" data-act="evolta" title="Llena los datos del cliente con el estado de cuenta descargado de Evolta">📄 Cargar PDF Evolta</button> <button class="btn pri" data-act="newop">+ Nuevo cliente</button>`, 'Busca por nombre, DNI o proyecto. La barra de colores muestra por cuáles etapas ya pasó el cliente (verde = lista, color = etapa actual, gris = falta).')}
    <div class="filters"><input type="search" placeholder="Buscar cliente, DNI, ID, proyecto…" value="${esc(F.q)}" data-f="clientes" data-k="q" data-r="${id}">
      ${sel('etapa', 'Todas las etapas', [...STAGES.map(s => [s.key, s.name]), ['cerrado', 'Cerrado']])}${sel('alerta', 'Todas las alertas', ['Inmediato', 'Por acumulación', 'Bajo control', 'Cerrado'].map(a => [a, ALERT_LABEL[a]]))}${sel('sin', 'Con o sin responsable', [['1', 'Solo sin responsable']])}
      ${sel('proy', 'Todos los proyectos', uniq(o => o.proyecto).map(p => [p, p]))}${sel('banco', 'Todos los bancos', uniq(o => o.banco).map(p => [p, p]))}</div>
    ${region(id, build)}`;
  }

  /* ---- Ficha de cliente ---- */
  function fieldInput(op, f, mark) {
    const v = op[f.k] ?? '', base = `data-fk="${f.k}" data-op="${op.id}" autocomplete="off"`; // sin autocompletar: evita que el navegador ofrezca guardar "pasaporte" o direcciones
    mark = mark === 'siempre' || (mark && op.evolta && f.k !== 'observaciones'); // con estado de cuenta cargado: resalta lo que falta y lo que vino del PDF
    let inp;
    if (f.t === 'select') inp = `<select ${base}><option value=""></option>${[...new Set([...f.o, ...(v && !f.o.includes(v) ? [v] : [])])].map(x => `<option ${String(v) === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
    else if (f.t === 'owner') { const key = Object.keys(STAGE).find(s => STAGE[s].ownerKey === f.k); const names = [...new Set([...S.users.filter(u => u.stage === key).map(u => u.name), ...(v ? [v] : [])])]; inp = `<select ${base}><option value="">Sin asignar</option>${names.map(x => `<option ${v === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`; }
    else if (f.t === 'textarea') inp = `<textarea rows="2" ${base}>${esc(v)}</textarea>`;
    else inp = `<input type="${f.t === 'number' ? 'number' : f.t === 'date' ? 'date' : 'text'}" ${f.t === 'number' ? 'step="any"' : ''} ${f.list ? `list="dl-${f.list}"` : ''} value="${esc(v)}" ${f.k === 'empresa' && !v && empresaDe(op) ? `placeholder="${esc(empresaDe(op))} (del proyecto)"` : ''} ${base}>`;
    const fromPdf = mark && op.evolta && (op.evolta.campos || []).includes(f.k);
    return `<label class="f ${f.w === 2 ? 'w2' : ''} ${mark ? 'mk' : ''} ${mark && v === '' ? 'falta' : ''}"><span>${f.l}${fromPdf ? ' <em class="pdf" title="Dato tomado del estado de cuenta de Evolta">PDF</em>' : ''}</span>${inp}</label>`;
  }
  function kvFor(key, o, d) {
    const kv = (a, b) => `<div><span>${a}</span><b>${b}</b></div>`;
    if (key === 'cob') return kv('Inicial recibido', money(d.cobRecibido)) + kv('Días de atención', d.cobDiasAt ?? '—') + kv('Plazo objetivo', S.params.plazo + ' días');
    if (key === 'con') return kv('Estado de atención', d.conEstado) + kv('Estado de firma', d.conFirma) + kv('Días desde validación', d.conDias ?? '—') + kv('Cumplimiento', cumpBadge(d.conCump));
    if (key === 'fin') return kv('Semáforo carta fianza', semBadge(d.semCF)) + kv('Límite carta fianza', o.fin_fSolicitud ? fdate(iso(CRM.addDays(pd(o.fin_fSolicitud), S.params.slaCF))) : '—');
    if (key === 'for') return kv('Semáforo minuta lev.', semBadge(d.semMin)) + kv('Semáforo notarial', semBadge(d.semNot)) + kv('Límite notarial', o.for_fIngresoNotaria ? fdate(iso(CRM.addDays(pd(o.for_fIngresoNotaria), S.params.slaNot))) : '—');
    return '';
  }
  // quién puede marcar pasos a mano ve "Marcar ✓ / Deshacer"; el resto ve el dato que debe completar
  const stepLabel = (c) => can('a_pasos') ? (c.done ? 'Deshacer' : (c.set || c.choose) ? 'Marcar ✓' : 'Completar') : (c.done ? '' : c.choose ? 'Elegir' : 'Completar dato');
  const checkHtml = (key, d, o) => `<ul class="chk">${d.check[key].map((c, i) => `<li class="tap ${c.done ? 'ok' : ''}" data-act="step" data-op="${o.id}" data-s="${key}" data-i="${i}" role="button" tabindex="0"><span class="tk">${c.done ? '✓' : ''}</span><span class="cl">${esc(c.label)}</span><em>${stepLabel(c)}</em></li>`).join('')}</ul><div class="kv">${kvFor(key, o, d)}</div>`;
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

  /* ---- Estado de cuenta del CRM Evolta (PDF) ---- */
  const EV_GLOSARIO = [['Cuota inicial', 'Parte del precio que el cliente paga directo a la inmobiliaria. Puede estar dividida en varias cuotas.'],
    ['Saldo a financiar', 'Lo que paga el banco con el crédito hipotecario. Se cobra con el desembolso.'],
    ['Bono (MiVivienda / BBP / Techo Propio)', 'Aporte del Estado que se descuenta del precio.'],
    ['Fecha programada', 'Fecha acordada para el pago. En el saldo a financiar es la fecha referencial del desembolso.'],
    ['Cancelado / Pendiente', 'Cancelado = ya se pagó. Pendiente = falta pagar. Si la fecha programada ya pasó, se muestra como vencido.'],
    ['Pagado / Por pagar', 'Suma de lo que el cliente ya pagó y lo que todavía falta (incluye lo que pagará el banco).']];
  function evoltaHtml(o) {
    const head = `<div class="ev-bar"><button class="btn sm" data-act="evolta" data-op="${o.id}">📄 ${o.evolta ? 'Actualizar con un PDF nuevo' : 'Cargar estado de cuenta (PDF Evolta)'}</button></div>`;
    const e = o.evolta; if (!e) return head;
    const T = iso(today());
    const est = (c) => /CANCELAD/.test(c.estado) ? '<span class="badge verde">Cancelado</span>' : c.fProg && c.fProg < T ? '<span class="badge rojo">Vencido</span>' : `<span class="badge amar">${esc(c.estado ? c.estado[0] + c.estado.slice(1).toLowerCase() : 'Pendiente')}</span>`;
    const kv = (a, b) => `<div><span>${a}</span><b>${b}</b></div>`;
    // el cronograma es una foto de Evolta: si lo registrado a mano ya no coincide, se pide bajar el PDF actualizado
    const ini = (e.cronograma || []).filter(c => /inicial/i.test(c.concepto)), pdfFalta = ini.filter(c => !/CANCELAD/.test(c.estado)).reduce((t, c) => t + c.monto, 0);
    const crmFalta = num(o.cob_porRecibir), difiere = ini.length && crmFalta != null && crmFalta !== pdfFalta;
    const aviso = difiere ? `<div class="ev-falta" style="margin-top:10px">⚠️ En el CRM figura <b>inicial por recibir ${money(crmFalta)}</b>, pero este estado de cuenta (del ${fdate(e.consulta) || '—'}) dice <b>${money(pdfFalta)}</b>. Verifica el pago en Evolta, descarga el PDF actualizado y cárgalo con el botón de arriba.</div>` : '';
    return `<div class="ev">${head}<div class="ev-h"><b>Estado de cuenta Evolta</b><span class="small muted">foto del ${fdate(e.consulta) || '—'} · cargado por ${esc(e.por || '—')} · no cambia al editar a mano</span></div>${aviso}
      <div class="kv">${kv('Forma de pago', esc([e.modalidad, e.entidad].filter(Boolean).join(' / ') || '—'))}${(e.formaPago || []).map(x => kv(esc(x.motivo), `${money(x.monto)} <span class="muted small">${esc(x.pct)}</span>`)).join('')}${kv('Pagado', money(e.pagado))}${kv('Por pagar', money(e.porPagar))}</div>
      <div class="ev-tw"><table class="ev-t"><thead><tr><th>Cronograma</th><th>Monto</th><th>Programada</th><th>Pagada</th><th>Estado</th></tr></thead><tbody>${(e.cronograma || []).map(c => `<tr><td>${esc(c.concepto)}</td><td>${money(c.monto)}</td><td>${fdate(c.fProg) || '—'}</td><td>${fdate(c.fPago) || '—'}</td><td>${est(c)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Sin cronograma</td></tr>'}</tbody></table></div>
      ${(e.pagos || []).length ? `<div class="ev-tw"><table class="ev-t"><thead><tr><th>Pagos registrados</th><th>Monto</th><th>Forma</th><th>N° operación</th><th>Entidad</th></tr></thead><tbody>${e.pagos.map(p => `<tr><td>${fdate(p.fecha)}</td><td>${money(p.monto)}</td><td>${esc(p.forma)}</td><td>${esc(p.operacion)}</td><td>${esc(p.entidad)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <details class="info"><summary>¿Qué significa cada concepto?</summary><dl class="ev-g">${EV_GLOSARIO.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join('')}</dl></details></div>`;
  }
  /* ---- Resumen de operaciones (administración): lo más importante de cada venta, en pantalla y en Excel ---- */
  // empresa: la del cliente; si no, la configurada para su proyecto (Configurar → Empresa por proyecto); si no, la de la minuta
  const empEnProy = (p) => ((S.params.empresas || {})[p]) || '';
  const empresaDe = (o) => o.empresa || empEnProy(o.proyecto) || (o.minuta && o.minuta.vendedora && o.minuta.vendedora.razon) || '';
  function setEmpresaProyecto(p, e) { if (!p) return; S.params.empresas = { ...(S.params.empresas || {}), [p]: e || undefined }; if (!e) delete S.params.empresas[p]; save(); }
  const empresaProy = () => { const m = {}; S.ops.forEach(o => { const e = empresaDe(o); if (e && o.proyecto && !m[o.proyecto]) m[o.proyecto] = e; }); return m; };
  // `s: 1` = columna de la vista simple (la completa y el Excel llevan todas)
  const OPS_COLS = [
    { h: 'ID', v: r => r.o.id }, { h: 'Proyecto', v: r => r.o.proyecto, s: 1 }, { h: 'Empresa', v: r => empresaDe(r.o) || r.ep[r.o.proyecto] || '' },
    { h: 'Unidad / Dpto.', v: r => r.o.unidad, s: 1 }, { h: 'Cliente', v: r => r.o.cliente, s: 1 }, { h: 'DNI', v: r => r.o.dni },
    { h: 'Precio de venta', v: r => r.o.precio, t: 'n' }, { h: 'Monto financiamiento', v: r => r.o.montoBanco, t: 'n' }, { h: 'Bonos', v: r => r.o.bono, t: 'n' }, { h: 'Inicial cobrada', v: r => r.d.cobRecibido, t: 'n', s: 1 },
    { h: 'Ejecutivo de ventas', v: r => r.o.vendedor }, { h: 'Jefe de ventas', v: r => r.o.jefeVentas }, { h: 'Banco', v: r => r.o.banco, s: 1 }, { h: 'Ejecutivo de banco', v: r => r.o.ejecBanco },
    { h: 'Kardex', v: r => r.o.con_kardexMonto }, { h: 'Abogado a cargo', v: r => r.o.con_abogado },
    { h: 'Firma cliente', v: r => r.o.con_fFirmaCliente, t: 'd' }, { h: 'Firma inmobiliaria', v: r => r.o.con_fFirmaRL, t: 'd' },
    { h: 'Fecha base (ingreso)', v: r => fechaBase(r.o), t: 'd' }, { h: 'Mes de ingreso', v: r => mesTxt(mesDe(fechaBase(r.o))), s: 1 },
    { h: 'Desembolso programado', v: r => desembolsoProg(r.o), t: 'd' }, { h: 'Fecha de desembolso', v: r => r.o.fin_fDesembolso, t: 'd' },
    { h: 'Desembolso esperado', v: r => r.esp.fecha, t: 'd' }, { h: 'Tipo de fecha', v: r => r.esp.tipo, s: 1 }, { h: 'Mes en que se recibe', v: r => mesTxt(mesDe(r.esp.fecha)), s: 1 },
    { h: 'Monto a recibir (financ. + bono)', v: r => aRecibir(r.o), t: 'n', s: 1 },
    { h: 'Días base → desembolso', v: r => diasDesembolso(r.o).dias, t: 'i', x: r => diasDesembolso(r.o) },
    { h: 'Etapa actual', v: r => r.d.etapa === 'cerrado' ? 'Cerrado' : STAGE[r.d.etapa].name, s: 1 }];
  // fecha comprometida para el desembolso: la última cláusula generada manda; si no, el cronograma de Evolta (saldo a financiar)
  function desembolsoProg(o) {
    const it = o.clausula && o.clausula.pago && (o.clausula.pago.items || []).find(i => /a más tardar el/i.test(i.texto || ''));
    const fc = it && CLAUSULA.isoDeTexto((/a más tardar el (.+? del? \d{4})/i.exec(it.texto) || [])[1]);
    if (fc) return fc;
    const s = o.evolta && (o.evolta.cronograma || []).filter(c => /saldo|financ/i.test(c.concepto) && c.fProg).pop();
    return s ? s.fProg : '';
  }
  // fecha base de la operación: la primera que se registró (ingreso del cliente o inicio de la cobranza)
  const fechaBase = (o) => [o.fechaInicio, o.cob_fInicio].filter(Boolean).sort()[0] || '';
  // días desde la fecha base hasta el desembolso; si aún no hay desembolso, días que van corriendo
  function diasDesembolso(o) {
    const b = fechaBase(o); if (!b) return { dias: null, enCurso: false };
    const fin = o.fin_fDesembolso ? pd(o.fin_fDesembolso) : today();
    return { dias: Math.max(0, diff(fin, pd(b))), enCurso: !o.fin_fDesembolso };
  }
  // días típicos hasta el desembolso: el promedio real si ya hay al menos 3 desembolsados; si no, el de Configurar
  function diasTipicos() {
    const real = S.ops.filter(o => o.fin_fDesembolso && fechaBase(o)).map(o => diasDesembolso(o).dias);
    return real.length >= 3 ? { dias: Math.round(real.reduce((t, x) => t + x, 0) / real.length), fuente: `promedio real de ${real.length} desembolsos` } : { dias: S.params.diasDesemb || 90, fuente: 'valor de Configurar' };
  }
  // cuándo se espera recibir el desembolso: real > programado (cláusula / Evolta) > estimado (fecha base + días típicos)
  // si ya pasó Finanzas (está en Formalización, Postventa o cerrado) el desembolso ya ocurrió aunque no se anotó la fecha
  function desembolsoEsperado(o, tip, d) {
    if (o.fin_fDesembolso) return { fecha: o.fin_fDesembolso, tipo: 'Real' };
    d = d || D.get(o.id);
    if (d && ['for', 'pos', 'cerrado'].includes(d.etapa)) return { fecha: '', tipo: 'Recibido sin fecha' };
    const p = desembolsoProg(o); if (p) return { fecha: p, tipo: 'Programado' };
    const b = fechaBase(o); if (!b) return { fecha: '', tipo: '' };
    const est = iso(CRM.addDays(pd(b), (tip || diasTipicos()).dias)), hoy = iso(today());
    return est < hoy ? { fecha: hoy, tipo: 'Estimado (retrasado)', orig: est } : { fecha: est, tipo: 'Estimado' }; // si la estimación ya pasó, se espera este mes
  }
  const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
  const mesDe = (f) => f ? f.slice(0, 7) : '', mesTxt = (m) => m ? `${MESES_C[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}` : '—';
  const aRecibir = (o) => (Number(o.montoBanco) || 0) + (Number(o.bono) || 0);
  const opsFilter = () => flt('operaciones', { q: '', emp: '', proy: '', banco: '', etapa: '', mesIng: '', mes: '', vista: 'simple', size: '20', page: 1 });
  // proyección mensual: cuánto se recibirá por desembolsos (financiamiento + bono) en cada mes
  function proyeccion(list) {
    const m = {};
    list.forEach(r => { const k = mesDe(r.esp.fecha); if (!k) return; const x = m[k] = m[k] || { mes: k, n: 0, real: 0, prog: 0, est: 0 };
      x.n++; x[{ Real: 'real', Programado: 'prog' }[r.esp.tipo] || 'est'] += aRecibir(r.o); });
    return Object.values(m).sort((a, b) => a.mes < b.mes ? -1 : 1).map(x => ({ ...x, total: x.real + x.prog + x.est }));
  }
  function proyHtml(list, tip) {
    const P = proyeccion(list), hoy = mesDe(iso(today())), max = Math.max(1, ...P.map(x => x.total));
    const sf = list.filter(r => r.esp.tipo === 'Recibido sin fecha'), ret = list.filter(r => r.esp.tipo === 'Estimado (retrasado)');
    if (!P.length && !sf.length) return '';
    const sig = (n) => { const d = new Date(today()); d.setMonth(d.getMonth() + n); return iso(d).slice(0, 7); }, totMes = (m) => (P.find(x => x.mes === m) || { total: 0 }).total;
    return `<details class="card proy"><summary class="card-h"><h2>📅 Proyección de ingresos</h2><span class="small">Este mes: <b>${money(totMes(hoy))}</b> · ${mesTxt(sig(1))}: <b>${money(totMes(sig(1)))}</b> · ${mesTxt(sig(2))}: <b>${money(totMes(sig(2)))}</b></span><span class="small muted">ver detalle ▾</span></summary>
      <div class="card-b"><div class="ev-tw"><table class="ev-t"><thead><tr><th>Mes</th><th class="r">Operaciones</th><th class="r">Recibido (real)</th><th class="r">Programado</th><th class="r">Estimado</th><th class="r">Total del mes</th><th></th></tr></thead><tbody>
      ${P.map(x => `<tr class="${x.mes === hoy ? 'proy-hoy' : ''}" data-act="proy-mes" data-mes="${x.mes}" title="Ver las operaciones de este mes"><td><b>${mesTxt(x.mes)}</b>${x.mes === hoy ? ' <span class="badge plain">este mes</span>' : x.mes < hoy && (x.prog || x.est) ? ' <span class="badge rojo plain">atrasado</span>' : ''}</td><td class="r">${x.n}</td><td class="r">${x.real ? money(x.real) : '—'}</td><td class="r">${x.prog ? money(x.prog) : '—'}</td><td class="r">${x.est ? money(x.est) : '—'}</td><td class="r"><b>${money(x.total)}</b></td>
        <td style="min-width:120px"><div class="proy-bar"><span style="width:${x.real / max * 100}%;background:var(--f-verde)"></span><span style="width:${x.prog / max * 100}%;background:var(--accent)"></span><span style="width:${x.est / max * 100}%;background:var(--f-gris)"></span></div></td></tr>`).join('')}
      </tbody></table></div>
      ${sf.length ? `<div class="ev-falta" style="margin-top:10px">📌 <b>${sf.length} operaciones ya pasaron Finanzas</b> (${money(sf.reduce((t, r) => t + aRecibir(r.o), 0))}): se cuentan como recibidas, pero no tienen la <b>fecha de desembolso</b> registrada, por eso no aparecen en ningún mes. Regístrala en Finanzas para que sumen en su mes real.</div>` : ''}
      ${ret.length ? `<p class="small" style="margin:8px 0 0">⏰ ${ret.length} operaciones ya superaron los ${tip.dias} días estimados sin desembolso: se proyectan en el mes actual.</p>` : ''}
      <p class="small muted">🟢 Real: ya desembolsado · 🔵 Programado: fecha de la cláusula adicional o del cronograma de Evolta · ⚪ Estimado: fecha de ingreso + ${tip.dias} días (${tip.fuente}). Montos: financiamiento + bono. Toca un mes para ver sus operaciones.</p></div></details>`;
  }
  function opsRows(todosLosMeses) {
    const F = opsFilter(), ep = empresaProy(), tip = diasTipicos();
    return rows().filter(r => match(r, F.q) && (!F.emp || (empresaDe(r.o) || ep[r.o.proyecto] || '') === F.emp) && (!F.proy || r.o.proyecto === F.proy) && (!F.banco || r.o.banco === F.banco) && (!F.etapa || r.d.etapa === F.etapa)
      && (!F.mesIng || mesDe(fechaBase(r.o)) === F.mesIng)).map(r => ({ ...r, ep, esp: desembolsoEsperado(r.o, tip, r.d) }))
      .filter(r => todosLosMeses || !F.mes || mesDe(r.esp.fecha) === F.mes);
  }
  function vOperaciones() {
    const F = opsFilter(), id = 'rg-ops';
    const build = () => {
      const all = opsRows(), size = +F.size || 20, pages = Math.max(1, Math.ceil(all.length / size));
      F.page = Math.min(Math.max(1, F.page || 1), pages);
      // ordenar todo antes de cortar la página, para que el orden no sea solo dentro de la página
      const st = ui.sort[id + '-t'], vis = OPS_COLS.filter(c => F.vista === 'completa' || c.s);
      if (st && vis[st.i]) { const g = vis[st.i].v; all.sort((a, b) => { const x = g(a) ?? '', y = g(b) ?? ''; return (x > y ? 1 : x < y ? -1 : 0) * st.dir; }); }
      const page = all.slice((F.page - 1) * size, F.page * size);
      const cols = vis.map(c => ({ h: c.h, cls: c.t === 'n' || c.t === 'i' ? 'r' : '', s: r => c.v(r) ?? '', f: r => { const v = c.v(r); return !filled(v) ? '<span class="muted">—</span>' : c.t === 'n' ? money(v) : c.t === 'd' ? fdate(v)
        : c.t === 'i' ? (c.x(r).enCurso ? `<span class="muted">${v} en curso</span>` : `<b>${v}</b>`) : c.h === 'Cliente' ? `<a href="#/cliente/${r.o.id}"><b>${esc(v)}</b></a>`
        : c.h === 'Tipo de fecha' ? `<span class="badge plain ${{ Real: 'verde', Programado: '', 'Recibido sin fecha': 'verde' }[v] ?? 'gris'}">${esc(v)}</span>` : esc(v); } }));
      const sum = (fn) => all.reduce((t, r) => t + (Number(fn(r)) || 0), 0);
      const con = all.map(r => diasDesembolso(r.o)).filter(x => x.dias != null && !x.enCurso), prom = con.length ? Math.round(con.reduce((t, x) => t + x.dias, 0) / con.length) : null;
      const kpi = (n, l) => `<div class="kpi"><div class="n">${n}</div><div class="small muted">${l}</div></div>`;
      const pager = `<div class="pager"><span class="small muted">${all.length ? `${(F.page - 1) * size + 1}–${Math.min(F.page * size, all.length)} de ${all.length}` : '0 operaciones'}</span>
        <button class="btn sm" data-act="ops-page" data-p="${F.page - 1}" ${F.page <= 1 ? 'disabled' : ''}>‹ Anterior</button><span class="small">Página <b>${F.page}</b> de ${pages}</span><button class="btn sm" data-act="ops-page" data-p="${F.page + 1}" ${F.page >= pages ? 'disabled' : ''}>Siguiente ›</button></div>`;
      const mesChip = F.mes ? `<div class="small" style="margin-bottom:8px">Mostrando lo que se recibe en <b>${mesTxt(F.mes)}</b> <button class="btn sm" data-act="proy-mes" data-mes="">✕ Quitar</button></div>` : '';
      return `${proyHtml(opsRows(true), diasTipicos())}${mesChip}
        <div class="kpis ops-kpis">${kpi(all.length, 'Operaciones')}${kpi(money(sum(r => aRecibir(r.o))), 'A recibir (financiamiento + bono)')}${kpi(money(sum(r => r.d.cobRecibido)), 'Inicial cobrada')}${kpi((prom ?? '—') + ' días', 'Promedio ingreso → desembolso')}</div>
        ${pager}<div class="ops-tw ${F.vista === 'completa' ? 'full' : ''}">${tbl(id + '-t', cols, page)}</div>${all.length > size ? pager : ''}`;
    };
    const sel = (k, label, opts, noAll) => `<select data-f="operaciones" data-k="${k}" data-r="${id}">${noAll ? '' : `<option value="">${label}</option>`}${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(F[k]) === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const meses = (fn) => [...new Set(S.ops.map(fn).filter(Boolean))].sort().reverse().map(m => [m, mesTxt(m)]);
    const tip = diasTipicos();
    return `${pageHead('Resumen de operaciones', 'Cada venta con su financiamiento, equipo, banco, firmas y cuándo se recibe el desembolso.', `<button class="btn pri" data-act="export-ops">⬇️ Exportar a Excel</button>`, 'Filtra por <b>mes de ingreso</b> (fecha en que se creó el cliente o empezó la cobranza) y por <b>mes en que se recibe</b> el desembolso. La vista simple muestra lo principal; la completa y el Excel traen todas las columnas. Se recibe: la fecha real de desembolso; si no hay, la programada (cláusula o Evolta); si no, la fecha de ingreso + ' + tip.dias + ' días.')}
      <div class="filters"><input type="search" placeholder="Buscar cliente, DNI, unidad…" value="${esc(F.q)}" data-f="operaciones" data-k="q" data-r="${id}">
        ${(() => { const ep = empresaProy(), emps = [...new Set(S.ops.map(o => empresaDe(o) || ep[o.proyecto]).filter(Boolean))].sort();
          // al elegir empresa, la lista de proyectos muestra solo los de esa empresa
          const proys = uniq(o => o.proyecto).filter(p => !F.emp || S.ops.some(o => o.proyecto === p && (empresaDe(o) || ep[o.proyecto]) === F.emp));
          return sel('emp', 'Todas las empresas', emps.map(e => [e, e])) + sel('proy', 'Todos los proyectos', proys.map(p => [p, p])); })()}
        ${sel('mesIng', 'Mes de ingreso: todos', meses(o => mesDe(fechaBase(o))))}
        ${sel('mes', 'Se recibe en: todos', meses(o => mesDe(desembolsoEsperado(o, tip).fecha)))}
        ${sel('banco', 'Todos los bancos', uniq(o => o.banco).map(p => [p, p]))}
        ${sel('etapa', 'Todas las etapas', [...STAGES.map(s => [s.key, s.name]), ['cerrado', 'Cerrado']])}</div>
      <div class="filters ops-opts"><span class="small muted">Vista</span>${sel('vista', '', [['simple', 'Simple (lo principal)'], ['completa', 'Completa (todas las columnas)']], true)}<span class="small muted">Mostrar</span>${sel('size', '', [['20', '20 por página'], ['30', '30 por página'], ['50', '50 por página']], true)}</div>
      ${region(id, build)}`;
  }
  // fecha al mediodía: así el huso horario de Perú no la corre al día anterior al pasar a Excel
  const xlDate = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d, 12); };
  function exportOps() {
    const list = opsRows(), data = list.map(r => { const x = {}; OPS_COLS.forEach(c => { const v = c.v(r); x[c.h] = !filled(v) ? '' : c.t === 'n' || c.t === 'i' ? Number(v) : c.t === 'd' ? xlDate(v) : v; });
      const dd = diasDesembolso(r.o); x['Estado desembolso'] = r.o.fin_fDesembolso ? 'Desembolsado' : dd.dias != null ? 'En curso (días a hoy)' : ''; return x; });
    const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ 'Sin datos': '' }], { cellDates: true, dateNF: 'dd/mm/yyyy' });
    ws['!cols'] = [...OPS_COLS.map(c => ({ wch: c.h === 'Cliente' || c.h === 'Empresa' ? 34 : Math.max(12, c.h.length + 2) })), { wch: 22 }];
    const ref = XLSX.utils.decode_range(ws['!ref']); // formato de miles en las columnas de montos
    OPS_COLS.forEach((c, ci) => { if (c.t !== 'n') return; for (let r = 1; r <= ref.e.r; r++) { const cell = ws[XLSX.utils.encode_cell({ r, c: ci })]; if (cell && cell.t === 'n') cell.z = '#,##0.00'; } });
    ws['!autofilter'] = { ref: ws['!ref'] };
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Resumen operaciones');
    const tip = diasTipicos(), P = proyeccion(opsRows(true)).map(x => ({ Mes: mesTxt(x.mes), Operaciones: x.n, 'Recibido (real)': x.real, Programado: x.prog, Estimado: x.est, 'Total del mes': x.total }));
    const wp = XLSX.utils.json_to_sheet(P.length ? P : [{ 'Sin datos': '' }]);
    if (P.length) { const rp = XLSX.utils.decode_range(wp['!ref']); for (let r = 1; r <= rp.e.r; r++) for (let c = 2; c <= 5; c++) { const cell = wp[XLSX.utils.encode_cell({ r, c })]; if (cell) cell.z = '#,##0.00'; } }
    XLSX.utils.sheet_add_aoa(wp, [[], [`Real = ya desembolsado · Programado = cláusula adicional o cronograma de Evolta · Estimado = fecha base + ${tip.dias} días (${tip.fuente}). Montos: financiamiento + bono.`]], { origin: -1 });
    wp['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wp, 'Proyección mensual');
    XLSX.writeFile(wb, `Resumen_operaciones_${iso(today())}.xlsx`, { cellDates: true }); toast(`Excel con ${list.length} operaciones`);
  }

  /* ---- Cartas fianza: seguimiento de vencimientos, renovaciones y devoluciones (Finanzas) ---- */
  const esCarta = (o) => o.fin_tipo !== 'No aplica' && o.fin_tipoSolicitud !== 'MINUTA DE LEVANTAMIENTO' && !!(o.fin_nCarta || o.fin_cfMonto || o.fin_fEmision || o.fin_tipoSolicitud === 'CARTA FIANZA');
  // cadena de vencimientos: el primero y luego cada renovación (op.cfRenov guarda { anterior, nuevo, ts, por })
  const vencimientos = (o) => { const R = o.cfRenov || []; return R.length ? [R[0].anterior, ...R.map(r => r.nuevo)].filter(Boolean) : (o.fin_fVenc ? [o.fin_fVenc] : []); };
  const DIAS_AVISO_CF = 15;
  function cfEstado(o) {
    if (o.fin_cfEstado === 'Devuelta') return { k: 'dev', t: 'Devuelta', c: 'verde' };
    if (!o.fin_fVenc) return { k: 'sin', t: 'Sin vencimiento', c: 'gris' };
    const n = diff(pd(o.fin_fVenc), today());
    if (n < 0) return { k: 'venc', t: `Vencida hace ${-n} d`, c: 'rojo', n };
    if (n <= DIAS_AVISO_CF) return { k: 'pronto', t: `Vence en ${n} d`, c: 'amar', n };
    return { k: 'vig', t: (o.cfRenov || []).length ? 'Vigente (renovada)' : 'Vigente', c: '', n };
  }
  const cfFilter = () => flt('cartas', { q: '', emp: '', proy: '', bco: '', est: '', page: 1, size: '20' });
  const CF_COLS = [
    { h: 'Proyecto', v: r => r.o.proyecto }, { h: 'Empresa', v: r => empresaDe(r.o) || r.ep[r.o.proyecto] || '' }, { h: 'Unidad', v: r => r.o.unidad },
    { h: 'Cliente', v: r => r.o.cliente }, { h: 'DNI', v: r => r.o.dni }, { h: 'Monto fianza', v: r => r.o.fin_cfMonto, t: 'n' },
    { h: 'Banco promotor (emite)', v: r => r.o.fin_cfBanco }, { h: 'Banco que financia', v: r => r.o.banco }, { h: 'Carta N°', v: r => r.o.fin_nCarta },
    { h: 'Emisión', v: r => r.o.fin_fEmision, t: 'd' }, { h: 'Vencimiento actual', v: r => r.o.fin_cfEstado === 'Devuelta' ? '' : r.o.fin_fVenc, t: 'd' },
    { h: 'Renovaciones', v: r => Math.max(0, vencimientos(r.o).length - 1) }, { h: 'Estado', v: r => r.st.t }, { h: 'Devolución', v: r => r.o.fin_fDevolucion, t: 'd' }];
  function cfRows() {
    const F = cfFilter(), ep = empresaProy(), ord = { venc: 0, pronto: 1, vig: 2, sin: 3, dev: 4 };
    return rows().filter(r => esCarta(r.o)).map(r => ({ ...r, ep, st: cfEstado(r.o) }))
      .filter(r => match(r, F.q) && (!F.emp || (empresaDe(r.o) || ep[r.o.proyecto]) === F.emp) && (!F.proy || r.o.proyecto === F.proy) && (!F.bco || r.o.fin_cfBanco === F.bco) && (!F.est || r.st.k === F.est))
      .sort((a, b) => ord[a.st.k] - ord[b.st.k] || String(a.o.fin_fVenc || '9').localeCompare(String(b.o.fin_fVenc || '9'))); // lo más urgente arriba
  }
  function vCartas() {
    const F = cfFilter(), id = 'rg-cf';
    const build = () => {
      const all = cfRows(), size = +F.size || 20, pages = Math.max(1, Math.ceil(all.length / size)); F.page = Math.min(Math.max(1, F.page || 1), pages);
      const page = all.slice((F.page - 1) * size, F.page * size), cnt = (k) => all.filter(r => r.st.k === k), sum = (L) => money(L.reduce((t, r) => t + (Number(r.o.fin_cfMonto) || 0), 0));
      const vivas = all.filter(r => r.st.k !== 'dev');
      const kpi = (n, l, k, c) => `<div class="kpi ${F.est === k ? 'on' : ''}" ${k !== undefined ? `data-act="cf-est" data-k="${k}" role="button" tabindex="0"` : ''}><div class="n ${c || ''}">${n}</div><div class="small muted">${l}</div></div>`;
      const cols = [...CF_COLS.map(c => ({ h: c.h, cls: c.t === 'n' ? 'r' : '', s: r => c.v(r) ?? '', f: r => { const v = c.v(r);
        if (c.h === 'Estado') return `<span class="badge ${r.st.c}">${esc(v)}</span>`;
        if (c.h === 'Renovaciones') return v ? `<span title="${esc(vencimientos(r.o).map(fdate).join(' → '))}">${v} · ${vencimientos(r.o).slice(1).map(fdate).join(', ')}</span>` : '<span class="muted">—</span>';
        return !filled(v) ? '<span class="muted">—</span>' : c.t === 'n' ? money(v) : c.t === 'd' ? fdate(v) : c.h === 'Cliente' ? `<a href="#/cliente/${r.o.id}"><b>${esc(v)}</b></a>` : esc(v); } })),
        { h: '', cls: 'nowrap', f: r => r.st.k === 'dev' ? '' : `<button class="btn sm" data-act="cf-renovar" data-op="${r.o.id}">🔄 Renovar</button> <button class="btn sm" data-act="cf-devolver" data-op="${r.o.id}">↩️ Devuelta</button>` }];
      const pager = `<div class="pager"><span class="small muted">${all.length ? `${(F.page - 1) * size + 1}–${Math.min(F.page * size, all.length)} de ${all.length}` : '0 cartas'}</span><button class="btn sm" data-act="cf-page" data-p="${F.page - 1}" ${F.page <= 1 ? 'disabled' : ''}>‹ Anterior</button><span class="small">Página <b>${F.page}</b> de ${pages}</span><button class="btn sm" data-act="cf-page" data-p="${F.page + 1}" ${F.page >= pages ? 'disabled' : ''}>Siguiente ›</button></div>`;
      return `<div class="kpis ops-kpis">${kpi(vivas.length, `Cartas vigentes · ${sum(vivas)}`, '')}${kpi(cnt('venc').length, 'Vencidas: renovar o devolver ya', 'venc', 'txt-rojo')}${kpi(cnt('pronto').length, `Vencen en ${DIAS_AVISO_CF} días o menos`, 'pronto', 'txt-amar')}${kpi(cnt('dev').length, `Devueltas · ${sum(cnt('dev'))}`, 'dev')}</div>
        ${pager}<div class="ops-tw full cf-tw">${tbl(id + '-t', cols, page, 'No hay cartas fianza con estos filtros.')}</div>${all.length > size ? pager : ''}`;
    };
    const sel = (k, label, opts, noAll) => `<select data-f="cartas" data-k="${k}" data-r="${id}">${noAll ? '' : `<option value="">${label}</option>`}${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(F[k]) === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const base = S.ops.filter(esCarta), ep = empresaProy();
    return `${pageHead('Cartas fianza', 'Seguimiento de cada carta: vencimiento, renovaciones y devolución. Lo más urgente aparece primero.', `<button class="btn pri" data-act="export-cf">⬇️ Exportar a Excel</button>`, 'Se listan los clientes con carta fianza (Finanzas). <b>Renovar</b> registra el nuevo vencimiento y guarda el anterior en el historial. <b>Devuelta</b> la marca como devuelta con su fecha y deja de alertar. Toca un recuadro de arriba para filtrar. Los datos de la carta (banco, monto, N°) se llenan en la ficha → Finanzas → Carta Fianza, o cotejando con Evolta.')}
      <div class="filters"><input type="search" placeholder="Buscar cliente, DNI, unidad…" value="${esc(F.q)}" data-f="cartas" data-k="q" data-r="${id}">
        ${sel('emp', 'Todas las empresas', [...new Set(base.map(o => empresaDe(o) || ep[o.proyecto]).filter(Boolean))].sort().map(e => [e, e]))}
        ${sel('proy', 'Todos los proyectos', [...new Set(base.map(o => o.proyecto).filter(Boolean))].sort().map(p => [p, p]))}
        ${sel('bco', 'Todos los bancos promotores', [...new Set(base.map(o => o.fin_cfBanco).filter(Boolean))].sort().map(b => [b, b]))}
        ${sel('est', 'Todos los estados', [['venc', 'Vencidas'], ['pronto', 'Por vencer'], ['vig', 'Vigentes'], ['sin', 'Sin vencimiento'], ['dev', 'Devueltas']])}
        ${sel('size', '', [['20', '20 por página'], ['30', '30 por página'], ['50', '50 por página']], true)}</div>
      ${region(id, build)}`;
  }
  function cfRenovar(o) {
    modal({ title: `${o.fin_fVenc ? 'Renovar' : 'Registrar vencimiento de'} carta fianza · ${o.cliente}`, ok: o.fin_fVenc ? '🔄 Registrar renovación' : 'Guardar vencimiento', body: `<p class="small" style="margin-top:0">Carta <b>${esc(o.fin_nCarta || '—')}</b> · vence <b>${fdate(o.fin_fVenc) || 'sin fecha'}</b>${(o.cfRenov || []).length ? ` · renovada ${o.cfRenov.length} vez(es)` : ''}</p>
      <div class="form"><label>${o.fin_fVenc ? 'Nuevo vencimiento' : 'Fecha de vencimiento'}<input type="date" id="cf-nv"></label><label>N° de carta (si cambió con la renovación)<input id="cf-nc" value="${esc(o.fin_nCarta || '')}"></label></div>`,
      onOk: (dlg) => { const nv = dlg.querySelector('#cf-nv').value, nc = dlg.querySelector('#cf-nc').value.trim(); if (!nv) { toast('Elige el nuevo vencimiento'); return false; }
        if (o.fin_fVenc && nv <= o.fin_fVenc) { toast('El nuevo vencimiento debe ser posterior al actual'); return false; }
        if (o.fin_fVenc) { // sin vencimiento previo no es renovación: solo se registra el vencimiento
          const R = [...(o.cfRenov || []), { anterior: o.fin_fVenc, nuevo: nv, ts: Date.now(), por: S.actor }];
          o.cfRenov = R; (pendingOps[o.id] = pendingOps[o.id] || {}).cfRenov = R;
        }
        setField(o.id, 'fin_fVenc', nv); if (nc && nc !== o.fin_nCarta) setField(o.id, 'fin_nCarta', nc); setField(o.id, 'fin_cfEstado', 'Vigente');
        toast(`Renovada hasta el ${fdate(nv)}`); render(true); } });
  }
  function cfDevolver(o) {
    modal({ title: `Carta fianza devuelta · ${o.cliente}`, ok: '↩️ Marcar como devuelta', body: `<p class="small" style="margin-top:0">Carta <b>${esc(o.fin_nCarta || '—')}</b>. Al marcarla como devuelta deja de generar alertas de vencimiento.</p><div class="form"><label>Fecha de devolución<input type="date" id="cf-fd" value="${iso(today())}"></label></div>`,
      onOk: (dlg) => { const fd = dlg.querySelector('#cf-fd').value; if (!fd) { toast('Elige la fecha'); return false; }
        setField(o.id, 'fin_fDevolucion', fd); setField(o.id, 'fin_cfEstado', 'Devuelta'); toast('Carta marcada como devuelta'); render(true); } });
  }
  function exportCf() {
    const list = cfRows(), maxR = Math.max(0, ...list.map(r => vencimientos(r.o).length - 1));
    const data = list.map((r, i) => { const x = { Item: i + 1 }; CF_COLS.forEach(c => { if (c.h === 'Renovaciones' || c.h === 'Vencimiento actual') return; const v = c.v(r); x[c.h] = !filled(v) ? '' : c.t === 'n' ? Number(v) : c.t === 'd' ? xlDate(v) : v; });
      const V = vencimientos(r.o); x['Vcto'] = V[0] ? xlDate(V[0]) : ''; for (let k = 1; k <= maxR; k++) x[`Vcto renovación ${k}`] = V[k] ? xlDate(V[k]) : ''; x['Estado'] = r.st.t; return x; });
    const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ 'Sin datos': '' }], { cellDates: true, dateNF: 'dd/mm/yyyy' });
    if (data.length) { const keys = Object.keys(data[0]), ci = keys.indexOf('Monto fianza'), rg = XLSX.utils.decode_range(ws['!ref']); for (let r = 1; r <= rg.e.r; r++) { const cell = ws[XLSX.utils.encode_cell({ r, c: ci })]; if (cell && cell.t === 'n') cell.z = '#,##0.00'; }
      ws['!cols'] = keys.map(k => ({ wch: k === 'Cliente' || k === 'Empresa' ? 34 : Math.max(11, k.length + 2) })); ws['!autofilter'] = { ref: ws['!ref'] }; }
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Cartas fianza'); XLSX.writeFile(wb, `Cartas_fianza_${iso(today())}.xlsx`, { cellDates: true }); toast(`Excel con ${list.length} cartas fianza`);
  }

  /* ---- Inscripciones (Formalización): estado del trámite notarial y registral de cada cliente ---- */
  const enFormalizacion = (r) => r.d.state.for !== 'porllegar'; // en Formalización o ya pasó por ella
  // estado: el elegido por la asistente; si no hay, se deduce de las fechas
  const insEstado = (o) => o.for_estadoIns || (o.for_fInscripcion || o.for_fIndep ? 'Inscrito' : o.for_fIngresoNotaria ? 'Ingresado a notaría' : 'Pendiente');
  const INS_GRUPO = { Inscrito: 'ok', 'En calificación (SUNARP)': 'cal', Observado: 'obs', 'Sin respuesta': 'obs', 'Ingresado a notaría': 'not', 'Docs enviados a notaría': 'not', 'Pendiente conformidad de notaría (adenda)': 'not', 'Email enviado': 'not', Pendiente: 'pend' };
  const INS_BADGE = { ok: 'verde', cal: '', obs: 'rojo', not: 'amar', pend: 'gris' };
  const insFilter = () => flt('inscripciones', { q: '', emp: '', proy: '', bco: '', not: '', grp: '', page: 1, size: '20' });
  const INS_COLS = [
    { h: 'Proyecto', v: r => r.o.proyecto }, { h: 'Empresa', v: r => empresaDe(r.o) || r.ep[r.o.proyecto] || '' }, { h: 'Dpto.', v: r => r.o.unidad },
    { h: 'Comprador', v: r => r.o.cliente }, { h: 'DNI', v: r => r.o.dni }, { h: 'Banco financia', v: r => r.o.banco }, { h: 'Ejecutivo de banco', v: r => r.o.ejecBanco },
    { h: 'Celular ejecutivo', v: r => r.o.con_bcoTel }, { h: 'Email ejecutivo', v: r => r.o.con_bcoCorreo }, { h: 'Carta N°', v: r => r.o.fin_nCarta },
    { h: 'Estado', v: r => insEstado(r.o) }, { h: 'Notaría', v: r => r.o.con_notaria }, { h: 'Abogado', v: r => r.o.con_abogado },
    { h: 'Correo / cel. notaría', v: r => [r.o.con_notEmail, r.o.con_notCel || r.o.con_notTel].filter(Boolean).join(' · ') }, { h: 'Kardex', v: r => r.o.con_kardexMonto },
    { h: 'Código', v: r => r.o.for_codigo }, { h: 'Título', v: r => r.o.for_titulo }, { h: 'Copia SUNARP en Evolta', v: r => r.o.for_copiaEvolta || 'PENDIENTE' }, { h: 'Ingreso notaría', v: r => r.o.for_fIngresoNotaria, t: 'd' },
    { h: 'Días en trámite', v: r => r.o.for_fIngresoNotaria && !r.o.for_fInscripcion ? diff(today(), pd(r.o.for_fIngresoNotaria)) : null, t: 'i' },
    { h: 'Inscripción', v: r => r.o.for_fInscripcion, t: 'd' }, { h: 'Observación', v: r => r.o.for_obsIns }];
  function insRows() {
    const F = insFilter(), ep = empresaProy(), ord = { obs: 0, cal: 1, not: 2, pend: 3, ok: 4 };
    return rows().filter(enFormalizacion).map(r => ({ ...r, ep, grp: INS_GRUPO[insEstado(r.o)] || 'pend' }))
      .filter(r => match(r, F.q) && (!F.emp || (empresaDe(r.o) || ep[r.o.proyecto]) === F.emp) && (!F.proy || r.o.proyecto === F.proy) && (!F.bco || r.o.banco === F.bco) && (!F.not || r.o.con_notaria === F.not) && (!F.grp || r.grp === F.grp))
      .sort((a, b) => ord[a.grp] - ord[b.grp] || String(a.o.for_fIngresoNotaria || '9').localeCompare(String(b.o.for_fIngresoNotaria || '9')));
  }
  function vInscripciones() {
    const F = insFilter(), id = 'rg-ins', sla = S.params.slaNot || 20;
    const build = () => {
      const all = insRows(), size = +F.size || 20, pages = Math.max(1, Math.ceil(all.length / size)); F.page = Math.min(Math.max(1, F.page || 1), pages);
      const page = all.slice((F.page - 1) * size, F.page * size), n = (g) => all.filter(r => r.grp === g).length;
      const kpi = (v, l, g, c) => `<div class="kpi ${F.grp === g ? 'on' : ''}" data-act="ins-grp" data-k="${g}" role="button" tabindex="0"><div class="n ${c || ''}">${v}</div><div class="small muted">${l}</div></div>`;
      const ed = can('a_edit');
      const cols = INS_COLS.map(c => ({ h: c.h, cls: c.t === 'i' ? 'r' : '', s: r => c.v(r) ?? '', f: r => { const v = c.v(r);
        if (c.h === 'Estado') return ed ? `<select class="ins-sel b-${INS_BADGE[r.grp]}" data-ins="${r.o.id}">${CRM.ESTADOS_INS.map(e => `<option ${e === v ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select>` : `<span class="badge ${INS_BADGE[r.grp]}">${esc(v)}</span>`;
        if (c.h === 'Días en trámite') return v == null ? '<span class="muted">—</span>' : `<span class="${v > sla ? 'txt-rojo' : v >= sla - (S.params.anticipo || 2) ? 'txt-amar' : ''}"><b>${v}</b> / ${sla}</span>`;
        return !filled(v) ? '<span class="muted">—</span>' : c.t === 'd' ? fdate(v) : c.h === 'Comprador' ? `<a href="#/cliente/${r.o.id}"><b>${esc(v)}</b></a>` : esc(v); } }));
      const pager = `<div class="pager"><span class="small muted">${all.length ? `${(F.page - 1) * size + 1}–${Math.min(F.page * size, all.length)} de ${all.length}` : '0 inscripciones'}</span><button class="btn sm" data-act="ins-page" data-p="${F.page - 1}" ${F.page <= 1 ? 'disabled' : ''}>‹ Anterior</button><span class="small">Página <b>${F.page}</b> de ${pages}</span><button class="btn sm" data-act="ins-page" data-p="${F.page + 1}" ${F.page >= pages ? 'disabled' : ''}>Siguiente ›</button></div>`;
      return `<div class="kpis ops-kpis">${kpi(all.length, 'En formalización', '')}${kpi(n('obs'), 'Observadas / sin respuesta', 'obs', 'txt-rojo')}${kpi(n('cal'), 'En calificación SUNARP', 'cal')}${kpi(n('not'), 'En notaría', 'not', 'txt-amar')}${kpi(n('pend'), 'Pendientes de iniciar', 'pend')}${kpi(n('ok'), 'Inscritas', 'ok')}</div>
        ${pager}<div class="ops-tw full ins-tw">${tbl(id + '-t', cols, page, 'No hay expedientes con estos filtros.')}</div>${all.length > size ? pager : ''}`;
    };
    const base = rows().filter(enFormalizacion).map(r => r.o), ep = empresaProy(), opts = (fn) => [...new Set(base.map(fn).filter(Boolean))].sort().map(x => [x, x]);
    const sel = (k, label, o, noAll) => `<select data-f="inscripciones" data-k="${k}" data-r="${id}">${noAll ? '' : `<option value="">${label}</option>`}${o.map(([v, l]) => `<option value="${esc(v)}" ${String(F[k]) === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    return `${pageHead('Inscripciones', 'Avance de la formalización de cada cliente: notaría, kardex, código, título y estado de la inscripción.', `<button class="btn pri" data-act="export-ins">⬇️ Exportar a Excel</button>`, `Se listan los clientes que están en Formalización o ya pasaron por ella. Cambia el <b>Estado</b> directo en la tabla: al marcar "Inscrito" se registra la fecha de inscripción. "Días en trámite" cuenta desde el ingreso a notaría (plazo: ${sla} días). Código, título y observación se editan en la ficha → Formalización. Los datos del banco y la notaría vienen de Contratos (Notaría y Kardex/Banco).`)}
      <div class="filters"><input type="search" placeholder="Buscar comprador, DNI, dpto…" value="${esc(F.q)}" data-f="inscripciones" data-k="q" data-r="${id}">
        ${sel('emp', 'Todas las empresas', opts(o => empresaDe(o) || ep[o.proyecto]))}${sel('proy', 'Todos los proyectos', opts(o => o.proyecto))}
        ${sel('bco', 'Todos los bancos', opts(o => o.banco))}${sel('not', 'Todas las notarías', opts(o => o.con_notaria))}
        ${sel('size', '', [['20', '20 por página'], ['30', '30 por página'], ['50', '50 por página']], true)}</div>
      ${region(id, build)}`;
  }
  function exportIns() {
    const list = insRows(), data = list.map((r, i) => { const x = { Item: i + 1 }; INS_COLS.forEach(c => { const v = c.v(r); x[c.h] = !filled(v) ? '' : c.t === 'd' ? xlDate(v) : v; }); return x; });
    const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ 'Sin datos': '' }], { cellDates: true, dateNF: 'dd/mm/yyyy' });
    if (data.length) { ws['!cols'] = Object.keys(data[0]).map(k => ({ wch: k === 'Comprador' || k === 'Empresa' || k.startsWith('Email') || k.startsWith('Correo') ? 32 : Math.max(10, k.length + 2) })); ws['!autofilter'] = { ref: ws['!ref'] }; }
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Inscripciones'); XLSX.writeFile(wb, `Inscripciones_${iso(today())}.xlsx`, { cellDates: true }); toast(`Excel con ${list.length} expedientes`);
  }

  /* ---- Constancia de cierre de etapa (etiqueta PDF A6) ---- */
  const STAGE_HEX = { cob: '#2c6db4', con: '#7448b0', fin: '#b86e12', for: '#1c8658', pos: '#be3f76' };
  const fechaCulm = (o, k) => k === 'cob' ? o.cob_fCulm : k === 'con' ? (o.con_fCulm || [o.con_fFirmaCliente, o.con_fFirmaRL].filter(Boolean).sort().pop())
    : k === 'fin' ? (o.fin_tipo === 'No aplica' ? '' : o.fin_tipoSolicitud === 'MINUTA DE LEVANTAMIENTO' ? o.for_fFirmaMinuta : o.fin_fEmision) : k === 'for' ? o.for_fIndep : '';
  const cotejoTxt = (c) => !c ? 'No cotejado' : `${fdate(iso(new Date(c.ts)))} · ${c.pendientes ? c.pendientes + ' pendientes' : 'todo coincide'}`;
  function stickerDatos(o, d, k) {
    const D = [], add = (l, v) => { if (filled(v)) D.push([l, v]); };
    if (k === 'cob') {
      add('Precio de venta', money(o.precio)); add('Inicial recibida', money(d.cobRecibido)); add('Saldo inicial por recibir', money(num(o.cob_porRecibir) || 0));
      add('Inicio de cobranza', fdate(o.cob_fInicio)); add('Días de atención', d.cobDiasAt != null ? `${d.cobDiasAt} (objetivo ${S.params.plazo})` : '');
      if (o.evolta) { add('Estado de cuenta Evolta', `consultado ${fdate(o.evolta.consulta)}`); add('Pagado / por pagar (Evolta)', `${money(o.evolta.pagado)} / ${money(o.evolta.porPagar)}`); }
    } else if (k === 'con') {
      add('Asistente legal', o.con_asistente); add('Validación', fdate(o.con_fValidacion)); add('Cláusula enviada', o.con_clausula);
      if (o.clausula && o.clausula.generada) add('Cláusula adicional generada', fdate(iso(new Date(o.clausula.generada))));
      add('Firma cliente', fdate(o.con_fFirmaCliente)); add('Firma rep. legal', fdate(o.con_fFirmaRL)); add('Notaría', o.con_notaria); add('N° Kardex', o.con_kardexMonto);
      add('Datos en CRM Evolta', o.con_datosCRM); add('Cotejo Notaría y Kardex/Banco', cotejoTxt(o.nkbCheck)); add('Cumplimiento de plazo', d.conCump);
    } else if (k === 'fin') {
      add('Carta fianza / minuta', o.fin_tipo); add('Tipo de solicitud', o.fin_tipoSolicitud); add('N° carta fianza', o.fin_nCarta); add('Monto carta fianza', o.fin_cfMonto != null ? money(o.fin_cfMonto) : '');
      add('Solicitud', fdate(o.fin_fSolicitud)); add('Emisión / activación', fdate(o.fin_fEmision)); add('Vencimiento / vigencia', fdate(o.fin_fVenc)); add('Desembolso', fdate(o.fin_fDesembolso));
      if (o.fin_tipo !== 'No aplica' && o.fin_tipoSolicitud !== 'MINUTA DE LEVANTAMIENTO') { add('Cotejo Carta Fianza', cotejoTxt(o.cfCheck)); add('Estado de la carta', cfEstado(o).t); add('Devolución', fdate(o.fin_fDevolucion)); }
    } else if (k === 'for') {
      add('Inicio formalización', fdate(o.for_fInicio)); add('Levantamiento de hipoteca', o.for_aplicaLev); add('Ingreso a notaría', fdate(o.for_fIngresoNotaria));
      add('Inscripción SUNARP', fdate(o.for_fInscripcion)); add('Independización', fdate(o.for_fIndep)); add('Estado', o.for_estado);
      add('Código de inscripción', o.for_codigo); add('N° de título SUNARP', o.for_titulo); add('Copia simple en Evolta', o.for_copiaEvolta);
    } else if (k === 'pos') { add('Derivado a postventa', o.pos_derivado); add('Unidad entregada', o.pos_entregada); }
    return D;
  }
  /* Cierre de etapa en 3 pasos: 1) el responsable firma que culminó, 2) la jefatura revisa y da V°B° (u observa),
     3) recién entonces se descarga la constancia con ambas firmas (nombre, fecha y hora). */
  const fechaHora = (ts) => new Date(ts).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fullName = (n) => { const u = user(n); return (u && u.full) || n; };
  const isJefe = (n) => { const u = user(n || S.actor); return !!(u && (u.admin || u.stage === JEFATURA)); };
  const canFirmar = (o, d, k) => { const u = user(S.actor); return !!u && (u.admin || u.stage === k || d.owner[k] === S.actor); };
  const cierre = (o, k) => (o.cierres || {})[k];
  function setCierre(o, k, c, logTxt) {
    o.cierres = { ...(o.cierres || {}), [k]: c }; (pendingOps[o.id] = pendingOps[o.id] || {}).cierres = o.cierres;
    S.log.push({ ts: Date.now(), usuario: S.actor, opId: o.id, etapa: k, campo: 'cierre', antes: '', despues: logTxt }); commit();
  }
  const pendientesVB = () => S.ops.flatMap(o => Object.entries(o.cierres || {}).filter(([, c]) => c.estado === 'pendiente').map(([k, c]) => ({ o, k, c }))).sort((a, b) => a.c.firma.ts - b.c.firma.ts);
  function stickerBar(o, d, k) {
    if (d.state[k] !== 'culminada') return '';
    const c = cierre(o, k), firma = c && c.firma ? `✍️ Firmado por <b>${esc(c.firma.nombre || fullName(c.firma.por))}</b> · ${fechaHora(c.firma.ts)}` : '';
    let html;
    if (!c || c.estado === 'observado') html = `${c && c.obs ? `<div class="ev-falta">↩️ <b>Observado por ${esc(c.obs.por)}</b> (${fechaHora(c.obs.ts)}): ${esc(c.obs.motivo)}</div>` : ''}
      ${canFirmar(o, d, k) ? `<button class="btn sm pri" data-act="cierre-firmar" data-op="${o.id}" data-s="${k}">✍️ Firmar culminación de la etapa</button> <span class="small muted">La jefatura la revisará y dará su V°B°.</span>` : '<span class="small muted">Esperando que el responsable firme la culminación.</span>'}
      ${CIERRE_ESTRICTO.has(k) && d.check[k].some(x => !x.done) ? `<span class="small txt-amar">⚠️ Faltan ${d.check[k].filter(x => !x.done).length} punto(s) para que el proceso esté saneado: no se podrá firmar hasta completarlos.</span>` : ''}`;
    else if (c.estado === 'pendiente') html = `<div class="small">${firma}</div><div class="small cl-wait">⏳ Derivado a jefatura · esperando V°B°</div>
      ${isJefe() ? `<button class="btn sm pri" data-act="cierre-vb" data-op="${o.id}" data-s="${k}">✅ Dar V°B°</button> <button class="btn sm" data-act="cierre-obs" data-op="${o.id}" data-s="${k}">↩️ Observar</button>` : ''}`;
    else html = `<div class="small">${firma}</div><div class="small nkb-ok">✅ V°B° de <b>${esc(c.vb.nombre || fullName(c.vb.por))}</b> · ${fechaHora(c.vb.ts)}</div>
      <button class="btn sm" data-act="sticker" data-op="${o.id}" data-s="${k}">🏷️ Descargar constancia (PDF)</button> <span class="small muted">código ${esc(c.codigo)}</span>`;
    return `<div class="cierre"><b>Cierre de la etapa</b>${html}</div>`;
  }
  // Finanzas y Formalización solo se cierran con el proceso saneado: ningún punto pendiente
  const CIERRE_ESTRICTO = new Set(['fin', 'for']);
  async function cierreFirmar(o, k) {
    const d = D.get(o.id), faltan = d.check[k].filter(x => !x.done), pend = faltan.length;
    if (CIERRE_ESTRICTO.has(k) && pend) {
      return modal({ title: `Aún no se puede cerrar ${STAGE[k].name}`, ok: 'Entendido', cancel: '', body: `<p style="margin-top:0">Para emitir la constancia, el proceso de <b>${STAGE[k].name}</b> debe estar <b>saneado</b>. Falta:</p>
        <ul class="chk">${faltan.map(x => `<li><span class="tk"></span><span class="cl">${esc(x.label)}</span></li>`).join('')}</ul>
        <p class="small muted">${k === 'for' ? 'La copia simple que emite SUNARP debe estar cargada en digital en el CRM Evolta y su N° de título registrado en la ficha (Formalización → Editar datos a mano).' : 'La carta fianza debe estar cotejada con Evolta y al día: renovada si venció, o marcada como devuelta (pantalla Cartas fianza).'}</p>` });
    }
    if (!(user(S.actor) || {}).full) toast('Consejo: pide al administrador que registre tu nombre completo en Equipo para que salga en la constancia');
    if (!await ask(`Firmarás como ${fullName(S.actor)} que culminaste la etapa ${STAGE[k].name} de ${o.cliente}.${pend ? ` Quedan ${pend} punto(s) sin marcar: la constancia saldrá "con observaciones".` : ''} Se registrará tu nombre, fecha y hora y se derivará a jefatura para su V°B°.`, '✍️ Firmar')) return;
    setCierre(o, k, { estado: 'pendiente', firma: { por: S.actor, nombre: fullName(S.actor), ts: Date.now() } }, `Firma de culminación (${STAGE[k].name})`);
    toast('Firmado. Derivado a jefatura para V°B°'); render(true);
  }
  async function cierreVB(o, k) {
    const c = cierre(o, k); if (!c || c.estado !== 'pendiente' || !isJefe()) return;
    const falta = D.get(o.id).check[k].filter(x => !x.done);
    if (CIERRE_ESTRICTO.has(k) && falta.length) return toast(`No se puede dar V°B°: falta ${falta.map(x => x.label).join(' · ')}. Obsérvalo para que lo complete.`);
    if (!await ask(`Darás tu V°B° al cierre de ${STAGE[k].name} de ${o.cliente}, firmado por ${c.firma.por} el ${fechaHora(c.firma.ts)}. Se registrará tu nombre, fecha y hora.`, '✅ Dar V°B°')) return;
    const ts = Date.now();
    setCierre(o, k, { ...c, estado: 'aprobado', vb: { por: S.actor, nombre: fullName(S.actor), ts }, codigo: `${o.id}-${k.toUpperCase()}-${CONSTANCIA.codigo([o.id, k, c.firma.ts, ts, S.actor])}` }, `V°B° de jefatura (${STAGE[k].name})`);
    toast('V°B° registrado. Ya se puede descargar la constancia'); render(true);
  }
  function cierreObs(o, k) {
    const c = cierre(o, k); if (!c || !isJefe()) return;
    modal({ title: `Observar cierre · ${STAGE[k].name}`, ok: '↩️ Devolver con observación', body: `<div class="form"><label>¿Qué debe corregir ${esc(c.firma.por)}?<textarea id="obs-m" placeholder="Ej.: Falta cotejar la carta fianza con Evolta"></textarea></label></div>`,
      onOk: (dlg) => { const m = dlg.querySelector('#obs-m').value.trim(); if (!m) { toast('Escribe la observación'); return false; }
        setCierre(o, k, { ...c, estado: 'observado', obs: { por: S.actor, ts: Date.now(), motivo: m } }, `Cierre observado (${STAGE[k].name}): ${m}`); toast('Devuelto al responsable'); render(true); } });
    setTimeout(() => { const t = $('#obs-m'); t && t.focus(); }, 60);
  }
  async function sticker(id, k) {
    const o = getOp(id), d = D.get(id), st = STAGE[k], c = o && cierre(o, k); if (!o || !st) return;
    if (!c || c.estado !== 'aprobado') return toast('Primero se necesita la firma del responsable y el V°B° de jefatura');
    const ts = Date.now(), cod = c.codigo;
    toast('Generando constancia…');
    try {
      const blob = await CONSTANCIA.pdf({ stage: { n: st.n, name: st.name, color: STAGE_HEX[k] }, cliente: o.cliente, id: o.id, dni: o.dni, proyecto: o.proyecto, unidad: o.unidad,
        responsable: fullName(d.owner[k]), fechaCulm: fdate(fechaCulm(o, k)) || '—', checks: d.check[k].map(c => ({ label: c.label, done: c.done })), datos: stickerDatos(o, d, k),
        firma: { por: c.firma.nombre || fullName(c.firma.por), cuando: fechaHora(c.firma.ts), rol: (user(c.firma.por) || {}).rol || '' }, vb: { por: c.vb.nombre || fullName(c.vb.por), cuando: fechaHora(c.vb.ts), rol: (user(c.vb.por) || {}).rol || '' },
        codigo: cod, generado: new Date(ts).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }), por: S.actor });
      download(`CONSTANCIA ${st.name.toUpperCase()} ${o.id} ${(o.cliente || '').replace(/[\\/:*?"<>|,]/g, '').slice(0, 40)}.pdf`, blob);
      const reg = { ts, por: S.actor, codigo: cod, conforme: d.check[k].every(c => c.done) };
      o.stickers = { ...(o.stickers || {}), [k]: reg }; (pendingOps[o.id] = pendingOps[o.id] || {}).stickers = o.stickers;
      S.log.push({ ts, usuario: S.actor, opId: o.id, etapa: k, campo: 'constancia', antes: '', despues: `${st.name} · ${cod}${reg.conforme ? '' : ' (con observaciones)'}` });
      commit(); toast('Constancia descargada'); render(true);
    } catch (e) { console.error(e); toast('No se pudo generar la constancia: ' + e.message); }
  }

  /* ---- Pestañas de Evolta (Notaría y Kardex/Banco, Carta Fianza): mismos campos y cotejo con una captura ---- */
  const TAB_F = (tk) => CRM.EV_TABS[tk].groups.flatMap(g => g.f), filled = (v) => v !== undefined && v !== null && v !== '';
  const nkbNorm = (f, v) => !filled(v) ? '' : f.t === 'number' ? String(Number(String(v).replace(/,/g, ''))) : EVOLTA.fold(String(v)).replace(/\s+/g, ' ').trim();
  const G_TITLES = (tk) => CRM.EV_TABS[tk].groups.map(g => g.t).join(', ');
  function tabStatus(o, tk) {
    const F = TAB_F(tk), faltan = F.filter(f => !filled(o[f.k])).length, c = o[tk + 'Check'], lbl = (ks) => ks.map(k => (F.find(f => f.k === k) || {}).l).join(', ');
    const cot = c ? `Último cotejo con Evolta: ${new Date(c.ts).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })} · ${esc(c.por || '')}` : 'Aún no se ha cotejado con Evolta.';
    const det = c && c.pendientes ? [c.faltaEvolta.length && `<div>📝 <b>Completar en Evolta:</b> ${esc(lbl(c.faltaEvolta))}</div>`, c.faltaAmbos.length && `<div>❗ <b>Falta en ambos:</b> ${esc(lbl(c.faltaAmbos))}</div>`, (c.faltaCrm || []).length && `<div>⬅️ <b>Está en Evolta, falta en el CRM:</b> ${esc(lbl(c.faltaCrm))}</div>`, c.difieren.length && `<div>≠ <b>Distinto en Evolta:</b> ${esc(lbl(c.difieren))}</div>`].filter(Boolean).join('') : '';
    const ok = CRM.tabOk(o, tk);
    return `<div id="st-${tk}" class="${ok ? 'small nkb-ok' : 'ev-falta'}">${ok ? '✅ Completo y cotejado con Evolta.' : `${faltan ? `<b>${faltan} campo${faltan > 1 ? 's' : ''} por completar en el CRM.</b> ` : ''}${cot}`}${ok ? ' ' + cot : ''}${det}</div>`;
  }
  function tabHtml(o, tk) {
    const T = CRM.EV_TABS[tk], G = T.groups;
    const card = (gs) => `<div class="nkb-card ${T.wide ? 'nkb-row' : ''}">${gs.map(g => `<div class="nkb-t">${g.t}</div>${g.f.map(f => fieldInput(o, { k: f.k, l: f.l, t: f.t || 'text' }, 'siempre')).join('')}`).join('')}</div>`;
    return `<div class="nkb"><div class="nkb-h"><b>${T.ic} ${T.t}</b><span class="small muted">mismos campos que la pestaña de Evolta</span><button class="btn sm" data-act="evtab" data-tab="${tk}" data-op="${o.id}">📋 Cotejar con Evolta</button></div>
      ${tabStatus(o, tk)}<div class="nkb-grid" style="--cols:${T.cols.length}">${T.cols.map(c => card(c.map(i => G[i]))).join('')}</div></div>`;
  }
  function openTab(op, tk) {
    let ev = null;
    const T = CRM.EV_TABS[tk], F = TAB_F(tk);
    modal({ title: `Cotejar ${T.t} con Evolta · ${op.cliente}`, ok: 'Guardar cotejo', wide: true,
      body: `<ol class="small" style="margin:0 0 10px;padding-left:18px"><li>En Evolta abre la venta y entra a la pestaña <b>${T.t}</b>.</li>
        <li>Toma una captura (<b>Windows + Shift + S</b>) y pégala abajo con <b>Ctrl + V</b>. También puedes seleccionar el texto de la pestaña, copiarlo y pegarlo.</li></ol>
        <div class="nkb-paste" contenteditable="true" tabindex="0" data-ph="Haz clic aquí y pega (Ctrl + V)"></div>
        <p class="small" style="margin:8px 0"><label class="btn sm">🖼️ Elegir imagen…<input type="file" accept="image/*" id="nkb-img" hidden></label></p><div id="nkb-res"></div>`,
      onOk: () => {
        if (!ev) { toast('Primero pega la captura o el texto de Evolta'); return false; }
        $$('#nkb-res [data-nk]').forEach(c => { if (c.checked) setField(op.id, c.dataset.nk, ev[c.dataset.nk]); });
        const faltaEvolta = [], faltaAmbos = [], faltaCrm = [], difieren = [];
        F.forEach(f => { const a = nkbNorm(f, ev[f.k]), b = nkbNorm(f, op[f.k]); if (!a && !b) faltaAmbos.push(f.k); else if (!a) faltaEvolta.push(f.k); else if (!b) faltaCrm.push(f.k); else if (a !== b) difieren.push(f.k); });
        const chk = { ts: Date.now(), por: S.actor, faltaEvolta, faltaAmbos, faltaCrm, difieren, pendientes: faltaEvolta.length + faltaAmbos.length + faltaCrm.length + difieren.length, evolta: ev };
        op[tk + 'Check'] = chk; (pendingOps[op.id] = pendingOps[op.id] || {})[tk + 'Check'] = chk;
        S.log.push({ ts: Date.now(), usuario: S.actor, opId: op.id, etapa: T.stage, campo: 'cotejo_' + tk, antes: '', despues: chk.pendientes ? `${chk.pendientes} pendientes` : 'Todo coincide' });
        commit(); toast(chk.pendientes ? `Cotejo guardado: ${chk.pendientes} pendientes` : 'Todo coincide con Evolta'); render(true);
      } });
    const dlg = $('#dlg'), res = dlg.querySelector('#nkb-res'), box = dlg.querySelector('.nkb-paste');
    const show = (text) => {
      const r = EVOLTA.readTab(text, tk);
      if (r.found < T.min) { ev = null; res.innerHTML = `<div class="ev-falta">No reconocí la pestaña <b>${T.t}</b>. Revisa que la captura muestre todos sus recuadros (${G_TITLES(tk)}).</div>`; return; }
      ev = r.values;
      const row = (f) => {
        const a = nkbNorm(f, ev[f.k]), b = nkbNorm(f, op[f.k]), show = (v) => filled(v) ? esc(f.t === 'date' ? fdate(v) : String(v)) : '<span class="muted">—</span>';
        let st, box = '';
        if (!a && !b) st = '<span class="badge rojo">Falta en ambos</span>';
        else if (!a) st = '<span class="badge amar">Completar en Evolta</span>';
        else if (!b) { st = '<span class="badge amar">Falta en el CRM</span>'; box = `<label class="small"><input type="checkbox" data-nk="${f.k}" checked> copiar al CRM</label>`; }
        else if (a !== b) { st = '<span class="badge rojo">Distinto</span>'; box = `<label class="small"><input type="checkbox" data-nk="${f.k}"> usar el de Evolta</label>`; }
        else st = '<span class="badge verde">Coincide</span>';
        return `<tr><td>${esc(f.l)}</td><td>${show(op[f.k])}</td><td>${show(ev[f.k])}</td><td>${st}</td><td>${box}</td></tr>`;
      };
      res.innerHTML = `<div class="ev-tw"><table class="ev-t"><thead><tr><th>Campo</th><th>Nuestro CRM</th><th>Evolta (captura)</th><th>Estado</th><th></th></tr></thead><tbody>${T.groups.map(g => `<tr><td colspan="5" class="nkb-gr">${g.t}</td></tr>${g.f.map(row).join('')}`).join('')}</tbody></table></div>        <p class="small muted">Lee la captura con atención: si algún dato salió mal leído, corrígelo luego a mano en la ficha.</p>`;
    };
    const fromImage = async (file) => {
      res.innerHTML = '<div class="small muted">Leyendo la imagen… <b id="nkb-pg">0%</b> (la primera vez tarda un poco más)</div>';
      try { show(await EVOLTA.ocr(file, p => { const g = $('#nkb-pg'); if (g) g.textContent = p + '%'; })); } catch (e) { res.innerHTML = `<div class="ev-falta">No se pudo leer la imagen: ${esc(e.message)}</div>`; }
    };
    box.addEventListener('paste', (e) => {
      e.preventDefault();
      const img = [...(e.clipboardData.items || [])].find(i => i.type.startsWith('image/'));
      if (img) { box.textContent = '🖼️ Captura pegada'; return fromImage(img.getAsFile()); }
      const t = e.clipboardData.getData('text/plain'); box.textContent = t.slice(0, 400); show(t);
    });
    dlg.querySelector('#nkb-img').onchange = (e) => { const f = e.target.files[0]; if (f) { box.textContent = '🖼️ ' + f.name; fromImage(f); } };
    setTimeout(() => box.focus(), 60);
  }

  /* ---- Acta de entrega (Postventa): el Generador de Actas se abre dentro del CRM y se llena con los datos del cliente.
     Está en el mismo sitio de GitHub Pages, por eso el CRM puede escribir en sus campos. ---- */
  const ACTAS_URL = '/GENERADOR-ACTAS/';
  const ACTA_PROY = ['direccion', 'urbanizacion', 'distrito', 'provincia', 'razon_social', 'ruc']; // datos del edificio: se recuerdan por proyecto
  const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
  const actaLocal = () => { try { return JSON.parse(localStorage.getItem('crm-mg-acta') || '{}'); } catch (e) { return {}; } };
  const partes = (f) => { const [y, m, d] = f.split('-'); return { d: String(+d), m: MESES_L[+m - 1], y }; };
  const actaBar = (o) => `<div class="ev-bar"><button class="btn sm" data-act="acta" data-op="${o.id}">📝 Generar acta de entrega</button>${o.acta ? ` <span class="small muted">Última: ${fechaHora(o.acta.ts)} · ${esc(o.acta.por)}</span>` : ''}</div>`;
  function openActa(o) {
    modal({ title: `Acta de entrega · ${o.cliente}`, ok: 'Cerrar', cancel: '', wide: true, onOk: () => render(true),
      body: `<p class="small muted" style="margin-top:0">El generador ya tiene los datos del cliente. <b>Revisa lo resaltado en amarillo</b> (falta o hay que confirmar) y toca "Generar y descargar Acta (Word)". <a href="${ACTAS_URL}" target="_blank" rel="noopener">Abrir en otra pestaña ↗</a></p>
        <iframe id="acta-fr" class="acta-fr" src="${ACTAS_URL}" title="Generador de actas de entrega"></iframe>` });
    const fr = $('#acta-fr');
    fr.onload = () => { try { llenarActa(fr.contentDocument, o); } catch (e) { console.error(e); toast('No se pudo llenar el acta automáticamente: complétala a mano'); } };
  }
  function llenarActa(doc, o) {
    const f = (id) => doc.getElementById(id);
    const put = (id, v, ev = 'input') => { const el = f(id); if (!el || v == null) return; if (el.type === 'checkbox') el.checked = !!v; else el.value = v; el.dispatchEvent(new Event(ev, { bubbles: true })); };
    const mark = (id) => { const el = f(id); if (!el) return; el.style.outline = '2px solid #e0a21b'; el.style.outlineOffset = '1px'; el.addEventListener('input', () => { el.style.outline = ''; }, { once: true }); };
    const fill = (id, v) => { put(id, v || ''); if (!v) mark(id); };
    const m = o.minuta || {}, cl = o.clausula || {}, comps = (cl.compradores && cl.compradores.length ? cl.compradores : m.compradores) || [];
    const proyEjemplo = (f('proyecto').value || '').toUpperCase(), guardado = { ...actaLocal()[o.proyecto], ...(S.params.actaProy || {})[o.proyecto] };
    // unidad
    const esEst = /^\s*EST/i.test(o.unidad || ''), num = ((o.unidad || '').toUpperCase().match(/[A-Z]?-?\d{2,4}/) || [''])[0];
    f(esEst ? 'tab_est' : 'tab_dpto').click();
    fill(esEst ? 'num_estacionamiento' : 'departamento', num);
    put('proyecto', o.proyecto || '');
    fill('area_ocupada', m.areaOcupada); fill('area_techada', m.areaTechada);
    // edificio y vendedora: lo recordado del proyecto; si es el proyecto del ejemplo se deja; si no, queda vacío para llenar
    const mismo = (o.proyecto || '').toUpperCase() === proyEjemplo;
    ACTA_PROY.forEach(k => { if (guardado && guardado[k]) put(k, guardado[k]); else if (!mismo) fill(k, ''); });
    if (empresaDe(o)) put('razon_social', empresaDe(o)); if (m.vendedora && m.vendedora.ruc) put('ruc', m.vendedora.ruc);
    // compradores (de la cláusula o de la minuta; si no hay, los del CRM)
    const c1 = comps[0] || { nombre: o.cliente, dni: o.dni }, TR = { 'Sr.': 'Sr.|o', 'Sra.': 'Sra.|a', 'Srta.': 'Srta.|a' };
    if (TR[c1.trat]) put('tratamiento', TR[c1.trat], 'change'); else mark('tratamiento');
    fill('estado_civil', c1.ec); fill('nombre_cliente', (c1.nombre || o.cliente || '').toUpperCase()); fill('dni_cliente', c1.dni || o.dni);
    const c2 = comps[1];
    put('tiene_segundo', !!c2, 'change');
    if (c2) { fill('nombre_cliente2', (c2.nombre || '').toUpperCase()); fill('dni_cliente2', c2.dni); if (c2.trat) put('tratamiento2', c2.trat === 'Sr.' ? 'o' : 'a', 'change'); else mark('tratamiento2'); }
    // fecha del contrato (minuta), cláusula adicional generada en el CRM y fecha del acta (hoy)
    if (m.fechaMinuta) { const p = partes(m.fechaMinuta); put('fc_dia', p.d); put('fc_mes', p.m); put('fc_anio', p.y); } else ['fc_dia', 'fc_mes', 'fc_anio'].forEach(k => fill(k, ''));
    if (cl.generada && cl.fecha) { f('btn_add_clausula').click(); const p = partes(cl.fecha); ['dia', 'mes', 'anio'].forEach((k, i) => { const el = doc.querySelector(`#clausulas_lista [data-field="${k}"]`); if (el) { el.value = [p.d, p.m, p.y][i]; el.dispatchEvent(new Event('input', { bubbles: true })); } }); }
    const h = partes(iso(today())); put('fa_dia', h.d); put('fa_mes', h.m[0].toUpperCase() + h.m.slice(1)); put('fa_anio', h.y); mark('fa_dia');
    // al generar: se recuerda la dirección del edificio para el proyecto y queda registrado en el CRM
    f('form').addEventListener('submit', () => {
      const datos = Object.fromEntries(ACTA_PROY.map(k => [k, (f(k).value || '').trim()]));
      if (isAdmin()) S.params.actaProy = { ...(S.params.actaProy || {}), [o.proyecto]: datos }; // configuración compartida: solo la administración la escribe
      else try { localStorage.setItem('crm-mg-acta', JSON.stringify({ ...actaLocal(), [o.proyecto]: datos })); } catch (e) { }
      const a = { ts: Date.now(), por: S.actor }; o.acta = a; (pendingOps[o.id] = pendingOps[o.id] || {}).acta = a;
      S.log.push({ ts: a.ts, usuario: S.actor, opId: o.id, etapa: 'pos', campo: 'acta', antes: '', despues: 'Acta de entrega generada' }); commit();
    });
  }

  /* ---- Cláusula adicional (desde la minuta que exporta Evolta) ---- */
  const BANCO_LARGO = { BCP: 'BANCO DE CRÉDITO DEL PERÚ', INTERBANK: 'BANCO INTERNACIONAL DEL PERÚ - INTERBANK', BBVA: 'BBVA PERÚ', SCOTIABANK: 'SCOTIABANK PERÚ', BANBIF: 'BANCO INTERAMERICANO DE FINANZAS', PICHINCHA: 'BANCO PICHINCHA', GNB: 'BANCO GNB PERÚ' };
  const clauseBar = (o) => `<div class="ev-bar"><button class="btn sm" data-act="clausula" data-op="${o.id}">📝 Generar cláusula adicional${o.minuta ? '' : ' (subir minuta PDF)'}</button>${o.clausula && o.clausula.generada ? ` <span class="small muted">Última: ${new Date(o.clausula.generada).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })} · ${esc(o.clausula.por || '')}</span>` : ''}</div>`;
  const keepClause = (op, D) => { op.clausula = D; (pendingOps[op.id] = pendingOps[op.id] || {}).clausula = D; save(); };
  function setPath(o, path, v) { const k = path.split('.'); let x = o; k.slice(0, -1).forEach(p => { x = x[p]; }); x[k[k.length - 1]] = v; }
  function clauseCollect(box, D) {
    box.querySelectorAll('[name]').forEach(el => setPath(D, el.name, el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) || 0 : el.value));
    box.querySelectorAll('[data-desemb]').forEach(el => { const it = D.pago.items[+el.dataset.desemb]; if (el.value && el.value !== el.dataset.orig) it.texto = it.texto.replace(/a más tardar el .+? del? \d{4}/i, 'a más tardar el ' + CLAUSULA.fechaLarga(el.value)); });
    D.pago.items.forEach(it => { if (it.sub && it.sub.length) it.monto = it.sub.reduce((t, s) => t + (Number(s.monto) || 0), 0); });
  }
  function clauseForm(D, op) {
    const L = CLAUSULA, inp = (name, val, label, o = {}) => `<label class="f ${o.w2 ? 'w2' : ''}">${label}<input name="${name}" value="${esc(val ?? '')}" ${o.type ? `type="${o.type}"` : ''} ${o.ro ? 'readonly' : ''}></label>`;
    const ta = (name, val) => `<textarea name="${name}" rows="2">${esc(val || '')}</textarea>`;
    const total = D.pago.items.reduce((t, i) => t + (Number(i.monto) || 0), 0);
    const items = D.pago.items.map((it, i) => {
      const fd = CLAUSULA.isoDeTexto((/a más tardar el (.+? del? \d{4})/i.exec(it.texto) || [])[1]);
      return `<div class="cl-item"><div class="cl-row"><b>${i + 1}.</b> ${inp(`pago.items.${i}.monto`, it.monto, 'Monto (S/)', { type: 'number', ro: it.sub && it.sub.length })}<span class="small muted cl-let">${L.montoLetras(it.monto || 0)}</span></div>${ta(`pago.items.${i}.texto`, it.texto)}
        ${fd ? `<label class="f cl-row" style="max-width:260px">Desembolso a más tardar el<input type="date" data-desemb="${i}" data-orig="${fd}" value="${fd}"></label>` : ''}
        ${(it.sub || []).map((s, j) => `<div class="cl-sub"><div class="cl-row">– ${inp(`pago.items.${i}.sub.${j}.monto`, s.monto, 'Monto (S/)', { type: 'number' })}<span class="small muted cl-let">${L.montoLetras(s.monto || 0)}</span><button type="button" class="btn sm" data-cl="del-sub" data-i="${i}" data-j="${j}" title="Quitar este pago">✕</button></div>${ta(`pago.items.${i}.sub.${j}.texto`, s.texto)}</div>`).join('')}
        ${it.sub ? `<button type="button" class="btn sm" data-cl="add-sub" data-i="${i}">+ Agregar pago a este punto</button>` : ''}</div>`;
    }).join('');
    const pagosEv = op.evolta && (op.evolta.pagos || []).length;
    return `<div class="cl"><p class="small muted" style="margin-top:0">Datos tomados de la minuta (Anexo I). Corrige lo necesario: los cambios aquí solo afectan a la cláusula. <button type="button" class="btn sm" data-cl="otra">📄 Cargar otra minuta</button></p>
      <h3>Minuta y bien</h3><div class="f-grid">${inp('fechaMinuta', D.fechaMinuta, 'Fecha de la minuta', { type: 'date' })}${inp('proyecto', D.proyecto, 'Proyecto')}${inp('inmuebles', D.inmuebles, 'Inmueble(s)', { w2: true })}</div>
      <h3>Compradores</h3>${D.compradores.map((c, i) => `<div class="f-grid cl-block"><label class="f">Trato<select name="compradores.${i}.trat"><option value="">Elegir…</option><option ${c.trat === 'Sr.' ? 'selected' : ''}>Sr.</option><option ${c.trat === 'Sra.' ? 'selected' : ''}>Sra.</option></select></label>${inp(`compradores.${i}.nombre`, c.nombre, 'Nombre completo', { w2: true })}${inp(`compradores.${i}.dni`, c.dni, 'DNI')}${inp(`compradores.${i}.ec`, c.ec, 'Estado civil')}${inp(`compradores.${i}.nac`, c.nac, 'Nacionalidad')}${inp(`compradores.${i}.domicilio`, c.domicilio, 'Domicilio', { w2: true })}</div>`).join('')}
      <h3>Vendedora</h3><div class="f-grid">${inp('vendedora.razon', D.vendedora.razon, 'Razón social')}${inp('vendedora.ruc', D.vendedora.ruc, 'RUC')}${inp('vendedora.domicilio', D.vendedora.domicilio, 'Domicilio', { w2: true })}${inp('vendedora.rep', D.vendedora.rep, 'Representante')}${inp('vendedora.repDni', D.vendedora.repDni, 'DNI representante')}${inp('vendedora.repCargo', D.vendedora.repCargo, 'Cargo')}${inp('vendedora.partida', D.vendedora.partida, 'Partida electrónica')}</div>
      <h3 class="cl-h"><label><input type="checkbox" name="pago.incluir" ${D.pago.incluir ? 'checked' : ''}> Aclarar la forma de pago</label> <span class="small muted">punto</span> <input name="pago.num" value="${esc(D.pago.num)}" class="cl-num"> <span class="small muted">del Anexo I</span></h3>
      ${D.pago.incluir ? `${pagosEv ? `<p class="small"><button type="button" class="btn sm" data-cl="evolta">💳 Usar los pagos registrados en Evolta (${op.evolta.pagos.length})</button> <span class="muted">reemplaza los pagos de la cuota inicial</span></p>` : ''}${items}
        <div class="${D.minutaPrecio && total !== D.minutaPrecio ? 'ev-falta' : 'small muted'}">Total: <b>${money(total)}</b>${D.minutaPrecio ? ` · precio en la minuta: ${money(D.minutaPrecio)}${total !== D.minutaPrecio ? ' ⚠️ no coincide' : ' ✓'}` : ''}</div>` : ''}
      <h3 class="cl-h"><label><input type="checkbox" name="entrega.incluir" ${D.entrega.incluir ? 'checked' : ''}> Aclarar la fecha de entrega</label> <span class="small muted">punto</span> <input name="entrega.num" value="${esc(D.entrega.num)}" class="cl-num"></h3>
      ${D.entrega.incluir ? `<div class="f-grid">${inp('entrega.fecha', D.entrega.fecha, 'Nueva fecha de entrega', { type: 'date' })}</div>` : ''}
      <h3 class="cl-h"><label><input type="checkbox" name="poder.incluir" ${D.poder.incluir ? 'checked' : ''}> Incluir poder irrevocable</label></h3>
      ${D.poder.incluir ? `<div class="f-grid">${inp('poder.banco', D.poder.banco, 'Banco que otorga el crédito', { w2: true })}</div>` : ''}
      <h3>Lugar y fecha de firma</h3><div class="f-grid">${inp('ciudad', D.ciudad, 'Ciudad')}${inp('fecha', D.fecha, 'Fecha', { type: 'date' })}</div></div>`;
  }
  function openClausula(op) {
    const m = op.minuta, base = JSON.parse(JSON.stringify(m));
    const D = op.clausula && op.clausula.minutaCargada === m.cargado ? JSON.parse(JSON.stringify(op.clausula)) : { ...base, minutaPrecio: m.precio, minutaCargada: m.cargado, poder: { incluir: true, banco: BANCO_LARGO[op.banco] || op.banco || '' }, ciudad: 'Lima', fecha: iso(today()) };
    modal({ title: `Cláusula adicional · ${op.cliente}`, ok: '⬇️ Descargar Word', wide: true, body: clauseForm(D, op),
      onCancel: () => { if (box.isConnected) clauseCollect(box, D); keepClause(op, D); },
      onOk: (dlg) => {
        clauseCollect(box, D);
        if (D.compradores.some(c => !c.trat)) { toast('Elige el trato (Sr. / Sra.) de cada comprador'); return false; }
        CLAUSULA.docx(D).then(blob => {
          const name = `CLAUSULA ADICIONAL ${D.inmuebles.replace(/N\.º\s*/g, '').replace(/[.\\/:*?"<>|]/g, '').toUpperCase()} - ${D.proyecto.replace(/^EDIFICIO\s+/i, '').toUpperCase()}.docx`;
          download(name, blob); D.generada = Date.now(); D.por = S.actor; keepClause(op, D);
          S.log.push({ ts: Date.now(), usuario: S.actor, opId: op.id, etapa: 'con', campo: 'clausula', antes: '', despues: 'Word generado' }); commit();
          toast('Cláusula descargada'); dlg._ok = true; dlg.close(); render(true);
        }).catch(e => toast('No se pudo generar el Word: ' + e.message));
        return false;
      } });
    const dlg = $('#dlg'), box = dlg.querySelector('.dlg-b');
    const redraw = () => { const y = box.scrollTop; box.innerHTML = clauseForm(D, op); box.scrollTop = y; };
    box.onchange = (e) => { if (/number|checkbox|date/.test(e.target.type) || e.target.tagName === 'SELECT') { clauseCollect(box, D); redraw(); } };
    box.onclick = (e) => {
      const b = e.target.closest('[data-cl]'); if (!b) return;
      clauseCollect(box, D); const it = D.pago.items[+b.dataset.i];
      if (b.dataset.cl === 'add-sub') it.sub.push({ monto: 0, texto: (it.sub[it.sub.length - 1] || {}).texto || CLAUSULA.DEP });
      if (b.dataset.cl === 'del-sub') it.sub.splice(+b.dataset.j, 1);
      if (b.dataset.cl === 'evolta') { const ini = D.pago.items.find(x => x.sub) || D.pago.items[0]; ini.sub = op.evolta.pagos.map(p => ({ monto: p.monto, texto: CLAUSULA.DEP })); }
      if (b.dataset.cl === 'otra') { keepClause(op, D); ui.minOp = op.id; dlg.close(); return $('#minfile').click(); }
      D.pago.items.forEach(x => { if (x.sub && x.sub.length) x.monto = x.sub.reduce((t, s) => t + (Number(s.monto) || 0), 0); });
      redraw();
    };
  }
  async function loadMinuta(file, opId) {
    const op = getOp(opId); if (!op) return;
    toast('Leyendo la minuta…'); let m;
    try { m = CLAUSULA.parseMinuta(await EVOLTA.readText(await file.arrayBuffer())); } catch (e) { console.error(e); return toast('No se pudo leer la minuta: ' + e.message); }
    const dnis = m.compradores.map(c => c.dni);
    if (op.dni && dnis.length && !dnis.includes(String(op.dni).trim()) && !await ask(`La minuta es de ${m.compradores.map(c => c.nombre).join(' y ')} (DNI ${dnis.join(', ')}), pero este cliente tiene DNI ${op.dni}. ¿Usarla igual?`)) return;
    m.cargado = Date.now(); m.por = S.actor;
    op.minuta = m; (pendingOps[op.id] = pendingOps[op.id] || {}).minuta = m;
    S.log.push({ ts: Date.now(), usuario: S.actor, opId: op.id, etapa: 'con', campo: 'minuta', antes: '', despues: 'Minuta cargada' }); commit();
    openClausula(op);
  }

  /* ---- V°B° de ingreso de clientes creados por asistentes (p. ej. clientes antiguos que no estaban en el CRM) ---- */
  function marcaIngreso(op) { if (!isJefe()) op.aprob = { estado: 'pendiente', por: S.actor, nombre: fullName(S.actor), ts: Date.now() }; }
  function setAprob(o, a, txt) {
    o.aprob = a; (pendingOps[o.id] = pendingOps[o.id] || {}).aprob = a;
    S.log.push({ ts: Date.now(), usuario: S.actor, opId: o.id, etapa: 'gen', campo: 'ingreso', antes: '', despues: txt }); commit();
  }
  const ingresoBar = (o) => !pendienteIngreso(o) ? '' : o.aprob.estado === 'observado'
    ? `<div class="ev-falta ing-bar">↩️ <b>Ingreso observado</b> por ${esc(o.aprob.obs.por)} (${fechaHora(o.aprob.obs.ts)}): ${esc(o.aprob.obs.motivo)}<div style="margin-top:6px">Corrige los datos y vuelve a enviarlo. ${o.aprob.por === S.actor || isJefe() ? `<button class="btn sm pri" data-act="ing-reenviar" data-op="${o.id}">📤 Reenviar para aprobación</button>` : ''}</div></div>`
    : `<div class="ev-falta ing-bar">⏳ <b>Cliente ingresado por ${esc(o.aprob.nombre || o.aprob.por)}</b> (${fechaHora(o.aprob.ts)}). Espera el V°B° de la administración: hasta entonces no aparece en las etapas, resúmenes ni reparto. Puedes ir completando sus datos.
      ${isJefe() ? `<div style="margin-top:6px"><button class="btn sm pri" data-act="ing-ok" data-op="${o.id}">✅ Dar V°B° al ingreso</button> <button class="btn sm" data-act="ing-obs" data-op="${o.id}">↩️ Observar</button></div>` : ''}</div>`;
  async function ingresoOk(o) {
    if (!await ask(`Darás tu V°B° al ingreso de ${o.cliente} (${o.proyecto || '—'} ${o.unidad || ''}), registrado por ${o.aprob.nombre || o.aprob.por}. Desde ahora seguirá su proceso normal en las etapas.`, '✅ Dar V°B°')) return;
    setAprob(o, { ...o.aprob, estado: 'aprobado', vb: { por: S.actor, nombre: fullName(S.actor), ts: Date.now() } }, 'Ingreso aprobado');
    let msg = 'Ingreso aprobado';
    if (S.params.autoAsignar) { const plan = planAssign(new Set([o.id])).filter(p => SMART.has(p.stage)); applyPlan(plan); if (plan.length) msg += ` · asignado a ${plan[0].who} (${plan[0].por})`; } // si entra directo a Contratos, se reparte como cualquier otro
    toast(msg); render(true);
  }
  function ingresoObs(o) {
    modal({ title: `Observar ingreso · ${o.cliente}`, ok: '↩️ Devolver con observación', body: `<div class="form"><label>¿Qué debe corregir o confirmar ${esc(o.aprob.nombre || o.aprob.por)}?<textarea id="ing-m" placeholder="Ej.: Confirmar el precio con el estado de cuenta de Evolta"></textarea></label></div>`,
      onOk: (dlg) => { const m = dlg.querySelector('#ing-m').value.trim(); if (!m) { toast('Escribe la observación'); return false; }
        setAprob(o, { ...o.aprob, estado: 'observado', obs: { por: S.actor, ts: Date.now(), motivo: m } }, 'Ingreso observado: ' + m); toast('Devuelto con observación'); render(true); } });
  }
  function ingresoReenviar(o) { setAprob(o, { ...o.aprob, estado: 'pendiente', ts: Date.now() }, 'Ingreso reenviado para aprobación'); toast('Reenviado a la administración'); render(true); }

  async function deleteOp(id) {
    const o = getOp(id); if (!o) return;
    const nSeg = S.seguimientos.filter(s => s.opId === id).length;
    if (!await ask(`Se eliminará a ${o.cliente} (${o.id}) con sus ${nSeg} seguimientos. No se puede deshacer. ¿Continuar?`, 'Sí, eliminar')) return;
    S.ops = S.ops.filter(x => x.id !== id); delete pendingOps[id];
    const segs = S.seguimientos.filter(s => s.opId === id); S.seguimientos = S.seguimientos.filter(s => s.opId !== id);
    if (CL.enabled) { CL.deleteDoc('ops', id); cloudIds.delete(id); segs.forEach(s => { CL.deleteDoc('seguimientos', s.id); cloudSeg.delete(s.id); }); }
    S.log.push({ ts: Date.now(), usuario: S.actor, opId: id, etapa: 'gen', campo: 'cliente_baja', antes: o.cliente || '', despues: '' });
    commit(); toast('Cliente eliminado'); location.hash = '#/clientes';
  }
  async function loadEvolta(file, opId) {
    let r; toast('Leyendo el estado de cuenta…');
    try { r = await EVOLTA.fromPdf(await file.arrayBuffer()); } catch (e) { console.error(e); return toast('No se pudo leer el PDF: ' + e.message); }
    const { fields, info } = r;
    if (!fields.cliente && !fields.dni) return toast('No se encontraron datos del cliente en el PDF');
    let op = opId ? getOp(opId) : S.ops.find(o => fields.dni && String(o.dni || '').trim() === fields.dni);
    if (opId && op && fields.dni && op.dni && String(op.dni).trim() !== fields.dni && !await ask(`El PDF es del DNI ${fields.dni}, pero este cliente tiene DNI ${op.dni}. ¿Cargarlo igual?`)) return;
    if (op && !can('a_edit')) return toast(NOPERM);
    if (!op && !can('a_newop')) return toast(NOPERM);
    const keys = Object.keys(fields), lbl = (k) => FIELD_LABEL[k] || k;
    const rows = keys.map(k => ({ k, cur: op ? op[k] : undefined, nuevo: fields[k] })).filter(x => String(x.cur ?? '') !== String(x.nuevo));
    const after = { ...(op || { fechaInicio: iso(today()) }), ...fields };
    const faltan = [...FIELDS.gen, ...FIELDS.cob].filter(f => f.k !== 'observaciones' && (after[f.k] === undefined || after[f.k] === '')).map(f => f.l);
    const body = `<p>${op ? `Se actualizará <b>${esc(op.cliente)}</b> (${op.id}).` : `No hay un cliente con DNI ${esc(fields.dni || '—')}: se creará <b>${esc(fields.cliente)}</b>.`} Estado de cuenta consultado el ${fdate(info.consulta) || '—'}.</p>
      ${rows.length ? `<p class="small muted">Desmarca lo que no quieras cambiar:</p><div class="ev-tw"><table class="ev-t"><thead><tr><th></th><th>Campo</th>${op ? '<th>Ahora</th>' : ''}<th>Del PDF</th></tr></thead><tbody>${rows.map(x => `<tr><td><input type="checkbox" data-evk="${x.k}" checked></td><td>${esc(lbl(x.k))}</td>${op ? `<td class="muted">${esc(fmtVal(x.k, x.cur))}</td>` : ''}<td><b>${esc(fmtVal(x.k, x.nuevo))}</b></td></tr>`).join('')}</tbody></table></div>` : '<p class="small muted">Los datos del PDF ya coinciden con el CRM.</p>'}
      <p class="small">Además se guardan el cronograma (${info.cronograma.length} cuotas), los pagos registrados (${info.pagos.length}) y lo pagado / por pagar.</p>
      ${faltan.length ? `<div class="ev-falta"><b>Quedarán por completar a mano:</b> ${faltan.map(esc).join(' · ')}</div>` : ''}`;
    modal({ title: 'Cargar estado de cuenta Evolta', ok: op ? 'Actualizar' : 'Crear cliente', body, onOk: (dlg) => {
      const pick = keys.filter(k => { const c = dlg.querySelector(`[data-evk="${k}"]`); return !c || c.checked; });
      const ev = { ...info, cargado: Date.now(), por: S.actor, campos: pick };
      if (!op) {
        const max = Math.max(0, ...S.ops.map(o => +String(o.id).replace(/\D/g, '') || 0));
        op = { id: 'OP-' + String(max + 1).padStart(4, '0'), fechaInicio: iso(today()) };
        pick.forEach(k => op[k] = fields[k]); op.evolta = ev; marcaIngreso(op); S.ops.push(CRM.normalize(op));
        S.log.push({ ts: Date.now(), usuario: S.actor, opId: op.id, etapa: 'gen', campo: 'cliente', antes: '', despues: op.cliente || '' });
      } else {
        pick.forEach(k => setField(op.id, k, fields[k]));
        op.evolta = ev; (pendingOps[op.id] = pendingOps[op.id] || {}).evolta = ev;
      }
      S.log.push({ ts: Date.now(), usuario: S.actor, opId: op.id, etapa: 'cob', campo: 'evolta', antes: '', despues: 'PDF consultado el ' + (fdate(info.consulta) || '—') });
      commit(); toast('Estado de cuenta cargado');
      const to = '#/cliente/' + op.id; if (location.hash === to) render(true); else location.hash = to;
    } });
  }

  function vCliente(id) {
    const o = getOp(id); if (!o) return `<div class="empty">Cliente no encontrado. <a href="#/clientes">Volver</a></div>`;
    const d = D.get(id);
    return `<div class="crumb muted" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><span><a href="#/clientes">Clientes</a> / ${o.id}</span><button class="btn sm danger" data-act="op-del" data-op="${o.id}">🗑️ Eliminar cliente</button></div>
    ${ingresoBar(o)}<div class="card ficha-h"><div id="f-head">${headHtml(o, d)}</div><div class="stepper" id="f-step">${stepperHtml(o, d)}</div></div>
    <div class="ficha-grid"><div>
      ${STAGES.filter(s => verEtapa(s.key)).map(s => `<details class="sc" id="sc-${s.key}" style="--sc:${colVar(s.key)}" ${d.etapa === s.key ? 'open' : ''}><summary>${sbadge(s.key)}<span id="sh-${s.key}" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${stageHead(s.key, d)}</span><span class="grow"></span><span class="muted small">editar ▾</span></summary>
        <div class="sc-body"><div id="sk-${s.key}">${checkHtml(s.key, d, o)}</div><div id="cb-${s.key}">${stickerBar(o, d, s.key)}</div>${s.key === 'cob' ? `<div id="ev-box">${evoltaHtml(o)}</div>` : ''}${s.key === 'con' ? clauseBar(o) : ''}${s.key === 'pos' ? actaBar(o) : ''}${Object.keys(CRM.EV_TABS).filter(tk => CRM.EV_TABS[tk].stage === s.key && !(tk === 'cf' && (o.fin_tipo === 'No aplica' || o.fin_tipoSolicitud === 'MINUTA DE LEVANTAMIENTO'))).map(tk => tabHtml(o, tk)).join('')}<details class="fe" ${s.key === 'cob' && o.evolta ? 'open' : ''}><summary>✏️ Editar datos a mano</summary>${s.key === 'cob' && o.evolta ? '<p class="small muted ev-leg"><span class="sw-falta"></span> Falta completar · <em class="pdf">PDF</em> vino del estado de cuenta: corrobóralo</p>' : ''}<div class="f-grid">${FIELDS[s.key].map(f => fieldInput(o, f, s.key === 'cob')).join('')}</div></details></div></details>`).join('')}
      <details class="sc" style="--sc:var(--c-jef)" ${o.evolta ? 'open' : ''}><summary><b>Datos generales y comerciales</b><span class="grow"></span><span class="muted small">editar ▾</span></summary><div class="sc-body" style="grid-template-columns:1fr"><div class="f-grid">${FIELDS.gen.map(f => fieldInput(o, f, true)).join('')}</div></div></details>
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
      </form></details><hr style="border:0;border-top:1px solid var(--line2);margin:16px 0"><div id="tl">${timelineHtml(o)}</div></div></div></div>`;
  }
  function refreshFicha(id) {
    const o = getOp(id), d = D.get(id); if (!o || !$('#f-head')) return;
    $('#f-head').innerHTML = headHtml(o, d); $('#f-step').innerHTML = stepperHtml(o, d); $('#tl').innerHTML = timelineHtml(o);
    if ($('#ev-box')) $('#ev-box').innerHTML = evoltaHtml(o);
    Object.keys(CRM.EV_TABS).forEach(tk => { const el = $('#st-' + tk); if (el) el.outerHTML = tabStatus(o, tk); });
    STAGES.forEach(s => { if (!$('#sh-' + s.key)) return; /* etapa oculta para este usuario */ $('#sh-' + s.key).innerHTML = stageHead(s.key, d); $('#sk-' + s.key).innerHTML = checkHtml(s.key, d, o); const cb = $('#cb-' + s.key); if (cb) cb.innerHTML = stickerBar(o, d, s.key); });
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
      <div class="card"><div class="card-h"><h2>Plazos (SLA)</h2></div><div class="card-b f-grid" style="grid-template-columns:1fr 1fr">${pf('plazo', 'Plazo objetivo de atención (días)', 'Contratos: desde validación')}${pf('anticipo', 'Días de anticipación (por vencer)', 'Alerta amarilla')}${pf('slaCF', 'SLA carta fianza (días)', 'Desde solicitud')}${pf('slaMin', 'SLA minuta de levantamiento (días)', 'Desde desembolso')}${pf('slaNot', 'SLA trámite notarial (días)', 'Desde ingreso a notaría')}${pf('metaEficacia', 'Meta de eficacia (%)', 'Cerrados ÷ trabajados')}${pf('metaEficiencia', 'Meta de eficiencia (%)', 'Cerrados dentro del plazo')}${pf('metaSemana', 'Meta de cierres por semana', 'Procesos de toda el área')}${pf('metaDia', 'Meta de acciones por día', 'Por persona (Mi día)')}${pf('diasDesemb', 'Días estimados del ingreso al desembolso', 'Para proyectar ingresos si no hay fecha programada')}${pf('topeCarga', 'Reparto en Contratos: tope de diferencia de carga', 'Si el dueño del proyecto tiene esta cantidad más que el otro, pasa al otro')}${pf('autoAsignar', 'Asignar solo al llegar a Contratos (1 = sí, 0 = no)', 'Según proyectos a cargo y carga')}${pf('minInactivo', 'Cerrar sesión tras minutos sin uso', 'Seguridad: avisa 1 minuto antes. 0 = nunca')}</div></div>
      <div class="card"><div class="card-h"><h2>🏢 Empresa por proyecto</h2></div><div class="card-b"><p class="small muted" style="margin-top:0">Escribe una vez la razón social de cada proyecto y todos sus clientes la toman (en la ficha, en el Resumen de operaciones y en el Excel).</p>
        <div class="f-grid" style="grid-template-columns:1fr 1.6fr">${uniq(o => o.proyecto).map(p => `<span class="small" style="align-self:center"><b>${esc(p)}</b></span><input list="dl-empresa" data-emp="${esc(p)}" value="${esc(empEnProy(p))}" placeholder="Ej.: MG PROYECTO 22 S.A.C." ${can('a_params') ? '' : 'disabled'}>`).join('')}</div></div></div>
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
      <h3 style="margin:14px 0 6px">Etapas que puede ver ${tip('Las etapas apagadas no aparecen en su menú ni en la ficha del cliente. Los datos generales del cliente siempre se ven.')}</h3>
      <div class="tpls" style="margin-bottom:8px"><button class="btn sm" data-act="perm-etapas" data-val="propia">🎯 Solo su etapa (${esc(STAGE[(user(sel) || {}).stage] ? STAGE[user(sel).stage].name : '—')})</button> <button class="btn sm" data-act="perm-etapas" data-val="todas">👁️ Todas</button></div>
      <div class="switches">${sw('e')}</div>
      <h3 style="margin:14px 0 6px">Pantallas</h3><div class="switches">${sw('v')}</div><h3 style="margin:14px 0 6px">Botones</h3><div class="switches">${sw('a')}</div>
      <p class="small muted" style="margin:8px 0 0">“Marcar pasos a mano” está apagado para todos: los pasos se marcan solos cuando la persona completa los datos. Actívalo solo como excepción. Tú, como administradora, siempre puedes marcarlos.</p>` : '<div class="empty">Agrega usuarios en Equipo para darles permisos.</div>'}
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
  const proyDe = (dlg) => { const p = $$('[data-proy]', dlg).filter(c => c.checked).map(c => c.value); return p.length ? p : undefined; };
  function userForm(u) {
    return `<div class="form"><label>Nombre (cómo aparece en el CRM)<input id="u-n" value="${esc(u ? u.name : '')}"></label><label>Nombre completo (para firmas y constancias)<input id="u-fn" value="${esc(u ? u.full || '' : '')}" placeholder="Nombres y apellidos"></label><label>Rol / cargo<input id="u-r" value="${esc(u ? u.rol || '' : '')}" placeholder="Ej.: Asistente Legal"></label>
      <label>Etapa en la que trabaja<select id="u-s">${STAGES.map(s => `<option value="${s.key}" ${u && u.stage === s.key ? 'selected' : ''}>${s.n}. ${s.name}</option>`).join('')}<option value="${JEFATURA}" ${u && u.stage === JEFATURA ? 'selected' : ''}>Jefatura (supervisa todo)</option></select></label>
      <div class="f"><span>Proyectos a cargo <span class="muted">(reparto automático: estos proyectos se le asignan primero)</span></span><div class="chips" style="flex-wrap:wrap">${uniq(o => o.proyecto).map(p => `<label class="chipb"><input type="checkbox" data-proy value="${esc(p)}" ${u && (u.proyectos || []).includes(p) ? 'checked' : ''}> ${esc(p)}</label>`).join('')}</div></div>
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
      S.users.push({ name: n, full: dlg.querySelector('#u-fn').value.trim() || undefined, proyectos: proyDe(dlg), stage: s, rol: dlg.querySelector('#u-r').value.trim() || (STAGE[s] ? STAGE[s].rol : 'Jefatura'), admin: dlg.querySelector('#u-a').checked || undefined, email: em || undefined });
      if (CL.enabled) { const pw = Math.random().toString(36).slice(2) + 'Aa1!' + Math.random().toString(36).slice(2); CL.createAccount(em, pw).catch(x => { if (x.code !== 'auth/email-already-in-use') throw x; }).then(() => CL.reset(em)).then(() => toast('📧 Se envió un correo a ' + em + ' para crear su contraseña')).catch(x => toast('Usuario agregado, pero no se pudo crear la cuenta: ' + (x.code || x.message))); }
      S.log.push({ ts: Date.now(), usuario: S.actor, opId: '—', etapa: 'gen', campo: 'usuario_alta', antes: '', despues: n }); save(); toast('Usuario agregado'); render(true); } });
  }
  function editUser(name) {
    const u = user(name); if (!u) return;
    modal({ title: 'Editar usuario', body: userForm(u) + `<p class="small muted">Si cambias el nombre, se actualiza en los expedientes y en el historial. Si cambias la etapa, sus expedientes de la etapa anterior siguen a su nombre.</p>`, ok: 'Guardar', onOk: (dlg) => {
      const n = dlg.querySelector('#u-n').value.trim(), s = dlg.querySelector('#u-s').value;
      if (!n) { toast('Escribe el nombre'); return false; } if (n !== u.name && user(n)) { toast('Ya existe un usuario con ese nombre'); return false; }
      const em2 = dlg.querySelector('#u-e').value.trim().toLowerCase(); if (CL.enabled && !/^\S+@\S+\.\S+$/.test(em2)) { toast('Escribe un correo válido'); return false; }
      if (n !== u.name) {
        STAGES.forEach(st => { if (st.ownerKey) S.ops.forEach(o => { if (o[st.ownerKey] === u.name) { o[st.ownerKey] = n; (pendingOps[o.id] = pendingOps[o.id] || {})[st.ownerKey] = n; } }); });
        S.seguimientos.forEach(x => { if (x.usuario === u.name) { x.usuario = n; if (CL.enabled) CL.updateDoc('seguimientos', x.id, { usuario: n }); } });
        S.log.forEach(x => { if (x.usuario === u.name) x.usuario = n; });
        u.antes = [...new Set([...(u.antes || []), u.name])]; // en la nube el historial no se reescribe: se reconoce por el nombre anterior
        if (S.perms[u.name]) { S.perms[n] = S.perms[u.name]; delete S.perms[u.name]; }
        if (S.actor === u.name) S.actor = n;
        S.log.push({ ts: Date.now(), usuario: n, opId: '—', etapa: 'gen', campo: 'usuario_nombre', antes: u.name, despues: n });
      }
      const adm = dlg.querySelector('#u-a').checked; if (u.admin && !adm && S.users.filter(x => x.admin).length < 2) { toast('Debe quedar al menos un administrador'); return false; }
      u.name = n; u.full = dlg.querySelector('#u-fn').value.trim() || undefined; u.proyectos = proyDe(dlg); u.stage = s; u.rol = dlg.querySelector('#u-r').value.trim(); u.admin = adm || undefined; u.email = em2 || undefined; commit(); toast('Usuario actualizado'); render(true); } });
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
  /* Manual paso a paso: mapa del proceso, flujograma del día y un flujograma por etapa.
     Los pasos siguen el checklist de cada etapa; "Lo que registras" sale de FIELDS. Un nodo {q,si,no} es una decisión. */
  const MAN_COL = { cob: '#FFC53D', con: '#FF6B57', fin: '#3DD6A3', for: '#B79CFF', pos: '#FF9F43', gen: '#5A4A50' };
  const MANUAL_INICIO = [
    ['Entra', 'Correo Gmail y contraseña. Es personal.'],
    ['Mi día', 'Tus expedientes, del más urgente al menos urgente.'],
    ['Abre al cliente', 'Toca su nombre o búscalo por DNI o unidad.'],
    ['Completa los datos', 'Cada paso se marca solo al tener su dato.'],
    ['Anota la gestión', 'Qué pasó, próxima acción y fecha compromiso.'],
    ['Cierra la etapa', 'Firma, V°B° de la jefatura y constancia.'],
    ['Sal', 'Toca Salir. Se cierra solo a los 15 min.']
  ];
  const MANUAL = {
    cob: { termina: 'Inicial en S/ 0',
      flujo: ['Toma el expediente', 'Carta de aprobación y vencimiento', 'Inicio de la cobranza', 'Actualiza la inicial por recibir', { q: '¿Inicial en S/ 0?', si: 'Registra la culminación: pasa a Contratos', no: 'Sigue el cobro y anota la gestión' }],
      pasos: ['Toma el expediente: queda a tu nombre y aparece en tu Mi día.', 'Registra la fecha de la carta de aprobación del banco y su fecha de vencimiento, tal como figura en el documento del banco.', 'Registra la fecha en que inicias la cobranza de la cuota inicial.', 'Cada vez que el cliente paga, actualiza el monto de la inicial por recibir y anota la gestión en el seguimiento.', 'Cuando la inicial por recibir llegue a S/ 0, registra la fecha de culminación: el expediente pasa automáticamente a Contratos.'],
      tools: ['Cargar estado de cuenta (PDF Evolta): llena los datos solo. Revisa que coincidan con Evolta.'] },
    con: { termina: 'Firmas del cliente y del representante',
      flujo: ['Toma y valida documentos', 'Envía la cláusula digital', 'Documentos a notaría e inicio de firmas', 'Notaría y Kardex: coteja con Evolta', 'Cheque y estado del kardex', { q: '¿Firmaron cliente y representante?', si: 'Datos a Evolta: pasa a Finanzas', no: 'Coordina las firmas y anota la gestión' }],
      pasos: ['Toma el expediente y registra la fecha de validación de la documentación.', 'Indica si aplica actualización de documentos.', 'Envía la cláusula digital al cliente y marca "Cláusula enviada".', 'Envía los documentos a notaría y registra la fecha de envío de la minuta, que marca el inicio de firmas.', 'Completa la pestaña Notaría y Kardex/Banco y cotéjala con la captura de Evolta: el CRM compara los datos y te avisa si algo no coincide.', 'Registra el cheque en Evolta y el estado del kardex.', 'Registra la fecha de firma del cliente y la del representante legal.', 'Marca "Datos ingresados al CRM Evolta" para dejar la etapa completa.'],
      tools: ['Generar cláusula adicional (Word) a partir de la minuta en PDF.', 'Cotejar con Evolta en Notaría y Kardex/Banco: subes la captura y el CRM compara.'] },
    fin: { termina: 'Carta emitida, minuta firmada o "No aplica"',
      flujo: [{ q: '¿Aplica carta fianza o minuta?', si: 'Continúa con la solicitud', no: 'Marca "No aplica": pasa a Formalización' }, 'Toma como responsable de valorados', 'Solicitud al banco', 'Emisión: banco, monto y N° (coteja con Evolta)', 'Registra el desembolso', { q: '¿Carta vigente o devuelta?', si: 'Etapa saneada', no: 'Renuévala antes del vencimiento' }],
      pasos: ['Define si el expediente requiere carta fianza o minuta de levantamiento. Si no aplica, márcalo y la etapa queda cerrada.', 'Toma el expediente como responsable de valorados.', 'Registra la fecha de solicitud al banco.', 'Registra la emisión de la carta fianza con banco, monto y número, y su fecha de vencimiento. Cotéjalo con la captura de Evolta.', 'Registra la fecha de desembolso.', 'Mantén la carta al día: renuévala antes de que venza o regístrala como devuelta con su fecha de devolución.'],
      tools: ['Cotejar con Evolta en Carta Fianza: banco, monto y N° frente a la captura.', 'Pantalla Cartas fianza: vencimientos, renovar, devolver y descarga en Excel.'] },
    for: { termina: 'Independización registrada',
      flujo: ['Toma y registra el inicio', { q: '¿Aplica levantamiento de hipoteca?', si: 'Registra la firma de la minuta', no: 'Sigue al ingreso a notaría' }, 'Ingreso a notaría', 'Inscripción SUNARP: estado, código y título', 'Gastos notariales y registrales', 'Copia simple SUNARP cargada en Evolta', 'Independización: pasa a Postventa'],
      pasos: ['Toma el expediente y registra la fecha de inicio de la formalización.', 'Define si aplica levantamiento de hipoteca. Si aplica, registra la fecha de firma de la minuta de levantamiento.', 'Registra la fecha de ingreso a notaría.', 'Sigue la inscripción en SUNARP y registra su estado, el código de inscripción, el número de título y las observaciones.', 'Registra los gastos notariales y registrales.', 'Carga en Evolta la copia simple que emite SUNARP, con su número de título, y márcala como "Cargada".', 'Registra la fecha de independización: el expediente pasa a Postventa.'],
      tools: ['Pantalla Inscripciones: estado, código y título de todos tus expedientes en una sola lista.'] },
    pos: { termina: 'Unidad entregada',
      flujo: ['Marca "Derivado a postventa"', 'Coordina la entrega con el cliente', 'Genera el acta de entrega', 'Marca "Unidad entregada": operación cerrada'],
      pasos: ['Recibe el expediente derivado y márcalo como "Derivado a postventa".', 'Coordina con el cliente la fecha y hora de entrega de la unidad.', 'Genera el acta de entrega desde la ficha: ya viene llena con los datos del cliente.', 'Marca "Unidad entregada": la operación queda cerrada.'],
      tools: ['Generador de actas, dentro de la etapa Postventa.'] }
  };
  const MANUAL_CSS = `.mn{--ink:#22181C;--soft:#5A4A50;--paper:#FFFDF8;--line:#EADFD3;background:var(--paper);color:var(--ink);font-family:'Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.55;border-radius:14px;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.mn *{box-sizing:border-box}.mn p,.mn li{text-align:justify;hyphens:auto}
.mn-hero{background:var(--ink);color:#FFF3E3;padding:26px 28px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
.mn-hero h2{margin:0;font-size:26px;line-height:1.15}.mn-hero p{margin:6px 0 0;color:#E9D9C8;text-align:left}
.mn-dots{display:flex;gap:8px}.mn-dots i{width:22px;height:22px;border-radius:50%}
.mn-sec{padding:20px 28px}.mn-sec+.mn-sec{border-top:1px solid var(--line)}
.mn-h{margin:0 0 12px;font-size:18px;display:flex;align-items:center;gap:10px}.mn-h::before{content:"";width:6px;height:20px;border-radius:3px;background:var(--c,var(--ink))}
.mn-map{display:flex;flex-wrap:wrap;align-items:stretch;gap:8px}
.mn-st{flex:1 1 150px;min-width:0;background:var(--c);border-radius:14px;padding:12px 14px;display:flex;flex-direction:column;gap:4px}
.mn-st .n{font-size:28px;font-weight:900;line-height:1}.mn-st b{font-size:15px}.mn-st small{font-size:12px;color:var(--ink);opacity:.8}.mn-st em{font-style:normal;font-size:12px;border-top:1px dashed rgba(34,24,28,.35);padding-top:6px;margin-top:auto}
.mn-ar{align-self:center;font-size:22px;font-weight:900;color:var(--soft)}
.mn-flow{display:flex;flex-wrap:wrap;align-items:stretch;gap:10px 4px}
.mn-node{flex:0 1 150px;min-width:0;background:#fff;border:2px solid var(--c);border-radius:12px;padding:10px 12px;font-size:13px;line-height:1.35;display:flex;flex-direction:column;gap:6px}
.mn-node .k{width:24px;height:24px;border-radius:50%;background:var(--c);color:var(--ink);font-weight:800;font-size:12px;display:grid;place-items:center}
.mn-node.q{flex-basis:220px;border-style:dashed;background:color-mix(in srgb,var(--c) 16%,#fff)}
.mn-node.q .k{border-radius:4px;transform:rotate(45deg)}.mn-node.q .k span{transform:rotate(-45deg)}
.mn-br{display:grid;gap:4px;font-size:12px}.mn-br span{padding:3px 8px;border-radius:8px;background:#fff;border:1px solid var(--line)}.mn-br b{color:var(--soft)}
.mn-node small{color:var(--soft);text-align:left}
.mn-fa{align-self:center;color:var(--c);font-size:20px;font-weight:900;padding:0 2px}
.mn-stage{border-top:1px solid var(--line);break-inside:avoid-page}
.mn-band{background:var(--c);padding:16px 28px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.mn-band .n{font-size:44px;font-weight:900;line-height:1}.mn-band h3{margin:0;font-size:22px}.mn-band p{margin:2px 0 0;font-size:13px;text-align:left}
.mn-band .who{margin-left:auto;background:rgba(255,255,255,.55);border-radius:999px;padding:6px 14px;font-weight:700;font-size:13px}
.mn-body{padding:18px 28px;display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:20px}
.mn-body h4{margin:0 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:var(--soft)}
.mn-ol{margin:0;padding-left:20px}.mn-ol li{margin:4px 0}.mn-ol li::marker{font-weight:800;color:var(--soft)}
.mn-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}.mn-chips span{font-size:12px;background:color-mix(in srgb,var(--c) 22%,#fff);border-radius:999px;padding:3px 10px}
.mn-tool{display:flex;gap:8px;align-items:flex-start;font-size:13px;margin:6px 0}.mn-tool::before{content:"✦";color:var(--soft)}
.mn-full{grid-column:1/-1}
.mn-reg{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}.mn-reg div{border-left:4px solid var(--c);padding:6px 12px}.mn-reg b{display:block}.mn-reg p{margin:2px 0 0;font-size:13px}
@media (max-width:700px){.mn-body{grid-template-columns:1fr}.mn-ar{display:none}.mn-sec,.mn-band,.mn-body{padding-left:16px;padding-right:16px}}
@media print{.mn{border-radius:0}.mn-node,.mn-st{break-inside:avoid}}`;
  function manualHtml(print) {
    const etapas = STAGES.filter(s => print || verEtapa(s.key));
    const quien = (k) => { const corto = (n) => { const w = n.split(' '); return w.length > 2 ? w.slice(0, -1).join(' ') : w[0]; }; const ns = S.users.filter(u => u.stage === k).map(u => corto(u.name)); return ns.length ? (ns.length > 1 ? ns.slice(0, -1).join(', ') + ' y ' + ns[ns.length - 1] : ns[0]) : (STAGE[k].fixedOwner || '').split(' ')[0]; };
    const flujo = (xs, c) => '<div class="mn-flow" style="--c:' + c + '">' + xs.map((x, i) => (i ? '<span class="mn-fa">➜</span>' : '') + (typeof x === 'string'
      ? '<div class="mn-node"><span class="k">' + (i + 1) + '</span>' + esc(x) + '</div>'
      : Array.isArray(x) ? '<div class="mn-node"><span class="k">' + (i + 1) + '</span><b>' + esc(x[0]) + '</b><small>' + esc(x[1]) + '</small></div>'
      : '<div class="mn-node q"><span class="k"><span>?</span></span><b>' + esc(x.q) + '</b><div class="mn-br"><span><b>Sí:</b> ' + esc(x.si) + '</span><span><b>No:</b> ' + esc(x.no) + '</span></div></div>')).join('') + '</div>';
    const cierre = flujo(['Todos los pasos en verde', 'Firmas la culminación', 'La jefatura da su V°B°', 'Descargas la constancia PDF'], MAN_COL.gen);
    return '<div class="mn"><style>' + MANUAL_CSS + '</style>'
      + '<div class="mn-hero"><div><h2>Manual del CRM · Contratos y Cobranzas</h2><p>Cómo trabaja cada etapa, paso a paso, y qué se registra.</p></div><div class="mn-dots">' + STAGES.map(s => '<i style="background:' + MAN_COL[s.key] + '"></i>').join('') + '</div></div>'
      + '<div class="mn-sec"><h3 class="mn-h">Mapa del proceso</h3><div class="mn-map">' + STAGES.map((s, i) => (i ? '<span class="mn-ar">➜</span>' : '') + '<div class="mn-st" style="--c:' + MAN_COL[s.key] + '"><span class="n">' + s.n + '</span><b>' + esc(s.name) + '</b><small>' + esc(quien(s.key) || s.rol) + '</small><em>Termina: ' + esc(MANUAL[s.key].termina) + '</em></div>').join('') + '</div>'
      + '<p style="margin:12px 0 0">Cada cliente recorre las cinco etapas en este orden. Cuando una etapa se completa, el CRM pasa el expediente solo a la siguiente y lo muestra en el Mi día de su responsable.</p></div>'
      + '<div class="mn-sec"><h3 class="mn-h">Tu día en el CRM</h3>' + flujo(MANUAL_INICIO, MAN_COL.con) + '</div>'
      + etapas.map(s => { const c = MAN_COL[s.key], m = MANUAL[s.key];
        return '<section class="mn-stage" style="--c:' + c + '"><div class="mn-band"><span class="n">' + s.n + '</span><div><h3>' + esc(s.name) + '</h3><p>' + esc(s.desc) + '</p></div><span class="who">' + esc(quien(s.key) || s.rol) + '</span></div>'
          + '<div class="mn-body"><div class="mn-full"><h4>Flujograma</h4>' + flujo(m.flujo, c) + '</div>'
          + '<div><h4>Paso a paso</h4><ol class="mn-ol">' + m.pasos.map(p => '<li>' + esc(p) + '</li>').join('') + '</ol></div>'
          + '<div><h4>Lo que registras</h4><div class="mn-chips">' + (FIELDS[s.key] || []).map(f => '<span>' + esc(f.l) + '</span>').join('') + '</div><h4>Herramientas</h4>' + m.tools.map(t => '<div class="mn-tool">' + esc(t) + '</div>').join('') + '</div>'
          + '<div class="mn-full"><h4>Para cerrar la etapa</h4>' + cierre + '</div></div></section>'; }).join('')
      + '<div class="mn-sec"><h3 class="mn-h">Registros generales</h3><div class="mn-reg">'
      + [['cob', 'Nuevo cliente', 'Si lo creas tú, queda pendiente hasta el V°B° de la jefatura.'], ['con', 'Seguimiento', 'Cada llamada, mensaje o visita se anota con fecha y próxima acción.'], ['fin', 'Historial', 'Cada cambio queda guardado con tu nombre, la fecha y la hora.'], ['for', 'Pasos a mano', 'Solo la jefatura puede marcar un paso por excepción, y queda registrado.']].map(([k, t, d]) => '<div style="--c:' + MAN_COL[k] + '"><b>' + t + '</b><p>' + d + '</p></div>').join('')
      + '</div></div></div>';
  }
  function vAyuda() {
    const step = (n, t, d) => `<div class="how"><span class="hn">${n}</span><div><b>${t}</b><p class="muted">${d}</p></div></div>`;
    return `${pageHead('Ayuda', 'Cómo funciona el CRM en 2 minutos.', `<button class="btn" data-act="welcome">Ver la bienvenida</button> <button class="btn" data-act="manual-print">🖨️ Imprimir manual</button>`)}
    <h2 class="sec" style="margin-top:0">📘 Manual paso a paso</h2>
    ${manualHtml()}
    <h2 class="sec">El camino de cada cliente</h2>
    <div class="flow help-flow">${STAGES.map((s, i) => `<div class="fstage" style="--sc:${colVar(s.key)}"><div class="fs-top"><span class="fs-n">${s.n}</span><b>${s.name}</b></div><p class="small muted" style="margin:6px 0">${esc(s.desc)}</p><div class="fs-who">${IC.nouser.replace('<svg', '<svg class="mini"')}${esc(s.rol)}</div></div>${i < 4 ? '<span class="arrow">›</span>' : ''}`).join('')}</div>
    <h2 class="sec">¿Qué significan los colores?</h2>
    <div class="grid two"><div class="card"><div class="card-b">${['Inmediato', 'Por acumulación', 'Bajo control', 'Cerrado'].map(a => `<div class="lg2">${alertChip(a)}<span>${ALERT_HELP[a]}</span></div>`).join('')}</div></div>
    <div class="card"><div class="card-b"><div class="lg2"><span class="badge verde">En plazo</span><span>Está dentro del tiempo permitido (SLA).</span></div><div class="lg2"><span class="badge amar">Por vencer</span><span>Faltan ${S.params.anticipo} días o menos para el límite.</span></div><div class="lg2"><span class="badge rojo">Vencido</span><span>Ya pasó el plazo.</span></div><div class="lg2"><span class="badge rojo plain">Sin asignar</span><span>Nadie es responsable todavía. Asígnalo desde la ficha o con "Tomar".</span></div></div></div></div>
    <h2 class="sec">Lo más común, paso a paso</h2>
    <div class="grid two">
      <div class="card"><div class="card-b">${step(1, 'Registrar una llamada o gestión', 'Entra a <b>Clientes</b>, abre al cliente y completa "Seguimiento del cliente": qué pasó, próxima acción y fecha compromiso.')}${step(2, 'Avanzar una etapa', 'En la ficha abre la etapa y completa las fechas (por ejemplo, firma del cliente). Cada paso se marca solo y el CRM mueve el expediente cuando la etapa se completa.')}${step(3, 'Asignar un responsable', 'En la ficha elige el nombre en "Responsable", o entra al usuario y toca <b>Tomar</b> en los expedientes sin asignar.')}</div></div>
      <div class="card"><div class="card-b">${step(4, 'Ver qué hace cada persona', 'Ve a <b>Actividad</b>: muestra cada cambio y seguimiento con el nombre de quien lo hizo.')}${step(5, 'Agregar o quitar usuarios', 'Ve a <b>Equipo</b>, abajo en "Gestionar equipo".')}${step(6, 'Descargar indicadores', 'Toca <b>Descargar Excel</b> arriba: trae productividad, eficiencia y eficacia por persona y por etapa.')}</div></div>
    </div>
    <h2 class="sec">Glosario</h2>
    <div class="card"><div class="card-b gloss">
      ${[['Kardex', 'Número de registro del documento en la notaría.'], ['Minuta', 'Borrador del contrato de compraventa que firman las partes.'], ['Carta fianza', 'Garantía del banco que respalda el desembolso.'], ['Levantamiento de hipoteca', 'Trámite para liberar la hipoteca previa del inmueble.'], ['SUNARP', 'Registro público donde se inscribe la propiedad.'], ['Independización', 'Inscripción de la unidad como inmueble propio.'], ['SLA / plazo objetivo', 'Días máximos para completar una etapa.'], ['Cuello de botella', 'Quién o qué está frenando un expediente.'], ['Eficacia', 'De lo asignado, cuánto se llegó a cerrar.'], ['Eficiencia', 'Si se atiende en menos o más días que el plazo objetivo.'], ['Productividad', 'Procesos cerrados por día hábil.']].map(([t, d]) => `<div><b>${t}</b><span class="muted">${d}</span></div>`).join('')}</div></div>`;
  }
  function showWelcome() {
    const s = (n, t, d) => `<div class="how"><span class="hn">${n}</span><div><b>${t}</b><p class="muted">${d}</p></div></div>`;
    modal({ title: '👋 Bienvenida al CRM de Contratos y Cobranzas', ok: 'Entendido, empezar', cancel: '', body: `<p class="muted" style="margin-top:0">Cada cliente pasa por <b>5 etapas</b>: Cobranzas → Contratos → Finanzas → Formalización → Postventa.</p>
      ${s(1, 'Elige quién eres', 'Arriba, en "Trabajando como". Así queda registrado quién hizo cada acción.')}${s(2, 'Abre Mi día', 'Ahí ves tus expedientes del más urgente al menos urgente, con un botón para el siguiente paso.')}${s(3, 'Completa tus datos', 'En cada cliente llena las fechas y estados de tu etapa: los pasos se marcan solos. Usa 📞 💬 para anotar una gestión en 2 toques.')}${s(4, 'Mide resultados', 'Con "Descargar Excel" obtienes productividad, eficiencia y eficacia.')}
      <p class="small muted">Tip: el botón <b>☾ / ☀</b> cambia entre modo noche y día. Puedes volver a esta guía en <b>Ayuda</b>.</p>`, onOk: () => { try { localStorage.setItem('crm-mg-welcome', '1'); } catch (e) { } }, onCancel: () => { try { localStorage.setItem('crm-mg-welcome', '1'); } catch (e) { } } });
  }

  /* ---- Devoluciones de venta (Seguimiento): datos del cliente (del CRM, del PDF de Evolta o a mano), cuenta de destino,
     captura del correo de solicitud y formato PDF. Cada mes se descarga un respaldo en ZIP para guardarlo fuera de la nube. */
  let DV = [], dvUnsub = null, dvErr = '', dvListo = false, dvReintento = null;
  const DV_K = 'crm-mg-dev', DV_RESP_K = 'crm-mg-dev-respaldo';
  const DV_EST = { Pendiente: 'amar', Programada: '', Devuelta: 'verde', Anulada: 'gris' }, DV_ORD = { Pendiente: 0, Programada: 1, Devuelta: 2, Anulada: 3 };
  const DV_MOTIVOS = ['Desistimiento de separación', 'Desistimiento de compra', 'Pago en exceso', 'Resolución de contrato', 'Otro'];
  const DV_CUENTAS = ['de ahorros soles', 'de ahorros dólares', 'corriente soles', 'corriente dólares'];
  const DV_G = [
    ['Datos del cliente', [['proyecto', 'Proyecto / Edificio', 'list'], ['distrito', 'Distrito'], ['unidad', 'Departamento Nº'], ['cliente', 'Cliente (titular)', '', 2], ['dni', 'DNI'], ['conyuge', 'Cónyuge'], ['dniConyuge', 'DNI del cónyuge'], ['domicilio', 'Domicilio fiscal', '', 2], ['telefono', 'Teléfono / celular'], ['email', 'Correo electrónico'], ['centroLaboral', 'Centro laboral'], ['precioDpto', 'Precio del departamento (S/)', 'n'], ['precioTotal', 'Precio total (S/)', 'n']]],
    ['Devolución', [['empresa', 'Empresa', 'list'], ['importe', 'Importe a devolver (S/)', 'n'], ['motivo', 'Motivo', DV_MOTIVOS], ['fSolicitud', 'Fecha de la solicitud', 'd'], ['solicitadoPor', 'Solicitado por'], ['fLiberacion', 'Unidad liberada en el sistema', 'd'], ['fProgramada', 'Fecha programada de devolución', 'd'], ['autorizadaPor', 'Autorizada por', 'list'], ['estado', 'Estado', Object.keys(DV_EST)], ['fDevolucion', 'Fecha en que se devolvió', 'd'], ['obs', 'Observaciones', 'ta', 2]]],
    ['Cuenta de destino', [['banco', 'Banco', 'list'], ['tipoCuenta', 'Tipo de cuenta', DV_CUENTAS], ['cuenta', 'N° de cuenta'], ['cci', 'CCI (20 dígitos)'], ['titularCuenta', 'Titular de la cuenta', '', 2]]]
  ];
  const hay = (v) => v !== undefined && v !== null && String(v).trim() !== '';
  const dvMes = (d) => String(d.fSolicitud || iso(new Date(d.ts || Date.now()))).slice(0, 7);
  const mesLargo = (m) => { const [y, mm] = m.split('-').map(Number); return new Date(y, mm - 1, 1).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' }); };
  function dvLocal(save) { try { if (save) localStorage.setItem(DV_K, JSON.stringify(DV)); else DV = JSON.parse(localStorage.getItem(DV_K) || '[]'); } catch (e) { if (save) toast('No hay espacio en este navegador para guardar las capturas'); } }
  function stopDev() { clearTimeout(dvReintento); if (dvUnsub) { dvUnsub(); dvUnsub = null; } DV = []; dvErr = ''; dvListo = false; }
  function startDev() {
    stopDev(); if (!can('v_dev')) return; // sin permiso no se descargan datos bancarios a ese navegador
    dvUnsub = CL.listenCol('devoluciones', (ch) => { ch.forEach(c => { const i = DV.findIndex(x => x.id === c.id); if (c.type === 'removed') { if (i >= 0) DV.splice(i, 1); } else if (i >= 0) DV[i] = c.data; else DV.push(c.data); }); dvErr = ''; dvListo = true; scheduleRender(); },
      (e) => { dvUnsub = null; dvReintento = setTimeout(() => { if (cloudState === 'ready') startDev(); }, 20000); dvErr = e && e.code === 'permission-denied' ? 'Las devoluciones aún no están activadas en Firebase (falta actualizar las reglas).' : 'No se pudieron cargar las devoluciones.'; scheduleRender(); });
  }
  async function dvGuardar(d) { if (CL.enabled) { await CL.setDoc('devoluciones', d.id, d); const i = DV.findIndex(x => x.id === d.id); if (i >= 0) DV[i] = d; else DV.push(d); if (!dvUnsub) startDev(); } else { const i = DV.findIndex(x => x.id === d.id); if (i >= 0) DV[i] = d; else DV.push(d); dvLocal(true); } }
  const dvCodigo = () => { const y = new Date().getFullYear(), re = new RegExp('^DEV-' + y + '-(\\d+)$'); const n = Math.max(0, ...DV.map(x => Number((re.exec(x.codigo || '') || [])[1] || 0))); return `DEV-${y}-${String(n + 1).padStart(4, '0')}`; };
  function dvDraft(id) {
    if (ui.dvId === id && ui.dv) return ui.dv;
    const ex = DV.find(x => x.id === id);
    ui.dvId = id; ui.dv = ex ? JSON.parse(JSON.stringify(ex)) : { id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), estado: 'Pendiente', tipoCuenta: 'de ahorros soles', nuevo: true };
    return ui.dv;
  }
  function dvDeOp(o) {
    const d = ui.dv, set = (k, v) => { if (hay(v)) d[k] = v; };
    if (o.id) d.opId = o.id;
    set('cliente', o.cliente); set('dni', o.dni); set('proyecto', o.proyecto); set('unidad', String(o.unidad || '').replace(/^(dpto\.?|departamento)\s*/i, ''));
    set('email', o.email); set('telefono', o.telefono); set('empresa', o.id ? empresaDe(o) : o.empresa); set('precioDpto', o.precio); set('precioTotal', o.precio);
  }
  async function dvPdfEvolta(file) {
    toast('Leyendo el estado de cuenta…');
    try { const { fields } = await EVOLTA.fromPdf(await file.arrayBuffer()); const o = S.ops.find(x => fields.dni && String(x.dni || '').trim() === fields.dni);
      dvDeOp(o ? { ...o, ...fields } : fields); toast(o ? `Datos de ${o.cliente} cargados (cliente del CRM)` : 'Datos del cliente cargados del PDF'); } catch (e) { toast('No se pudo leer el PDF: ' + e.message); }
    render(true);
  }
  async function dvImagen(file, k) { try { ui.dv[k] = await bzImagen(file, 450000); toast(k === 'solicitud' ? 'Captura del correo adjunta' : 'Constancia adjunta'); } catch (e) { toast(e.message); } render(true); }
  async function dvLeerCaptura() {
    const d = ui.dv; if (!d || !d.solicitud) return toast('Primero adjunta la captura del correo');
    toast('Leyendo la captura… (la primera vez tarda un poco)');
    try {
      const r = DEVOLUCION.leerCorreo(await EVOLTA.ocr(await (await fetch(d.solicitud)).blob()));
      if (!d.opId && r.dni) { const o = S.ops.find(x => String(x.dni || '').trim() === r.dni); if (o) dvDeOp(o); }
      const puestos = Object.keys(r).filter(k => !hay(d[k])); puestos.forEach(k => d[k] = r[k]);
      toast(puestos.length ? `Se llenaron ${puestos.length} datos de la captura. Revísalos antes de guardar.` : 'No se encontraron datos nuevos en la captura');
    } catch (e) { toast('No se pudo leer la captura: ' + e.message); }
    render(true);
  }
  async function dvGuardarForm() {
    const d = ui.dv; if (!d) return;
    const falta = [['cliente', 'el cliente'], ['dni', 'el DNI'], ['importe', 'el importe'], ['titularCuenta', 'el titular de la cuenta']].filter(([k]) => !hay(d[k])).map(x => x[1]);
    if (!hay(d.cuenta) && !hay(d.cci)) falta.push('la cuenta o el CCI');
    if (falta.length) return toast('Falta completar: ' + falta.join(', '));
    if (hay(d.cci) && String(d.cci).replace(/\D/g, '').length !== 20 && !await ask('El CCI no tiene 20 dígitos. ¿Guardar igual?', 'Guardar igual')) return;
    if (!d.solicitud && !await ask('No adjuntaste la captura del correo de solicitud, que es el sustento de la devolución. ¿Guardar sin ella?', 'Guardar sin captura')) return;
    ['importe', 'precioDpto', 'precioTotal'].forEach(k => { if (hay(d[k])) d[k] = Number(String(d[k]).replace(/[^\d.]/g, '')) || 0; });
    if (d.estado === 'Devuelta' && !d.fDevolucion) d.fDevolucion = iso(today());
    if (!d.fSolicitud) d.fSolicitud = iso(today());
    const nuevo = !!d.nuevo, out = JSON.parse(JSON.stringify(d)); delete out.nuevo;
    if (!out.codigo) out.codigo = dvCodigo();
    out.mod = { por: S.actor, ts: Date.now() }; if (nuevo) out.creado = { por: S.actor, ts: Date.now() }; out.ts = out.ts || Date.now();
    try { await dvGuardar(out); } catch (e) { return toast('No se pudo guardar: ' + (e.code === 'permission-denied' ? 'las devoluciones aún no están activadas en Firebase' : e.message)); }
    S.log.push({ ts: Date.now(), usuario: S.actor, opId: out.opId || '—', etapa: 'gen', campo: 'devolucion', antes: '', despues: `${out.codigo} · ${out.estado} · ${DEVOLUCION.soles(out.importe)}` }); save();
    toast(`✓ ${out.codigo} guardada`); ui.dv = null; ui.dvId = null;
    if (location.hash === '#/devolucion/' + out.id) render(true); else location.hash = '#/devolucion/' + out.id;
  }
  function dvExcel(list, bajar) {
    const C = [['Código', 'codigo'], ['Fecha solicitud', 'fSolicitud', 'd'], ['Estado', 'estado'], ['Cliente', 'cliente'], ['DNI', 'dni'], ['Proyecto', 'proyecto'], ['Departamento', 'unidad'], ['Distrito', 'distrito'], ['Empresa', 'empresa'], ['Importe a devolver', 'importe', 'n'], ['Motivo', 'motivo'], ['Solicitado por', 'solicitadoPor'], ['Unidad liberada', 'fLiberacion', 'd'], ['Fecha programada', 'fProgramada', 'd'], ['Fecha de devolución', 'fDevolucion', 'd'], ['Autorizada por', 'autorizadaPor'],
      ['Banco', 'banco'], ['Tipo de cuenta', 'tipoCuenta'], ['N° de cuenta', 'cuenta'], ['CCI', 'cci'], ['Titular de la cuenta', 'titularCuenta'], ['Teléfono', 'telefono'], ['Correo', 'email'], ['Cónyuge', 'conyuge'], ['DNI cónyuge', 'dniConyuge'], ['Domicilio fiscal', 'domicilio'], ['Centro laboral', 'centroLaboral'], ['Precio departamento', 'precioDpto', 'n'], ['Precio total', 'precioTotal', 'n'], ['Observaciones', 'obs'],
      ['Captura de solicitud', x => x.solicitud ? 'Sí' : 'No'], ['Registrado por', x => (x.creado || {}).por || '']];
    const data = list.map(x => { const r = {}; C.forEach(([h, k, t]) => { const v = typeof k === 'function' ? k(x) : x[k]; r[h] = !hay(v) ? '' : t === 'n' ? Number(v) : t === 'd' ? xlDate(v) : String(v); }); return r; });
    const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ 'Sin datos': '' }], { cellDates: true, dateNF: 'dd/mm/yyyy' });
    if (data.length) { ws['!cols'] = Object.keys(data[0]).map(k => ({ wch: /Cliente|Titular|Empresa|Domicilio|Observ/.test(k) ? 32 : Math.max(12, k.length + 2) })); ws['!autofilter'] = { ref: ws['!ref'] }; }
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Devoluciones');
    if (bajar) { XLSX.writeFile(wb, `Devoluciones_${iso(today())}.xlsx`, { cellDates: true }); toast(`Excel con ${list.length} devoluciones`); }
    return wb;
  }
  function dvZipModal(mes) {
    const meses = [...new Set(DV.map(dvMes))].sort().reverse(); if (!meses.length) return toast('Aún no hay devoluciones para respaldar');
    const sel = mes && meses.includes(mes) ? mes : meses[0];
    modal({ title: '🗂️ Respaldo mensual de devoluciones', ok: '⬇️ Descargar ZIP', body: `<p class="small" style="margin-top:0">Se descarga en tu computadora un ZIP con una carpeta por devolución (formato PDF, captura del correo de solicitud y constancia de transferencia) y un Excel del mes. Guárdalo en tu carpeta de respaldos: no ocupa espacio en Drive.</p>
      <div class="form"><label>Mes<select id="dv-zm">${meses.map(m => `<option value="${m}" ${m === sel ? 'selected' : ''}>${mesLargo(m)} · ${DV.filter(x => dvMes(x) === m).length} devoluciones</option>`).join('')}</select></label></div>`,
      onOk: (dlg) => { const m = dlg.querySelector('#dv-zm').value, lista = DV.filter(x => dvMes(x) === m).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
        toast('Preparando el respaldo…');
        const buf = XLSX.write(dvExcel(lista), { type: 'array', bookType: 'xlsx' });
        DEVOLUCION.zipMes(lista, m, buf, { por: fullName(S.actor) }).then(() => { try { if ((localStorage.getItem(DV_RESP_K) || '') < m) localStorage.setItem(DV_RESP_K, m); } catch (e) { } toast('✓ Respaldo descargado'); render(true); })
          .catch(e => toast('No se pudo crear el respaldo: ' + e.message)); } });
  }
  const dvFilter = () => ui.dvF || (ui.dvF = { q: '', est: '', mes: '', emp: '' });
  function dvRows() {
    const F = dvFilter(), n = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), q = n(F.q);
    return DV.filter(x => (!F.est || x.estado === F.est) && (!F.mes || dvMes(x) === F.mes) && (!F.emp || x.empresa === F.emp) && (!q || n([x.codigo, x.cliente, x.dni, x.proyecto, x.unidad, x.titularCuenta].join(' ')).includes(q)))
      .sort((a, b) => ((DV_ORD[a.estado] ?? 9) - (DV_ORD[b.estado] ?? 9)) || String(b.fSolicitud || '').localeCompare(String(a.fSolicitud || '')));
  }
  function vDevoluciones() {
    const F = dvFilter(), id = 'rg-dv', mesAct = iso(today()).slice(0, 7), t = today(), prev = iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)).slice(0, 7);
    const build = () => {
      const L = dvRows(), sum = (A) => DEVOLUCION.soles(A.reduce((s, x) => s + (Number(x.importe) || 0), 0)) || 'S/ 0.00';
      const pend = DV.filter(x => x.estado === 'Pendiente'), prog = DV.filter(x => x.estado === 'Programada'), dev = DV.filter(x => x.estado === 'Devuelta' && String(x.fDevolucion || '').slice(0, 7) === mesAct), sin = DV.filter(x => !x.solicitud && x.estado !== 'Anulada');
      const kpi = (n, l, c) => `<div class="kpi card ${c || ''}"><div><div class="n">${n}</div><div class="l">${l}</div></div></div>`;
      const cols = [{ h: 'Código', s: x => x.codigo, f: x => `<a href="#/devolucion/${x.id}"><b>${esc(x.codigo || '—')}</b></a>` }, { h: 'Solicitud', s: x => x.fSolicitud, f: x => fdate(x.fSolicitud) || '—' },
        { h: 'Cliente', s: x => x.cliente, f: x => `<a href="#/devolucion/${x.id}">${esc(x.cliente || '')}</a><div class="small muted">DNI ${esc(x.dni || '—')}</div>` }, { h: 'Proyecto · Dpto', s: x => x.proyecto, f: x => `${esc(x.proyecto || '')}${x.unidad ? ' · ' + esc(x.unidad) : ''}` },
        { h: 'Empresa', s: x => x.empresa, f: x => esc(x.empresa || '—') }, { h: 'Importe', cls: 'r', s: x => Number(x.importe) || 0, f: x => DEVOLUCION.soles(x.importe) || '—' }, { h: 'Programada', s: x => x.fProgramada, f: x => fdate(x.fProgramada) || '—' },
        { h: 'Estado', s: x => DV_ORD[x.estado], f: x => `<span class="badge ${DV_EST[x.estado] || ''}">${esc(x.estado || '')}</span>` }, { h: 'Sustento', f: x => x.solicitud ? '<span title="Captura del correo adjunta">📎 Correo</span>' : '<span class="badge rojo plain">Sin captura</span>' },
        { h: '', cls: 'nowrap', f: x => `<button class="btn sm" data-act="dv-pdf" data-id="${x.id}">📄 Formato</button>` }];
      return `<div class="kpis ops-kpis">${kpi(pend.length, `Pendientes · ${sum(pend)}`, pend.length ? 'warn' : '')}${kpi(prog.length, `Programadas · ${sum(prog)}`)}${kpi(dev.length, `Devueltas este mes · ${sum(dev)}`)}${kpi(sin.length, 'Sin captura del correo', sin.length ? 'bad' : '')}</div>
        <div class="ops-tw full">${tbl(id + '-t', cols, L, DV.length ? 'No hay devoluciones con estos filtros.' : 'Aún no hay devoluciones. Toca “Nueva devolución” para registrar la primera.')}</div>`;
    };
    let hecho = ''; try { hecho = localStorage.getItem(DV_RESP_K) || ''; } catch (e) { }
    const aviso = isJefe() && t.getDate() <= 15 && hecho < prev && DV.some(x => dvMes(x) === prev)
      ? `<div class="dv-aviso">📦 <span>Inicio de mes: descarga el <b>respaldo de devoluciones de ${mesLargo(prev)}</b> y guárdalo en tu computadora.</span><button class="btn sm pri" data-act="dv-zip" data-mes="${prev}">Descargar respaldo</button></div>` : '';
    const sel = (k, label, opts) => `<select data-dvf="${k}"><option value="">${label}</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${F[k] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    return `${pageHead('Devoluciones', 'Devoluciones de venta: datos del cliente, cuenta de destino, sustento y formato.', `<a class="btn pri" href="#/devolucion/nueva">➕ Nueva devolución</a> <button class="btn" data-act="dv-excel">⬇️ Excel</button> <button class="btn" data-act="dv-zip">🗂️ Respaldo del mes</button>`)}
      ${dvErr ? `<div class="ev-falta" style="margin-bottom:12px">${esc(dvErr)}</div>` : ''}${aviso}
      <div class="filters"><input type="search" placeholder="Buscar código, cliente, DNI, dpto…" value="${esc(F.q)}" data-dvf="q" autocomplete="off">
        ${sel('est', 'Todos los estados', Object.keys(DV_EST).map(e => [e, e]))}${sel('mes', 'Todos los meses', [...new Set(DV.map(dvMes))].sort().reverse().map(m => [m, mesLargo(m)]))}${sel('emp', 'Todas las empresas', [...new Set(DV.map(x => x.empresa).filter(Boolean))].sort().map(e => [e, e]))}</div>
      ${region(id, build)}`;
  }
  function vDevolucion(id) {
    if (id !== 'nueva' && !DV.find(x => x.id === id) && !(ui.dvId === id && ui.dv)) return `${pageHead('Devolución', '', '<a class="btn" href="#/devoluciones">‹ Volver</a>')}<div class="empty">${dvErr ? esc(dvErr) : dvListo || !CL.enabled ? 'No se encontró esta devolución.' : 'Cargando…'}</div>`;
    const d = dvDraft(id), uq = (A) => [...new Set(A.filter(Boolean))].sort();
    const listas = { proyecto: uq(S.ops.map(o => o.proyecto)), empresa: uq([...S.ops.map(empresaDe), ...DV.map(x => x.empresa)]), autorizadaPor: uq(DV.map(x => x.autorizadaPor)),
      banco: uq(['BCP', 'BBVA', 'Interbank', 'Scotiabank', 'BanBif', 'Pichincha', 'Banco de la Nación', ...DV.map(x => x.banco)]) };
    const campo = ([k, l, t, w]) => { const v = d[k] ?? '', base = `data-dv="${k}" id="dv-${k}" autocomplete="off"`;
      const inp = Array.isArray(t) ? `<select ${base}><option value=""></option>${t.map(o => `<option ${v === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
        : t === 'ta' ? `<textarea ${base} rows="2">${esc(v)}</textarea>` : t === 'd' ? `<input type="date" ${base} value="${esc(v)}">`
        : `<input ${base} value="${esc(v)}" ${t === 'n' ? 'inputmode="decimal"' : ''} ${t === 'list' ? `list="dvl-${k}"` : ''}>`;
      return `<label class="dv-f${w === 2 ? ' w2' : ''}" for="dv-${k}"><span>${l}</span>${inp}</label>`; };
    const capt = (k, titulo, ayuda) => `<div class="dv-cap"><b>${titulo}</b><span class="small muted">${ayuda}</span>${d[k]
      ? `<button type="button" class="dv-th" data-act="dv-ver" data-k="${k}"><img src="${d[k]}" alt="${titulo}"></button><div class="dv-cb">${k === 'solicitud' ? '<button class="btn sm pri" data-act="dv-ocr">🔍 Leer datos de la captura</button>' : ''}<button class="btn sm" data-act="dv-quitar" data-k="${k}">Quitar</button></div>`
      : `<label class="dv-drop">📎 Pega la captura con <b>Ctrl + V</b> o <u>elige un archivo</u><input type="file" accept="image/*" data-dvimg="${k}" style="display:none"></label>`}</div>`;
    const op = d.opId && getOp(d.opId);
    return `${pageHead(d.codigo || 'Nueva devolución', d.codigo ? `${esc(d.cliente || '')} · registrada por ${esc(((d.creado || {}).por) || '—')}` : 'Registra la solicitud, adjunta el correo y genera el formato.',
        `<a class="btn" href="#/devoluciones">‹ Volver</a> <button class="btn" data-act="dv-pdf">📄 Formato PDF</button>${!d.nuevo && isAdmin() ? ' <button class="btn" data-act="dv-del">Eliminar</button>' : ''} <button class="btn pri" data-act="dv-guardar">Guardar</button>`)}
      <div class="dv-form">
      <div class="card"><div class="card-b"><h3 class="dv-h">1. Carga los datos del cliente</h3>
        <div class="dv-cargas"><label class="dv-f dv-bus" for="dv-buscar"><span>Buscar en el CRM (nombre, DNI o unidad)</span><input id="dv-buscar" list="dvl-ops" placeholder="Escribe y elige de la lista" autocomplete="off"></label>
          <button class="btn" data-act="dv-evolta">📄 Cargar PDF de Evolta</button><input type="file" id="dv-evfile" accept="application/pdf" style="display:none"><span class="small muted">o llénalos a mano más abajo.</span></div>
        ${op ? `<p class="small" style="margin:8px 0 0">Vinculada al cliente <a href="#/cliente/${op.id}"><b>${esc(op.cliente)}</b></a> (${op.id}).</p>` : ''}</div></div>
      <div class="card"><div class="card-b"><h3 class="dv-h">2. Sustento</h3><div class="dv-caps">${capt('solicitud', 'Correo de solicitud', 'Captura del correo que pide la devolución. Con “Leer datos” se llenan la cuenta, el CCI, el titular y el importe.')}${capt('voucher', 'Constancia de transferencia', 'Opcional: cuando ya se devolvió el dinero.')}</div></div></div>
      ${DV_G.map(([tt, fs], i) => `<div class="card"><div class="card-b"><h3 class="dv-h">${i + 3}. ${tt}</h3><div class="dv-grid">${fs.map(campo).join('')}</div></div></div>`).join('')}
      <div class="dv-acc"><button class="btn" data-act="dv-pdf">📄 Formato PDF</button><button class="btn pri" data-act="dv-guardar">Guardar devolución</button></div></div>
      <datalist id="dvl-ops">${S.ops.map(o => `<option value="${esc(o.id)} · ${esc(o.cliente || '')} · DNI ${esc(o.dni || '—')} · ${esc(o.proyecto || '')} ${esc(o.unidad || '')}"></option>`).join('')}</datalist>
      ${Object.entries(listas).map(([k, L]) => `<datalist id="dvl-${k}">${L.map(v => `<option value="${esc(v)}"></option>`).join('')}</datalist>`).join('')}`;
  }
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset && t.dataset.dv && ui.dv) ui.dv[t.dataset.dv] = t.value;
    if (t.dataset && t.dataset.dvf) { dvFilter()[t.dataset.dvf] = t.value; refresh('rg-dv'); }
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'dv-buscar' && ui.dv) { const o = getOp(String(t.value).split(' · ')[0].trim()); if (o) { dvDeOp(o); toast(`Datos de ${o.cliente} cargados`); render(true); } }
    if (t.id === 'dv-evfile' && t.files[0]) dvPdfEvolta(t.files[0]);
    if (t.dataset && t.dataset.dvimg && t.files[0]) dvImagen(t.files[0], t.dataset.dvimg);
  });
  document.addEventListener('paste', (e) => { // pegar la captura del correo (o la constancia) en cualquier parte del formulario
    if (route().view !== 'devolucion' || !ui.dv) return; const img = [...((e.clipboardData && e.clipboardData.items) || [])].find(i => i.type.startsWith('image/'));
    if (img) { e.preventDefault(); dvImagen(img.getAsFile(), !ui.dv.solicitud ? 'solicitud' : !ui.dv.voucher ? 'voucher' : 'solicitud'); }
  });

  /* ---- Buzón: todos envían errores o sugerencias (con captura opcional); la jefatura los evalúa y responde.
     En la nube cada persona solo lee los suyos (reglas de Firebase); en modo local se guarda en este navegador. */
  let BZ = [], bzUnsub = null, bzErr = '', bzForm = { tipo: 'error', texto: '', img: '' };
  const BZ_K = 'crm-mg-buzon';
  const BZ_EST = { nuevo: ['Nuevo', 'rojo'], evaluando: ['En evaluación', 'amar'], resuelto: ['Resuelto', 'verde'], descartado: ['No aplica', 'gris'] };
  const bzNuevos = () => BZ.filter(x => x.estado === 'nuevo').length;
  function bzLocal(save) { try { if (save) localStorage.setItem(BZ_K, JSON.stringify(BZ)); else BZ = JSON.parse(localStorage.getItem(BZ_K) || '[]'); } catch (e) { if (save) toast('No hay espacio en este navegador para guardar la captura'); } }
  function stopBuzon() { if (bzUnsub) { bzUnsub(); bzUnsub = null; } BZ = []; bzErr = ''; }
  function startBuzon() {
    stopBuzon(); let primera = true;
    bzUnsub = CL.listenBuzon(isJefe() ? '' : me, (ch) => {
      ch.forEach(c => { const i = BZ.findIndex(x => x.id === c.id); if (c.type === 'removed') { if (i >= 0) BZ.splice(i, 1); return; }
        if (i >= 0) BZ[i] = c.data; else { BZ.push(c.data); if (!primera && isJefe() && c.data.email !== me) toast('📬 Nuevo en el buzón: ' + (c.data.tipo === 'error' ? 'error reportado' : 'sugerencia') + ' de ' + c.data.autor); } });
      primera = false; bzErr = ''; scheduleRender();
    }, (e) => { bzErr = e && e.code === 'permission-denied' ? 'El buzón aún no está activado en Firebase (falta actualizar las reglas).' : 'No se pudo cargar el buzón.'; scheduleRender(); });
  }
  function bzImagen(file, max = 700000) { // reduce la captura (máx. 1400 px, JPEG) para que entre en la base de datos
    return new Promise((ok, no) => { const r = new FileReader(); r.onerror = () => no(r.error); r.onload = () => { const im = new Image(); im.onerror = () => no(new Error('El archivo no es una imagen')); im.onload = () => {
      const k = Math.min(1, 1400 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
      let q = 0.8, d = c.toDataURL('image/jpeg', q); while (d.length > max && q > 0.35) { q -= 0.1; d = c.toDataURL('image/jpeg', q); } ok(d); }; im.src = r.result; }; r.readAsDataURL(file); });
  }
  async function bzAdjuntar(file) { try { bzForm.img = await bzImagen(file); toast('Captura adjunta'); } catch (e) { toast(e.message); } render(true); }
  async function bzEnviar() {
    const t = bzForm.texto.trim(); if (t.length < 5) return toast('Cuéntanos un poco más, en unas palabras');
    const it = { id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), tipo: bzForm.tipo, texto: t.slice(0, 2000), img: bzForm.img || '', autor: S.actor, email: me || '', ts: Date.now(), pantalla: (ui.lastView || '').replace(/^#\//, ''), estado: 'nuevo' };
    if (CL.enabled) { try { await CL.setDoc('buzon', it.id, it); } catch (e) { return toast('No se pudo enviar: ' + (e.code === 'permission-denied' ? 'el buzón aún no está activado en Firebase' : e.message)); } }
    else { BZ.push(it); bzLocal(true); }
    bzForm = { tipo: bzForm.tipo, texto: '', img: '' }; toast('✓ Enviado a la jefatura. ¡Gracias!'); render(true);
  }
  function bzActualizar(id, f) {
    const it = BZ.find(x => x.id === id); if (!it) return; const cambio = { ...f, tsResp: Date.now(), por: S.actor }; Object.assign(it, cambio);
    if (CL.enabled) CL.updateDoc('buzon', id, cambio).catch(e => toast('No se pudo guardar: ' + e.message)); else bzLocal(true);
  }
  function vBuzon() {
    const jefe = isJefe(), fh = (ts) => new Date(ts).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
    const mios = BZ.filter(x => jefe || (CL.enabled ? x.email === me : x.autor === S.actor)).sort((a, b) => b.ts - a.ts);
    const f = ui.bzF || 'abiertos', lista = jefe ? mios.filter(x => f === 'todos' || (f === 'abiertos' ? ['nuevo', 'evaluando'].includes(x.estado) : x.estado === f)) : mios;
    const chip = (e) => `<span class="badge ${(BZ_EST[e] || BZ_EST.nuevo)[1]}">${(BZ_EST[e] || BZ_EST.nuevo)[0]}</span>`;
    const tipoBtn = (k, ic, l, d) => `<button type="button" class="bz-tipo ${bzForm.tipo === k ? 'on' : ''}" data-act="bz-tipo" data-val="${k}"><span class="bz-ic">${ic}</span><b>${l}</b><small>${d}</small></button>`;
    const card = (x) => `<div class="bz-it ${x.estado === 'nuevo' && jefe ? 'nuevo' : ''}">
      <div class="bz-h"><span class="bz-ic">${x.tipo === 'error' ? '🐞' : '💡'}</span><b>${x.tipo === 'error' ? 'Error' : 'Sugerencia'}</b>${chip(x.estado)}<span class="small muted">${esc(x.autor || '')} · ${fh(x.ts)}${x.pantalla ? ' · pantalla: ' + esc(x.pantalla) : ''}</span></div>
      <p class="bz-t">${esc(x.texto)}</p>
      ${x.img ? `<button type="button" class="bz-th" data-act="bz-ver" data-id="${x.id}"><img src="${x.img}" alt="Captura enviada por ${esc(x.autor || '')}"><span>🔍 Ver captura</span></button>` : ''}
      ${jefe ? `<div class="bz-j"><label class="small muted">Estado <select data-bzest="${x.id}">${Object.entries(BZ_EST).map(([k, [l]]) => `<option value="${k}" ${x.estado === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <textarea id="bzr-${x.id}" rows="2" maxlength="1000" placeholder="Respuesta para ${esc((x.autor || '').split(' ')[0])} (opcional)">${esc(x.resp || '')}</textarea>
        <div class="bz-jb"><button class="btn sm pri" data-act="bz-resp" data-id="${x.id}">Guardar respuesta</button>${isAdmin() ? `<button class="btn sm" data-act="bz-del" data-id="${x.id}">Eliminar</button>` : ''}</div></div>`
        : x.resp ? `<div class="bz-r"><b>Respuesta de la jefatura:</b> ${esc(x.resp)}</div>` : ''}
    </div>`;
    const filtros = [['abiertos', 'Por atender'], ['nuevo', 'Nuevos'], ['evaluando', 'En evaluación'], ['resuelto', 'Resueltos'], ['descartado', 'No aplica'], ['todos', 'Todos']];
    return `${pageHead('Buzón', jefe ? 'Errores y sugerencias del equipo. Evalúa, responde y marca su estado.' : 'Reporta un error o envía una idea. Le llega a la jefatura con tu nombre.')}
    ${bzErr ? `<div class="ev-falta" style="margin-bottom:12px">${esc(bzErr)}</div>` : ''}
    <div class="card"><div class="card-b bz-form">
      <div class="bz-tipos">${tipoBtn('error', '🐞', 'Reportar un error', 'Algo no funciona o sale un mensaje extraño')}${tipoBtn('sugerencia', '💡', 'Enviar una sugerencia', 'Una idea para mejorar el CRM')}</div>
      <label class="bz-l" for="bz-texto">${bzForm.tipo === 'error' ? '¿Qué pasó? Cuéntanos qué estabas haciendo y qué mensaje salió.' : '¿Qué te gustaría mejorar o agregar?'}</label>
      <textarea id="bz-texto" rows="4" maxlength="2000" autocomplete="off" placeholder="${bzForm.tipo === 'error' ? 'Ej.: al guardar la fecha de firma en Contratos sale un error en rojo…' : 'Ej.: sería útil ver los vencimientos de esta semana en Mi día…'}">${esc(bzForm.texto)}</textarea>
      <div class="bz-cap">${bzForm.img ? `<img src="${bzForm.img}" alt="Captura adjunta"><button type="button" class="btn sm" data-act="bz-quitar">Quitar captura</button>` : `📎 <b>Adjunta una captura</b> (opcional): pégala con <b>Ctrl + V</b> o <label class="bz-file">elige un archivo<input type="file" id="bz-file" accept="image/*" style="display:none"></label>`}</div>
      <div class="bz-acc"><span class="small muted">Se envía con tu nombre, la fecha y la pantalla donde estabas.</span><button class="btn pri" data-act="bz-enviar">Enviar</button></div>
    </div></div>
    <h2 class="sec">${jefe ? 'Bandeja de la jefatura' : 'Mis envíos'}</h2>
    ${jefe ? `<div class="bz-fil">${filtros.map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-act="bz-f" data-val="${k}">${l}</button>`).join('')}</div>` : ''}
    <div class="bz-list">${lista.length ? lista.map(card).join('') : `<div class="empty">${jefe ? 'No hay mensajes en esta lista.' : 'Aún no has enviado nada. Cuando lo hagas, aquí verás su estado y la respuesta.'}</div>`}</div>`;
  }
  document.addEventListener('input', (e) => { if (e.target.id === 'bz-texto') bzForm.texto = e.target.value; });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'bz-file' && e.target.files[0]) bzAdjuntar(e.target.files[0]);
    if (e.target.dataset && e.target.dataset.bzest) { bzActualizar(e.target.dataset.bzest, { estado: e.target.value }); toast('Estado actualizado'); render(true); }
  });
  document.addEventListener('paste', (e) => { // pegar una captura en cualquier parte del buzón
    if (route().view !== 'buzon') return; const img = [...((e.clipboardData && e.clipboardData.items) || [])].find(i => i.type.startsWith('image/'));
    if (img) { e.preventDefault(); bzAdjuntar(img.getAsFile()); }
  });

  /* ================= router ================= */
  function route() { const [, view, arg] = location.hash.slice(1).split('/'); return { view: view || 'resumen', arg: arg ? decodeURIComponent(arg) : '' }; }
  function navHtml(r) {
    const all = rows();
    const item = (href, label, extra, on, dot) => `<a href="${href}" class="${on ? 'on' : ''}">${dot ? `<span class="dot" style="background:${dot}"></span>` : ''}${label}${extra || ''}</a>`;
    const venc = agenda().filter(a => a.cat === 'vencido').length;
    const cfAlerta = S.ops.filter(o => esCarta(o) && ['venc', 'pronto'].includes(cfEstado(o).k)).length; // cartas vencidas o por vencer
    const insAlerta = all.filter(r => enFormalizacion(r) && INS_GRUPO[insEstado(r.o)] === 'obs').length; // inscripciones observadas o sin respuesta
    const I = { ins: '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13l2 2 4-4"/></svg>', cf: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>', ops: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>', help: IC.help, act: '<svg viewBox="0 0 24 24"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>', home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>', sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>', users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M17 5a3.5 3.5 0 0 1 0 7M22 21c0-3-2-5-5-5.5"/></svg>', cli: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/></svg>', cal: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>', cfg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/></svg>' };
    const seg = [can('v_clientes') && item('#/clientes', I.cli + 'Clientes', `<span class="cnt">${all.length}</span>`, r.view === 'clientes' || r.view === 'cliente'), can('v_ops') && item('#/operaciones', I.ops + 'Resumen de operaciones', '', r.view === 'operaciones'), can('v_cartas') && item('#/cartas', I.cf + 'Cartas fianza', cfAlerta ? `<span class="cnt hot">${cfAlerta}</span>` : '', r.view === 'cartas'), can('v_ins') && item('#/inscripciones', I.ins + 'Inscripciones', insAlerta ? `<span class="cnt hot">${insAlerta}</span>` : '', r.view === 'inscripciones'), can('v_dev') && item('#/devoluciones', '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>Devoluciones', DV.filter(x => x.estado === 'Pendiente' || x.estado === 'Programada').length ? `<span class="cnt">${DV.filter(x => x.estado === 'Pendiente' || x.estado === 'Programada').length}</span>` : '', r.view === 'devoluciones' || r.view === 'devolucion'), can('v_equipo') && item('#/usuarios', I.users + 'Equipo', '', r.view === 'usuarios' || r.view === 'usuario'), can('v_actividad') && item('#/actividad', I.act + 'Actividad', '', r.view === 'actividad'), can('v_agenda') && item('#/agenda', I.cal + 'Agenda', venc ? `<span class="cnt hot">${venc}</span>` : '', r.view === 'agenda')].filter(Boolean).join('');
    return `<div class="nav-h">Menú</div>${item('#/resumen', I.home + 'Inicio', '', r.view === 'resumen')}${can('v_mi') ? item('#/mi', I.sun + 'Mi día', '', r.view === 'mi') : ''}
      ${primeraEtapa() ? `<div class="nav-h">Gestión por etapa</div>${STAGES.filter(s => verEtapa(s.key)).map(s => { const n = all.filter(x => x.d.etapa === s.key).length; return item('#/etapa/' + s.key, `${s.n}. ${s.name}`, `<span class="cnt">${n}</span>`, r.view === 'etapa' && r.arg === s.key, colVar(s.key)); }).join('')}` : ''}
      ${seg ? `<div class="nav-h">Seguimiento</div>${seg}` : ''}
      <div class="nav-h">Más</div>${item('#/buzon', '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>Buzón', isJefe() && bzNuevos() ? `<span class="cnt hot">${bzNuevos()}</span>` : '', r.view === 'buzon')}${item('#/ayuda', I.help + 'Ayuda', '', r.view === 'ayuda')}${can('v_config') ? item('#/config', I.cfg + 'Configurar', '', r.view === 'config') : ''}`;
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
    $('#dls').innerHTML = dl('proyecto', uniq(o => o.proyecto)) + dl('vendedor', uniq(o => o.vendedor)) + dl('jefeVentas', uniq(o => o.jefeVentas)) + dl('banco', uniq(o => o.banco)) + dl('empresa', uniq(empresaDe)) + dl('notaria', uniq(o => o.con_notaria)) + dl('abogado', uniq(o => o.con_abogado));
  }
  let lastKey = '';
  function render(keepScroll) {
    if (!gateCheck()) return;
    const r = route(); let html;
    if (r.view !== 'buzon') ui.lastView = location.hash; // para saber en qué pantalla estaba quien reporta
    if (!S.ops.length && r.view !== 'config') html = `${pageHead('Bienvenida', 'Todavía no hay datos cargados.')}<div class="card"><div class="card-b"><p>Importa tu Excel <b>SEGUIMIENTOS.xlsx</b> (hoja BASE_MAESTRA) o un respaldo desde <a href="#/config">Configuración</a>.</p></div></div>`;
    else {
      try {
        html = (VIEW_PERM[r.view] && !can(VIEW_PERM[r.view])) ? vSinAcceso() : r.view === 'mi' ? vMiDia() : r.view === 'etapa' && STAGE[r.arg] ? vEtapa(r.arg) : r.view === 'usuarios' ? vUsuarios() : r.view === 'usuario' ? vUsuario(r.arg) : r.view === 'clientes' ? vClientes()
          : r.view === 'cliente' ? vCliente(r.arg) : r.view === 'agenda' ? vAgenda() : r.view === 'operaciones' ? vOperaciones() : r.view === 'cartas' ? vCartas() : r.view === 'inscripciones' ? vInscripciones() : r.view === 'actividad' ? vActividad() : r.view === 'buzon' ? vBuzon() : r.view === 'devoluciones' ? vDevoluciones() : r.view === 'devolucion' ? vDevolucion(r.arg) : r.view === 'ayuda' ? vAyuda() : r.view === 'config' ? vConfig() : vResumen();
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
    STAGES.forEach(s => add(`Datos ${s.n}-${s.name}`.replace('ó', 'o'), rows().map(({ o, d }) => { const r = { ID: o.id, Cliente: o.cliente, Proyecto: o.proyecto, Unidad: o.unidad, 'Estado en la etapa': ESTADO[d.state[s.key]], Responsable: d.owner[s.key], 'Avance %': d.progress[s.key] }; [...FIELDS[s.key], ...Object.keys(CRM.EV_TABS).filter(tk => CRM.EV_TABS[tk].stage === s.key).flatMap(tk => FIELDS[tk])].forEach(f => r[f.l] = fv(f, o[f.k])); return r; })));

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
    if (a === 'perm-etapas') { // atajo: solo su propia etapa, o todas
      const u = ui.permU, st = (user(u) || {}).stage, solo = el.dataset.val === 'propia';
      S.perms[u] = S.perms[u] || {}; STAGES.forEach(s => { S.perms[u]['e_' + s.key] = !solo || s.key === st; });
      S.log.push({ ts: Date.now(), usuario: S.actor, opId: '—', etapa: 'gen', campo: 'permiso', antes: u, despues: solo ? 'Ve solo su etapa' : 'Ve todas las etapas' }); save(); toast('Etapas actualizadas'); return render(true);
    }
    if (a === 'perm-tpl') { const u = ui.permU, v = el.dataset.val; PERMS.filter(p => p.g !== 'e').forEach(p => { S.perms[u] = S.perms[u] || {}; /* las plantillas no tocan las etapas visibles */ S.perms[u][p.k] = v === 'all' ? true : v === 'ops' ? !PERM_OFF.has(p.k) : (p.g === 'v' && !PERM_OFF.has(p.k)); }); S.log.push({ ts: Date.now(), usuario: S.actor, opId: '—', etapa: 'gen', campo: 'permiso', antes: u, despues: 'Plantilla: ' + el.textContent.trim() }); save(); toast('Permisos aplicados'); return render(true); }
    if (a === 'perm-back') { ui.previewReal = null; S.actor = actorOf(); toast('Volviste a tu usuario'); location.hash = '#/config'; return render(); }
    if (a === 'perm-try') { if (CL.enabled) ui.previewReal = S.actor; S.actor = ui.permU; if (!CL.enabled) save(); toast('Ahora ves el CRM como ' + S.actor); location.hash = '#/resumen'; return render(); }
    if (a === 'pin-set') return setPin();
    if (a === 'pin-clear') { if (await ask('¿Quitar el PIN de administrador?')) { S.adminPin = ''; save(); toast('PIN quitado'); render(true); } return; }
    if (a === 'nav-toggle') return $('.side').classList.toggle('open');
    if (a === 'evolta') { ui.evOp = el.dataset.op || ''; return $('#evfile').click(); }
    if (a === 'op-del') return deleteOp(el.dataset.op);
    if (a === 'ing-ok') return ingresoOk(getOp(el.dataset.op));
    if (a === 'ing-obs') return ingresoObs(getOp(el.dataset.op));
    if (a === 'ing-reenviar') return ingresoReenviar(getOp(el.dataset.op));
    if (a === 'evtab') return openTab(getOp(el.dataset.op), el.dataset.tab);
    if (a === 'seguir') return marcaActividad(true);
    if (a === 'acta') return openActa(getOp(el.dataset.op));
    if (a === 'sticker') return sticker(el.dataset.op, el.dataset.s);
    if (a === 'export-ops') return exportOps();
    if (a === 'export-cf') return exportCf();
    if (a === 'export-ins') return exportIns();
    if (a === 'ins-page') { insFilter().page = +el.dataset.p; return refresh('rg-ins'); }
    if (a === 'ins-grp') { const F = insFilter(); F.grp = F.grp === el.dataset.k ? '' : el.dataset.k; F.page = 1; return refresh('rg-ins'); }
    if (a === 'cf-renovar') return cfRenovar(getOp(el.dataset.op));
    if (a === 'cf-devolver') return cfDevolver(getOp(el.dataset.op));
    if (a === 'cf-page') { cfFilter().page = +el.dataset.p; return refresh('rg-cf'); }
    if (a === 'cf-est') { const F = cfFilter(); F.est = F.est === el.dataset.k ? '' : el.dataset.k; F.page = 1; const s = $('[data-f=cartas][data-k=est]'); if (s) s.value = F.est; return refresh('rg-cf'); }
    if (a === 'proy-mes') { const F = opsFilter(); F.mes = el.dataset.mes; F.page = 1; const s = $('[data-f=operaciones][data-k=mes]'); if (s) s.value = F.mes; refresh('rg-ops'); const t = $('.ops-kpis'); if (t && el.dataset.mes) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (a === 'ops-page') { opsFilter().page = +el.dataset.p; refresh('rg-ops'); const t = $('.pager'); if (t) t.scrollIntoView({ block: 'start' }); return; }
    if (a === 'cierre-firmar') return cierreFirmar(getOp(el.dataset.op), el.dataset.s);
    if (a === 'cierre-vb') return cierreVB(getOp(el.dataset.op), el.dataset.s);
    if (a === 'cierre-obs') return cierreObs(getOp(el.dataset.op), el.dataset.s);
    if (a === 'clausula') { const op = getOp(el.dataset.op); if (op && op.minuta) return openClausula(op); ui.minOp = el.dataset.op; return $('#minfile').click(); }
    if (a === 'chip') { flt(el.dataset.v, {})[el.dataset.k] = el.dataset.val; return refresh(el.dataset.r); }
    if (a === 'sort') { const id = el.dataset.t, i = +el.dataset.i, s = ui.sort[id]; ui.sort[id] = s && s.i === i ? { i, dir: -s.dir } : { i, dir: 1 }; const rg = Object.keys(regions).find(r => id === r || id.startsWith(r + '-')) || id; return regions[rg] ? refresh(rg) : render(true); }
    if (a === 'tab') { ui.tab[el.dataset.t] = el.dataset.val; return render(true); }
    if (a === 'help') return location.hash = '#/ayuda';
    if (a === 'dv-guardar') return dvGuardarForm();
    if (a === 'dv-pdf') { const d = el.dataset.id ? DV.find(x => x.id === el.dataset.id) : ui.dv; if (d) DEVOLUCION.descargar({ ...d, codigo: d.codigo || 'BORRADOR' }, { por: fullName(S.actor) }).catch(e => toast(e.message)); return; }
    if (a === 'dv-evolta') { const f = $('#dv-evfile'); if (f) f.click(); return; }
    if (a === 'dv-ocr') return dvLeerCaptura();
    if (a === 'dv-quitar') { if (ui.dv) delete ui.dv[el.dataset.k]; return render(true); }
    if (a === 'dv-ver') { const src = (ui.dv || {})[el.dataset.k]; if (src) modal({ title: 'Captura', body: `<img src="${src}" alt="Captura" style="width:100%;border-radius:8px">`, ok: 'Cerrar', cancel: '', wide: true }); return; }
    if (a === 'dv-zip') return dvZipModal(el.dataset.mes);
    if (a === 'dv-excel') { dvExcel(dvRows(), true); return; }
    if (a === 'dv-del') { const d = ui.dv; if (d && await ask(`¿Eliminar la devolución ${d.codigo || ''} de ${d.cliente || ''}? No se puede deshacer.`, 'Eliminar')) { DV = DV.filter(x => x.id !== d.id); if (CL.enabled) CL.deleteDoc('devoluciones', d.id).catch(e => toast('No se pudo eliminar: ' + e.message)); else dvLocal(true); S.log.push({ ts: Date.now(), usuario: S.actor, opId: d.opId || '—', etapa: 'gen', campo: 'devolucion', antes: d.codigo || '', despues: 'Eliminada' }); save(); ui.dv = null; ui.dvId = null; toast('Devolución eliminada'); location.hash = '#/devoluciones'; } return; }
    if (a === 'bz-tipo') { bzForm.tipo = el.dataset.val; return render(true); }
    if (a === 'bz-enviar') return bzEnviar();
    if (a === 'bz-quitar') { bzForm.img = ''; return render(true); }
    if (a === 'bz-f') { ui.bzF = el.dataset.val; return render(true); }
    if (a === 'bz-resp') { const t = $('#bzr-' + el.dataset.id), it = BZ.find(x => x.id === el.dataset.id); bzActualizar(el.dataset.id, { resp: (t ? t.value : '').trim(), estado: it && it.estado === 'nuevo' ? 'evaluando' : (it ? it.estado : 'evaluando') }); toast('Respuesta guardada'); return render(true); }
    if (a === 'bz-ver') { const it = BZ.find(x => x.id === el.dataset.id); if (it) modal({ title: 'Captura de ' + esc(it.autor || ''), body: `<img src="${it.img}" alt="Captura" style="width:100%;border-radius:8px">`, ok: 'Cerrar', cancel: '', wide: true }); return; }
    if (a === 'bz-del') { if (await ask('¿Eliminar este mensaje del buzón? No se puede deshacer.', 'Eliminar')) { BZ = BZ.filter(x => x.id !== el.dataset.id); if (CL.enabled) CL.deleteDoc('buzon', el.dataset.id).catch(e => toast('No se pudo eliminar: ' + e.message)); else bzLocal(true); toast('Eliminado'); render(true); } return; }
    if (a === 'manual-print') { const w = window.open('', '_blank'); if (!w) return toast('Permite las ventanas emergentes para imprimir'); w.document.write('<!doctype html><meta charset="utf-8"><title>Manual del CRM · Contratos y Cobranzas</title><style>@page{margin:10mm}body{margin:0;background:#FFFDF8}</style>' + manualHtml(true)); w.document.close(); w.focus(); setTimeout(() => w.print(), 400); return; }
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
    if (a === 'newop') return modal({ title: 'Nuevo cliente', ok: 'Crear', body: `<p class="ev-falta" style="margin-top:0">¿Tienes el estado de cuenta de Evolta? <button type="button" class="btn sm" data-act="evolta" data-close>📄 Cargar PDF</button> y los datos se llenan solos.</p><div class="form"><div class="row2"><label>Cliente<input id="n-cliente"></label><label>DNI<input id="n-dni"></label></div><div class="row2"><label>Proyecto<input id="n-proyecto" list="dl-proyecto" placeholder="Elige o escribe uno nuevo"></label><label>Unidad<input id="n-unidad"></label></div><div class="row2"><label>Empresa (razón social)<input id="n-empresa" list="dl-empresa" placeholder="Se completa sola según el proyecto"></label><span></span></div><div class="row2"><label>Vendedor<input id="n-vendedor" list="dl-vendedor" placeholder="Elige o escribe uno nuevo"></label><label>Banco<input id="n-banco" list="dl-banco" placeholder="Elige o escribe uno nuevo"></label></div><div class="row2"><label>Precio (S/)<input id="n-precio" type="number"></label><label>Monto a financiar (S/)<input id="n-monto" type="number"></label></div></div>`,
      onOk: (dlg) => { const v = (i) => dlg.querySelector('#n-' + i).value.trim(); if (!v('cliente')) { toast('Escribe el nombre del cliente'); return false; }
        // aviso de cliente duplicado: mismo DNI, mismo nombre o misma unidad del mismo proyecto
        const nrm = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const dig = (x) => String(x || '').replace(/\D/g, '');
        const dni = dig(v('dni')), nom = nrm(v('cliente')), pro = nrm(v('proyecto')), uni = nrm(v('unidad'));
        const dups = S.ops.map(o => { const r = [];
          if (dni && dig(o.dni) === dni) r.push('mismo DNI');
          if (nom && nrm(o.cliente) === nom) r.push('mismo nombre');
          if (pro && uni && nrm(o.proyecto) === pro && nrm(o.unidad) === uni) r.push('misma unidad');
          return r.length ? { o, r } : null; }).filter(Boolean);
        const firma = dni + '|' + nom + '|' + pro + '|' + uni;
        if (dups.length && dlg._dupOk !== firma) {
          dlg._dupOk = firma; let box = dlg.querySelector('.dup-aviso');
          if (!box) { box = document.createElement('div'); box.className = 'ev-falta dup-aviso'; box.setAttribute('role', 'alert'); dlg.querySelector('.dlg-b').prepend(box); }
          box.innerHTML = `<b>⚠️ Este cliente podría estar repetido:</b><ul style="margin:6px 0 6px 18px;padding:0">${dups.slice(0, 5).map(d => `<li><b>${esc(d.o.cliente)}</b> (${esc(d.o.id)})${d.o.dni ? ' · DNI ' + esc(d.o.dni) : ''}${d.o.proyecto ? ' · ' + esc(d.o.proyecto) : ''}${d.o.unidad ? ' – ' + esc(d.o.unidad) : ''} · <i>${d.r.join(', ')}</i> <button type="button" class="btn sm" data-act="goto" data-href="#/cliente/${esc(d.o.id)}" data-close>Ver</button></li>`).join('')}</ul>Si de verdad es otro cliente u otra compra, toca <b>Crear de todas formas</b>.`;
          dlg.querySelector('[data-m=ok]').textContent = 'Crear de todas formas'; box.scrollIntoView({ block: 'nearest' }); return false;
        }
        const max = Math.max(0, ...S.ops.map(o => +String(o.id).replace(/\D/g, '') || 0)); const op = { id: 'OP-' + String(max + 1).padStart(4, '0'), fechaInicio: iso(today()), cliente: v('cliente') };
        ['dni', 'proyecto', 'unidad', 'vendedor', 'banco'].forEach(k => v(k) && (op[k] = v(k)));
        if (v('empresa') && v('empresa') !== empEnProy(op.proyecto)) { if (op.proyecto && !empEnProy(op.proyecto)) setEmpresaProyecto(op.proyecto, v('empresa')); else op.empresa = v('empresa'); } // la primera vez queda como la empresa del proyecto
        if (v('precio')) op.precio = +v('precio'); if (v('monto')) op.montoBanco = +v('monto');
        if (op.precio != null) op.cob_porRecibir = Math.max(0, op.precio - (op.montoBanco || 0)); // la inicial empieza pendiente, no cobrada
        marcaIngreso(op); if (op.aprob) toast('Cliente creado. Queda pendiente del V°B° de la administración');
        S.ops.push(CRM.normalize(op)); S.log.push({ ts: Date.now(), usuario: S.actor, opId: op.id, etapa: 'gen', campo: 'cliente', antes: '', despues: op.cliente }); commit(); location.hash = '#/cliente/' + op.id; } });
  });
  const closeSide = () => { const s = $('.side'); if (s) s.classList.remove('open'); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSide(); });
  matchMedia('(max-width:820px)').addEventListener('change', closeSide);
  document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role=button]')) { e.preventDefault(); e.target.click(); } });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'pk-q') return pickList(e.target.value);
    const el = e.target.closest('[data-f]'); if (!el) return;
    const F = flt(el.dataset.f, {}); F[el.dataset.k] = el.value; if ('page' in F) F.page = 1; // al cambiar un filtro se vuelve a la página 1
    if (el.dataset.f === 'operaciones' && el.dataset.k === 'emp') { F.proy = ''; return render(true); } // la lista de proyectos depende de la empresa
    refresh(el.dataset.r);
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.perm) { setPerm(t.dataset.u, t.dataset.perm, t.checked); return toast('Permiso guardado'); }
    if (t.dataset.fk) { if (!can('a_edit')) { toast(NOPERM); return render(true); } if (setField(t.dataset.op, t.dataset.fk, t.value)) { const mk = t.closest('.f.mk'); if (mk) mk.classList.toggle('falta', !t.value); refreshFicha(t.dataset.op); $('#nav').innerHTML = navHtml(route()); toast('Guardado'); } return; }
    if (t.dataset.ins) { // estado de inscripción cambiado desde la lista de Inscripciones
      if (!can('a_edit')) { toast(NOPERM); return render(true); }
      const o = getOp(t.dataset.ins); setField(o.id, 'for_estadoIns', t.value);
      if (t.value === 'Inscrito' && !o.for_fInscripcion) setField(o.id, 'for_fInscripcion', iso(today()));
      if (t.value === 'Ingresado a notaría' && !o.for_fIngresoNotaria) setField(o.id, 'for_fIngresoNotaria', iso(today()));
      toast(`${o.cliente}: ${t.value}`); return refresh('rg-ins');
    }
    if (t.dataset.emp !== undefined) { if (!can('a_params')) { toast(NOPERM); return render(true); } setEmpresaProyecto(t.dataset.emp, t.value.trim()); return toast(`Empresa de ${t.dataset.emp} guardada`); }
    if (t.id === 'n-proyecto') { const e = $('#n-empresa'); if (e && !e.value) e.value = empEnProy(t.value.trim()); return; }
    if (t.dataset.pk) { if (!can('a_params')) { toast(NOPERM); return render(true); } S.params[t.dataset.pk] = Math.max(0, Number(t.value) || 0); commit(); return toast('Plazo actualizado'); }
    if (t.id === 'gproy') { ui.proy = t.value; return render(true); }
    if (t.id === 'actor') {
      const to = t.value, go = () => { S.actor = to; save(); render(true); };
      if (isAdmin(to) && S.adminPin && !adminSession()) return askPin('Entrar como ' + to, go, () => renderTop());
      return go();
    }
    if (t.id === 'file' && t.files[0]) { doImport(t.files[0]); t.value = ''; }
    if (t.id === 'evfile' && t.files[0]) { loadEvolta(t.files[0], ui.evOp); t.value = ''; }
    if (t.id === 'minfile' && t.files[0]) { loadMinuta(t.files[0], ui.minOp); t.value = ''; }
  });
  document.addEventListener('submit', (e) => {
        if (e.target.id === 'login-form') {
      e.preventDefault(); const f = e.target, em = $('#lg-e').value.trim(), pw = $('#lg-p').value, btn = f.querySelector('button[type=submit]');
      let msg = f.querySelector('.lg-err'); if (!msg) { msg = document.createElement('p'); msg.className = 'small lg-err'; msg.setAttribute('role', 'alert'); msg.style.cssText = 'margin:0;color:var(--red)'; btn.before(msg); }
      const fin = (txt) => { clearTimeout(lento); btn.disabled = false; btn.textContent = 'Entrar'; msg.textContent = txt || ''; if (txt) toast(txt); };
      const lento = setTimeout(() => { msg.textContent = 'Está tardando más de lo normal. Revisa tu conexión o si algún bloqueador/antivirus impide conectar con Google (Firebase).'; }, 12000);
      btn.disabled = true; btn.textContent = 'Entrando…'; msg.textContent = '';
      CL.signIn(em, pw).then(() => fin(''), x => fin(AUTH_ERR[x.code] || 'No se pudo entrar: ' + (x.code || x.message)));
      return;
    }
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
  /* ---- Cierre de sesión por inactividad (solo en modo nube) ----
     La última actividad se guarda en el navegador: así trabajar en cualquier pestaña mantiene abiertas todas. */
  const LAST_K = 'crm-mg-ultimo-uso', AVISO_MS = 60000;
  let idleMsg = '', ultimoRegistro = 0;
  const ultimaActividad = () => { try { return +localStorage.getItem(LAST_K) || Date.now(); } catch (e) { return Date.now(); } };
  function marcaActividad(forzar) {
    const now = Date.now(); if (!forzar && now - ultimoRegistro < 5000) return; // no escribir en cada movimiento del mouse
    ultimoRegistro = now; try { localStorage.setItem(LAST_K, String(now)); } catch (e) { }
    const av = $('#idle-aviso'); if (av) av.remove();
  }
  function revisarInactividad() {
    const min = +S.params.minInactivo || 0;
    if (!CL.enabled || cloudState !== 'ready' || !min) return;
    const resta = min * 60000 - (Date.now() - ultimaActividad());
    if (resta <= 0) { const av = $('#idle-aviso'); if (av) av.remove(); idleMsg = `Tu sesión se cerró tras ${min} minuto${min > 1 ? 's' : ''} sin uso. Vuelve a entrar.`; if ($('#dlg').open) $('#dlg').close(); return CL.signOut(); }
    if (resta <= Math.min(AVISO_MS, min * 30000)) { // aviso el último minuto (o la mitad del tiempo, si es muy corto)
      let av = $('#idle-aviso');
      if (!av) { av = document.createElement('div'); av.id = 'idle-aviso'; av.setAttribute('role', 'alertdialog'); document.body.appendChild(av); }
      av.innerHTML = `<b>⏱️ ¿Sigues ahí?</b><span>Por seguridad, tu sesión se cerrará en <b>${Math.ceil(resta / 1000)} s</b> por inactividad.</span><button class="btn pri" type="button" data-act="seguir">Seguir trabajando</button>`;
    }
  }
  ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(ev => document.addEventListener(ev, () => marcaActividad(), { passive: true, capture: true }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) revisarInactividad(); }); // al volver de otra ventana o de la suspensión
  setInterval(revisarInactividad, 1000);

  if (!CL.enabled) { bzLocal(); dvLocal(); }
  if (CL.enabled) { CL.onAuth((u) => { if (!u) { stopCloud(); cloudState = 'login'; render(); } else { marcaActividad(true); idleMsg = ''; startCloud(u.email); } }); render(); }
  else { render(); try { if (!localStorage.getItem('crm-mg-welcome')) setTimeout(showWelcome, 350); } catch (e) { } }
  window.__CRM = { get state() { return S; }, derived: () => D };
})();
