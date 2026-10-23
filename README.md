# Backend — Estrellas del Saber

API con Bun, TypeScript estricto, Fastify y PostgreSQL. La Fase 2 agrega identidad, sesiones rotatorias y control de acceso por permisos.

## Requisitos

- Bun `1.4.4` (fijado en `.bun-version`).
- Docker Desktop con Docker Compose, solo para PostgreSQL local.

## Desarrollo local

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
bun install --frozen-lockfile
bun run db:migrate
bun run auth:bootstrap-admin
bun run dev
```

La API escucha en `http://localhost:3001`. `GET /health` informa si el proceso está vivo; `GET /ready` devuelve `503` si PostgreSQL no responde. La especificación OpenAPI está en `http://localhost:3001/docs` y su JSON en `/docs/json`.

Docker ejecuta únicamente PostgreSQL. La API se ejecuta directamente con Bun. `auth:bootstrap-admin` solicita correo y nombre en el terminal y pide la contraseña sin mostrarla; no acepta credenciales por argumentos ni crea valores predeterminados. Solo puede inicializar un superadministrador. `auth:recover-admin` es un proceso operativo separado que actualiza la contraseña de un superadministrador ya existente y revoca sus sesiones.

Para detener la base sin borrar los datos: `docker compose stop postgres`. Para eliminar intencionalmente la base local y sus datos: `docker compose down --volumes` (destructivo e irreversible para este entorno).

### Registro de peticiones

En desarrollo, cada respuesta aparece en una línea con estado y código HTTP (`OK` verde para 2xx/3xx, `WARN` amarillo para 4xx y `FAIL` rojo para 5xx), método, ruta, IP remota y duración en milisegundos. La IP se obtiene de la conexión directa; el servidor no confía en `X-Forwarded-For`. En producción, los logs permanecen en JSON estructurado.

## Calidad

```powershell
bun run format:check
bun run lint
bun run typecheck
bun test
bun run test:integration
bun run architecture:check
bun run build
```

`bun test` ejecuta pruebas unitarias y de rutas sin PostgreSQL. Para ejecutar integración, configura `TEST_DATABASE_URL` con una base desechable; el test crea y elimina un esquema de nombre aleatorio. CI proporciona un PostgreSQL aislado y ejecuta ambos grupos. Nunca apuntes `TEST_DATABASE_URL` a una base compartida o de producción.

`bun ci` instala exactamente lo resuelto por `bun.lock` y falla si el manifiesto no coincide. Actualiza dependencias de forma deliberada, revisa el diff del lockfile y ejecuta todas las comprobaciones.

## Configuración

Copia `.env.example` a `.env` y conserva valores ficticios/de desarrollo local. `.env` se ignora en Git. En otros entornos inyecta `DATABASE_URL`, `AUTH_JWT_SECRET` y las demás variables desde el gestor de secretos del entorno. La configuración se valida en `src/shared/config/env.ts`; nunca se imprimen valores de entorno. El valor predeterminado de JWT solo sirve para desarrollo y se rechaza en producción.

## Autenticación

- `POST /api/v1/auth/login`: email y contraseña; devuelve access JWT y establece cookie refresh `HttpOnly`.
- `POST /api/v1/auth/refresh`: rota la cookie y emite otro access JWT. Un refresh usado de nuevo revoca su sesión completa.
- `POST /api/v1/auth/logout`: revoca la sesión encontrada y borra la cookie; es idempotente.
- `GET /api/v1/auth/me`: requiere `Authorization: Bearer <accessToken>` y devuelve perfil, roles y permisos actuales.
- `GET /api/v1/admin/access-check`: requiere el permiso `admin.access`.

El frontend envía `credentials: "include"` en login/refresh/logout y el `Origin` configurado. No persiste tokens en `localStorage` ni `sessionStorage`. El access JWT vence en 10 minutos por defecto. Logout invalida refresh inmediatamente; un access JWT emitido puede seguir funcionando hasta expirar. El refresh usa cookie `SameSite=Lax` y exige coincidencia exacta de `Origin` como defensa CSRF adicional.

### Variables de identidad

`AUTH_JWT_SECRET` debe ser una clave aleatoria de al menos 32 bytes en base64url en producción; no se acepta el placeholder local. Para rotarla sin cortar sesiones, define temporalmente `AUTH_JWT_PREVIOUS_SECRET` con la clave anterior durante al menos el TTL máximo de access tokens (15 minutos); después retírala. `AUTH_JWT_ISSUER` y `WEB_ORIGIN` deben usar HTTPS en producción. `AUTH_COOKIE_SAME_SITE=lax` sirve cuando frontend y API son del mismo sitio; usa `none` solo para frontend/API cross-site y siempre sobre HTTPS. `AUTH_ACCESS_TOKEN_TTL_SECONDS` admite de 300 a 900 segundos; `AUTH_REFRESH_TOKEN_TTL_DAYS`, de 1 a 90 días. Los límites de login y refresh se ajustan con `AUTH_LOGIN_RATE_LIMIT_MAX`, `AUTH_REFRESH_RATE_LIMIT_MAX` y `AUTH_RATE_LIMIT_WINDOW_SECONDS`.

Los límites de intentos se guardan en memoria por proceso y combinan IP con correo normalizado en login; refresh limita por IP y token presentado. El servidor no confía en `X-Forwarded-For`; detrás de proxy, `request.ip` será la IP del proxy hasta configurar proxies confiables de forma explícita. Para varias réplicas se requiere un rate-limit store compartido.

Detalles de algoritmo, cookies, auditoría y rotación de claves: [`ADR 0003`](docs/adr/0003-identidad-y-sesiones.md).

## Arquitectura

- `src/shared/domain`: errores compartidos, sin dependencias de Fastify ni persistencia.
- `src/shared/application`: puertos y casos de uso compartidos; depende de contratos.
- `src/shared/infrastructure/persistence/postgresql`: conexión Kysely y driver `pg`.
- `src/modules/identity`: puertos y casos de uso de identidad, adaptador PostgreSQL, criptografía y rutas HTTP.
- `src/shared/presentation/http`: rutas técnicas y formato de errores.
- `src/bootstrap`: composición e inicio/cierre del servidor.

La regla de dependencias y el alcance del producto están documentados en [`docs/architecture`](docs/architecture/). Las comprobaciones de capas están en `scripts/check-dependency-boundaries.ts`.

## Ramas y revisión

Usa `main` protegida y ramas cortas `feat/<issue>-<resumen>`, `fix/...`, `docs/...` o `chore/...`. Los cambios entran por pull request con revisión y CI verde. La política propuesta y los permisos mínimos están en [`CONTRIBUTING.md`](CONTRIBUTING.md). Las reglas de protección se deben aplicar en la configuración de GitHub de este repositorio.
