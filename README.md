# CRM Contratos y Cobranzas · Grupo MG

Seguimiento de expedientes dividido por **etapas** (Cobranzas → Contratos → Finanzas → Formalización → Postventa),
por **usuario** (qué hace y qué tiene en cartera cada persona) y por **cliente** (ficha con las 5 etapas, checklist,
bitácora de seguimientos y línea de tiempo). Es una página estática: no necesita servidor ni instalación.

## Qué incluye
| Vista | Para qué sirve |
|---|---|
| Torre de control | KPIs, embudo por etapa, alertas, cuellos de botella, carga por usuario, resumen por proyecto |
| Etapas 1–5 | Tabla de cada etapa con sus propias columnas, filtros por estado/responsable/proyecto, funciones de la etapa |
| Equipo / Usuario | Qué hace cada persona, su cartera, pendientes concretos por expediente, expedientes sin asignar para "tomar", actividad registrada |
| Clientes / Ficha | Recorrido por las 5 etapas, edición de campos por etapa, checklist de avance, seguimientos con próxima acción y fecha compromiso, hitos y cambios |
| Agenda | Compromisos de seguimiento vencidos, de hoy y próximos 7 días |
| Configuración | Plazos (SLA), equipo, exportar a Excel, respaldo, importar el Excel original |

## Publicar en GitHub Pages
1. Crea un repositorio (recomendado **privado**, ver aviso) y sube todo el contenido de esta carpeta.
2. En GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → main / (root)**.
3. En unos minutos queda en `https://<usuario>.github.io/<repositorio>/`.

## Aviso de privacidad
`data/operaciones.js` contiene nombres y DNI de clientes. En un repositorio **público** cualquiera podría leerlos.
Opciones: repositorio privado (Pages en privado requiere plan de pago de GitHub), o **borrar `data/operaciones.js`**
antes de subir y cargar los datos desde *Configuración → Importar* (quedan solo en tu navegador).

## Cómo se guardan los datos y cómo se comparten
- Cada cambio se guarda en el navegador de quien lo hace (localStorage) y queda registrado con el nombre elegido en
  **"Trabajando como"**.
- Para publicar el estado oficial al equipo: *Configuración → Descargar datos para el repositorio* → reemplaza
  `data/operaciones.js` en GitHub. Quien abra la página verá un aviso para cargar los datos nuevos.
- Para actualizar desde el Excel: *Configuración → Importar Excel* (lee la hoja `BASE_MAESTRA`; conserva los seguimientos).
- Sin servidor, dos personas editando a la vez en equipos distintos no se sincronizan solas. Para eso haría falta una base
  de datos compartida (Google Sheets, Supabase, Firebase o la API de CRM Evolta).

## Reglas que replica del Excel
Etapa actual = primera etapa no cerrada (Cobranzas: inicial por recibir ≤ 0 · Contratos: ambas firmas · Finanzas: "No aplica" o carta
fianza/minuta completada · Formalización: independización · Postventa: unidad entregada). Semáforos con SLA de carta fianza (5 d),
minuta de levantamiento (10 d) y trámite notarial (20 d). Nivel de alerta: Inmediato / Por acumulación / Bajo control.

## Estructura
```
index.html  css/styles.css  js/model.js (reglas)  js/app.js (interfaz)  data/operaciones.js  vendor/xlsx.full.min.js
```
Para probar en local: `python3 -m http.server` dentro de la carpeta y abrir http://localhost:8000

## Novedades v4
- **Permisos** (Configurar → Permisos): el administrador activa/desactiva pantallas y botones por persona, con plantillas y "Probar como". PIN opcional para la cuenta de administrador.
- **Botones de un toque**: tocar un paso lo marca con la fecha de hoy (con "Deshacer"); 📞 💬 ✉️ anotan una gestión en 2 toques; botón "+" flotante.
- **Mi día**: cola personal ordenada por urgencia; **Repartir automáticamente** expedientes sin responsable.
- **Resultados del área**: eficacia, eficiencia y productividad con metas editables, y mejoras sugeridas.
- Nota: los permisos se aplican en el navegador (no son seguridad real); `operaciones.js` los incluye al exportar.
