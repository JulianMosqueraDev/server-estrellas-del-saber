# Política propuesta para los repositorios

Frontend y backend ya están inicializados como repositorios Git independientes, cada uno con `main` y su propio `origin`:

- Frontend: `client-estrellas-del-saber`.
- Backend: `server-estrellas-del-saber`.

Se mantienen separados porque tienen ciclos de entrega y responsabilidades distintos. Los contratos HTTP y los cambios coordinados se documentan/revisan en ambos PR; no se crea un monorepo paralelo.

## Ramas y merge

- `main` es la rama estable y protegida.
- Ramas cortas: `feat/<issue>-<resumen>`, `fix/<issue>-<resumen>`, `docs/<resumen>` y `chore/<resumen>`.
- Pull request requerido; una aprobación de otra persona y el check `quality` deben pasar. Exigir resolución de conversaciones.
- Bloquear force-push y borrado de `main`; preferir squash merge y borrar ramas al integrar.
- No desplegar desde CI durante la Semana 1.

## Permisos recomendados (mínimo privilegio)

- **Admin:** solo responsables que gestionan configuración, accesos y protección de ramas.
- **Write:** colaboradores que crean ramas y pull requests.
- **Read/Triage:** revisores de contexto o personas que clasifican incidencias sin integrar cambios.
- Limitar quién puede administrar Actions, secretos y reglas; no crear secretos de producción en esta fase.
- Repetir la revisión de acceso por separado para los dos repositorios.

`CODEOWNERS` solicita revisión de `@JulianMosqueraDev`. En GitHub Settings se debe activar protección de `main`, exigir pull request y review, el check `quality`, conversaciones resueltas y bloquear force-push/borrado. La creación local de los archivos no cambia esos ajustes remotos.
