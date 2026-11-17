/* Cláusula adicional de aclaración y ratificación: lee la minuta (pre-minuta) que exporta Evolta
   y arma el Word con el formato de la empresa. Todo ocurre en el navegador. */
(function () {
  'use strict';
  const JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  let zipLoading = null;
  const zipLib = () => zipLoading || (zipLoading = new Promise((ok, ko) => {
    if (window.JSZip) return ok(window.JSZip);
    const s = document.createElement('script'); s.src = JSZIP; s.integrity = 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG'; s.crossOrigin = 'anonymous';
    s.onload = () => ok(window.JSZip); s.onerror = () => { zipLoading = null; ko(new Error('no se pudo cargar el generador de Word (revisa tu conexión a internet)')); };
    document.head.appendChild(s);
  }));

  /* ---------- fechas y montos en letras ---------- */
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
  const fechaLarga = (iso) => { if (!iso) return '____ de ________ del ____'; const [y, m, d] = iso.split('-'); return `${d} de ${MESES[+m - 1]} del ${y}`; };
  const isoDeTexto = (s) => {
    const m = /(\d{1,2})\s+de\s+([a-záéíóú]+)\s+del?\s+(\d{4})/i.exec(s || ''); if (!m) return '';
    let mi = MESES.indexOf(m[2].toLowerCase()); if (mi < 0 && /^sept/i.test(m[2])) mi = 8; if (mi < 0) return '';
    return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  };
  const U = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
  const D = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const C = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
  function cientos(n) { // 0..999
    if (n === 100) return 'CIEN';
    const c = Math.floor(n / 100), r = n % 100;
    const dec = r < 30 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' Y ' + U[r % 10] : '');
    return [C[c], dec].filter(Boolean).join(' ');
  }
  const apocope = (s) => s.replace(/VEINTIUNO$/, 'VEINTIÚN').replace(/UNO$/, 'UN'); // "un mil", "veintiún mil", "un millón"
  function letras(n) {
    n = Math.floor(n); if (n === 0) return 'CERO';
    const mill = Math.floor(n / 1e6), miles = Math.floor((n % 1e6) / 1000), resto = n % 1000, out = [];
    if (mill) out.push(mill === 1 ? 'UN MILLÓN' : apocope(cientos(mill)) + ' MILLONES');
    if (miles) out.push(miles === 1 ? 'UN MIL' : apocope(cientos(miles)) + ' MIL');
    if (resto) out.push(cientos(resto));
    return out.join(' ');
  }
  // bien futuro: "Y 00/100 SOLES" y "S/." · bien inmueble (terminado): "CON 00/100 SOLES" y "S/"
  const montoLetras = (n, con) => { const cent = Math.round((n - Math.floor(n)) * 100); return `${letras(n)} ${con ? 'CON' : 'Y'} ${String(cent).padStart(2, '0')}/100 SOLES`; };
  const montoNum = (n, sinPunto) => (sinPunto ? 'S/ ' : 'S/. ') + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* ---------- lectura de la minuta (Anexo I) ---------- */
  const amt = (s) => Number(String(s).replace(/,/g, ''));
  const flat = (s) => s.replace(/\s+/g, ' ').trim();
  function parseMinuta(text) {
    const ini = text.search(/ANEXO I\s*\n\s*(?:I\.\s*)?Informaci[oó]n/i); // en la minuta en Word el "I." es numeración automática
    if (ini < 0) throw new Error('no se encontró el Anexo I de la minuta');
    const fin = text.indexOf('ANEXO II', ini), A = text.slice(ini, fin < 0 ? undefined : fin), F = flat(A);
    const get = (re, s = F) => { const m = re.exec(s); return m ? flat(m[1]) : ''; };
    const between = (a, b) => { const i = F.search(a); if (i < 0) return ''; const r = F.slice(i); const j = r.slice(1).search(b); return j < 0 ? r : r.slice(0, j + 1); };

    const rep = /Apoderado\s*:\s*(.+?)\s*DNI\s*:\s*(\d+)/i.exec(F) || [];
    const vendedora = { razon: get(/Raz[oó]n Social\s*:\s*(.+?)\s*-?\s*Domicilio/i), domicilio: get(/Domicilio\s*:\s*(.+?)\s*-?\s*RUC/i), ruc: get(/RUC\s*:\s*(\d+)/i),
      partida: get(/Inscripci[oó]n\s*:\s*PE\s*N[°º]?\s*(\d+)/i), rep: flat(rep[1] || ''), repDni: rep[2] || '', repCargo: 'Gerente' };

    const compradores = between(/III\.\s*Informaci[oó]n de EL COMPRADOR/i, /IV\.\s*Bien/i).split(/o Nombre del comprador\s*:/i).slice(1).map(b => ({
      trat: '', nombre: get(/^(.+?)\s*o (?:DNI|Carn[eé]t?)/i, b.trim()), dni: get(/(?:DNI|Extranjer[ií]a)\s*:\s*(\d+)/i, b), doc: /Carn[eé]t? de Extranjer/i.test(b) ? 'CE' : 'DNI', ec: get(/Estado civil\s*:\s*(.+?)\s*o Direcci/i, b),
      domicilio: get(/Direcci[oó]n\s*:\s*(.+?)\s*o Ocupaci/i, b), nac: 'peruana' }));

    const IV = A.slice(Math.max(0, A.search(/IV\.\s*Bien/i)), A.search(/\n\s*V\.\s*Precio/i) > 0 ? A.search(/\n\s*V\.\s*Precio/i) : undefined);
    const ABR = { departamento: 'Dpto.', estacionamiento: 'Estacionamiento', 'depósito': 'Depósito', deposito: 'Depósito' };
    const bienes = [...IV.matchAll(/^\s*[A-Z]\.\s*(Departamento|Estacionamiento|Dep[oó]sito|Casa|Lote|Local|Oficina|Tienda)\s*N[°º]?\s*([\w-]+)/gim)]
      .map(m => `${ABR[m[1].toLowerCase()] || m[1]} N.º ${m[2]}`);
    const inmuebles = bienes.length > 1 ? bienes.slice(0, -1).join(', ') + ' y ' + bienes[bienes.length - 1] : (bienes[0] || '');

    // Forma de pago: "1. S/. 100,000.00 (CIEN MIL…) texto" y sub-pagos "- S/. 10,000.00 (…) texto"
    const fpNum = get(/\b([IVX]+)\.\s*Forma de Pago/i);
    let FP = between(/\b[IVX]+\.\s*Forma de Pago/i, /\b[IVX]+\.\s*Fecha de entrega/i).replace(/^.*?Forma de Pago\s*/i, '');
    FP = FP.split(/Conforme a lo estipulado/i)[0];
    const items = [], re = /(?:(\d+)\.|-)\s+S\/\.?\s*([\d,]+\.\d{2})\s*\([^)]*\)\s*/g; let m, prev = null;
    while ((m = re.exec(FP))) {
      if (prev) prev.obj.texto = flat(FP.slice(prev.end, m.index));
      const obj = { monto: amt(m[2]), texto: '' };
      if (m[1] || !items.length) { obj.sub = []; items.push(obj); } else items[items.length - 1].sub.push(obj);
      prev = { obj, end: re.lastIndex };
    }
    if (prev) prev.obj.texto = flat(FP.slice(prev.end));
    if (!items.length) { // respaldo: montos al inicio de cada línea de la sección (numeración automática de Word)
      const iFP = A.search(/Forma de Pago/i), fFP = A.search(/\b[IVX]+\.\s*Fecha de entrega|\n\s*Fecha de entrega/i);
      const RAW = iFP < 0 ? '' : A.slice(iFP, fFP > iFP ? fFP : undefined).replace(/^.*?Forma de Pago[^\n]*\n?/i, '').split(/Conforme a lo estipulado/i)[0];
      const re2 = /^[ \t]*(?:(\d+)[.)][ \t]*|([-–•·▪o])[ \t]+)?S\/\.?[ \t]*([\d,]+(?:\.\d{1,2})?)[ \t]*\([^)]*\)[ \t]*/gm; let k, pv = null;
      while ((k = re2.exec(RAW))) {
        if (pv) pv.obj.texto = flat(RAW.slice(pv.end, k.index));
        const obj = { monto: amt(k[3]), texto: '' };
        if (k[2] && items.length) items[items.length - 1].sub.push(obj); else { obj.sub = []; items.push(obj); }
        pv = { obj, end: re2.lastIndex };
      }
      if (pv) pv.obj.texto = flat(RAW.slice(pv.end));
    }

    const seccion = (a, b) => { const i = A.search(a); if (i < 0) return ''; const r = A.slice(i).replace(/^[^\n]*\n/, ''); const j = r.search(b); return (j < 0 ? r : r.slice(0, j)).split('\n').map(x => flat(x)).filter(Boolean).join('\n'); };
    items.forEach(it => { it.k = tipoDe(it.texto, it.sub); (it.sub || []).forEach(x => { x.k = tipoDe(x.texto); x.fecha = fechaDe(x.texto); }); it.fecha = fechaDe(it.texto); });
    return {
      infoTxt: seccion(/\bII\.\s*Informaci[oó]n del Proyecto/i, /\n\s*(?:III\.\s*)?Informaci[oó]n de EL COMPRADOR/i),
      bienTxt: seccion(/\bIV\.\s*Bien/i, /\n\s*(?:V\.\s*)?Precio/i),
      vendedora, compradores, inmuebles, proyecto: get(/denominado\s*[“"](.+?)[”"]/i),
      precio: amt(get(/es de S\/\.?\s*([\d,]+\.\d{2})/i) || 0),
      areaOcupada: get(/[ÁA]rea Ocupada aproximada\s*:\s*([\d.,]+)/i), areaTechada: get(/[ÁA]rea Techada aproximada\s*:\s*([\d.,]+)/i), // para el acta de entrega
      fechaMinuta: isoDeTexto(get(/Fecha de celebraci[oó]n del Contrato\s*(.{0,40})/i)) || isoDeTexto(get(/\bLima,\s*(\d{1,2}\s+de\s+\S+\s+del?\s+\d{4})/i, flat(text))),
      dirLote: get(/propietari[oa] del (?:Lote|inmueble)[^,;]*?ubicad[oa] en\s*(.+?)[,;]\s*cuyos antecedentes/i),
      resolucion: window.CARTA ? window.CARTA.leerSexta(text) : null, // texto exacto de la cláusula sexta, para la carta notarial
      pago: { incluir: true, num: fpNum || 'VI', items },
      entrega: { incluir: true, num: get(/\b([IVX]+)\.\s*Fecha de entrega/i) || 'VII', fecha: isoDeTexto(get(/Fecha de entrega[^.]*?ser[aá] el\s*(.{0,40})/i)) }
    };
  }

  /* ---------- empresas y formatos ---------- */
  // Datos fijos de cada empresa (RUC y partida son públicos en SUNAT/SUNARP). El tipo indica el formato:
  // "futuro" = contrato de bien futuro (Anexo I, punto VI) · "inmueble" = bien terminado (Cláusula Cuarta).
  const COMUN = { domicilio: 'Av. Javier Prado Este N° 1540-1542, Distrito de San Isidro, Provincia y Departamento de Lima', rep: 'VICTOR MAX GUEVARA OTINIANO', repDni: '10179629', repCargo: 'Gerente', registro: 'del Registro de Personas Jurídicas de Lima' };
  const EMPRESAS = [
    { razon: 'MG PROYECTO 22 S.A.C.', ruc: '20610893679', partida: '15264689', tipo: 'futuro', proy: /dulanto|liberta/i },
    { razon: 'MG PROYECTO 23 S.A.C.', ruc: '20611409614', partida: '15359217', tipo: 'futuro', proy: /centrium/i },
    { razon: 'MG PROYECTO 24 S.A.C.', ruc: '20612273929', partida: '15563602', tipo: 'futuro', proy: /huiracocha/i },
    { razon: 'MG VIDA S.A.C.', ruc: '20600743750', partida: '13503256', tipo: 'inmueble', proy: /vista verde/i },
    { razon: 'MG VILLA S.A.C.', ruc: '20606189282', partida: '14493092', tipo: 'inmueble', proy: /alborada/i, registro: 'Zona Registral IX – Registro de persona jurídica Sede Lima – Oficina Registral de Lima,' }
  ].map(e => ({ ...COMUN, ...e }));
  const nrm = (x) => String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  function empresaDe(o) { // por RUC, por razón social o por el nombre del proyecto
    return EMPRESAS.find(e => o.ruc && e.ruc === String(o.ruc).trim()) || EMPRESAS.find(e => o.razon && nrm(o.razon) && nrm(e.razon).startsWith(nrm(o.razon).replace(/SAC$/, ''))) || EMPRESAS.find(e => e.proy.test(o.proyecto || '')) || null;
  }
  const vendedoraDe = (e) => ({ razon: e.razon, ruc: e.ruc, domicilio: e.domicilio, rep: e.rep, repDni: e.repDni, repCargo: e.repCargo, partida: e.partida, registro: e.registro });

  /* ---------- textos modelo de cada pago (tomados de las cláusulas firmadas) ---------- */
  const TIPOS_ITEM = [['ini', 'Cuota inicial (en varios pagos)'], ['sal', 'Saldo con crédito hipotecario'], ['dir', 'Pago con fecha'], ['otro', 'Texto libre']];
  const TIPOS_SUB = [['sep', 'Separación (ya pagada)'], ['dep', 'Depósito ya pagado'], ['fut', 'Pago pendiente (con fecha)'], ['bbp', 'Bono del Buen Pagador (BBP)'], ['otro', 'Texto libre']];
  const CON_FECHA = ['sal', 'dir', 'fut'];
  const DEP = 'que fueron depositados mediante una transferencia bancaria LA VENDEDORA le otorga plenos efectos cancelatorios y declara que no tiene nada que reclamar con respecto a esta cantidad.';
  const DEP_B = 'que fueron depositados mediante transferencia bancaria proveniente de recursos propios del comprador. Por el presente acto, LA VENDEDORA le otorga plenos efectos cancelatorios y declara que no tiene nada que reclamar con respecto a esta cantidad.';
  const fechaDe = (t) => isoDeTexto((/a m[aá]s tardar (?:el )?(\d{1,2} de [a-záéíóú]+ del? \d{4})/i.exec(t || '') || [])[1]);
  function tipoDe(t, sub) {
    t = t || ''; if (sub) return 'ini';
    if (/separaci[oó]n/i.test(t)) return 'sep';
    if (/bono|BBP/i.test(t)) return 'bbp';
    if (/desembolso|cr[eé]dito hipotecario/i.test(t)) return 'sal';
    if (/fueron depositad/i.test(t)) return 'dep';
    if (/ser[aá]n? (?:depositad|cancelad)/i.test(t)) return 'fut';
    return 'otro';
  }
  const rolDe = (cs) => cs.length > 1 ? 'LOS COMPRADORES' : (cs[0] && cs[0].trat === 'Sra.' ? 'LA COMPRADORA' : 'EL COMPRADOR');
  function textoModelo(k, d, row) {
    const B = d.tipo === 'inmueble', rol = rolDe(d.compradores || []), cr = d.credito || {};
    const fe = 'a más tardar el ' + (row.fecha ? fechaLarga(row.fecha) : '____ de ________ del ____');
    const bco = cr.banco || '________';
    switch (k) {
      case 'ini': return B ? `que serán cancelados por ${rol} de la siguiente manera:` : 'por concepto de cuota inicial, suma que será cancelada de la manera siguiente:';
      case 'sep': return B ? DEP_B : 'que fueron depositados mediante una transferencia bancaria por concepto de separación, con la firma puesta de ambas partes, LA VENDEDORA le otorga plenos efectos cancelatorios y declara que no tiene nada que reclamar con respecto a esta cantidad.';
      case 'dep': return B ? DEP_B : DEP;
      case 'fut': return `que serán depositados mediante ${B ? '' : 'una '}transferencia bancaria ${fe}.`;
      case 'dir': return `que será cancelado por ${rol} mediante transferencia bancaria ${fe}, asimismo, LA VENDEDORA le otorga plenos efectos cancelatorios.`;
      case 'bbp': return `, correspondientes al Bono Integrador del Buen Pagador (BBP) para vivienda Sostenible, que complementa la cuota inicial, otorgado por el Fondo Mivivienda S.A., a través del ${cr.bbpBanco || bco}, cuya entrega se hará efectiva al momento de la suscripción de la escritura pública que la presente minuta origine mediante cheque de gerencia y/u otro medio de pago, sin mayor constancia de entrega que la firma de las partes puestas en el mencionado instrumento público.`;
      case 'sal': return B
        ? `, que será cancelado por ${rol} mediante desembolso del crédito hipotecario otorgado por el ${bco}; que será pagado mediante cheque no negociable que el ${bco}, girará por instrucción de ambas partes a nombre de ${(d.vendedora || {}).razon || '________'} / ${cr.promotor || '________'}, en forma conjunta, a la firma de la escritura pública, ${fe}, para que sea abonado en la cuenta Crediobra N.º ${cr.cuenta || '________'}, que servirá para cumplir con la condición del levantamiento de hipoteca del inmueble. Asimismo, LA VENDEDORA le otorga plenos efectos cancelatorios.`
        : `, que será cancelado por EL COMPRADOR/ LOS COMPRADORES mediante desembolso del crédito Hipotecario Otorgado por la entidad financiera ${fe}, mediante cheque de gerencia y/u otro medio de pago a la firma de la escritura pública, asimismo, LA VENDEDORA le otorga plenos efectos cancelatorios.`;
    }
    return row.texto || '';
  }
  // vuelve a escribir el texto de los pagos que siguen un modelo (no toca los de "Texto libre")
  function rehacerTextos(d) {
    (d.pago.items || []).forEach(it => { if (it.k && it.k !== 'otro') it.texto = textoModelo(it.k, d, it); (it.sub || []).forEach(x => { if (x.k && x.k !== 'otro') x.texto = textoModelo(x.k, d, x); }); });
  }
  // completa un borrador guardado con versiones anteriores del CRM
  function normalizar(d) {
    d.tipo = d.tipo || 'futuro'; d.credito = d.credito || {}; d.info = d.info || { incluir: false, num: 'II', texto: '' }; d.bien = d.bien || { incluir: false, num: 'IV', texto: '' };
    d.reserva = d.reserva || { incluir: false, clausula: 'Quinta' }; d.poder = d.poder || { incluir: false, banco: '' }; d.antecedentes = d.antecedentes || [];
    d.vendedora = d.vendedora || {}; if (!d.vendedora.registro) d.vendedora.registro = COMUN.registro;
    (d.pago.items || []).forEach(it => { if (!it.k) it.k = tipoDe(it.texto, it.sub && it.sub.length); if (it.fecha === undefined) it.fecha = fechaDe(it.texto); (it.sub || []).forEach(x => { if (!x.k) x.k = tipoDe(x.texto); if (x.fecha === undefined) x.fecha = fechaDe(x.texto); }); });
    return d;
  }

  /* ---------- texto de la cláusula ---------- */
  const fem = (c) => c.trat === 'Sra.';
  const ecTxt = (c) => { const e = (c.ec || '').toLowerCase().replace(/\(a\)|\(o\)/g, ''); const base = e.replace(/[oa]$/, ''); const r = /casad|solter|viud|divorciad/.test(e) ? base + (fem(c) ? 'a' : 'o') : e; return r ? r[0].toUpperCase() + r.slice(1) : r; };
  const idTxt = (c) => `${c.trat === 'Sra.' ? 'la Sra.' : 'el Sr.'} ${c.nombre.toUpperCase()}, identificad${fem(c) ? 'a' : 'o'} con ${c.doc === 'CE' ? 'Carné de Extranjería' : 'DNI'} N.º ${c.dni}`;
  function partesCompradores(cs) {
    const cap = (s) => s[0].toUpperCase() + s.slice(1);
    const nac = (c) => c.nac || 'peruana';
    let txt;
    if (cs.length === 2 && cs.every(c => /casad/i.test(c.ec)) && flat(cs[0].domicilio) === flat(cs[1].domicilio))
      txt = `${cap(idTxt(cs[0]))}, ${fem(cs[0]) ? 'casada' : 'casado'} con ${idTxt(cs[1])}, ${fem(cs[0]) && fem(cs[1]) ? 'ambas' : 'ambos'} de nacionalidad ${nac(cs[0])} con domicilio en ${cs[0].domicilio}`;
    else txt = cs.map((c, i) => `${i ? idTxt(c) : cap(idTxt(c))}, de nacionalidad ${nac(c)}, de estado civil ${ecTxt(c)}, con domicilio en ${c.domicilio}`).join('; y ');
    const rol = rolDe(cs);
    return { txt: txt + (cs.length === 1 ? `, a quien en adelante se le denominará ${rol}; y de la otra parte:` : ', a quienes en adelante se les denominarán LOS COMPRADORES; y de la otra parte:'), rol: `“${rol}”` };
  }

  /* ---------- Word (OOXML) ---------- */
  const xe = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const RPR = (o = {}) => `<w:rPr><w:rFonts w:ascii="Verdana" w:hAnsi="Verdana" w:cs="Arial"/>${o.b ? '<w:b/>' : ''}${o.u ? '<w:u w:val="single"/>' : ''}<w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="es-PE"/></w:rPr>`;
  // texto con **negrita**
  const runs = (s, o = {}) => String(s).split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(t => { const b = /^\*\*.*\*\*$/.test(t); return `<w:r>${RPR({ ...o, b: o.b || b })}${xe(b ? t.slice(2, -2) : t).split('\t').map(x => `<w:t xml:space="preserve">${x}</w:t>`).join('<w:tab/>')}</w:r>`; }).join('');
  const P = (s, o = {}) => `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>${o.ind ? `<w:ind w:left="${o.ind}" w:hanging="${o.hang || 0}"/>` : ''}<w:jc w:val="${o.jc || 'both'}"/></w:pPr>${s ? runs(s, o) : ''}</w:p>`;
  const BL = P('');

  function bodyXml(d) {
    normalizar(d);
    const B = d.tipo === 'inmueble', fm = fechaLarga(d.fechaMinuta), V = d.vendedora, cs = partesCompradores(d.compradores);
    const contrato = B ? 'contrato de bien inmueble' : 'contrato de bien futuro';
    const vend = `**${V.razon}** con RUC Nº ${V.ruc}, con domicilio en ${V.domicilio}, debidamente representada por su ${V.repCargo || 'Gerente'} el Señor **${(V.rep || '').toUpperCase()}**, identificado con DNI Nº ${V.repDni}, con poderes inscritos en la Partida Electrónica N° ${V.partida} ${V.registro || COMUN.registro} a quien en adelante se le denominará **LA VENDEDORA**:`.replace(/,, /g, ', ');
    const empresa = `${V.razon}, con RUC ${V.ruc}`;
    const parrafos = (t) => String(t || '').split(/\n+/).map(x => x.trim()).filter(Boolean).flatMap(x => [P(x), BL]);
    const ubic = d.ubicacion ? `, inmueble ubicado en ${d.ubicacion}` : ` del Proyecto ${B ? '' : 'inmobiliario denominado '}“${d.proyecto}”`;
    const out = [P('CLAUSULA ADICIONAL:', { b: true, u: true, jc: 'center' }), BL,
      P(`Conste por la presente cláusula adicional una de **ACLARACIÓN Y RATIFICACIÓN DE CONTRATO DE COMPRAVENTA** que celebran las partes a la minuta de compraventa de fecha ${fm}, en los términos siguientes:`), BL,
      P(cs.txt.replace(/(LOS COMPRADORES|EL COMPRADOR|LA COMPRADORA)/, '**$1**')), BL, P(vend), BL,
      P('A quienes en adelante también se les podrá denominar **LAS PARTES**.'), BL,
      P('PRIMERA. - “Antecedentes”', { b: true, u: true }), BL,
      P(`Las partes contratantes con fecha ${fm} firmaron contrato de **COMPRA VENTA DE ${B ? 'BIEN INMUEBLE' : 'BIEN FUTURO'}**, por la adquisición del ${d.inmuebles}${ubic}.`), BL];
    (d.antecedentes || []).filter(a => a.fecha || a.texto).forEach(a => out.push(P(`Asimismo, con fecha ${fechaLarga(a.fecha)}, **LAS PARTES** suscribieron una cláusula adicional a la referida minuta${a.texto ? `, mediante la cual ${String(a.texto).trim().replace(/[.;]+$/, '')}` : ''}.`), BL));
    const info = !B && d.info.incluir && d.info.texto, bien = !B && d.bien.incluir && d.bien.texto, entrega = !B && d.entrega.incluir;
    const hay = info || bien || d.pago.incluir || entrega || d.reserva.incluir;
    const punto = (num, titulo) => P(`Según se cita en el punto ${num} del ANEXO I, en “${titulo}” del ${contrato}, **LAS PARTES** aclaran y declaran bajo responsabilidad la siguiente modificación:`);
    if (hay) {
      out.push(P('SEGUNDA. - “Aclaración”', { b: true, u: true }), BL,
        P(`Mediante la presente cláusula adicional, que forma parte integrante de la minuta de compraventa de fecha ${fm}, **LAS PARTES** ${B ? 'establecen por mutuo acuerdo' : 'precisan'} que son materia de aclaración lo siguiente:`), BL);
      if (info) out.push(punto(d.info.num, 'Información del Proyecto'), BL, P(`${d.info.num}. Información del Proyecto`, { b: true, u: true }), BL, ...parrafos(d.info.texto));
      if (bien) out.push(punto(d.bien.num, 'Bien/bienes objeto del presente contrato'), BL, ...parrafos(d.bien.texto));
      if (d.pago.incluir) {
        if (B) out.push(P(`Según se cita en la Cláusula ${d.pago.clausula || 'Cuarta'} referido a la “forma de pago” del ${contrato}, **LAS PARTES** aclaran y declaran bajo responsabilidad la siguiente modificación:`), BL,
          P(`El precio de venta, será pagado por **${rolDe(d.compradores)}**, tal como se detalla a continuación:`), BL);
        else out.push(punto(d.pago.num, 'Forma de Pago'), BL, P('Forma de Pago', { b: true, u: true }), BL);
        const up = (t) => B ? t.toUpperCase() : t;
        const monto = (n) => `**${montoNum(n, B)} (${montoLetras(n, B)})**`;
        const sep = (t) => /^[,;.]/.test(t || '') ? '' : ' ';
        d.pago.items.forEach((it, i) => {
          const pre = B && it.k === 'ini' ? 'La cuota inicial asciende a ' : B && it.k === 'sal' ? 'El saldo del precio de venta que asciende a ' : '';
          out.push(P(up(`${i + 1}.\t${pre}${monto(it.monto)}${sep(it.texto)}${it.texto || ''}`), { ind: 709, hang: 425 }));
          (it.sub || []).forEach(x => out.push(P(up(`${B ? '■' : '-'}\t${monto(x.monto)}${sep(x.texto)}${x.texto || ''}`), { ind: 1418, hang: 425 })));
          out.push(BL);
        });
      }
      if (entrega) {
        out.push(punto(d.entrega.num, 'Fecha de entrega de EL INMUEBLE/LOS INMUEBLES'), BL,
          P('Fecha de entrega de EL INMUEBLE/LOS INMUEBLES', { b: true, u: true }), BL,
          P(`El plazo para la entrega de EL INMUEBLE/LOS INMUEBLES será en el **${fechaLarga(d.entrega.fecha)}**. Sin embargo, si **LA VENDEDORA** culminase el edificio con fecha anterior a la antes mencionada, podrá hacer entrega anticipada de EL INMUEBLE/LOS INMUEBLES en cuestión siempre y cuando éstos se encuentren debidamente cancelados en su totalidad.`), BL,
          P('Sin perjuicio de lo antes indicado, **LA VENDEDORA** contara con días de gracia indicado en la presente minuta para la entrega de EL INMUEBLE/LOS INMUEBLES.'), BL);
      }
      if (d.reserva.incluir) out.push(P(`Así mismo por medio de la presente cláusula adicional que se incorpora a la minuta de compraventa de fecha ${fm} (en adelante “EL CONTRATO”), **LAS PARTES** conviene en:`), BL,
        P(`“Dejar sin efecto la Reserva de Propiedad indicada en la Cláusula ${d.reserva.clausula || 'Quinta'} de EL CONTRATO. Dejando expresa constancia que la transferencia del inmueble opera desde la suscripción EL CONTRATO”.`), BL);
    }
    if (d.poder.incluir) {
      const lista = [
        'Subsanar cualquier observación que pueda ser formulada por el Registro de Predios de la Oficina Registral competente en el trámite de inscripción del contrato de compraventa del inmueble y/o de la hipoteca, encontrándose entre tales subsanaciones la precisión, aclaración, ratificación, modificación y/o corrección de la numeración, nomenclatura y/o denominación de los INMUEBLES así como de la partida registral en la que se encuentren inscritos y la subsanación de cualquier otra observación de cualquier naturaleza, pudiendo suscribir y otorgar a nombre y representación del Cliente cualquier documento público y/o privado, así como minutas y/o escrituras públicas modificatorias y/o aclaratorias y/o ratificatorias que se requieran.',
        'Efectuar todos los trámites necesarios y suscribir a nombre del Cliente todos los documentos que se requieran para inscribir la Declaratoria de Fábrica, Reglamento Interno e Independización de los INMUEBLES.',
        'Efectuar todos los actos necesarios para la formalización e inscripción del levantamiento de la hipoteca matriz en la partida de los INMUEBLES.',
        `Luego de la Conformidad de Obra del proyecto, siempre que ${empresa}, lo considere necesario y sin que ello constituya una obligación, presentarse ante la Municipalidad Distrital para declarar e inscribir (dar de baja y alta) de los INMUEBLES y para registrar como propietario al Cliente en la oficina municipal competente, y para realizar todos los actos que resulten necesarios para que el cliente figure como nuevo propietario de los INMUEBLES, pudiendo suscribir todos los documentos que resulten necesarios, incluyendo los formularios correspondientes en los que se incluye la declaración jurada de autovalúo (HR y PU) y la constancia de no adeudo.`,
        `Asimismo, en los casos que sea necesario y se requiera para la continuidad del proyecto, ${empresa}, también estarán facultados para presentarse ante Sedapal, Luz del Sur, Edelnor, Calidda y cualquier otra entidad que se requiera para inscribir la titularidad del Cliente sobre los suministros de los INMUEBLES.`,
        'Realizar, ante el Servicio de Administración Tributaria (SAT) y/o ante cualquier otra entidad que pudiera resultar pertinente, todos los actos que resulten necesarios para la determinación, liquidación y pago del impuesto de alcabala que corresponda, así como la emisión de la constancia de inafectación de alcabala, incluyendo el cuestionamiento del monto que se determine, para lo cual podrá presentar y/o interponer todo tipo de recursos y/o escritos de cualquier naturaleza.',
        'Suscribir los documentos públicos y/o privados que sean necesarios para la emisión del TCHN en los términos establecidos en este contrato y en la Ley de Títulos Valores – Ley Nº 27287.',
        'Delegar cualquiera de los poderes otorgados y reasumirlos cuando considere conveniente. Los mismos que pueden ser delegados por LA VENDEDORA a terceros.',
        `${empresa}, podrán representar al cliente a sola firma y de manera indistinta, para los actos señalados precedentemente.`];
      out.push(P('Asimismo, las partes convienen en incluir en la presente cláusula adicional lo sgte:'), BL,
        P('CLAUSULA ADICIONAL. - PODER IRREVOCABLE:', { b: true, u: true }), BL,
        P(`Las partes declaran que es de su interés la inscripción, en el registro de predios de la oficina registral competente, de la transferencia de propiedad de los INMUEBLES a favor del Cliente; así como, de la Hipoteca y la emisión –en caso así lo solicite el ${(d.poder.banco || (d.credito || {}).banco || '').toUpperCase()} al Registro de Predios de la Oficina Registral competente- del TCHN.`), BL,
        P(`En este sentido, por la presente cláusula, el Cliente otorga poder irrevocable a favor de ${empresa}, para que, pueda ejercer a sola firma, en forma indistinta, las facultades detalladas a continuación:`), BL,
        ...lista.map(t => P('•\t' + t, { ind: 709, hang: 357 })), BL,
        P(`El plazo de vigencia del poder irrevocable que en virtud a esta cláusula el cliente otorga a favor de ${empresa} será de un (1) año, plazo que será computado a partir de la fecha en que se inscriba la independización del inmueble o que se inscriba el poder en el registro de mandatos y poderes correspondiente, lo que suceda primero.`), BL);
    }
    out.push(P(`${hay ? 'TERCERA' : 'SEGUNDA'}. - “Ratificación”`, { b: true, u: true }), BL,
      P(`Mediante la presente cláusula las partes intervinientes prestan su conformidad y ratificación los demás términos y condiciones pactadas en la minuta de compraventa de fecha ${fm} antes aludida, la cual mantiene su plena vigencia y validez legal en tanto no se oponga al presente instrumento.`), BL,
      P('Agregue usted señor notario, lo demás que fuere de ley, y sírvase cursar los partes correspondientes al Registro de la Propiedad Inmueble de Lima para su inscripción.'), BL,
      P(`${d.ciudad || 'Lima'}, ${fechaLarga(d.fecha)}.`), BL, BL, BL, BL);
    const firma = (n, dni, extra, rol) => [P('________________________________', { jc: 'center' }), P(n.toUpperCase(), { b: true, jc: 'center' }), P(`DNI Nº ${dni}`, { jc: 'center' }), extra ? P(extra, { b: true, jc: 'center' }) : '', P(rol, { b: true, jc: 'center' }), BL, BL, BL, BL].join('');
    out.push(firma(V.rep || '', V.repDni, V.razon, '“LA VENDEDORA”'));
    d.compradores.forEach(c => out.push(firma(c.nombre, c.dni, '', cs.rol)));
    return out.join('');
  }

  async function docx(d) {
    const Z = new (await zipLib())();
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    Z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
    Z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    Z.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    Z.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Verdana" w:hAnsi="Verdana" w:cs="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="es-PE"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`);
    Z.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${bodyXml(d)}<w:sectPr><w:pgSz w:w="11906" w:h="16838" w:code="9"/><w:pgMar w:top="1417" w:right="1701" w:bottom="1417" w:left="1701" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`);
    return Z.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  window.CLAUSULA = { zipLib, parseMinuta, docx, letras, montoLetras, montoNum, fechaLarga, isoDeTexto, DEP, EMPRESAS, empresaDe, vendedoraDe, TIPOS_ITEM, TIPOS_SUB, CON_FECHA, textoModelo, rehacerTextos, normalizar, tipoDe, fechaDe, rolDe, bodyXml };
})();
