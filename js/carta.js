/* Carta notarial de resolución (cláusula sexta): toma los datos de la minuta y arma el Word
   con el mismo formato de las cartas del área (membrete, pie, márgenes y letra de plantillas/carta-notarial.docx).
   Todo ocurre en el navegador: la minuta no se sube a ningún servidor. */
(function () {
  'use strict';
  const PLANTILLA = 'plantillas/carta-notarial.docx?v=20261106b';
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
  const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const ent = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

  /* ---------- minuta en Word (.docx): texto plano con un salto por párrafo ---------- */
  function docxTexto(xml) { // solo el texto de <w:t> (algunos Word traen espacios y saltos entre etiquetas que no son texto)
    let out = ''; const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br[^>]*\/>|<\/w:p>|<\/w:tc>|<\/w:tr>/g; let m;
    while ((m = re.exec(xml))) out += m[1] !== undefined ? m[1] : m[0] === '<w:tab/>' ? '\t' : m[0] === '</w:tc>' ? ' ' : '\n';
    return ent(out);
  }
  async function leerDocx(buf) {
    const Z = await (await window.CLAUSULA.zipLib()).loadAsync(buf), f = Z.file('word/document.xml');
    if (!f) throw new Error('el archivo no es un Word válido');
    return docxTexto(await f.async('string'));
  }

  /* ---------- cláusula SEXTA de la minuta: causales (6.1), aviso y penalidad (6.2) ---------- */
  const STD = {
    intro: 'Las partes acuerdan que LA VENDEDORA podrá resolver de pleno derecho el presente contrato, de conformidad con lo establecido en el artículo 1430 del Código Civil, ante:',
    literales: ['El incumplimiento de la obligación por parte de EL COMPRADOR/LOS COMPRADORES de pagar el precio en los términos y condiciones indicadas en el numeral VI del Anexo I del presente contrato',
      'El incumplimiento de parte de EL COMPRADOR/LOS COMPRADORES en suscribir cualquier documento que sea requerido por LA VENDEDORA y/o la entidad financiera en el marco del préstamo hipotecario (incluyendo el contrato de préstamo, la escritura pública que este contrato origine, adendas aclaratorias al presente contrato, etc.)',
      'La pérdida de la calidad de sujeto a crédito de EL COMPRADOR/LOS COMPRADORES y/o su no cumplimiento de los requisitos establecidos por la Entidad Financiera para el otorgamiento del crédito hipotecario que impidan o demoren su desembolso',
      'El incumplimiento de parte de EL COMPRADOR/LOS COMPRADORES de cualquiera de las obligaciones establecidas en el contrato de préstamo a ser suscrito con la entidad financiera (de manera principal más no exclusiva, el pago de las cuotas mensuales del préstamo)'],
    aviso: 'Para que la resolución opere, bastará que LA VENDEDORA dirija una comunicación a EL COMPRADOR/LOS COMPRADORES manifestando que el contrato ha quedado resuelto en virtud de esta cláusula resolutoria expresa, la mencionada comunicación podrá realizarse por cualquier medio, incluyendo correo electrónico, WhatsApp u otra plataforma de mensajería instantánea.',
    penalidad: 'En caso de operar la resolución aquí descrita, EL COMPRADOR/LOS COMPRADORES deberán pagar la suma equivalente al 20% del precio de venta total de EL INMUEBLE/LOS INMUEBLES, en calidad de penalidad, quedando LA VENDEDORA autorizada a retener los importes abonados por EL COMPRADOR/LOS COMPRADORES a efectos de hacerse cobro de la penalidad.',
    resuelto: 'Resuelto el contrato, LA VENDEDORA queda facultada para vender EL INMUEBLE/LOS INMUEBLES a terceros y, en general, para disponer de éstas según convenga a sus intereses.'
  };
  function leerSexta(text) {
    const F = flat(text).replace(/\s+([,;.])/g, '$1');
    const i = F.search(/SEXTA\s*:?\s*RESOLUCI[OÓ]N/i); if (i < 0) return null;
    const S = F.slice(i, i + 9000);
    const i61 = S.search(/6\.1\.?\s/), i62 = S.search(/6\.2\.?\s/), i63 = S.search(/6\.3\.?\s|S[EÉ]PTIM[AO]\s*:/i);
    if (i61 < 0 || i62 < 0) return null;
    const s61 = S.slice(i61, i62).replace(/^6\.1\.?\s*/, ''), s62 = S.slice(i62, i63 > i62 ? i63 : undefined).replace(/^6\.2\.?\s*/, '');
    const k = s61.search(/\bante\s*:/i); if (k < 0) return null;
    const intro = s61.slice(0, k).trim() + ' ante:';
    let resto = s61.slice(k).replace(/^ante\s*:\s*/i, '');
    const ia = resto.search(/Para que la resoluci[oó]n opere/i);
    let aviso = ''; if (ia >= 0) { aviso = resto.slice(ia).replace(/(instant[aá]nea\.).*$/i, '$1').trim(); resto = resto.slice(0, ia); }
    resto = resto.replace(/\s*Por la falta de pago[^.]*\.\s*$/i, '').trim();
    const literales = resto.split(/;\s*y\s*\/\s*o\s*,?\s*/i).map(s => s.replace(/^[a-dA-D]\)\s*/, '').replace(/[;.\s]+$/, '').trim()).filter(s => s.length > 20);
    const penalidad = (/^(.*?penalidad\.)/i.exec(s62) || [])[1] || '';
    const resuelto = (/(Resuelto el contrato,.*?intereses\.)/i.exec(s62) || [])[1] || '';
    if (!literales.length) return null;
    // la minuta dice "La mencionada comunicación" en una oración aparte: se une como en las cartas del área
    return { intro, literales, aviso: aviso.replace(/expresa\.\s*La mencionada/i, 'expresa, la mencionada') || STD.aviso, penalidad: penalidad || STD.penalidad, resuelto: resuelto || STD.resuelto };
  }

  /* ---------- nombres: "Nombres Apellidos" → "APELLIDOS, NOMBRES" ---------- */
  function apellidoNombre(n) {
    const w = flat(n).toUpperCase().split(' ').filter(Boolean); if (w.length < 2) return w.join(' ');
    if (/,/.test(n)) return flat(n).toUpperCase();
    const k = w.length >= 4 ? 2 : w.length === 3 ? 1 : 1; // 4+ palabras: 2 apellidos; 3: se asume 1 apellido (revisar)
    return `${w.slice(-k).join(' ')}, ${w.slice(0, -k).join(' ')}`;
  }
  const pegado = (n) => flat(n).split(' ').some(x => x.length >= 13); // "CARIDADESCALONA": falta un espacio en la minuta
  const direccion = (s) => flat(s).replace(/\s+,/g, ',').replace(/provincia de ([^,]+?) y departamento de \1\b/i, 'provincia y departamento de $1').replace(/\.?$/, '.');
  const inmueble = (m) => flat(String(m.inmuebles || '').replace(/Dpto\.\s*N\.º/g, 'Departamento N°').replace(/N\.º/g, 'N°'));

  /* datos iniciales para la ventana de revisión */
  function borrador(m, extra) {
    const R = m.resolucion || null, cs = (m.compradores || []).map(c => ({ nombre: apellidoNombre(c.nombre), doc: c.doc || 'DNI', num: c.dni || '', aviso: pegado(c.nombre) }));
    return {
      compradores: cs.length ? cs : [{ nombre: '', doc: 'DNI', num: '' }],
      direccion: direccion((m.compradores && m.compradores[0] && m.compradores[0].domicilio) || ''),
      fechaContrato: m.fechaMinuta || '', inmueble: inmueble(m), edificio: flat(m.proyecto),
      dirProyecto: extra.dirProyecto || '', empresa: flat((m.vendedora && m.vendedora.razon) || '').replace(/S\.A\.C\.?$/i, 'SAC'),
      fecha: extra.hoy, ciudad: 'Lima', firma: extra.firma || '', cargo: extra.cargo || 'Gerente General',
      literales: (R ? R.literales : STD.literales), marcadas: [], penalidad: true,
      textos: R || STD, deMinuta: !!R
    };
  }

  /* ---------- Word ---------- */
  const xe = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const RPR = (o = {}) => `<w:rPr><w:rFonts w:asciiTheme="${o.major ? 'majorHAnsi' : 'minorHAnsi'}" w:hAnsiTheme="${o.major ? 'majorHAnsi' : 'minorHAnsi'}" w:cstheme="${o.major ? 'majorHAnsi' : 'minorHAnsi'}"/>${o.b ? '<w:b/><w:bCs/>' : ''}${o.i ? '<w:i/><w:iCs/>' : ''}${o.u ? '<w:u w:val="single"/>' : ''}<w:sz w:val="${o.sz || 24}"/><w:szCs w:val="${o.sz || 24}"/><w:lang w:val="es-PE"/></w:rPr>`;
  const run = (t, o) => `<w:r>${RPR(o)}<w:t xml:space="preserve">${xe(t)}</w:t></w:r>`;
  // en las citas del contrato, los términos definidos van en negrita (como en las cartas del área)
  const TERM = /(LA VENDEDORA|EL COMPRADOR\/LOS COMPRADORES|EL INMUEBLE\/LOS INMUEBLES)/, ES_TERM = /^(LA VENDEDORA|EL COMPRADOR\/LOS COMPRADORES|EL INMUEBLE\/LOS INMUEBLES)$/;
  const cita = (t, o = {}) => String(t).split(TERM).filter(Boolean).map(x => run(x, { ...o, i: true, b: ES_TERM.test(x) })).join('');
  const P = (inner, o = {}) => `<w:p><w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}<w:spacing w:after="0" w:line="276" w:lineRule="auto"/>${o.ind || ''}<w:jc w:val="${o.jc || 'both'}"/></w:pPr>${inner || ''}</w:p>`;
  const BL = P('');
  function fechaLarga(iso) { if (!iso) return '____ de ________ del ____'; const [y, m, d] = iso.split('-'); return `${d} de ${MESES[+m - 1]} del ${y}`; }
  function fechaContrato(iso) { if (!iso) return '____ de ________ del año ____'; const [y, m, d] = iso.split('-'); return `${+d} de ${MESES[+m - 1]} del año ${y}`; }

  function cuerpo(d) {
    const varios = d.compradores.length > 1, T = d.textos, L = d.marcadas.map(i => ({ letra: 'ABCD'[i], txt: d.literales[i] }));
    const trato = varios ? 'Sres.:' : (d.trato || 'Sr.:'), ud = varios ? 'Ustedes' : 'Usted', han = varios ? 'han' : 'ha', com = varios ? 'les' : 'le';
    const x = [P(run('CARTA NOTARIAL', { b: true, u: true, sz: 28, major: true }), { jc: 'center' }), BL,
      P(run(`${d.ciudad || 'Lima'}, ${fechaLarga(d.fecha)}.`)), BL,
      P(run(trato, { b: true })),
      ...d.compradores.map(c => P(run(`${flat(c.nombre).toUpperCase()} (${c.doc === 'CE' ? 'CE' : 'DNI'} N° ${flat(c.num)})`, { b: true }))), BL,
      P(run(`Dirección de notificación: ${flat(d.direccion)}`, { b: true })), BL,
      P(run('De nuestra consideración:')), BL,
      P(run(`Por intermedio de la presente, en cumplimiento del numeral 6.1 de la Sexta Cláusula del Contrato de Compraventa de Bien Futuro, ${com} comunico por esta vía notarial que, en mérito de la citada cláusula, `)
        + run('ha quedado resuelto el Contrato', { u: true })
        + run(` suscrito el día ${fechaContrato(d.fechaContrato)}, por la Compraventa de Bien Futuro del ${flat(d.inmueble)} del Edificio Multifamiliar${d.edificio ? ` denominado “${flat(d.edificio)}”` : ''}, ubicado en ${flat(d.dirProyecto).replace(/\.$/, '')}, toda vez que ${ud} ${han} incumplido ${L.length > 1 ? 'las siguientes causales' : 'la siguiente causal'} del referido contrato:`)), BL,
      P(run('“', { i: true }) + run('SEXTA: RESOLUCIÓN', { b: true, i: true })),
      P(cita('6.1. ' + T.intro), { ind: '<w:ind w:left="567" w:hanging="567"/>' }), BL,
      ...L.map((l, k) => P(cita(`${l.letra})\t${l.txt}${k < L.length - 1 ? '; y/o,' : '”'}`), { ind: '<w:ind w:left="1134" w:hanging="567"/>' })), BL,
      P(run('Asimismo, la citada cláusula prevé expresamente que:')), BL,
      P(cita('“' + T.aviso + '”'), { ind: '<w:ind w:left="708"/>' }), BL,
      P(run('En consecuencia, la resolución contractual se entiende válidamente producida con la recepción de la presente comunicación.')), BL];
    if (d.penalidad) x.push(
      P(run('Adicionalmente, señalamos que, ante la resolución producida, el numeral 6.2 del contrato suscrito precisa la consecuente penalidad, en los siguientes términos:')), BL,
      P(cita('“6.2.\t' + T.penalidad), { ind: '<w:ind w:left="567" w:hanging="567"/>' }), BL,
      P(cita(T.resuelto + '”'), { ind: '<w:ind w:left="567"/>' }), BL,
      P(run('Es pertinente señalar que, en la ejecución del contrato, la empresa ha incurrido en diversos costos financieros, gastos administrativos, operativos, legales y comerciales, directamente vinculados al proceso de compraventa.')), BL);
    x.push(P(run('Sin otro particular, requerimos su inmediata atención.')), BL,
      P(run(`Quedamos de ${ud},`)), BL, BL, BL,
      P(run('_________________________'), { jc: 'center' }), P(run(flat(d.firma)), { jc: 'center' }), P(run(flat(d.cargo)), { jc: 'center' }));
    return x.join('');
  }

  async function docx(d) {
    const res = await fetch(PLANTILLA); if (!res.ok) throw new Error('no se encontró la plantilla de la carta');
    const Z = await (await window.CLAUSULA.zipLib()).loadAsync(await res.arrayBuffer());
    const doc = await Z.file('word/document.xml').async('string');
    Z.file('word/document.xml', doc.replace('{{CUERPO}}', () => cuerpo(d)));
    const h = Z.file('word/header1.xml'); if (h) Z.file('word/header1.xml', (await h.async('string')).split('{{EMPRESA}}').join(xe(d.empresa || '')));
    return Z.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  const nombreArchivo = (d) => `${d.compradores.map(c => `${flat(c.nombre).toUpperCase()} (${c.doc === 'CE' ? 'CE' : 'DNI'} N° ${flat(c.num)})`).join(' ')} - ${flat(d.edificio).toUpperCase().replace(/^EDIFICIO\s+/, '')} - ${flat(d.inmueble).replace(/^Departamento N°\s*/i, '')} - CARTA NOTARIAL.docx`.replace(/[\\/:*?"<>|]/g, '');

  window.CARTA = { docxTexto, leerDocx, leerSexta, apellidoNombre, pegado, borrador, cuerpo, docx, nombreArchivo, fechaLarga, STD };
})();
