# Preguntas de producto pendientes

El diagrama funcional da contexto, pero las siguientes decisiones requieren validación antes de crear modelos académicos o financieros.

## Estudiantes y academia

- ¿Qué identificador personal se almacena, quién lo ve y cómo se evita duplicar estudiantes?
- ¿Un estudiante puede pertenecer a varios acudientes y un acudiente tener varios estudiantes? ¿Qué relaciones deben representarse?
- ¿Cómo se definen curso, año/periodo académico, estados y transiciones de matrícula?
- ¿Alimentación, actividades y horarios son catálogos, asignaciones por estudiante o historial con vigencia?
- ¿Qué datos contiene un boletín y cuáles son los periodos, escalas y permisos para consultarlo?

## Finanzas

- ¿Cuál es la moneda, precisión y zona horaria que se usarán?
- ¿Qué representa cada tarifa y qué determina su vigencia, aplicación y ajuste?
- ¿Cuándo se crea una obligación, cómo se aplican pagos parciales y cómo se corrigen, anulan o devuelven pagos?
- ¿Qué medios de pago existen y qué evidencia o referencia se conserva?
- ¿Cómo se calcula el estado de cuenta, vencido, saldo, mora y cierre de cartera? ¿Qué fechas y excepciones aplican?
- ¿Un pago puede distribuirse entre varias obligaciones y una obligación recibir varios pagos? ¿Cómo se auditan esos movimientos?

## Eventos, documentos y datos personales

- ¿Quién puede crear eventos, inscribir beneficiarios y enviar notificaciones? ¿Qué canales y consentimientos se requieren?
- ¿Qué tipos, retención, acceso y firma válida aplican a certificados y archivos?
- ¿Qué datos personales son imprescindibles, cuánto tiempo se conservan y cómo se atienden correcciones o eliminaciones?
- Invitaciones, recuperación por correo, MFA y login externo siguen fuera del alcance de identidad acordado en [ADR 0003](../adr/0003-identidad-y-sesiones.md).

## Operación

- ¿Cuáles son los perfiles de carga, disponibilidad, retención y recuperación ante desastre que deben medirse antes de una afirmación de escala?
- ¿Cuál es el origen de datos existente, si lo hay, y quién valida una importación?
