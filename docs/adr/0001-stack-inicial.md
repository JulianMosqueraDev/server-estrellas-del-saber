# ADR 0001: stack inicial y repositorios separados

- **Estado:** aceptado para la base de Semana 1.
- **Fecha:** 2026-10-22.

## Contexto

El producto cubre gestión escolar y financiera, pero el diagrama es orientativo y aún faltan reglas y decisiones de privacidad. La primera entrega debe ser ejecutable y comprobable sin crear módulos prematuros.

## Decisión

- Mantener frontend y backend en repositorios separados con `main` como rama protegida propuesta.
- Backend: Bun, TypeScript estricto, Fastify, TypeBox/JSON Schema, OpenAPI, Kysely como adaptador PostgreSQL y logs Pino integrados en Fastify.
- Frontend: Next.js App Router, React, TypeScript y Tailwind. Redux Toolkit se incorpora cuando haya estado compartido que lo justifique; no se añade un store vacío.
- PostgreSQL es el primer motor implementado. Docker Compose ejecuta solo PostgreSQL en local. API y frontend se ejecutan directamente con Bun.
- Dominio y casos de uso dependen de contratos; Kysely, `pg`, SQL y filas permanecen dentro del adaptador PostgreSQL. No se construye un adaptador MongoDB.
- `bun test` cubre pruebas unitarias y de integración con `Fastify.inject`, sin puerto real.
- Se fija Bun `1.4.4`; los lockfiles fijan el grafo completo de dependencias.

## Motivos

Bun ofrece runtime, gestor de paquetes y test runner en una sola herramienta. La documentación oficial incluye una guía de Next.js con Bun y la ejecución de Next 16 con `bun --bun`; el proyecto incluye una verificación real en CI para detectar incompatibilidades. Fastify permite construir e inyectar solicitudes sin abrir un puerto. PostgreSQL aporta una base relacional apropiada para evaluar relaciones académicas y movimientos financieros, sin decidir todavía su modelo final.

## Consecuencias

- Bun y dependencias están fijados por versión y `bun.lock`; CI usa `bun ci`.
- No se hacen promesas de concurrencia antes de medir perfiles de carga.
- No hay tablas de dominio hasta validar requisitos. El migrador Kysely queda preparado.
- Los ajustes de protección de rama necesitan aplicarse en GitHub Settings por repositorio.

## Referencias

- [Bun: Next.js](https://bun.sh/guides/ecosystem/nextjs)
- [Bun: compatibilidad Node.js](https://bun.sh/docs/runtime/nodejs-compat)
- [Next.js: instalación](https://nextjs.org/docs/app/getting-started/installation)
- [Fastify: TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/)
