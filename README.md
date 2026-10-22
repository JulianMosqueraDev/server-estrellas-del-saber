# Backend — Estrellas del Saber

API inicial con Bun, TypeScript estricto, Fastify y PostgreSQL. La Semana 1 prepara infraestructura; no implementa módulos del producto.

## Requisitos

- Bun `1.4.4` (fijado en `.bun-version`).
- Docker Desktop con Docker Compose, solo para PostgreSQL local.

## Desarrollo local

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
bun install --frozen-lockfile
bun run db:migrate
bun run dev
```

La API escucha en `http://localhost:3001`. `GET /health` informa si el proceso está vivo; `GET /ready` devuelve `503` si PostgreSQL no responde. La especificación OpenAPI está en `http://localhost:3001/docs` y su JSON en `/docs/json`.

Docker ejecuta únicamente PostgreSQL. La API se ejecuta directamente con Bun. Las migraciones no incluyen tablas de negocio: se añadirán después de validar el modelo funcional.

Para detener la base sin borrar los datos: `docker compose stop postgres`. Para eliminar intencionalmente la base local y sus datos: `docker compose down --volumes` (destructivo e irreversible para este entorno).

### Registro de peticiones

En desarrollo, cada respuesta aparece en una línea con estado y código HTTP (`OK` verde para 2xx/3xx, `WARN` amarillo para 4xx y `FAIL` rojo para 5xx), método, ruta, IP remota y duración en milisegundos. La IP se obtiene de la conexión directa; el servidor no confía en `X-Forwarded-For`. En producción, los logs permanecen en JSON estructurado.

## Calidad

```powershell
bun run lint
bun run typecheck
bun test
bun run architecture:check
bun run build
```

`bun ci` instala exactamente lo resuelto por `bun.lock` y falla si el manifiesto no coincide. Actualiza dependencias de forma deliberada, revisa el diff del lockfile y ejecuta todas las comprobaciones.

## Configuración

Copia `.env.example` a `.env` y conserva valores ficticios/de desarrollo local. `.env` se ignora en Git. En otros entornos inyecta `DATABASE_URL` y las demás variables desde el gestor de secretos del entorno. La configuración se valida en `src/shared/config/env.ts`; nunca se imprimen valores de entorno.

## Arquitectura

- `src/shared/domain`: errores compartidos, sin dependencias de Fastify ni persistencia.
- `src/shared/application`: puertos y casos de uso; depende de contratos.
- `src/shared/infrastructure/persistence/postgresql`: adaptador Kysely y driver `pg`.
- `src/shared/presentation/http`: rutas, validación y traducción a HTTP.
- `src/bootstrap`: composición e inicio/cierre del servidor.

La regla de dependencias y el alcance del producto están documentados en [`docs/architecture`](docs/architecture/). Las comprobaciones de capas están en `scripts/check-dependency-boundaries.ts`.

## Ramas y revisión

Usa `main` protegida y ramas cortas `feat/<issue>-<resumen>`, `fix/...`, `docs/...` o `chore/...`. Los cambios entran por pull request con revisión y CI verde. La política propuesta y los permisos mínimos están en [`CONTRIBUTING.md`](CONTRIBUTING.md). Las reglas de protección se deben aplicar en la configuración de GitHub de este repositorio.
