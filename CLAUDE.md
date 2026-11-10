# CRM de Contratos y Cobranzas · Grupo MG

Instrucciones para cualquier sesión que trabaje en este repositorio.

## Objetivo
Todo lo que se construye es para **mejorar la eficiencia de la cobranza** del Área de Contratos y Cobranzas.

## Reglas de trabajo
- Responder siempre en **español**, claro y fácil de explicar al equipo y a gerencia. Actuar como asesor: recomendar, no listar opciones de más.
- **Costo cero**: GitHub Pages + Firebase plan gratuito (Spark). Nada de servicios de pago, plan Blaze, API de WhatsApp ni licencias.
- **Vista previa antes de publicar**: cada cambio se trabaja en una rama aparte, se prueba y se muestran capturas. Se pasa a `main` (lo que ve el equipo) solo cuando la jefatura dice "publica".
- Al publicar, **cambiar la versión `?v=` en `index.html`** para que los navegadores carguen los archivos nuevos.

## Todo módulo debe tener
1. **Tiempos**: días hábiles (feriados del Perú), meta configurable, semáforo (verde / amarillo / rojo) y productividad = eficacia × eficiencia (las mismas funciones `prodDe`, `diasEntre`, `metaProd`).
2. **Reportes**: resumen en pantalla y, cuando aplique, informe para imprimir o guardar en PDF ("Área de Contratos y Cobranzas presenta").
3. **Descarga en Excel**.
4. **Respaldo (backup)**: incluido en el respaldo general del CRM.
5. **Alertas y avisos** que eviten errores: duplicados (cliente, operación, comprobante), datos obligatorios para avanzar y casos vencidos.

## Modelo de productividad (único en todo el CRM)
- Eficacia = cerrados ÷ (cerrados + abiertos fuera de plazo).
- Eficiencia = plazo ÷ días reales de cada caso cerrado (máximo 100 %), promediado.
- Productividad = eficacia × eficiencia. Metas por defecto 80 % × 80 % = 64 % (se cambian en Configurar).
- Referencias: ISO 9000:2015; H. Gutiérrez Pulido, "Calidad y productividad"; SLA de Salesforce, Dynamics 365, HubSpot y Zoho.

## Datos
- Los datos de clientes viven en Firebase (proyecto crm-mg-4faf9). Nunca se suben al repositorio (`data/operaciones.js` queda vacío).
- Archivos: `js/model.js` (campos, metas, etapas), `js/app.js` (pantallas, Excel, informes), `js/cloud.js` (Firebase), `css/styles.css`.
- Prueba local: servir la carpeta y bloquear `gstatic` (sin Firebase la app corre en modo local con `localStorage`).
