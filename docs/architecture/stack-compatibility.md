# Compatibilidad verificada

Versiones estables consultadas el 2026-10-22 y fijadas para esta base:

| Componente | Versión elegida                 | Evidencia/decisión                                                                                                                                |
| ---------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bun        | `1.4.4`                         | Release estable oficial publicada el 22 de octubre de 2026; la acción de CI lee `.bun-version`.                                                   |
| Fastify    | `5.12.7`                        | Última release estable 5.x consultada; la rama 6 observada aún es alpha.                                                                          |
| Next.js    | `16.4.2`                        | Última release estable consultada; los canaries 16.5 se excluyen.                                                                                 |
| PostgreSQL | `18.6`                          | Versión menor actual soportada en la tabla oficial de versionado. La imagen 18 monta datos en `/var/lib/postgresql`.                              |
| TypeScript | `6.x` fijado por `bun.lock`     | Se usa el compilador estándar `tsc` y opciones explícitas; TypeScript 7 se difiere hasta verificar el ecosistema completo y el compilador nativo. |
| ESLint     | `10.13.x` fijado por `bun.lock` | ESLint 9 está fuera de soporte; las versiones elegidas de `eslint-config-next` y typescript-eslint declaran compatibilidad con ESLint 10.         |

Bun documenta que puede ejecutar Next.js con `bun --bun` y que `Fastify.inject()` funciona. Estas afirmaciones son punto de partida, no reemplazan las comprobaciones del repositorio: CI instala con lockfile y ejecuta lint, typecheck, tests y build. Se debe volver a ejecutar CI al actualizar versiones.

La imagen de PostgreSQL está fijada a `postgres:18.6-alpine3.23`. Si se actualiza el major, revisar el directorio de volumen y planificar una migración de datos.
