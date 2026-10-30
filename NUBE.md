# Activar edición en tiempo real (Firebase, plan gratuito)

1. Entra a https://console.firebase.google.com con tu cuenta Google → **Agregar proyecto** (nombre: crm-mg; desactiva Analytics).
2. **Authentication → Comenzar → Correo electrónico/contraseña → Habilitar.**
   Luego en **Configuración → Dominios autorizados** agrega `TU-USUARIO.github.io`.
3. **Compilación → Firestore Database → Crear base de datos** (modo producción, región us-east1 o southamerica-east1).
4. **Reglas**: pega el contenido de `firestore.rules` y cambia `TU_CORREO@gmail.com` por tu correo → **Publicar**.
5. **Configuración del proyecto (engranaje) → Tus apps → icono </> (Web)** → registra la app → copia el bloque `firebaseConfig`
   y pégalo en `js/firebase-config.js` (reemplaza `null`). Sube el archivo a GitHub.
6. Abre la web, entra con tu correo (si no tienes contraseña: escribe el correo y toca "Olvidé mi contraseña / crear contraseña", revisa tu correo).
   Primera vez: toca **Subir datos iniciales**.
7. **Equipo → Editar** cada persona y escribe su correo (Agregar usuario nuevo envía solo el correo para crear su contraseña).
