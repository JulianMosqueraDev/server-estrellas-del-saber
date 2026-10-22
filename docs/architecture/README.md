# Arquitectura del backend

La Semana 1 establece un monolito modular. Los módulos de producto se añadirán cuando se confirmen sus reglas. Cada módulo seguirá `domain → application → infrastructure/presentation`: dominio no depende de capas externas; aplicación depende de contratos; infraestructura implementa esos contratos; presentación traduce HTTP a llamadas de aplicación. La composición queda en `src/bootstrap`.

El proyecto comienza con `shared` para configuración, errores y salud técnica. No se crean módulos de negocio vacíos. Las rutas de producto futuras vivirán bajo `/api/v1`; salud técnica y documentación quedan fuera de ese prefijo.

Véanse [reglas de dependencias](dependency-rules.md), [alcance funcional](product-scope.md), [preguntas abiertas](open-questions.md), [política de repositorios](repository-policy.md) y los [ADR](../adr/).
