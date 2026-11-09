/* Devolución de venta: arma el formato "DEVOLUCIÓN DE VENTA" (A4) con los datos del cliente y la cuenta,
   y el respaldo mensual en ZIP (formatos, capturas del correo de solicitud y Excel). Todo ocurre en el navegador. */
(function () {
  'use strict';
  const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  const JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  const cargar = (url, sri, glob, que) => new Promise((ok, ko) => {
    if (window[glob]) return ok(window[glob]);
    const s = document.createElement('script'); s.src = url; s.integrity = sri; s.crossOrigin = 'anonymous';
    s.onload = () => ok(window[glob]); s.onerror = () => ko(new Error('no se pudo cargar el ' + que + ' (revisa tu conexión a internet)'));
    document.head.appendChild(s);
  });
  const pdfLib = () => cargar(JSPDF, 'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk', 'jspdf', 'generador de PDF');
  const zipLib = () => cargar(JSZIP, 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG', 'JSZip', 'generador de ZIP');

  const soles = (n) => (n === '' || n == null || isNaN(Number(n))) ? '' : 'S/ ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dmy = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (s || ''); };
  const nombreArchivo = (d) => `${d.codigo || 'DEV'} ${String(d.cliente || '').replace(/[\\/:*?"<>|]+/g, ' ').trim()}`.slice(0, 80);

  // logo simple de la empresa (no hay archivo de logo): recuadro con "MG" y "GRUPO MG"
  function logo(doc, x, y) {
    doc.setDrawColor(34, 24, 28); doc.setFillColor(255, 255, 255); doc.setLineWidth(0.6);
    doc.roundedRect(x + 9, y + 2.5, 11, 11, 2, 2, 'S');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(34, 24, 28); doc.text('MG', x + 14.5, y + 10, { align: 'center' });
    doc.setFontSize(5.5); doc.text('GRUPO MG', x + 14.5, y + 16.5, { align: 'center' });
  }

  /* d = { codigo, proyecto, distrito, unidad, cliente, dni, conyuge, dniConyuge, domicilio, telefono, email, centroLaboral,
           precioDpto, precioTotal, empresa, importe, fProgramada, autorizadaPor, banco, tipoCuenta, cuenta, cci, titularCuenta, motivo } */
  async function pdf(d, opts) {
    const { jsPDF } = await pdfLib();
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const L = 22, R = 188, W = R - L, ink = [34, 24, 28];
    doc.setTextColor(...ink); doc.setDrawColor(...ink);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('DEVOLUCIÓN DE VENTA', 105, 24, { align: 'center' });

    // tabla de datos del cliente
    let y = 32; const c1 = 52, rowH = 6.4;
    doc.setLineWidth(0.3); doc.rect(L, y, 29, 19); doc.rect(L + 29, y, W - 58, 19); doc.rect(R - 29, y, 29, 19);
    logo(doc, L, y); logo(doc, R - 29, y);
    doc.setFontSize(10); doc.text('DATOS CLIENTE', 105, y + 11, { align: 'center' });
    y += 19;
    const filas = [['Proyecto / Edificio', d.proyecto], ['Distrito', d.distrito], ['Departamento Nº', d.unidad], ['Cliente (Titular)', d.cliente], ['DNI Nº', d.dni],
      ['Cónyuge', d.conyuge], ['DNI Nº', d.dniConyuge], ['Domicilio Fiscal', d.domicilio], ['Teléfono/Celular', d.telefono], ['Correo Electrónico', d.email],
      ['Centro Laboral', d.centroLaboral], ['Precio Departamento', soles(d.precioDpto)], ['PRECIO TOTAL', soles(d.precioTotal)]];
    filas.forEach(([k, v], i) => {
      doc.rect(L, y, c1, rowH); doc.rect(L + c1, y, W - c1, rowH);
      doc.setFont('helvetica', i === filas.length - 1 ? 'bold' : 'normal'); doc.setFontSize(8.5); doc.text(k, L + 1.5, y + 4.4);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(doc.splitTextToSize(String(v || ''), W - c1 - 3)[0] || '', L + c1 + 2, y + 4.4);
      y += rowH;
    });

    // datos de la devolución
    y += 12;
    const linea = (k, v, size) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(size || 12); doc.text(k, L, y); const w = doc.getTextWidth(k + ' '); doc.setFont('helvetica', 'normal'); doc.text(doc.splitTextToSize(String(v || ''), W - w)[0] || '', L + w, y); y += 8; };
    const varias = (k, v, size) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(size); doc.text(k, L, y); const w = doc.getTextWidth(k + ' '); doc.setFont('helvetica', 'normal');
      const ls = doc.splitTextToSize(String(v || ''), W - w).slice(0, 4); ls.forEach((l, i) => doc.text(l, L + w, y + i * 5)); y += Math.max(1, ls.length) * 5 + 3; };
    const pen = Number(d.penalidad) > 0;
    linea('EMPRESA:', d.empresa);
    if (pen) { linea('PENALIDAD APLICADA AL CLIENTE:', soles(d.penalidad)); if (d.motivoPenalidad) varias('Motivo de la penalidad:', d.motivoPenalidad, 10); }
    linea('IMPORTE A DEVOLVER:', soles(d.importe)); linea('FECHA PROGRAMADA DE DEVOLUCIÓN:', dmy(d.fProgramada)); linea('AUTORIZADA POR:', d.autorizadaPor);
    if (d.estado === 'Programada' || d.estado === 'Devuelta') linea('DERIVADA A CONTABILIDAD:', dmy(d.fDerivada) || 'Sí', 10.5);
    if (d.motivo) linea('MOTIVO:', d.motivo, 10.5);
    if (d.obs) varias('OBSERVACIONES:', d.obs, 10);

    y += 8;
    linea(`Cuenta ${(d.tipoCuenta || 'de ahorros soles').replace(/^cuenta\s+/i, '')} Banco ${d.banco || ''}:`, d.cuenta);
    linea('CCI:', d.cci); linea('Titular de la cuenta:', d.titularCuenta);

    // espacio para el sello de recibido y la firma
    y = Math.max(y + 14, 238);
    doc.setLineWidth(0.3); doc.setDrawColor(150, 140, 135);
    doc.line(L, y + 22, L + 70, y + 22); doc.line(R - 70, y + 22, R, y + 22);
    doc.setFontSize(8.5); doc.setTextColor(90, 74, 80); doc.text('Sello de recibido', L + 35, y + 27, { align: 'center' }); doc.text('Firma y fecha', R - 35, y + 27, { align: 'center' });
    doc.setFontSize(7.5); doc.text(`${d.codigo || ''}  ·  Generado en el CRM de Contratos y Cobranzas${opts && opts.por ? ' por ' + opts.por : ''} el ${new Date().toLocaleString('es-PE')}`, 105, 290, { align: 'center' });
    return doc;
  }
  async function descargar(d, opts) { (await pdf(d, opts)).save(nombreArchivo(d) + '.pdf'); }

  const blobDe = (dataUrl) => { const [h, b] = String(dataUrl).split(','); const bin = atob(b); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: (/data:([^;]+)/.exec(h) || [])[1] || 'image/jpeg' }); };

  /* respaldo del mes: una carpeta por devolución (formato PDF + capturas) y un Excel con todas */
  async function zipMes(lista, mes, excelBuf, opts) {
    const JSZip = await zipLib(), z = new JSZip(), raiz = z.folder('Devoluciones ' + mes);
    for (const d of lista) {
      const f = raiz.folder(nombreArchivo(d));
      f.file('Formato devolucion.pdf', (await pdf(d, opts)).output('arraybuffer'));
      if (d.solicitud) f.file('Correo de solicitud.jpg', blobDe(d.solicitud));
      if (d.voucher) f.file('Constancia de transferencia.jpg', blobDe(d.voucher));
    }
    if (excelBuf) raiz.file(`Devoluciones ${mes}.xlsx`, excelBuf);
    const blob = await z.generateAsync({ type: 'blob' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Respaldo devoluciones ${mes}.zip`; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  /* lee el correo de solicitud (texto de la captura) y saca los datos que suele traer */
  function leerCorreo(t) {
    const s = String(t || ''), r = {};
    const m = (re) => { const x = re.exec(s); return x ? x[1].trim() : ''; };
    const dig = (v) => v.replace(/\D/g, '');
    r.cci = dig(m(/CCI\s*[:;]?\s*([\d\s-]{18,30})/i));
    r.cuenta = dig(m(/cuenta[^:\n]{0,40}?:\s*([\d\s-]{8,24})/i));
    r.titularCuenta = m(/titular de la cuenta\s*[:;]?\s*([^\n]+)/i).replace(/[.;,]+$/, '');
    const num = (v) => Number(String(v).replace(/,/g, ''));
    const pe = /([^\n.]*?(?:penalidad|descuento|retenci[oó]n|se descontar)[^\n]*?S\/\.?\s*([\d.,]+\d)[^\n.]*)/i.exec(s);
    if (pe) { r.penalidad = num(pe[2]); r.motivoPenalidad = pe[1].replace(/\s+/g, ' ').trim().slice(0, 200); }
    const dv = m(/devol[^\n]{0,60}?S\/\.?\s*([\d.,]+\d)/i), todos = [...s.matchAll(/S\/\.?\s*([\d.,]+\d)/gi)].map(x => num(x[1]));
    const imp = dv && !(pe && num(dv) === r.penalidad) ? num(dv) : todos.find(v => !pe || v !== r.penalidad); if (imp) r.importe = imp;
    r.dni = m(/DNI\s*N?[º°o]?\s*[:;]?\s*(\d{8})\b/i);
    const b = m(/banco\s+(BCP|BBVA|Interbank|Scotiabank|BanBif|Pichincha|de la Naci[oó]n|Continental|Falabella|Ripley|GNB)/i); if (b) r.banco = /naci/i.test(b) ? 'Banco de la Nación' : b.toUpperCase() === 'CONTINENTAL' ? 'BBVA' : b.length <= 4 ? b.toUpperCase() : b;
    const tc = /cuenta\s+(?:de\s+)?(ahorros?|corriente)\s*(?:en\s+)?(soles|d[oó]lares)?/i.exec(s);
    if (tc) r.tipoCuenta = 'de ' + (/corr/i.test(tc[1]) ? 'corriente' : 'ahorros') + ' ' + (tc[2] && /^d/i.test(tc[2]) ? 'dólares' : 'soles');
    r.unidad = m(/(?:departamento|dpto\.?)\s*N?[º°o]?\s*[:;]?\s*(\d{2,5})/i);
    r.proyecto = m(/proyecto\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ ]{2,30}?)(?:[,.]| a nombre)/);
    const f = /fecha\s*:\s*(\d{4})-(\d{2})-(\d{2})/i.exec(s); if (f) r.fSolicitud = `${f[1]}-${f[2]}-${f[3]}`;
    const lib = /liberada[^\n]*?(\d{2})\/(\d{2})\/(\d{4})/i.exec(s); if (lib) r.fLiberacion = `${lib[3]}-${lib[2]}-${lib[1]}`;
    const cli = /a nombre de\s+([^,\n]+,\s*[^,\n]+?),?\s+(?:con\s+)?DNI/i.exec(s); if (cli) r.cliente = cli[1].replace(/\s+/g, ' ').trim().toUpperCase();
    r.solicitadoPor = m(/De\s*:\s*<?([\w.+-]+@[\w.-]+)>?/i);
    if (/desistimiento|renuncia/i.test(s) && /separaci/i.test(s)) r.motivo = 'Desistimiento de separación';
    Object.keys(r).forEach(k => { if (r[k] === '' || r[k] == null || (typeof r[k] === 'number' && isNaN(r[k]))) delete r[k]; });
    if (r.cci && r.cci.length !== 20) delete r.cci; // un CCI siempre tiene 20 dígitos
    return r;
  }

  window.DEVOLUCION = { pdf, descargar, zipMes, leerCorreo, soles };
})();
