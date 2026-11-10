/* CRM Contratos y Cobranzas — Grupo MG
   Modelo de datos y reglas de negocio (equivalentes a las fórmulas del Excel SEGUIMIENTOS). */
(function (global) {
  'use strict';
  const MS = 86400000;

  /* ---------- fechas ---------- */
  const pd = (s) => { if (!s) return null; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const iso = (d) => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';
  const today = () => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const diff = (a, b) => Math.round((a - b) / MS);
  const fdate = (s) => { if (!s) return ''; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
  const num = (v) => (v === undefined || v === null || v === '') ? null : Number(v);

  /* ---------- etapas ---------- */
  const STAGES = [
    { key: 'cob', n: 1, name: 'Cobranzas', rol: 'Asistente de Cobranza', ownerKey: 'cob_asistente',
      desc: 'Cobro de la cuota inicial y seguimiento a la carta de aprobación del banco.',
      accion: 'Cobrar inicial pendiente',
      funciones: ['Registrar la carta de aprobación del banco y su vencimiento', 'Iniciar y dar seguimiento a la cobranza de la cuota inicial', 'Contactar al cliente por saldos pendientes', 'Registrar la fecha de culminación de la cobranza y pasar el expediente a Contratos'] },
    { key: 'con', n: 2, name: 'Contratos', rol: 'Asistente Legal', ownerKey: 'con_asistente',
      desc: 'Asignación, validación documentaria, kardex, minuta y firmas.',
      accion: 'Validar documentación, gestionar Kardex y coordinar firma',
      funciones: ['Recibir la asignación del expediente y validar la documentación', 'Actualizar documentos y enviar la cláusula digital', 'Enviar documentos a notaría y coordinar el kardex con el abogado a cargo', 'Coordinar la firma del cliente y del representante legal', 'Ingresar los datos en el CRM Evolta y cerrar la etapa'] },
    { key: 'fin', n: 3, name: 'Finanzas', rol: 'Responsable de Valorados', ownerKey: 'fin_responsable',
      desc: 'Carta fianza y minutas de levantamiento condicionadas.',
      accion: 'Solicitar / dar seguimiento a Carta Fianza o Minuta de Levantamiento',
      funciones: ['Definir si el expediente requiere carta fianza o minuta de levantamiento', 'Solicitar y dar seguimiento a la carta fianza con el banco (SLA)', 'Controlar vencimientos y renovaciones', 'Registrar el desembolso'] },
    { key: 'for', n: 4, name: 'Formalización', rol: 'Asistente de Formalización', ownerKey: 'for_asistente',
      desc: 'Minuta de levantamiento, trámite notarial e inscripción registral.',
      accion: 'Gestionar inscripción registral',
      funciones: ['Gestionar la minuta de levantamiento de hipoteca cuando aplica', 'Ingresar el trámite a notaría y controlar el SLA notarial', 'Seguir la inscripción registral (SUNARP)', 'Registrar gastos notariales y registrales', 'Registrar la independización'] },
    { key: 'pos', n: 5, name: 'Postventa', rol: 'Postventa', ownerKey: null, fixedOwner: 'Victoria Mayorga',
      desc: 'Derivación a postventa y entrega de la unidad.',
      accion: 'Coordinar entrega con cliente',
      funciones: ['Recibir los expedientes derivados a postventa', 'Coordinar la entrega de la unidad con el cliente', 'Registrar la entrega y cerrar la operación'] }
  ];
  const STAGE = Object.fromEntries(STAGES.map(s => [s.key, s]));
  const JEFATURA = 'jef';

  /* ---------- campos editables por etapa ---------- */
  const YN = ['SI', 'NO'];
  // estados de la inscripción registral, en el orden en que avanza el trámite (como en el seguimiento de Formalización)
  const BF_MOTIVOS = ['Falta independización del proyecto', 'Falta declaratoria de fábrica / conformidad de obra', 'Otro'];
  const ESTADOS_INS = ['Pendiente', 'Docs enviados a notaría', 'Ingresado a notaría', 'Pendiente conformidad de notaría (adenda)', 'Email enviado', 'Sin respuesta', 'En calificación (SUNARP)', 'Observado', 'Inscrito'];
  const FIELDS = {
    gen: [
      { k: 'cliente', l: 'Cliente', t: 'text', w: 2 }, { k: 'dni', l: 'DNI', t: 'text' },
      { k: 'email', l: 'Correo del cliente', t: 'text' }, { k: 'telefono', l: 'Teléfono / celular', t: 'text' },
      { k: 'proyecto', l: 'Proyecto', t: 'text', list: 'proyecto' }, { k: 'empresa', l: 'Empresa (razón social)', t: 'text', list: 'empresa' }, { k: 'unidad', l: 'Unidad', t: 'text' },
      { k: 'fechaInicio', l: 'Fecha de inicio', t: 'date' },
      { k: 'vendedor', l: 'Vendedor', t: 'text', list: 'vendedor' }, { k: 'jefeVentas', l: 'Jefe de ventas', t: 'text', list: 'jefeVentas' },
      { k: 'banco', l: 'Banco / financiamiento', t: 'text', list: 'banco' }, { k: 'ejecBanco', l: 'Ejecutivo / asesor de banco', t: 'text', list: 'ejecBanco' }, { k: 'fRecibeBanco', l: 'Fecha en que el ejecutivo de banco recibe el caso', t: 'date' },
      { k: 'montoBanco', l: 'Monto a financiar (S/)', t: 'number' }, { k: 'bono', l: 'Bono MiVivienda (S/)', t: 'number' }, { k: 'precio', l: 'Precio de venta (S/)', t: 'number' },
      { k: 'observaciones', l: 'Observaciones', t: 'textarea', w: 2 }
    ],
    cob: [
      { k: 'cob_asistente', l: 'Asistente de cobranza', t: 'owner' },
      { k: 'cob_fCartaAprob', l: 'Fecha carta de aprobación', t: 'date' }, { k: 'cob_vencCarta', l: 'Vencimiento carta de aprobación', t: 'date' },
      { k: 'cob_fInicio', l: 'Fecha inicio cobranza', t: 'date' }, { k: 'cob_porRecibir', l: 'Inicial por recibir (S/)', t: 'number' },
      { k: 'cob_fCulm', l: 'Fecha culminación cobranza', t: 'date' }
    ],
    con: [
      { k: 'con_asistente', l: 'Asistente legal asignado', t: 'owner' }, { k: 'con_fAsignacion', l: 'Fecha de asignación', t: 'date' },
      { k: 'con_fValidacion', l: 'Fecha de validación', t: 'date' },
      { k: 'con_actDocs', l: 'Actualización de documentos', t: 'select', o: ['SI APLICA', 'NO APLICA'] },
      { k: 'con_clausula', l: 'Cláusula enviada (digital)', t: 'select', o: ['SI', 'NO', 'EN PROCESO'] },
      { k: 'con_docsNotaria', l: 'Documentos a notaría', t: 'select', o: ['ENVIADOS', 'PENDIENTES', 'INCOMPLETOS'] },
      { k: 'con_fInicioFirmas', l: 'Fecha envío de minuta (inicio firmas)', t: 'date' },
      { k: 'con_cheque', l: 'Cheque en CRM Evolta', t: 'select', o: YN },
      { k: 'con_kardexMonto', l: 'Kardex (N°)', t: 'number' },
      { k: 'con_estadoKardex', l: 'Estado del kardex', t: 'select', o: ['Pendiente', 'En proceso', 'Completo', 'Observado', 'No corresponde'] },
      { k: 'con_notaria', l: 'Notaría', t: 'text', list: 'notaria' }, { k: 'con_fLlegaNotaria', l: 'Fecha en que llega a notaría (envío del banco)', t: 'date' },
      { k: 'con_abogado', l: 'Abogado / doctor a cargo en notaría', t: 'text', list: 'abogado' }, { k: 'con_fAsignaAbogado', l: 'Fecha de asignación del abogado', t: 'date' },
      { k: 'con_banObs', l: 'N° de observaciones / devoluciones del banco', t: 'number' }, { k: 'con_banPausa', l: 'Días hábiles esperando al cliente (en el banco)', t: 'number' },
      { k: 'con_notObs', l: 'N° de observaciones de la notaría', t: 'number' }, { k: 'con_notPausa', l: 'Días hábiles esperando al cliente (en notaría)', t: 'number' },
      { k: 'con_motivoDemora', l: 'Motivo principal de demora', t: 'select', o: ['Falta documento del cliente', 'Tasación', 'Evaluación / aprobación del banco', 'Observación en minuta o contrato', 'Agenda de la notaría', 'Cliente no disponible para firmar', 'Firma del representante legal', 'Otro'] },
      { k: 'con_fFirmaCliente', l: 'Fecha firma cliente', t: 'date' }, { k: 'con_fFirmaRL', l: 'Fecha firma representante legal', t: 'date' },
      { k: 'con_datosCRM', l: 'Datos ingresados al CRM Evolta', t: 'select', o: ['INGRESADO', 'NO INGRESADO'] },
      { k: 'con_fCulm', l: 'Fecha de culminación', t: 'date' }
    ],
    fin: [
      { k: 'fin_tipo', l: 'Carta fianza / minuta de levantamiento', t: 'select', o: ['No aplica', 'Aplica - En curso', 'Aplica - Bloqueada'] },
      { k: 'fin_tipoSolicitud', l: 'Tipo de solicitud', t: 'select', o: ['CARTA FIANZA', 'MINUTA DE LEVANTAMIENTO'] },
      { k: 'fin_responsable', l: 'Responsable de valorados', t: 'owner' }, { k: 'fin_nCarta', l: 'N° de carta fianza', t: 'text' },
      { k: 'fin_fSolicitud', l: 'Fecha solicitud', t: 'date' }, { k: 'fin_fEmision', l: 'Fecha emisión carta fianza', t: 'date' },
      { k: 'fin_fVenc', l: 'Vencimiento / renovación', t: 'date' }, { k: 'fin_fDesembolso', l: 'Fecha de desembolso', t: 'date' },
      { k: 'fin_cfEstado', l: 'Estado de la carta fianza', t: 'select', o: ['Vigente', 'Devuelta'] }, { k: 'fin_fDevolucion', l: 'Fecha de devolución de la carta', t: 'date' }
    ],
    for: [
      { k: 'for_asistente', l: 'Asistente de formalización', t: 'owner' }, { k: 'for_fInicio', l: 'Fecha inicio formalización', t: 'date' },
      { k: 'for_aplicaLev', l: 'Aplica levantamiento de hipoteca', t: 'select', o: ['Sí', 'No'] },
      { k: 'for_fFirmaMinuta', l: 'Fecha firma minuta de levantamiento', t: 'date' },
      { k: 'for_fIngresoNotaria', l: 'Fecha ingreso a notaría', t: 'date' }, { k: 'for_fInscripcion', l: 'Fecha inscripción registral (SUNARP)', t: 'date' },
      { k: 'for_gastoNotarial', l: 'Gasto notarial (S/)', t: 'number' }, { k: 'for_gastoRegistral', l: 'Gasto registral (S/)', t: 'number' },
      { k: 'for_estado', l: 'Estado de formalización', t: 'select', o: ['Pendiente', 'En Proceso', 'Completo'] },
      { k: 'for_estadoIns', l: 'Estado de la inscripción', t: 'select', o: ESTADOS_INS }, { k: 'for_codigo', l: 'Código de inscripción', t: 'text' },
      { k: 'for_titulo', l: 'N° de título (SUNARP)', t: 'text' }, { k: 'for_obsIns', l: 'Observación de la inscripción', t: 'text' },
      { k: 'for_copiaEvolta', l: 'Copia simple SUNARP cargada en Evolta', t: 'select', o: ['CARGADA', 'PENDIENTE'] },
      { k: 'for_fIndep', l: 'Fecha de independización', t: 'date' },
      { k: 'for_bfEstado', l: 'Bien futuro: inscripción en espera', t: 'select', o: ['En espera'] }, { k: 'for_bfMotivo', l: 'Bien futuro: motivo', t: 'select', o: BF_MOTIVOS },
      { k: 'for_bfReapertura', l: 'Bien futuro: reapertura estimada', t: 'date' }, { k: 'for_bfDesde', l: 'Bien futuro: en espera desde', t: 'date' },
      { k: 'for_bfReabierto', l: 'Bien futuro: fecha en que se reabrió', t: 'date' }
    ],
    pos: [
      { k: 'pos_derivado', l: 'Derivado a postventa', t: 'select', o: YN }, { k: 'pos_entregada', l: 'Unidad entregada', t: 'select', o: YN }
    ]
  };
  /* Pestaña "Notaría y Kardex/Banco" de Evolta: mismos campos, en el mismo orden.
     `ev` = cómo se llama el campo en Evolta (para leer la captura). Algunos reutilizan campos que ya existían. */
  const NKB = [
    { t: 'Notaría', f: [
      { k: 'con_notaria', l: 'Nombre notaría', ev: /nombre notaria\s*:/ }, { k: 'con_notResp', l: 'Responsable', ev: /responsable\s*:/ },
      { k: 'con_notCel', l: 'Celular', ev: /celular\s*:/ }, { k: 'con_notTel', l: 'Teléfono', ev: /telefono\s*:/ },
      { k: 'con_notEmail', l: 'E-mail', ev: /e\s*-?\s*mail\s*:/ }, { k: 'con_notDir', l: 'Dirección', ev: /direccion\s*:/ }] },
    { t: 'Expediente', f: [
      { k: 'con_kardexMonto', l: 'N° Kardex', ev: /n\W{0,2}\s*kardex\s*:/ }, { k: 'con_expOficina', l: 'Oficina', ev: /oficina\s*:/ },
      { k: 'con_expRegistro', l: 'N° Registro', ev: /n\W{0,2}\s*registro\s*:/ }] },
    { t: 'Otros', f: [
      { k: 'con_fEscritura', l: 'Fecha de escritura pública', t: 'date', ev: /fecha de escritura publica\s*:/ }, { k: 'con_penalidad', l: 'Penalidad de entrega (S/)', t: 'number', ev: /penalidad de entrega[^:]{0,8}:/ }] },
    { t: 'Banco', f: [
      { k: 'con_bcoAgencia', l: 'Agencia', ev: /agencia\s*:/ }, { k: 'ejecBanco', l: 'Asesor', ev: /asesor\s*:/ },
      { k: 'con_bcoTel', l: 'Teléfonos', ev: /telefonos\s*:/ }, { k: 'con_bcoCorreo', l: 'Correos', ev: /correos\s*:/ },
      { k: 'cob_vencCarta', l: 'Fec. Vcto. Carta de Aprob.', t: 'date', ev: /(?:fec\W{0,2}\s*v\w{2,4}\W{0,2}\s*)?carta de aprob[^:]{0,3}:/ }] }];
  /* Pestaña "Carta Fianza" de Evolta: solo se cotejan banco, monto y N° de carta (el recuadro "Carta Fianza (S/)") */
  const CF = [
    { t: 'Carta Fianza (S/)', f: [
      { k: 'fin_cfBanco', l: 'Banco', ev: /banco\s*:/ }, { k: 'fin_cfMonto', l: 'Monto (S/)', t: 'number', ev: /monto[^:]{0,8}:/ },
      { k: 'fin_nCarta', l: 'N° Carta Fianza', ev: /n\W{0,2}\s*carta fianza\s*:/ }] }];

  /* Pestañas de Evolta que se cotejan con una captura: en qué etapa van y cómo se reparten en columnas */
  const EV_TABS = {
    nkb: { t: 'Notaría y Kardex/Banco', ic: '🏛️', stage: 'con', groups: NKB, cols: [[0], [1, 2], [3]], min: 4 },
    cf: { t: 'Carta Fianza', ic: '✉️', stage: 'fin', groups: CF, cols: [[0]], min: 2, wide: true }
  };
  const NKB_KEYS = NKB.flatMap(g => g.f.map(f => f.k));
  Object.keys(EV_TABS).forEach(tk => { FIELDS[tk] = EV_TABS[tk].groups.flatMap(g => g.f).filter(f => !Object.values(FIELDS).flat().some(x => x.k === f.k)).map(f => ({ k: f.k, l: f.l, t: f.t || 'text' })); });

  const FIELD_LABEL = {};
  Object.values(FIELDS).forEach(a => a.forEach(f => FIELD_LABEL[f.k] = f.l));
  const NUM_KEYS = new Set();
  Object.values(FIELDS).forEach(a => a.forEach(f => { if (f.t === 'number') NUM_KEYS.add(f.k); }));

  const DEFAULT_PARAMS = { plazo: 5, anticipo: 2, slaCF: 5, slaMin: 10, slaNot: 20, metaEficacia: 80, metaEficiencia: 80, metaSemana: 20, metaDia: 8, diasDesemb: 90, metaVal: 3, metaBan: 15, metaNot: 10, metaAbo: 10, metaRl: 3, metaDes: 15, metaDev: 5, diasHabiles: 1, feriadosExtra: '', topeCarga: 5, autoAsignar: 1, minInactivo: 15 };
  const DEFAULT_USERS = [
    { name: 'Milagros Valles', stage: JEFATURA, rol: 'Jefa de Administración de Contratos y Cobranzas', admin: true },
    { name: 'Jonathan', stage: 'cob', rol: 'Asistente de Cobranza' },
    { name: 'Roxana Murga', stage: 'con', rol: 'Asistente Legal' },
    { name: 'Marilu Sandoval', stage: 'con', rol: 'Asistente Legal' },
    { name: 'Juan Pablo Humala', stage: 'fin', rol: 'Responsable de Valorados' },
    { name: 'Kiara Sandoval', stage: 'for', rol: 'Asistente de Formalización' },
    { name: 'Victoria Mayorga', stage: 'pos', rol: 'Postventa (Arq.)' }
  ];

  /* ---------- normalización de datos importados ---------- */
  const strip = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  function normalize(op) {
    ['con_clausula', 'con_cheque', 'pos_derivado', 'pos_entregada'].forEach(k => {
      if (op[k] != null) { const v = strip(op[k]); if (v === 'si') op[k] = 'SI'; else if (v === 'no') op[k] = 'NO'; }
    });
    if (op.for_aplicaLev != null) { const v = strip(op.for_aplicaLev); op.for_aplicaLev = v === 'si' ? 'Sí' : v === 'no' ? 'No' : undefined; if (!op.for_aplicaLev) delete op.for_aplicaLev; }
    ['cliente', 'proyecto', 'unidad', 'vendedor', 'jefeVentas', 'banco'].forEach(k => { if (typeof op[k] === 'string') op[k] = op[k].replace(/\s+/g, ' ').trim(); });
    NUM_KEYS.forEach(k => { if (op[k] != null && typeof op[k] !== 'number') { const n = Number(op[k]); if (isNaN(n)) delete op[k]; else op[k] = n; } });
    return op;
  }

  /* ---------- reglas de negocio ---------- */
  function semaforo(inicio, sla, fin, P, T) {
    if (!inicio) return '';
    if (fin) return 'COMPLETADO';
    const lim = addDays(pd(inicio), sla);
    if (T > lim) return 'ROJO';
    if (T >= addDays(lim, -P.anticipo)) return 'AMARILLO';
    return 'VERDE';
  }

  function ownerOf(op, key) {
    const st = STAGE[key];
    if (!st.ownerKey) return st.fixedOwner;
    return op[st.ownerKey] || 'Sin asignar';
  }

  /* Cada paso puede traer `set` (qué se registra con un toque; $today = hoy, $me = quien lo hace)
     o `choose` (el usuario elige una opción). Sin ninguno, se abre el campo para escribirlo. */
  // Pestaña de Evolta: todo lleno en el CRM y el último cotejo sin pendientes
  const tabOk = (op, tk) => EV_TABS[tk].groups.every(g => g.f.every(f => op[f.k] !== undefined && op[f.k] !== null && op[f.k] !== '')) && !!op[tk + 'Check'] && !op[tk + 'Check'].pendientes;
  const nkbOk = (op) => tabOk(op, 'nkb');
  function checklist(op, key, d) {
    const has = (k) => op[k] !== undefined && op[k] !== null && op[k] !== '';
    const it = (label, done, set, choose) => ({ label, done: !!done, set, choose });
    const T = '$today', ME = '$me';
    switch (key) {
      case 'cob': return [
        it('Asistente de cobranza asignado', has('cob_asistente'), { cob_asistente: ME }), it('Carta de aprobación registrada', has('cob_fCartaAprob'), { cob_fCartaAprob: T }),
        it('Cobranza iniciada', has('cob_fInicio'), { cob_fInicio: T }), it('Inicial cobrada (saldo por recibir = 0)', d.done.cob, { cob_porRecibir: 0 }), it('Fecha de culminación registrada', has('cob_fCulm'), { cob_fCulm: T })];
      case 'con': return [
        it('Asistente legal asignado', has('con_asistente'), { con_asistente: ME, con_fAsignacion: T }), it('Expediente validado', has('con_fValidacion'), { con_fValidacion: T }),
        it('Actualización de documentos definida', has('con_actDocs'), { con_actDocs: 'SI APLICA' }), it('Cláusula enviada (digital)', op.con_clausula === 'SI', { con_clausula: 'SI' }),
        it('Documentos enviados a notaría', op.con_docsNotaria === 'ENVIADOS', { con_docsNotaria: 'ENVIADOS' }), it('Minuta enviada a firmas', has('con_fInicioFirmas'), { con_fInicioFirmas: T }),
        it('Cheque en CRM Evolta', op.con_cheque === 'SI', { con_cheque: 'SI' }), it('Kardex completo', op.con_estadoKardex === 'Completo' || op.con_estadoKardex === 'No corresponde', { con_estadoKardex: 'Completo' }),
        it('Notaría y abogado definidos', has('con_notaria') && has('con_abogado')), it('Notaría y Kardex/Banco completo y cotejado con Evolta', nkbOk(op)),it('Firma del cliente', has('con_fFirmaCliente'), { con_fFirmaCliente: T }),
        it('Firma del representante legal', has('con_fFirmaRL'), { con_fFirmaRL: T }), it('Datos ingresados al CRM Evolta', op.con_datosCRM === 'INGRESADO', { con_datosCRM: 'INGRESADO' })];
      case 'fin':
        if (op.fin_tipo === 'No aplica') return [it('No aplica carta fianza ni minuta de levantamiento', true)];
        return [
          it('Definir si aplica carta fianza / minuta', has('fin_tipo'), null, { k: 'fin_tipo', opts: [['No aplica', '✅', 'No aplica'], ['Aplica - En curso', '📄', 'Sí aplica']] }),
          it('Responsable de valorados asignado', has('fin_responsable'), { fin_responsable: ME }),
          it('Solicitud registrada', has('fin_fSolicitud'), { fin_fSolicitud: T }),
          it(op.fin_tipoSolicitud === 'MINUTA DE LEVANTAMIENTO' ? 'Minuta de levantamiento firmada' : 'Carta fianza emitida', d.done.fin, op.fin_tipoSolicitud === 'MINUTA DE LEVANTAMIENTO' ? { for_fFirmaMinuta: T } : { fin_fEmision: T }),
          it('Desembolso registrado', has('fin_fDesembolso'), { fin_fDesembolso: T }),
          ...(op.fin_tipoSolicitud === 'MINUTA DE LEVANTAMIENTO' ? [] : [it('Carta fianza completa y cotejada con Evolta', tabOk(op, 'cf')),
            // saneado: la carta no puede estar vencida (o se renovó o ya se devolvió)
            it('Carta fianza al día (vigente o devuelta)', op.fin_cfEstado === 'Devuelta' || (op.fin_fVenc && op.fin_fVenc >= iso(today())))])];
      case 'for': return [
        it('Asistente de formalización asignado', has('for_asistente'), { for_asistente: ME }), it('Formalización iniciada', has('for_fInicio'), { for_fInicio: T }),
        it('Definir si aplica levantamiento de hipoteca', has('for_aplicaLev'), null, { k: 'for_aplicaLev', opts: [['Sí', '📄', 'Sí aplica'], ['No', '✅', 'No aplica']] }),
        ...(op.for_aplicaLev === 'Sí' ? [it('Minuta de levantamiento firmada', has('for_fFirmaMinuta'), { for_fFirmaMinuta: T })] : []),
        it('Ingreso a notaría', has('for_fIngresoNotaria'), { for_fIngresoNotaria: T }), it('Inscripción registral (SUNARP)', has('for_fInscripcion'), { for_fInscripcion: T }), it('Independización', has('for_fIndep'), { for_fIndep: T }),
        it('Copia simple SUNARP cargada en Evolta con su N° de título', has('for_titulo') && op.for_copiaEvolta === 'CARGADA')];
      case 'pos': return [it('Derivado a postventa', op.pos_derivado === 'SI', { pos_derivado: 'SI' }), it('Unidad entregada', op.pos_entregada === 'SI', { pos_entregada: 'SI' })];
    }
    return [];
  }

  function derive(op, P) {
    const T = today();
    const D = { done: {}, state: {}, owner: {}, check: {}, progress: {} };
    const fCulmCon = op.con_fCulm || ((op.con_fFirmaCliente && op.con_fFirmaRL) ? (op.con_fFirmaCliente > op.con_fFirmaRL ? op.con_fFirmaCliente : op.con_fFirmaRL) : null);

    D.done.cob = (num(op.cob_porRecibir) || 0) <= 0;
    D.done.con = !!(op.con_fFirmaCliente && op.con_fFirmaRL);
    D.semCF = semaforo(op.fin_fSolicitud, P.slaCF, op.fin_fEmision, P, T);
    D.semMin = semaforo(op.fin_fDesembolso, P.slaMin, op.for_fFirmaMinuta, P, T);
    D.espera = op.for_bfEstado === 'En espera' && !op.for_fIndep; // bien futuro: aún no se puede inscribir
    D.notIni = op.for_bfReabierto && op.for_fIngresoNotaria && op.for_bfReabierto > op.for_fIngresoNotaria ? op.for_bfReabierto : op.for_fIngresoNotaria;
    D.semNot = D.espera ? '' : semaforo(D.notIni, P.slaNot, op.for_fInscripcion, P, T);
    if (op.fin_tipo === 'No aplica') D.done.fin = true;
    else if (op.fin_tipo === 'Aplica - En curso') D.done.fin = op.fin_tipoSolicitud === 'MINUTA DE LEVANTAMIENTO' ? !!op.for_fFirmaMinuta : !!op.fin_fEmision;
    else D.done.fin = false;
    D.done.for = !!op.for_fIndep;
    D.done.pos = op.pos_entregada === 'SI';

    D.etapa = 'cerrado';
    for (const s of STAGES) if (!D.done[s.key]) { D.etapa = s.key; break; }
    STAGES.forEach(s => { D.state[s.key] = D.done[s.key] ? 'culminada' : (D.etapa === s.key ? 'actual' : 'porllegar'); D.owner[s.key] = ownerOf(op, s.key); });
    if (D.espera && D.state.for === 'actual') D.state.for = 'espera'; // no cuenta como carga ni como fuera de plazo
    D.responsable = D.etapa === 'cerrado' ? '—' : D.owner[D.etapa];
    D.hechas = STAGES.filter(s => D.done[s.key]).length;

    // Contratos: plazo
    D.conDias = null; D.conCump = '';
    if (op.con_fValidacion) {
      const end = fCulmCon ? pd(fCulmCon) : T;
      D.conDias = Math.max(0, diff(end, pd(op.con_fValidacion)));
      D.conCump = D.conDias > P.plazo ? 'FUERA DE PLAZO' : (D.conDias >= P.plazo - P.anticipo ? 'PROXIMO A VENCER' : 'DENTRO DEL PLAZO');
    }
    D.conEstado = !op.con_fAsignacion ? 'SIN ASIGNAR' : (fCulmCon ? 'CULMINADO' : 'EN ATENCION');
    D.conFirma = (op.con_fFirmaCliente && op.con_fFirmaRL) ? 'FIRMAS COMPLETAS' : op.con_fFirmaCliente ? 'PENDIENTE FIRMA REP. LEGAL' : op.con_fFirmaRL ? 'PENDIENTE FIRMA CLIENTE' : 'PENDIENTE AMBAS FIRMAS';
    D.cobDiasAt = op.cob_fInicio ? Math.max(0, diff(op.cob_fCulm ? pd(op.cob_fCulm) : T, pd(op.cob_fInicio))) : null;
    D.cobRecibido = (op.precio != null) ? (op.precio - (op.montoBanco || 0) - (op.bono || 0) - (num(op.cob_porRecibir) || 0)) : null;
    D.diasTotal = op.fechaInicio ? Math.max(0, diff(D.etapa === 'cerrado' ? T : T, pd(op.fechaInicio))) : null;

    // Alerta
    const venc = op.fin_fVenc && op.fin_cfEstado !== 'Devuelta' ? pd(op.fin_fVenc) : null; // una carta devuelta ya no vence
    if (D.etapa === 'cerrado') D.alerta = 'Cerrado';
    else if (op.fin_tipo === 'Aplica - Bloqueada' || D.responsable === 'Sin asignar' || (venc && T > venc)) D.alerta = 'Inmediato';
    else if ((D.etapa === 'con' && D.conCump === 'FUERA DE PLAZO') || D.semCF === 'ROJO' || D.semMin === 'ROJO' || D.semNot === 'ROJO' || (venc && T >= addDays(venc, -P.anticipo))) D.alerta = 'Por acumulación';
    else D.alerta = 'Bajo control';

    // Cuello de botella
    D.cuello = 'N/A';
    if (D.etapa === 'con' && D.conCump === 'FUERA DE PLAZO') D.cuello = 'Interno - Legal';
    else if (D.etapa === 'fin' && (D.semCF === 'ROJO' || D.semMin === 'ROJO')) D.cuello = 'Banco';
    else if (D.etapa === 'for' && D.semNot === 'ROJO') D.cuello = 'Notaría';
    else if (D.etapa === 'cob' && op.cob_fInicio && diff(T, pd(op.cob_fInicio)) > P.plazo) D.cuello = 'Cliente';

    STAGES.forEach(s => {
      const c = checklist(op, s.key, D); D.check[s.key] = c;
      D.progress[s.key] = D.done[s.key] ? 100 : (c.length ? Math.round(c.filter(x => x.done).length / c.length * 100) : 0);
    });
    if (D.state.for === 'espera') {
      D.check.for.forEach(c => { if (!c.done && /Inscripción|Independización|Copia simple/.test(c.label)) c.espera = true; });
      D.progress.for = 100; D.alerta = 'Bajo control'; D.cuello = 'N/A';
    }
    const first = D.etapa === 'cerrado' ? null : D.check[D.etapa].find(x => !x.done && !x.espera);
    D.siguiente = D.etapa === 'cerrado' ? 'Operación cerrada' : D.state[D.etapa] === 'espera' ? `En espera · bien futuro${op.for_bfReapertura ? ' (reapertura ' + op.for_bfReapertura.split('-').reverse().join('/') + ')' : ''}` : (first ? first.label : STAGE[D.etapa].accion);
    D.accion = D.etapa === 'cerrado' ? '—' : STAGE[D.etapa].accion;
    return D;
  }

  /* hitos automáticos a partir de las fechas */
  function milestones(op) {
    const m = [];
    const add = (k, label, stage) => { if (op[k]) m.push({ date: op[k], label, stage }); };
    add('fechaInicio', 'Inicio de la operación', null);
    add('cob_fCartaAprob', 'Carta de aprobación del banco', 'cob'); add('cob_fInicio', 'Inicio de cobranza', 'cob'); add('cob_fCulm', 'Cobranza culminada', 'cob');
    add('con_fAsignacion', 'Expediente asignado a asistente legal', 'con'); add('con_fValidacion', 'Expediente validado', 'con');
    add('con_fInicioFirmas', 'Minuta enviada a firmas', 'con'); add('con_fFirmaCliente', 'Firma del cliente', 'con');
    add('con_fFirmaRL', 'Firma del representante legal', 'con'); add('con_fCulm', 'Contratos culminado', 'con');
    add('fin_fSolicitud', 'Solicitud de carta fianza / minuta', 'fin'); add('fin_fEmision', 'Carta fianza emitida', 'fin'); add('fin_fDesembolso', 'Desembolso', 'fin');
    add('for_fInicio', 'Inicio de formalización', 'for'); add('for_fFirmaMinuta', 'Minuta de levantamiento firmada', 'for');
    add('for_fIngresoNotaria', 'Ingreso a notaría', 'for'); add('for_fInscripcion', 'Inscripción registral (SUNARP)', 'for'); add('for_fIndep', 'Independización', 'for');
    return m;
  }

  /* ---------- importación del Excel original (BASE_MAESTRA) ---------- */
  const EXCEL_MAP = { id: 'A', fechaInicio: 'C', proyecto: 'E', unidad: 'F', cliente: 'G', dni: 'H', vendedor: 'I', jefeVentas: 'J', banco: 'K', ejecBanco: 'L', montoBanco: 'M', bono: 'N', precio: 'O',
    cob_asistente: 'P', cob_fCartaAprob: 'Q', cob_vencCarta: 'R', cob_fInicio: 'S', cob_porRecibir: 'T', cob_fCulm: 'V',
    con_asistente: 'AB', con_fAsignacion: 'AC', con_fValidacion: 'AD', con_actDocs: 'AE', con_clausula: 'AF', con_docsNotaria: 'AG', con_fInicioFirmas: 'AH', con_cheque: 'AI', con_kardexMonto: 'AJ', con_notaria: 'AK', con_abogado: 'AL', con_fFirmaCliente: 'AM', con_fFirmaRL: 'AN', con_estadoKardex: 'AO', con_datosCRM: 'AP', con_fCulm: 'AS',
    fin_tipo: 'AZ', fin_tipoSolicitud: 'BA', fin_responsable: 'BB', fin_nCarta: 'BC', fin_fSolicitud: 'BD', fin_fEmision: 'BF', fin_fVenc: 'BH', fin_fDesembolso: 'BI',
    for_asistente: 'BK', for_fInicio: 'BL', for_aplicaLev: 'BM', for_fFirmaMinuta: 'BN', for_fIngresoNotaria: 'BQ', for_fInscripcion: 'BS', for_gastoNotarial: 'BU', for_gastoRegistral: 'BV', for_estado: 'BW', for_fIndep: 'BX',
    pos_derivado: 'BZ', pos_entregada: 'CA', observaciones: 'CH' };

  function importWorkbook(XLSX, buf) {
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const ws = wb.Sheets['BASE_MAESTRA'];
    if (!ws) throw new Error('No se encontró la hoja BASE_MAESTRA en el archivo.');
    const range = XLSX.utils.decode_range(ws['!ref']);
    const ops = [];
    for (let r = 3; r <= range.e.r; r++) {            // fila 4 en Excel = índice 3
      const gCell = ws['G' + (r + 1)];
      if (!gCell || !gCell.v || (gCell.f)) continue;
      const op = {};
      for (const [k, L] of Object.entries(EXCEL_MAP)) {
        const c = ws[L + (r + 1)];
        if (!c || c.v === undefined || c.v === null) continue;
        // las fórmulas se recalculan en el CRM, salvo sumas de montos constantes (ej. =45000+16870)
        if (c.f && k !== 'for_aplicaLev' && !/^[\d+\-*/.() ]+$/.test(c.f)) continue;
        let v = c.v;
        if (v instanceof Date) v = iso(new Date(v.getTime() + 12 * 3600000));
        else if (typeof v === 'string') { v = v.trim(); if (!v || v.startsWith('#')) continue; }
        op[k] = v;
      }
      if (op.id) ops.push(normalize(op));
    }
    return ops;
  }

  global.CRM = { BF_MOTIVOS, ESTADOS_INS, STAGES, STAGE, JEFATURA, FIELDS, FIELD_LABEL, NKB, NKB_KEYS, nkbOk, EV_TABS, tabOk, NUM_KEYS, DEFAULT_PARAMS, DEFAULT_USERS, derive, milestones, normalize, ownerOf, importWorkbook,
    pd, iso, today, addDays, diff, fdate, num };
})(window);
