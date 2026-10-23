# Migraciones

El ejecutor usa el `Migrator` y `FileMigrationProvider` de Kysely. Las migraciones TypeScript versionadas se ejecutan con `bun run db:migrate` después de copiar `.env.example` a `.env` y levantar PostgreSQL.

`0001_identity_schema` crea usuarios, roles, permisos, asignaciones, sesiones de autenticación, historial de hashes de refresh y auditoría. `0002_seed_identity_rbac` agrega de forma idempotente el rol `super_admin` y el catálogo inicial de permisos.

Las pruebas de integración usan `TEST_DATABASE_URL` contra una base desechable. Crean un esquema con nombre aleatorio, ejecutan las migraciones y eliminan solo ese esquema al terminar; no apuntes esta variable a una base compartida o de producción.

Estas migraciones no incluyen entidades académicas o financieras. Las reglas de estudiantes, matrículas, tarifas, obligaciones, pagos y relaciones requieren validación de producto.
