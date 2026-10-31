# Rifas Web — GitHub Pages + Supabase

Aplicación estática con página pública (`index.html`) y panel privado (`admin.html`). Los datos se guardan en PostgreSQL (Supabase). No hay pagos automáticos; el organizador verifica y confirma las transferencias manualmente.

## 1. Crear base de datos

1. Crea una cuenta/proyecto en https://supabase.com/dashboard
2. En **SQL Editor > New query**, pega el contenido de `supabase.sql` y pulsa **Run**.
3. Ve a **Authentication > Providers > Email**. Usa correo/contraseña y, si es posible, desactiva el registro público de nuevos usuarios en las opciones de autenticación para tu proyecto.
4. En **Authentication > Users > Add user**, crea el usuario administrador con un correo y contraseña fuertes, marcando confirmado cuando corresponda.
5. Copia su UUID desde la tabla de Users y ejecuta una nueva consulta SQL (sustituye el UUID):

```sql
insert into public.admin_users(user_id)
values ('UUID-DEL-USUARIO-ADMINISTRADOR');
```

No publiques esa contraseña ni una clave `service_role`/`secret` en GitHub.

## 2. Conectar web con base de datos

1. En Supabase busca **Project Settings > API** o **Connect**.
2. Copia la **Project URL** y la **publishable key** (o la antigua `anon` key).
3. Reemplaza los marcadores de `config.js`. Es normal que la clave publicable aparezca en el código web: la seguridad está en las políticas y funciones SQL.
4. **No uses nunca la clave `service_role` o una `secret key` en el navegador.**

## 3. Probar la web

En una terminal, dentro de esta carpeta, ejecuta:

```bash
python -m http.server 8000
```

Abre `http://localhost:8000/admin.html`. Inicia sesión, crea una rifa y marca **Activa**. Después entra a `http://localhost:8000/` y comprueba que se vea.

**Prueba completa:** elige un número, registra nombre/teléfono, revisa el registro pendiente en Admin, confirma pago, actualiza la web pública y observa que queda bloqueado. Verifica además que al registrar el mismo número pendiente se reemplazan los datos previos.

## 4. Publicar en GitHub Pages

1. Crea un repositorio en https://github.com/new, por ejemplo `mis-rifas`.
2. Sube los archivos a la rama `main` desde GitHub **Add file > Upload files** (o con `git add .`, `git commit`, `git push`).
3. En el repositorio entra a **Settings > Pages > Build and deployment**.
4. Configura **Deploy from a branch**, `main`, `/(root)` y pulsa **Save**.
5. Tu web aparecerá en `https://TU-USUARIO.github.io/mis-rifas/` y tu panel en `/admin.html`.
6. Si utilizas una política de URL para autenticar en Supabase, agrega las URLs de tu sitio en **Authentication > URL Configuration**. Con el acceso normal por correo y contraseña sin OAuth, no necesitas configurar un callback específico para iniciar sesión.

El enlace de cada rifa se puede copiar desde la página pública, después de elegirla (`?r=ID`).

## Diseño y reglas

- Número **disponible**: nadie ha enviado solicitud.
- Número **pendiente**: alguien lo solicitó, pero otra persona puede sustituir esa solicitud. **El último registro pendiente gana temporalmente**.
- Número **pagado**: no puede reemplazarse desde la página pública.
- El panel puede confirmar, revertir a pendiente y liberar un número.
- Las rifas en borrador o cerradas no reciben nuevas solicitudes ni aparecen en la página pública.
- El público no puede leer nombres ni teléfonos: solo el número y si está pendiente o pagado.
- La lectura pública se actualiza manualmente y cada 20 segundos mientras la pestaña está visible. No es sincronización en tiempo real instantánea.

## Precauciones antes de abrir al público

- **La web no verifica depósitos bancarios.** Revisa en la app de tu banco antes de marcar un boleto como pagado. No confíes solo en comprobantes enviados por participantes.
- La política de reemplazo inmediato permite que alguien pierda su número incluso poco después de enviar el formulario. Considera un aviso muy visible y un proceso de validación rápido; sería recomendable implementar vencimiento temporizado y notificación a quienes fueron reemplazados en una versión posterior.
- El endpoint de solicitudes no tiene CAPTCHA ni límites de frecuencia por IP; una persona podría saturar solicitudes. Para producción pública agrega protección antiabuso (por ejemplo un Edge Function con Turnstile y rate limits).
- Los datos personales se almacenan en Supabase. Publica un aviso de privacidad aplicable, define la retención y controla el acceso administrativo. No compartas capturas del panel con datos personales.
- Verifica que tu CLABE esté correcta. La página muestra la cuenta, pero no comprueba si pertenece al beneficiario.
- En México, los sorteos con venta de boletos pueden requerir autorización de SEGOB. Revisa los requisitos aplicables antes de ofrecer rifas pagadas: https://juegosysorteos.segob.gob.mx/es/Juegos_y_Sorteos/Requisitos_para_Sorteos
- No incluye selección aleatoria de ganadores, comprobantes PDF, validación automática de pagos, subida de imágenes ni notificaciones. Se pueden añadir en una segunda versión.

## Estructura

- `index.html`: interfaz pública.
- `admin.html`: acceso y panel administrador.
- `style.css`: estilos responsivos.
- `shared.js`: conexión y utilidades.
- `public.js`: funcionamiento público.
- `admin.js`: administración.
- `config.js`: URL y clave pública de Supabase.
- `supabase.sql`: esquema, seguridad y RPC.
