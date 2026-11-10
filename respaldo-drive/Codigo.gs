/**
 * Respaldo automático del CRM de Contratos y Cobranzas en Google Drive (gratis).
 *
 * Copia todos los datos de Firebase (clientes, seguimientos, historial, devoluciones,
 * actas y cargos, buzón y configuración) en la carpeta "Respaldo CRM Contratos y Cobranzas"
 * de Google Drive, todos los días de madrugada, aunque nadie abra el CRM.
 *  - Cada día: un archivo .json (sirve para restaurar el CRM).
 *  - Los días 1 y 16 (quincena): además una hoja de cálculo de Google con los clientes.
 *  - Se guardan los últimos 30 días; las copias de quincena no se borran nunca.
 *
 * Instalación: ver LEEME.md en esta misma carpeta. Se usa con la cuenta dueña del proyecto de Firebase.
 */
const CONFIG = {
  proyecto: 'crm-mg-4faf9',
  carpeta: 'Respaldo CRM Contratos y Cobranzas',
  colecciones: ['ops', 'seguimientos', 'log', 'devoluciones', 'cargos', 'buzon', 'meta'],
  diasQueSeGuardan: 30,
  hora: 2 // hora del día (madrugada) en que corre el respaldo
};

/** Ejecútalo UNA vez: programa el respaldo diario y hace el primero. */
function instalar() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'respaldarAhora').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('respaldarAhora').timeBased().everyDays(1).atHour(CONFIG.hora).inTimezone('America/Lima').create();
  respaldarAhora();
  Logger.log('Listo: el respaldo correrá todos los días a las ' + CONFIG.hora + ':00 (hora de Lima).');
}

/** Hace un respaldo en este momento (también lo usa el programador diario). */
function respaldarAhora() {
  const hoy = Utilities.formatDate(new Date(), 'America/Lima', 'yyyy-MM-dd');
  const datos = { generado: new Date().toISOString(), proyecto: CONFIG.proyecto, origen: 'Respaldo automático (Google Apps Script)' };
  CONFIG.colecciones.forEach(c => { datos[c] = leerColeccion_(c); });
  const carpeta = carpeta_();
  carpeta.createFile('Respaldo_CRM_' + hoy + '.json', JSON.stringify(datos), 'application/json');
  const dia = Number(hoy.slice(8, 10));
  if (dia === 1 || dia === 16) hojaClientes_(carpeta, hoy, datos.ops);
  limpiar_(carpeta);
  Logger.log('Respaldo ' + hoy + ': ' + CONFIG.colecciones.map(c => c + ' ' + datos[c].length).join(' · '));
}

/* ---------- Firebase (Firestore) por su API, con el permiso de la cuenta dueña ---------- */
function leerColeccion_(nombre) {
  const out = []; let pagina = '';
  const base = 'https://firestore.googleapis.com/v1/projects/' + CONFIG.proyecto + '/databases/(default)/documents/' + nombre + '?pageSize=300';
  do {
    const r = UrlFetchApp.fetch(base + (pagina ? '&pageToken=' + encodeURIComponent(pagina) : ''), { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw new Error('No se pudo leer "' + nombre + '" de Firebase (' + r.getResponseCode() + '): ' + r.getContentText().slice(0, 300));
    const j = JSON.parse(r.getContentText());
    (j.documents || []).forEach(d => { const o = valorDe_({ mapValue: { fields: d.fields || {} } }); o._id = d.name.split('/').pop(); out.push(o); });
    pagina = j.nextPageToken || '';
  } while (pagina);
  return out;
}
// convierte el formato de Firestore ({stringValue: ...}) a datos normales
function valorDe_(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(valorDe_);
  if ('mapValue' in v) { const o = {}; Object.keys(v.mapValue.fields || {}).forEach(k => { o[k] = valorDe_(v.mapValue.fields[k]); }); return o; }
  return null;
}

/* ---------- Drive ---------- */
function carpeta_() {
  const it = DriveApp.getFoldersByName(CONFIG.carpeta);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CONFIG.carpeta);
}
// hoja de cálculo de la quincena con los clientes (se abre en cualquier computadora)
function hojaClientes_(carpeta, hoy, ops) {
  const claves = [];
  ops.forEach(o => Object.keys(o).forEach(k => { const v = o[k]; if ((v === null || typeof v !== 'object') && claves.indexOf(k) < 0) claves.push(k); }));
  const filas = [claves].concat(ops.map(o => claves.map(k => o[k] === null || o[k] === undefined ? '' : o[k])));
  const ss = SpreadsheetApp.create('Respaldo CRM clientes ' + hoy);
  const hoja = ss.getSheets()[0]; hoja.setName('Clientes');
  if (filas[0].length) hoja.getRange(1, 1, filas.length, filas[0].length).setValues(filas);
  DriveApp.getFileById(ss.getId()).moveTo(carpeta);
}
// borra los respaldos diarios de más de 30 días (los de los días 1 y 16 se quedan)
function limpiar_(carpeta) {
  const limite = new Date(Date.now() - CONFIG.diasQueSeGuardan * 86400000);
  const it = carpeta.getFiles();
  while (it.hasNext()) {
    const f = it.next(), m = /^Respaldo_CRM_(\d{4})-(\d{2})-(\d{2})\.json$/.exec(f.getName());
    if (!m) continue;
    const dia = Number(m[3]), fecha = new Date(Number(m[1]), Number(m[2]) - 1, dia);
    if (fecha < limite && dia !== 1 && dia !== 16) f.setTrashed(true);
  }
}
