# Dirección de dependencias

```text
presentación HTTP ──> aplicación ──> dominio
infraestructura ────> contratos de aplicación/dominio
bootstrap ──────────> presentación + infraestructura
```

- Entidades, value objects, puertos y casos de uso no importan Fastify, TypeBox, Kysely, `pg`, SQL ni tipos de filas.
- Los contratos describen necesidades de aplicación; el adaptador PostgreSQL los implementa y mapea sus filas al modelo de aplicación.
- Rutas HTTP validan y traducen solicitudes/respuestas; no contienen reglas de negocio ni consultas.
- `src/bootstrap` es el único lugar que conecta el adaptador concreto con la aplicación.
- Los errores de aplicación tienen códigos estables y no dependen de códigos HTTP. La capa HTTP asigna el estado y una respuesta segura.
- Los módulos se importan a través de contratos públicos; no se permiten ciclos entre módulos ni imports a detalles internos de otro módulo.
- Para otro motor en el futuro, se implementará un adaptador que cumpla los mismos puertos y se migrarán datos de forma explícita. La separación limita el cambio, pero no promete que cambiar de modelo relacional a documental sea solo una configuración.

`bun run architecture:check` busca dependencias de persistencia dentro de las capas de dominio y aplicación.
