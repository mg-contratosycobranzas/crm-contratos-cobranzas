# Respaldo automático del CRM en Google Drive

Copia todos los datos del CRM en Google Drive **todos los días de madrugada**, aunque nadie abra el CRM. Es gratis.

- Carpeta en Drive: **Respaldo CRM Contratos y Cobranzas**.
- Cada día: `Respaldo_CRM_AAAA-MM-DD.json` (sirve para restaurar el CRM).
- Días 1 y 16: además una hoja de cálculo de Google con los clientes.
- Se guardan los últimos 30 días; las copias de quincena no se borran.

## Instalación (una sola vez, unos 10 minutos)

Hazlo con la cuenta **contratosycobranzas.mg@gmail.com** (la dueña del proyecto de Firebase `crm-mg-4faf9`).

1. Entra a <https://script.google.com> y pulsa **Nuevo proyecto**. Ponle de nombre **Respaldo CRM**.
2. Borra lo que aparece en `Código.gs` y pega todo el contenido de [`Codigo.gs`](Codigo.gs).
3. Pulsa ⚙️ **Configuración del proyecto** y marca **"Mostrar el archivo de manifiesto appsscript.json en el editor"**.
4. Vuelve al editor, abre `appsscript.json`, borra su contenido y pega el de [`appsscript.json`](appsscript.json). Guarda (💾).
5. Arriba, elige la función **`instalar`** y pulsa **▶ Ejecutar**.
6. Google pedirá permiso: **Revisar permisos** → elige la cuenta → si dice "Google no verificó esta app", pulsa **Configuración avanzada → Ir a Respaldo CRM** → **Permitir**. (Es tu propio programa; los datos no salen de tu cuenta).
7. Abre Google Drive: debe aparecer la carpeta **Respaldo CRM Contratos y Cobranzas** con el primer archivo.

Desde ese momento corre solo todos los días a las 2:00 a. m. (hora de Lima).

## Si algo falla
- En script.google.com → **Ejecuciones** se ve cada respaldo y, si falló, el motivo.
- Si dice que no se pudo leer de Firebase (403): la cuenta usada no es dueña del proyecto. En la consola de Firebase → ⚙️ **Usuarios y permisos**, agrégala como **Propietario**, o instala el programa con la cuenta dueña.
- Para hacer un respaldo en el momento: elige **`respaldarAhora`** y pulsa ▶ Ejecutar.

## Restaurar
El archivo `.json` contiene todo. En el CRM, la administradora entra a **Configurar → ♻️ Restaurar desde respaldo** y elige el archivo `.json`: vuelven los clientes, seguimientos, devoluciones y actas tal como estaban ese día, sin borrar lo registrado después. El historial de cambios queda guardado en el archivo (en el CRM está protegido y no se reescribe).
