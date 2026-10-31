/* Constancia de cierre de etapa: etiqueta PDF tamaño A6 (105 × 148 mm, la mitad de un A5)
   que deja evidencia de que la persona asignada culminó su función. */
(function () {
  'use strict';
  const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  let loading = null;
  const lib = () => loading || (loading = new Promise((ok, ko) => {
    if (window.jspdf) return ok(window.jspdf);
    const s = document.createElement('script'); s.src = JSPDF; s.onload = () => ok(window.jspdf);
    s.onerror = () => { loading = null; ko(new Error('no se pudo cargar el generador de PDF (revisa tu conexión a internet)')); };
    document.head.appendChild(s);
  }));
  const rgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

  /* c = { stage: { n, name, color }, cliente, id, dni, proyecto, unidad, responsable, fechaCulm,
           checks: [{ label, done }], datos: [[etiqueta, valor]], firma: { por, cuando, rol }, vb: { por, cuando, rol },
           codigo, generado, por } */
  const W = 105, M = 7, FOOT = 32;
  // alto según el contenido: mínimo A6 (148 mm), máximo 200 mm (siempre menor que un A5 de 148 × 210)
  async function pdf(c) {
    const { jsPDF } = await lib();
    const H = Math.max(148, Math.min(200, Math.ceil(body(new jsPDF({ unit: 'mm', format: [W, 400] }), c) + FOOT)));
    const doc = new jsPDF({ unit: 'mm', format: [W, H] });
    body(doc, c); footer(doc, c, H);
    return doc.output('blob');
  }
  function body(doc, c) {
    const col = rgb(c.stage.color), ok = c.checks.every(x => x.done), pend = c.checks.filter(x => !x.done).length;
    let y = 0;

    // cabecera con el color de la etapa
    doc.setFillColor(...col); doc.rect(0, 0, W, 17, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.text('GRUPO MG · CONSTANCIA DE CIERRE DE ETAPA', M, 6);
    doc.setFontSize(13); doc.text(`Etapa ${c.stage.n} · ${c.stage.name}`, M, 13);
    y = 21;

    // sello de estado
    doc.setFillColor(...(ok ? [29, 122, 77] : [147, 95, 0])); doc.roundedRect(M, y, W - 2 * M, 8, 1.5, 1.5, 'F');
    doc.setFontSize(9); doc.text(ok ? 'CULMINADO CONFORME' : `CULMINADO CON OBSERVACIONES (${pend} pendiente${pend > 1 ? 's' : ''})`, W / 2, y + 5.4, { align: 'center' });
    y += 12;

    // cliente
    doc.setTextColor(20); doc.setFontSize(10.5);
    doc.splitTextToSize(c.cliente || '—', W - 2 * M).forEach(l => { doc.text(l, M, y); y += 4.6; });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(70);
    doc.text(`${c.id} · DNI ${c.dni || '—'} · ${[c.proyecto, c.unidad].filter(Boolean).join(' ') || '—'}`, M, y); y += 5;
    doc.setDrawColor(210); doc.line(M, y, W - M, y); y += 4.5;

    const kv = (k, v) => {
      doc.setFont('helvetica', 'bold'); doc.setTextColor(70); const kl = doc.splitTextToSize(k, 32); kl.forEach((l, i) => doc.text(l, M, y + i * 3.2));
      doc.setFont('helvetica', 'normal'); doc.setTextColor(20); const vl = doc.splitTextToSize(String(v ?? '—'), W - 2 * M - 34); vl.forEach((l, i) => doc.text(l, M + 34, y + i * 3.2));
      y += Math.max(kl.length, vl.length) * 3.2 + 0.8;
    };
    doc.setFontSize(7.5); kv('Responsable', c.responsable); kv('Fecha de culminación', c.fechaCulm);

    // verificaciones (mini checklist)
    y += 2; doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...col); doc.text('VERIFICACIONES', M, y); y += 3.5;
    doc.setFontSize(7.3);
    c.checks.forEach(x => {
      const lines = doc.splitTextToSize(x.label, W - 2 * M - 6);
      doc.setDrawColor(...(x.done ? [29, 122, 77] : [184, 50, 31])); doc.setLineWidth(0.3); doc.rect(M, y - 2.4, 2.8, 2.8);
      if (x.done) { doc.setLineWidth(0.5); doc.line(M + 0.5, y - 1, M + 1.2, y - 0.1); doc.line(M + 1.2, y - 0.1, M + 2.5, y - 2.1); }
      else { doc.setLineWidth(0.4); doc.line(M + 0.6, y - 1.8, M + 2.2, y - 0.2); doc.line(M + 2.2, y - 1.8, M + 0.6, y - 0.2); }
      doc.setLineWidth(0.2); doc.setFont('helvetica', 'normal'); doc.setTextColor(...(x.done ? [20, 20, 20] : [184, 50, 31]));
      lines.forEach((l, i) => doc.text(l, M + 4.5, y + i * 3.3)); y += lines.length * 3.3 + 0.9;
    });

    // datos clave de la etapa
    if (c.datos.length) {
      y += 1.5; doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...col); doc.text('DATOS VERIFICADOS', M, y); y += 3.5; doc.setFontSize(7.3);
      c.datos.forEach(([k, v]) => kv(k, v));
    }
    return y;
  }

  // pie: firmas, código y fecha
  function footer(doc, c, H) {
    // cada firma: quién, fecha y hora en que firmó en el CRM, y la línea para la firma a mano
    const fy = H - 30, BW = 42;
    const firma = (x, titulo, f, pie) => {
      const cx = x + BW / 2;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(5.8); doc.setTextColor(110); doc.text(titulo, cx, fy + 2.5, { align: 'center' });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(20); doc.text(doc.splitTextToSize((f && f.por) || '—', BW)[0], cx, fy + 6, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.3); doc.setTextColor(50); doc.text(f && f.cuando ? f.cuando : '', cx, fy + 9, { align: 'center' });
      if (f && f.rol) { doc.setFontSize(5.5); doc.setTextColor(110); doc.splitTextToSize(f.rol, BW).slice(0, 2).forEach((l, i) => doc.text(l, cx, fy + 11.6 + i * 2.2, { align: 'center' })); }
      doc.setDrawColor(120); doc.setLineWidth(0.2); doc.line(x, fy + 16, x + BW, fy + 16);
      doc.setFontSize(6.3); doc.setTextColor(70); doc.text(pie, cx, fy + 19, { align: 'center' });
    };
    firma(M, 'FIRMADO POR', c.firma, 'Firma del responsable');
    firma(W - M - BW, 'V°B° OTORGADO POR', c.vb, 'V°B° Jefatura');
    doc.setFillColor(242, 242, 238); doc.rect(0, H - 9, W, 9, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(40); doc.text(`Código: ${c.codigo}`, M, H - 3.6);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.3); doc.text(`Generado ${c.generado} · ${c.por}`, W - M, H - 3.6, { align: 'right' });
  }

  // código corto y estable para identificar la constancia (no es una firma digital)
  function codigo(parts) {
    let h = 2166136261; const s = parts.join('|');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36).toUpperCase().padStart(7, '0');
  }

  window.CONSTANCIA = { pdf, codigo };
})();
