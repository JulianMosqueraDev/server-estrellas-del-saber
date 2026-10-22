# Contribuir

## Ramas y commits

- Protege `main`: cambios solo por pull request; sin force-push ni borrado.
- Nombra ramas `feat/<issue>-<resumen>`, `fix/<issue>-<resumen>`, `docs/<resumen>` o `chore/<resumen>`.
- Escribe commits breves con Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`).
- Mantén cada pull request enfocado y vinculado a una tarea.

## Permisos y revisión

Aplica mínimo privilegio por separado en cada repositorio: administradores solo para responsables de repositorio; escritura para quienes desarrollan; lectura para colaboradores que solo consultan. No compartas secretos en issues, PR ni archivos locales. Exige al menos una revisión de otra persona y el check `quality` exitoso antes de integrar. Activa protección de `main`, bloqueo de force-push y borrado, y exige resolución de conversaciones. La plantilla [`docs/architecture/repository-policy.md`](docs/architecture/repository-policy.md) detalla la configuración propuesta; estos controles también deben activarse en GitHub Settings.

## Definition of Done

Una tarea termina cuando:

1. El comportamiento solicitado está implementado dentro del alcance y cubierto por pruebas útiles.
2. `bun ci`, formato, lint, chequeo de tipos, pruebas, control de arquitectura y build pasan localmente y en CI.
3. La documentación y los ejemplos de configuración están al día, sin secretos ni datos personales reales.
4. El pull request tiene revisión aprobada, todas las conversaciones resueltas y checks verdes.
5. Los cambios de API o persistencia tienen contratos y migraciones revisados; las decisiones relevantes tienen ADR.

En la Semana 1 no se implementan reglas o flujos del producto para cumplir artificialmente este DoD.
