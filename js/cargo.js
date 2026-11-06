/* Cargos de entrega de documentos: lectura y validación del DNI (anverso y reverso) y formato imprimible.
   Todo ocurre en el navegador: las fotos del DNI se leen y se descartan, no se guardan en ningún lado. */
(function () {
  'use strict';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

  /* ---------- DNI ---------- */
  // reduce la foto (máx. 2000 px) y, si se pide, recorta la franja inferior donde están las líneas del reverso
  async function canvasDe(file, franja) {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const y0 = franja ? Math.round(h * 0.45) : 0, c = document.createElement('canvas'); c.width = w; c.height = h - y0;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, -y0, w, h);
    return c;
  }
  let worker = null;
  async function mrzWorker() { // lector solo con los caracteres del reverso: A-Z, 0-9 y <
    if (worker) return worker;
    const T = await window.EVOLTA.tess(); // Tesseract: lector gratuito que corre en el navegador
    const w = await T.createWorker('eng');
    await w.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<' });
    return (worker = w);
  }
  // dígito de control de las líneas del reverso (norma OACI 9303): pesos 7, 3, 1
  const valor = (ch) => ch === '<' ? 0 : /\d/.test(ch) ? +ch : ch.charCodeAt(0) - 55;
  const control = (s) => String([...s].reduce((t, ch, i) => t + valor(ch) * [7, 3, 1][i % 3], 0) % 10);
  const aDig = (s) => s.replace(/O/g, '0').replace(/[IL]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2');
  const fecha6 = (s, futuro) => { if (!/^\d{6}$/.test(s)) return ''; let y = +s.slice(0, 2); y += futuro ? 2000 : (y > +String(new Date().getFullYear()).slice(2) ? 1900 : 2000); return `${y}-${s.slice(2, 4)}-${s.slice(4, 6)}`; };

  // lee las tres líneas del reverso
  function leerMrz(texto) {
    // el lector a veces confunde el relleno "<" con L, K o C: por eso no se exige que haya "<" en cada línea
    const L = String(texto).toUpperCase().replace(/[«‹]/g, '<<').split(/\n/).map(l => l.replace(/\s+/g, '').replace(/[^A-Z0-9<]/g, '')).filter(l => l.length >= 20);
    const i1 = L.findIndex(l => /^[I1L][<A-Z]?PER/.test(l) || /PER\d{7,}/.test(l)); if (i1 < 0) return null;
    const l1 = L[i1], l2 = L[i1 + 1] || '';
    const l3 = (L[i1 + 2] || '').replace(/<[<LKC]*$/, '').replace(/([A-Z])[LKC]{3,}$/, '$1'); // quita el relleno del final
    const p = l1.indexOf('PER'), campo = aDig(l1.slice(p + 3, p + 12)), cd = aDig(l1.charAt(p + 12));
    const dni = (/\d{8}/.exec(campo) || [])[0] || ''; if (!dni) return null;
    const ok1 = /\d/.test(cd) && control(campo) === cd;
    const z2 = aDig(l2.slice(0, 15)), nac = z2.slice(0, 6), cad = z2.slice(8, 14);
    const okCad = /^\d{6}$/.test(cad) && control(cad) === z2.charAt(14);
    const limpio = (s) => s.split('<').filter(x => x && !/^[LKC]{2,}$/.test(x)); // fuera los trozos de relleno mal leído
    const partes = l3.replace(/^<+|<+$/g, '').split(/<<+/), ape = limpio(partes[0] || ''), nom = limpio(partes.slice(1).join('<'));
    return { dni, control: ok1, nacimiento: fecha6(nac), caduca: /^[<LKC]{6}$/.test(l2.slice(8, 14)) ? 'no' : fecha6(cad, true), caducaOk: okCad, sexo: z2.charAt(7),
      apellidos: ape.join(' '), nombres: nom.join(' '), nombre: [nom.join(' '), ape.join(' ')].filter(Boolean).join(' ') };
  }

  /* Valida un DNI con sus dos caras. frente y reverso son archivos de imagen (el frente es opcional).
     buscar(dni) devuelve el cliente del CRM con ese DNI, o null. */
  async function validar(frente, reverso, buscar, progreso) {
    const out = { checks: [], ok: false };
    progreso && progreso('Leyendo el reverso…');
    const w = await mrzWorker();
    let m = leerMrz((await w.recognize(await canvasDe(reverso, true))).data.text);
    if (!m) m = leerMrz((await w.recognize(await canvasDe(reverso, false))).data.text);
    if (!m) throw new Error('No se pudieron leer las líneas del reverso. Toma la foto de frente, con buena luz y sin reflejos, que se vean completas las 3 líneas de abajo.');
    Object.assign(out, m);
    const C = (ok, txt, nivel) => out.checks.push({ ok, txt, nivel: ok ? 'ok' : (nivel || 'aviso') });
    // anverso: el número y los nombres deben ser los mismos que en el reverso
    if (frente) {
      progreso && progreso('Leyendo el anverso…');
      const t = fold(await window.EVOLTA.ocr(await canvasDe(frente, false))), digs = t.replace(/[OI]/g, x => x === 'O' ? '0' : '1');
      const nums = digs.match(/\d{8}/g) || [];
      C(nums.includes(m.dni), nums.includes(m.dni) ? `N° de DNI igual en ambas caras: <b>${m.dni}</b>` : `No se encontró el N° ${m.dni} en el anverso${nums.length ? ` (se leyó ${nums[0]})` : ''}: revisa que sea el mismo DNI`);
      // un "<" leído como L o K puede quedar pegado al inicio de un nombre ("LCARLOS"): si el anverso dice "CARLOS", se corrige
      const fix = (x) => !t.includes(x) && /^[LKC]/.test(x) && x.length > 3 && t.includes(x.slice(1)) ? x.slice(1) : x;
      m.apellidos = m.apellidos.split(' ').map(fix).join(' '); m.nombres = m.nombres.split(' ').map(fix).join(' ');
      m.nombre = out.nombre = [m.nombres, m.apellidos].filter(Boolean).join(' '); out.apellidos = m.apellidos; out.nombres = m.nombres;
      const tok = fold(m.nombre).split(' ').filter(x => x.length > 1), hall = tok.filter(x => t.includes(x));
      const okN = tok.length && hall.length / tok.length >= 0.75;
      C(okN, okN ? `Nombres y apellidos coinciden: ${esc(m.nombre)}` : `Los nombres del anverso no coinciden con el reverso (${esc(m.nombre)}): revisa las fotos`);
    } else C(false, 'Falta la foto del anverso: no se pudo comparar con el reverso');
    C(m.control, m.control ? 'Código de control del reverso correcto (se leyó bien)' : 'El código de control no cuadra: puede haber un número mal leído, revísalo');
    const hoy = new Date().toISOString().slice(0, 10);
    if (m.caduca === 'no') C(true, 'DNI sin fecha de caducidad');
    else if (m.caduca && m.caducaOk) C(m.caduca >= hoy, m.caduca >= hoy ? `DNI vigente hasta ${m.caduca.split('-').reverse().join('/')}` : `DNI vencido el ${m.caduca.split('-').reverse().join('/')}: revisar`);
    else C(false, 'No se pudo leer la fecha de caducidad');
    out.cliente = buscar ? buscar(m.dni) : null;
    out.checks.push({ ok: true, nivel: out.cliente ? 'ok' : 'info', txt: out.cliente ? `Es cliente del CRM: ${esc(out.cliente.cliente)} · ${esc([out.cliente.proyecto, out.cliente.unidad].filter(Boolean).join(' '))}` : 'No es cliente del CRM' });
    out.ok = out.checks.every(c => c.nivel !== 'aviso');
    return out;
  }

  /* ---------- formato imprimible ---------- */
  const DEST = { notaria: 'Notaría', banco: 'Banco', propietario: 'Propietario o tercero autorizado' };
  function html(c, o) {
    const linea = (v) => v ? esc(v) : '';
    const fRec = c.rec && c.rec.fecha ? c.rec.fecha.split('-').reverse().join(' / ') : `____ / ____ / ${new Date().getFullYear()}`;
    const una = (copia, sub) => `<section class="cg">
      <div class="hd"><div class="lg">MG</div><h1>CARGO ENTREGA DE DOCUMENTOS</h1><div class="cp">${copia}<small>${sub}</small></div></div>
      <div class="kv"><b>NOTARÍA Y/O BANCO:</b><span>${linea(c.dest)}</span><b>ABOGADO O ASESOR DE BANCO:</b><span>${linea(c.abogado)}</span><b>BANCO:</b><span>${linea(c.banco)}</span></div>
      <p>Por medio de la presente se adjunta los siguientes documentos:</p>
      <table><thead><tr><th>ITEM</th><th>PROYECTO</th><th>DPTO / EST / DEPO</th><th>PROPIETARIO</th></tr></thead><tbody>
      ${(c.items.length ? c.items : [{}]).map((x, i) => `<tr><td>${i + 1}</td><td>${linea(x.proyecto)}</td><td>${linea(x.unidad)}</td><td>${linea(x.propietario)}</td></tr>`).join('')}</tbody></table>
      <div class="ent"><b>SE HACE CONSTAR LA ENTREGA DE:</b><ul>${c.docs.filter(d => d.t).map(d => `<li>${esc(String(d.n || '').trim())} ${esc(d.t).toUpperCase()}</li>`).join('')}</ul>${c.obs ? `<p class="obs">Obs.: ${esc(c.obs)}</p>` : ''}</div>
      <div class="rec">
        <div><b style="font-size:10.5px">RECIBIDO POR:</b><div class="l"><b>NOMBRES Y APELLIDOS:</b><span>${linea(c.rec && c.rec.nombre)}</span><b>DNI:</b><span>${linea(c.rec && c.rec.dni)}${c.rec && c.rec.rel && c.rec.nombre ? ' · ' + esc(c.rec.rel) : ''}</span><b>FECHA:</b><span>${fRec} &nbsp;&nbsp; HORA: ______</span></div>
          <div class="nota">** DNI cuando es para el propietario o tercero autorizado</div></div>
        <div class="fi"><div>FIRMA Y SELLO</div></div>
      </div>
      <div class="pie"><span>Entregado por: ${esc(o.por)} · Área de Contratos y Cobranzas · Grupo MG</span><span>Código ${esc(c.codigo)} · ${esc(o.fecha)}</span></div>
    </section>`;
    const dos = c.formato !== 1 && c.items.length <= 6 && c.docs.length <= 6; // si no entra en media hoja, va una por hoja
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cargo ${esc(c.codigo)} · ${esc(c.dest || DEST[c.tipo] || '')}</title><style>
      @page{size:A4 portrait;margin:0}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{margin:0;background:#888;font:11.5px/1.35 Arial,Helvetica,sans-serif;color:#111}
      .hoja{width:210mm;min-height:297mm;margin:10px auto;background:#fff;display:flex;flex-direction:column;page-break-after:always}
      .cg{${dos ? 'height:148.4mm' : 'min-height:297mm'};padding:9mm 14mm 7mm;display:flex;flex-direction:column;overflow:hidden}
      .corte{border-top:1px dashed #999;position:relative;height:0}.corte span{position:absolute;left:50%;top:-8px;transform:translateX(-50%);background:#fff;padding:0 8px;font-size:9px;color:#888}
      .hd{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0f6f6a;padding-bottom:4px;gap:10px}
      .lg{width:30px;height:30px;border-radius:7px;background:#0f6f6a;color:#fff;display:grid;place-items:center;font-weight:700;font-size:11px}
      .hd h1{font-size:15px;margin:0;letter-spacing:.04em;text-align:center;flex:1}
      .cp{font-size:9px;font-weight:700;padding:3px 8px;border:1.5px solid #0f6f6a;color:#0f6f6a;border-radius:4px;text-align:center}.cp small{display:block;font-weight:400;color:#555}
      .kv{margin:7px 0 0;display:grid;grid-template-columns:auto 1fr;gap:3px 10px}.kv b{white-space:nowrap}.kv span{border-bottom:1px solid #bbb;min-height:14px}
      p{margin:7px 0 4px}.obs{font-size:10.5px}
      table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #333;padding:3px 6px;text-align:left}th{background:#e8f1ef;font-size:10px}
      td:first-child,th:first-child{width:28px;text-align:center}
      .ent{margin:6px 0 0}.ent b{display:block;margin-bottom:2px}.ent li{margin:1px 0}ul{margin:0;padding-left:16px}
      .rec{margin-top:auto;padding-top:8px;display:grid;grid-template-columns:1.3fr 1fr;gap:16px;align-items:end}
      .rec .l{display:grid;grid-template-columns:auto 1fr;gap:7px 8px;font-size:10.5px;margin-top:5px}.rec .l span{border-bottom:1px solid #333;min-height:13px}
      .fi{text-align:center;font-size:10px}.fi div{border-top:1px solid #333;margin-top:30px;padding-top:2px}
      .nota{font-size:9px;color:#555;margin-top:3px}
      .pie{display:flex;justify-content:space-between;gap:10px;font-size:8.5px;color:#666;margin-top:6px;border-top:1px solid #ddd;padding-top:3px}
      @media print{body{background:#fff}.hoja{margin:0}}
    </style></head><body>
    ${dos ? `<div class="hoja">${una('ORIGINAL', 'para quien recibe')}<div class="corte"><span>✂ cortar aquí</span></div>${una('CARGO', 'vuelve firmado al área')}</div>`
      : `<div class="hoja">${una('ORIGINAL', 'para quien recibe')}</div><div class="hoja">${una('CARGO', 'vuelve firmado al área')}</div>`}
    </body></html>`;
  }
  // se imprime desde un marco oculto en la misma página: no depende de que el navegador permita ventanas emergentes
  function imprimir(c, o) {
    const old = document.getElementById('cg-print'); if (old) old.remove();
    const f = document.createElement('iframe'); f.id = 'cg-print'; f.title = 'Cargo para imprimir';
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    const d = f.contentWindow.document; d.open(); d.write(html(c, o)); d.close();
    setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); }, 400);
  }

  window.CARGO = { validar, leerMrz, control, imprimir, html, DEST };
})();
