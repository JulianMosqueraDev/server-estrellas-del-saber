# ADR 0003: identidad local, tokens y sesiones revocables

- **Estado:** aceptado.
- **Fecha:** 2026-10-23.

## Decisiones

- Las cuentas locales se identifican por correo normalizado y guardan contraseñas con Argon2id de Bun (`memoryCost=65536 KiB`, `timeCost=2`, paralelismo predeterminado `1`). La verificación usa `Bun.password.verify`.
- El access token usa JWT HS256 con `sub`, `sid`, `iss`, `aud`, `iat`, `exp` y `jti`; la vigencia inicial es 600 segundos y se configura entre 300 y 900 segundos. `jose` verifica firma, algoritmo permitido, emisor, audiencia, expiración y edad máxima.
- El refresh token es 32 bytes aleatorios en base64url. La base guarda SHA-256 hexadecimal; cada rotación mueve el hash anterior a un historial y reemplaza el hash activo en una transacción con bloqueo de fila.
- Reutilizar un hash rotado revoca la sesión completa. Los hashes históricos se conservan junto con la sesión para detectar reutilizaciones posteriores; las políticas de retención deben purgar sesiones expiradas y sus historiales con una tarea operativa futura.
- El navegador guarda el refresh en cookie `HttpOnly`, `SameSite=Lax` por defecto (configurable a `None` para despliegues cross-site), `Path=/api/v1/auth`, `Secure` en producción y sin `Domain`. El access token solo se devuelve en JSON para el cliente; nunca se registra.
- Login, refresh y logout requieren el `Origin` exacto configurado. CORS permite un origen explícito con credenciales. El despliegue debe terminar TLS antes de exponer producción; el backend no confía en `X-Forwarded-*` mientras no se configure una lista de proxies confiables.
- Los permisos y roles se resuelven en la base por request. Así, cambios de RBAC y la desactivación de cuentas tienen efecto inmediato. Logout revoca refresh y no invalida un JWT ya emitido, que puede seguir vigente hasta su expiración máxima de 15 minutos.
- Login y refresh limitan por IP y por identificador (correo normalizado en login, IP/token en refresh) usando almacenamiento en memoria por proceso. Para varias réplicas se necesitará un store compartido antes de escalar ese despliegue.
- El primer superadministrador se crea solo con `auth:bootstrap-admin`; `auth:recover-admin` solo cambia la contraseña de un superadministrador existente y revoca sus sesiones. No hay registro público ni permisos asignados a usuarios normales.

## Consecuencias

- El dominio y los casos de uso dependen de puertos de repositorio y seguridad, nunca de Kysely, SQL, Fastify o `jose`.
- La tabla `auth_refresh_token_history` complementa `auth_sessions` para detectar tokens ya rotados sin guardar valores utilizables.
- La auditoría contiene códigos de evento, ID de usuario nullable, IP y user-agent acotado; nunca correo, contraseñas, hashes, cookies o tokens. El acceso y periodo de retención de auditoría deben definirse según la política de datos del despliegue.
- La clave JWT requiere rotación operativa coordinada. Durante la transición, `AUTH_JWT_PREVIOUS_SECRET` valida tokens anteriores mientras se firma con la clave actual; se retira después del TTL máximo de 15 minutos. El siguiente refresh emite un access token con la clave nueva.
- El rate limit local no coordina réplicas ni sustituye pruebas de carga. No se afirma soporte para 20.000 usuarios concurrentes.
