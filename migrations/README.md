# Migraciones

El ejecutor usa el `Migrator` y `FileMigrationProvider` de Kysely. Coloca futuras migraciones TypeScript aquí y ejecútalas con `bun run db:migrate` después de copiar `.env.example` a `.env` y levantar PostgreSQL.

Esta carpeta no incluye migraciones de entidades de producto: aún no se validaron reglas de estudiantes, matrículas, tarifas, obligaciones, pagos ni relaciones. No crear un SQL de negocio a partir únicamente del diagrama funcional.
