# Convenciones

- Directorios y archivos TypeScript en `kebab-case`; módulos de producto con nombres singulares.
- Tipos, interfaces y clases en `PascalCase`; variables y funciones en `camelCase`; variables de entorno en `UPPER_SNAKE_CASE`.
- Rutas futuras en plural bajo `/api/v1`; nombres JSON en `camelCase`.
- Validar entrada en presentación mediante JSON Schema/TypeBox y variables de entorno en un único módulo. No aceptar datos sin validar en casos de uso.
- Errores de aplicación con código estable `SCREAMING_SNAKE_CASE`; la capa HTTP asigna estado y mensaje seguro. Nunca enviar stack traces, SQL, credenciales o errores internos al cliente.
- Pino registra eventos estructurados con ID de solicitud. En desarrollo, cada petición registra estado, método, ruta, IP de la conexión directa y duración; producción conserva JSON. No registrar contraseñas, tokens, cookies, cuerpos ni parámetros de consulta. La IP se limita al diagnóstico del servidor y debe tratarse como dato sensible. Registrar códigos de error en vez del objeto de error del driver.
- Nombres de migración descriptivos y ordenados; migraciones futuras deben poder revisarse y no borrar datos sin estrategia explícita.
- Mantener archivos y funciones pequeños cuando eso haga más claro el cambio; abstraer solo cuando haya un límite o necesidad observable.
