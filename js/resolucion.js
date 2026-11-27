/* Resolución de contrato de compraventa POR MUTUO ACUERDO (Word). Dos modelos, tomados de los que usa el área:
   · "dev": se devuelve el saldo al cliente (con o sin penalidad retenida) a su cuenta bancaria
   · "tras": el importe abonado pasa como cuota inicial de otro departamento
   Todo ocurre en el navegador; no se sube nada a ningún servidor. */
(function () {
  'use strict';
  const C = window.CLAUSULA, P = C.P, BL = C.BL, fechaLarga = C.fechaLarga;
  const TXT_TERCERA = 'Las partes declaran que ambas ponen fin a los reclamos, denuncias y pretensiones que podrían haberse generado y en general dan por concluida toda discrepancia y/o reclamo que pudiera surgir entre las partes, obligándose, en consecuencia, a abstenerse de iniciar o continuar cualquier acción administrativa, judicial o arbitral uno en contra del otro, así como a desistirse de cualquier reclamo o pretensión que pudieran haber accionado.';
  const num = (v) => Number(String(v == null ? '' : v).replace(/,/g, '')) || 0;
  const money = (n) => 'S/ ' + num(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const titulo = (t) => t.toLowerCase().replace(/(^|\s)([a-záéíóúñ])/g, (m, a, b) => a + b.toUpperCase()).replace(/ Y /g, ' y ').replace(/ y Un /g, ' y un ');
  function enLetras(n) { // "Treinta y un Mil Ciento Cuarenta y 00/100 Soles"
    n = Math.round(num(n) * 100) / 100; const ent = Math.floor(n), cent = Math.round((n - ent) * 100);
    return `${titulo(C.letras(ent))} y ${String(cent).padStart(2, '0')}/100 Soles`;
  }
  const monto = (n) => `${money(n)} (${enLetras(n)})`;
  const ordinal = (n) => ['PRIMERA', 'SEGUNDA', 'TERCERA', 'CUARTA'][n];
  const sra = (c) => c.trat === 'Sra.' || /^(sra|la)\b/i.test(c.trat || '');

  function vendedora(e) { // datos fijos de la empresa
    const reg = /^del /i.test(e.registro || '') ? e.registro : e.registro ? 'de la ' + e.registro.replace(/[,\s]+$/, '') : 'del Registro de Personas Jurídicas de Lima';
    return `**${e.razon}**, con R.U.C. N° ${e.ruc}, con domicilio fiscal en ${e.domicilio}; debidamente representada por su ${e.repCargo === 'Gerente' || !e.repCargo ? 'Gerente General' : e.repCargo} **${String(e.rep || '').toUpperCase()}**, con DNI N° ${e.repDni}, con poderes inscritos en la Partida Electrónica N° ${e.partida} ${reg}.`;
  }
  function comprador(c) {
    return `${sra(c) ? 'La Sra.' : 'El Sr.'} **${String(c.nombre).toUpperCase()}**, con DNI N° ${c.dni}${c.ec ? `, de estado civil ${c.ec}` : ''}${c.domicilio ? `; con domicilio en ${c.domicilio}` : ''}.`;
  }
  function faltas(d) { // datos obligatorios para poder generar el documento
    const f = [];
    if (!d.empresa) f.push('la empresa vendedora');
    if (!(d.compradores || []).length || d.compradores.some(c => !c.nombre || !c.dni)) f.push('nombre y DNI del cliente');
    if (!d.fechaContrato) f.push('la fecha del contrato firmado');
    if (!d.inmueble) f.push('el departamento');
    if (!d.ubicacion) f.push('la ubicación del inmueble');
    if (!num(d.abonado)) f.push('el importe abonado por el cliente');
    if (d.mod === 'tras') { if (!d.nuevoDpto || !d.nuevoProy) f.push('el departamento y proyecto nuevo'); }
    else { if (!num(d.reembolso)) f.push('el importe a reembolsar'); if (num(d.reembolso) > num(d.abonado)) f.push('un reembolso que no supere lo abonado'); if (!d.cuenta) f.push('el número de cuenta'); if (!d.banco) f.push('el banco'); }
    return f;
  }
  function bodyXml(d) {
    const cs = d.compradores, uno = cs.length === 1, V = d.empresa, rol = 'LA PARTE COMPRADORA', ven = 'LA PARTE VENDEDORA';
    const pen = d.mod === 'dev' ? Math.max(0, Math.round((num(d.abonado) - num(d.reembolso)) * 100) / 100) : 0;
    const tipo = d.tipoContrato === 'inmueble' ? 'Compraventa de Bien Inmueble' : 'Compraventa de Bien Futuro';
    const out = [P('RESOLUCION DE CONTRATO DE COMPRAVENTA', { b: true, jc: 'center' }), BL,
      P('Conste por el presente documento, la **RESOLUCIÓN DE CONTRATO DE COMPRAVENTA** que celebran:'), BL,
      P(`Como **${ven}**:`), P(vendedora(V)), BL,
      P(`Como **${rol}**:`), ...cs.map(c => P(comprador(c))), BL,
      P('En los términos y condiciones siguientes:'), BL,
      P('PRIMERA:', { b: true }),
      P(`Con fecha ${fechaLarga(d.fechaContrato)}, las partes firmaron un contrato de ${tipo.toLowerCase()} correspondiente a la venta del ${d.inmueble}, del inmueble ${d.ubicacion}${d.partidas ? `, cuyos antecedentes, características, medidas perimétricas y linderos se encuentran inscritos en ${d.partidas} del Registro de la Propiedad Inmueble de Lima` : ''}${d.proyecto ? `, correspondientes al proyecto ${d.proyecto}` : ''}.`), BL,
      P('SEGUNDA:', { b: true })];
    if (d.mod === 'tras') {
      out.push(P(`Por mutuo acuerdo, LAS PARTES convienen en resolver el contrato de compraventa descrito en la cláusula precedente, dejándolo sin efecto desde la suscripción del presente documento. Asimismo, LAS PARTES acuerdan que el importe abonado por ${rol}, ascendente a ${monto(d.abonado)}, será imputado como parte de la cuota inicial de la nueva operación de compraventa del ${d.nuevoDpto} del Proyecto “${d.nuevoProy}”, a favor de ${uno ? (sra(cs[0]) ? 'la compradora' : 'el comprador') : 'los compradores'} ${cs.map(c => `**${String(c.nombre).toUpperCase()}** identificad${sra(c) ? 'a' : 'o'} con DNI N° ${c.dni}`).join(' y ')}.`));
    } else {
      out.push(P(`Por mutuo acuerdo, las partes convienen en resolver el contrato de compraventa descrito en la Cláusula Primera. Asimismo, reconocen que ${rol} abonó a favor de ${ven} la suma de ${monto(d.abonado)}${pen ? `, de la cual la suma de ${monto(pen)} será retenida por ${ven} a título de penalidad y por todo concepto` : ''}.`), BL,
        P(`En consecuencia, LA VENDEDORA procederá a devolver ${pen ? 'el saldo correspondiente' : 'la suma abonada'}${pen || num(d.reembolso) !== num(d.abonado) ? ` de ${monto(d.reembolso)}` : ''} dentro del plazo máximo de ${d.plazoTxt || 'sesenta (60)'} días hábiles, contados desde la suscripción de la presente resolución, mediante depósito o transferencia a la cuenta bancaria de titularidad de ${rol}, identificada con el número de cuenta N° ${d.cuenta}${d.cci ? ` y CCI N° ${d.cci}` : ''}, correspondiente al ${/^banco/i.test(d.banco) ? d.banco : 'Banco ' + d.banco}, conforme a lo establecido en el Contrato de Compraventa.`));
    }
    out.push(BL, P('TERCERA:', { b: true }), P(TXT_TERCERA), BL, P(`${d.ciudad || 'Lima'}, ${fechaLarga(d.fecha)}.`), BL, BL, BL);
    const firma = (n, extra, rolTxt) => [P('______________________________', { jc: 'center' }), P(String(n).toUpperCase(), { b: true, jc: 'center' }), ...extra.map(x => P(x, { jc: 'center' })), P(rolTxt, { b: true, jc: 'center' }), BL, BL].join('');
    out.push(firma(V.rep, [`DNI N° ${V.repDni}`, V.razon], `“${ven}”`));
    cs.forEach(c => out.push(firma(c.nombre, [`DNI N° ${c.dni}`], `“${rol}”`)));
    return out.join('');
  }
  const PLAZOS = { 30: 'treinta (30)', 45: 'cuarenta y cinco (45)', 60: 'sesenta (60)', 90: 'noventa (90)' };
  const docx = (d) => { d.plazoTxt = PLAZOS[d.plazo] || (d.plazo ? `${d.plazo}` : PLAZOS[60]); return C.docx(d, bodyXml(d)); };
  const nombreArchivo = (d) => `Resolucion_mutuo_acuerdo_${String(d.inmueble || '').replace(/[^A-Za-z0-9]+/g, '_')}_${String((d.compradores[0] || {}).nombre || '').split(/[ ,]+/)[0]}.docx`;
  window.RESOL = { bodyXml, docx, faltas, nombreArchivo, money, enLetras };
})();
