# Lectura funcional del diagrama

El [diagrama de referencia en Lucidchart](https://lucid.app/lucidchart/0fffff6a-561c-4ea2-a170-f82f4566454b/edit) muestra ideas y relaciones funcionales; no es un modelo de datos confirmado ni un contrato de API.

## Áreas visibles

- **Estudiantes y acudientes:** estudiante con UUID, nombre, identificación, curso, acudientes, alimentación, actividades extra, estado de cuenta, horarios y eventos. Acudientes con nombre, documento, teléfonos, correos y referencias a credenciales.
- **Configuración académica:** cursos, docentes, alimentación, actividades extracurriculares y horarios de salida.
- **Finanzas:** precios mensuales ilustrativos (380/430/480, sin moneda ni regla de asignación especificadas), sumador, precio por evento, historial de pagos y una condición de pago “al día”.
- **Eventos:** creación, calendario compartido, beneficiarios y notificaciones globales.
- **Documentos:** certificado de estudios, plantilla base, firmas de rector/coordinadora y almacenamiento etiquetado como S3/CDN.
- **Información académica:** histórico de notas o boletín.

## Alcance de esta semana

Se entrega el esqueleto técnico, configuración, salud de proceso/base de datos, OpenAPI, migrador configurado y CI. No se implementan identidad/autenticación, estudiantes, acudientes, cursos, matrículas, tarifas, obligaciones, pagos, eventos, notificaciones, boletines, certificados ni almacenamiento de archivos.

No se han definido roles ni permisos del producto. La referencia a `username` y `password` en el diagrama no autoriza a implementar autenticación ni a guardar contraseñas.
