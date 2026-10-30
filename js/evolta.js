/* Lector del "Estado de cuenta" (ficha de cliente) que se descarga del CRM Evolta.
   Todo ocurre en el navegador: el PDF no se sube a ningún servidor. */
(function () {
  'use strict';
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  let loading = null;
  const lib = () => loading || (loading = new Promise((ok, ko) => {
    if (window.pdfjsLib) return ok(window.pdfjsLib);
    const s = document.createElement('script'); s.src = PDFJS + 'pdf.min.js';
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; ok(window.pdfjsLib); };
    s.onerror = () => { loading = null; ko(new Error('no se pudo cargar el lector de PDF (revisa tu conexión a internet)')); };
    document.head.appendChild(s);
  }));

  /* ---------- PDF -> filas de celdas (texto agrupado por altura, ordenado de izquierda a derecha) ---------- */
  async function readLines(buf) {
    const pdf = await (await lib()).getDocument({ data: buf }).promise, out = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const items = (await (await pdf.getPage(p)).getTextContent()).items
        .map(i => ({ x: i.transform[4], y: i.transform[5], s: i.str.trim() })).filter(i => i.s)
        .sort((a, b) => b.y - a.y || a.x - b.x);
      let row = null;
      items.forEach(i => { if (row && Math.abs(row.y - i.y) <= 2) row.c.push(i); else out.push((row = { y: i.y, c: [i] })); });
    }
    return out.map(r => r.c.sort((a, b) => a.x - b.x).map(c => c.s));
  }

  /* ---------- utilidades ---------- */
  const isAmt = (s) => /^-?[\d,]+\.\d{2}$/.test(s || '');
  const amt = (s) => Number(String(s).replace(/,/g, ''));
  const dmy = (s) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s || ''); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };
  const sum = (a) => a.reduce((t, x) => t + x, 0);
  const BANKS = [[/interbank/i, 'INTERBANK'], [/cr[eé]dito del per|^bcp\b/i, 'BCP'], [/continental|bbva/i, 'BBVA'], [/scotiabank/i, 'SCOTIABANK'], [/banbif|interamericano/i, 'BANBIF'], [/pichincha/i, 'PICHINCHA'], [/gnb/i, 'GNB']];
  const bankName = (s) => { for (const [re, n] of BANKS) if (re.test(s)) return n; return String(s).toUpperCase(); };
  const UNIT = { DEPARTAMENTO: 'DPTO', ESTACIONAMIENTO: 'EST', DEPOSITO: 'DEP', 'DEPÓSITO': 'DEP' };
  const UNIT_RE = /^(DEPARTAMENTO|ESTACIONAMIENTO|DEP[OÓ]SITO|CASA|LOTE|LOCAL|OFICINA|TIENDA|D[UÚ]PLEX|PENTHOUSE)/i;

  function parse(L) {
    const up = (r) => r.join(' ').toUpperCase();
    const find = (re, from = 0) => { for (let i = from; i < L.length; i++) if (re.test(up(L[i]))) return i; return -1; };
    const after = (label) => { for (let j = 0; j < L.length; j++) { const i = L[j].findIndex(c => c.toUpperCase() === label); if (i >= 0 && L[j][i + 1]) return { v: L[j][i + 1], j }; } return { v: '', j: -1 }; };
    if (find(/ESTADO DE CUENTA/) < 0 || find(/DATOS DEL TITULAR/) < 0) throw new Error('no parece un estado de cuenta de Evolta');
    const between = (a, b, fn) => { const out = []; if (a < 0) return out; const end = b < 0 ? L.length : b; for (let i = a + 1; i < end; i++) { const x = fn(L[i], out); if (x) out.push(x); } return out; };

    const r = {};
    r.cliente = after('NOMBRES APELLIDOS').v; r.dni = after('DNI').v; r.email = after('E-MAIL').v; r.proyecto = after('PROYECTO').v;
    const tel = after('TELF. / CEL.'); r.telefono = tel.v;
    if (tel.j >= 0 && L[tel.j + 1] && L[tel.j + 1].length === 1 && /^\d+$/.test(L[tel.j + 1][0])) r.telefono += L[tel.j + 1][0]; // número partido en dos líneas
    r.consulta = dmy(after('FECHA DE CONSULTA:').v);
    const ej = L.find(x => /^EJE?CUTIVO DE VENTAS/i.test(x[0] || '')); r.vendedor = ej ? ej.slice(1).join(' ') : '';

    r.inmuebles = L.filter(x => UNIT_RE.test(x[0]) && isAmt(x[x.length - 1])).map(x => ({ tipo: x[0].toUpperCase(), nro: x[1] || '', area: x.find(c => /m2/i.test(c)) || '', monto: amt(x[x.length - 1]) }));

    const iFp = find(/PRECIO Y FORMA DE PAGO/), iCr = find(/CRONOGRAMA DE PAGOS/), iPr = find(/PAGOS REGISTRADOS/), iPct = find(/PAGADO\s*\/\s*POR PAGAR/);
    const numbered = (x) => /^\d+$/.test(x[0] || '');
    r.formaPago = between(iFp, iCr, x => numbered(x) && isAmt(x[2]) && { motivo: x[1], monto: amt(x[2]), pct: x[3] || '' });
    const head = iCr >= 0 ? L[iCr].slice(1).filter(c => c !== '/') : [];
    r.modalidad = head[0] || ''; r.entidad = head[1] || '';
    r.cronograma = between(iCr, iPr, x => {
      if (!numbered(x) || !isAmt(x[2])) return null;
      const estado = /CANCELAD|PENDIENTE|VENCID|PARCIAL/i.test(x[x.length - 1]) ? x[x.length - 1].toUpperCase() : '';
      return { concepto: x[1], monto: amt(x[2]), fProg: dmy(x[4]), fPago: dmy(x[5]), estado };
    });
    r.pagos = between(iPr, iPct, (x, out) => {
      if (numbered(x) && dmy(x[1])) return { fecha: dmy(x[1]), monto: amt(x[2]), forma: x[3] || '', operacion: x[4] || '', entidad: x.slice(5).join(' ') };
      const last = out[out.length - 1]; if (last && x.length === 1 && !/TOTAL/i.test(x[0])) last.entidad += ' ' + x[0]; // nombre del banco partido en dos líneas
      return null;
    });
    const m = L.find(x => x[0] === 'MONTO' && x[2] === 'MONTO'); r.pagado = m ? amt(m[1]) : null; r.porPagar = m ? amt(m[3]) : null;
    return r;
  }

  /* ---------- estado de cuenta -> campos del CRM ---------- */
  function toFields(r) {
    const f = {}, put = (k, v) => { if (v !== '' && v != null && !(typeof v === 'number' && isNaN(v))) f[k] = v; };
    const by = (re) => r.formaPago.filter(x => re.test(x.motivo)).map(x => x.monto);
    put('cliente', r.cliente.toUpperCase()); put('dni', r.dni); put('email', r.email.toLowerCase()); put('telefono', r.telefono);
    put('proyecto', r.proyecto.toUpperCase()); put('vendedor', r.vendedor.toUpperCase());
    put('unidad', r.inmuebles.map(u => `${UNIT[u.tipo] || u.tipo} ${u.nro}`.trim()).join(' + '));
    if (r.entidad) put('banco', bankName(r.entidad));
    if (r.formaPago.length) {
      put('precio', sum(r.formaPago.map(x => x.monto)));
      const fin = by(/saldo|financ/i), bono = by(/bono|bbp|techo/i);
      if (fin.length) put('montoBanco', sum(fin)); if (bono.length) put('bono', sum(bono));
    }
    const ini = r.cronograma.filter(x => /inicial/i.test(x.concepto));
    if (ini.length) {
      const falta = sum(ini.filter(x => !/CANCELAD/.test(x.estado)).map(x => x.monto));
      put('cob_porRecibir', falta);
      if (falta === 0) put('cob_fCulm', ini.map(x => x.fPago).filter(Boolean).sort().pop());
    }
    return f;
  }

  async function fromPdf(buf) {
    const r = parse(await readLines(buf));
    const info = { consulta: r.consulta, modalidad: r.modalidad, entidad: r.entidad, inmuebles: r.inmuebles, formaPago: r.formaPago, cronograma: r.cronograma, pagos: r.pagos, pagado: r.pagado, porPagar: r.porPagar };
    return { fields: toFields(r), info };
  }

  window.EVOLTA = { fromPdf, parse, toFields };
})();
