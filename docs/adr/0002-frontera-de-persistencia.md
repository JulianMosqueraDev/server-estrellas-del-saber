# ADR 0002: frontera del adaptador de persistencia

- **Estado:** aceptado.
- **Fecha:** 2026-10-22.

## Decisión

Los casos de uso reciben puertos pequeños. Solo `shared/infrastructure/persistence/postgresql` conoce Kysely, el driver `pg`, SQL y la conexión. El punto de composición inyecta el adaptador. Las pruebas de aplicación usan implementaciones falsas.

## Motivo

Evita que las reglas de negocio se acoplen a tablas, consultas o detalles de transacción. Permite sustituir o añadir un adaptador con cambios localizados, pero no elimina el trabajo de adaptar consultas, transacciones, índices o datos si se cambia a otro tipo de motor.

## Consecuencias

- El esquema de negocio y las migraciones de dominio se posponen hasta validar el modelo.
- `bun run architecture:check` bloquea imports de Kysely/PostgreSQL desde dominio y aplicación.
- Cada cambio de persistencia debe mapear registros a tipos de aplicación en el borde del adaptador.
