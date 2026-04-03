
-- Clear existing onboarding steps and re-insert comprehensive set
DELETE FROM onboarding_steps;

INSERT INTO onboarding_steps (role, page_route, step_order, target_element, title, content, is_active) VALUES
-- ═══════ DASHBOARD (/) ═══════
-- DO
('DO', '/', 1, '[data-tour="new-project"]', 'Crear Proyecto', 'Desde aquí creas una nueva obra. Asignarás nombre, dirección y podrás invitar a los agentes implicados.', true),
('DO', '/', 2, '[data-tour="projects-list"]', 'Tus Proyectos', 'Aquí verás todas las obras en las que participas. Pulsa sobre una para acceder a sus módulos.', true),
('DO', '/', 3, '[data-tour="notifications-bell"]', 'Centro de Notificaciones', 'La campana te alertará de firmas pendientes, nuevas versiones de planos y actualizaciones de tus proyectos.', true),
-- DEM
('DEM', '/', 1, '[data-tour="new-project"]', 'Crear Proyecto', 'Crea nuevas obras y gestiona los permisos de acceso para cada agente.', true),
('DEM', '/', 2, '[data-tour="projects-list"]', 'Tus Proyectos', 'Panel de acceso rápido a todas tus obras activas.', true),
('DEM', '/', 3, '[data-tour="notifications-bell"]', 'Centro de Notificaciones', 'Revisa aquí las alertas de firmas, planos actualizados y reclamaciones de documentos.', true),
-- CON
('CON', '/', 1, '[data-tour="projects-list"]', 'Tus Proyectos', 'Aquí encontrarás los proyectos a los que has sido invitado como Contratista.', true),
('CON', '/', 2, '[data-tour="notifications-bell"]', 'Centro de Notificaciones', 'La campana te avisará de órdenes de ejecución, firmas y reclamaciones de documentación.', true),
-- PRO
('PRO', '/', 1, '[data-tour="projects-list"]', 'Tus Proyectos', 'Accede a las obras donde participas como Promotor para autorizar pagos y firmar documentos.', true),
('PRO', '/', 2, '[data-tour="notifications-bell"]', 'Centro de Notificaciones', 'Recibe alertas de certificaciones pendientes de pago y documentos por firmar.', true),
-- CSS
('CSS', '/', 1, '[data-tour="projects-list"]', 'Tus Proyectos', 'Panel de obras donde actúas como Coordinador de Seguridad y Salud.', true),
('CSS', '/', 2, '[data-tour="notifications-bell"]', 'Centro de Notificaciones', 'Alertas de incidencias, planos y reclamaciones de documentación de seguridad.', true),

-- ═══════ PROJECT DETAIL (/project/:id) ═══════
-- DO
('DO', '/project/:id', 1, 'body', 'Briefing del Día', 'Tu hoja de ruta diaria con lo más urgente: firmas pendientes, documentos reclamados y últimas novedades.', true),
('DO', '/project/:id', 2, '[data-tour="invite-agent"]', 'Invitar Agentes', 'Invita a los profesionales de la obra: DEM, Contratista, Promotor y CSS. Recibirán un email de acceso.', true),
('DO', '/project/:id', 3, '[data-tour="module-docs"]', 'Documentación de Proyecto', 'Archivo documental base de la obra: memorias, pliegos, estudios geotécnicos...', true),
('DO', '/project/:id', 4, '[data-tour="module-plans"]', 'Planos Válidos', 'Gestión de la última información técnica aprobada con control de versiones.', true),
('DO', '/project/:id', 5, '[data-tour="module-brain"]', 'Cerebro de Obra', 'Asistente IA que resuelve dudas sobre la memoria y mediciones de este proyecto.', true),
('DO', '/project/:id', 6, '[data-tour="module-dwg"]', 'Metro Digital', 'Herramienta para medir distancias y superficies sobre plano.', true),
('DO', '/project/:id', 7, '[data-tour="module-gantt"]', 'Diagrama de Gantt', 'Visualización del cronograma y estado de los hitos de obra.', true),
('DO', '/project/:id', 8, '[data-tour="module-signatures"]', 'Firma de Documentos', 'Gestión de firmas con validez legal: certificado digital o firma manual.', true),
('DO', '/project/:id', 9, '[data-tour="module-costs"]', 'Validación Económica', 'Certificaciones y presupuestos pendientes de firma técnica.', true),
('DO', '/project/:id', 10, '[data-tour="module-cfo"]', 'Docs Finales (CFO)', 'Certificado Final de Obra: 16 puntos de control documental.', true),
-- DEM
('DEM', '/project/:id', 1, 'body', 'Briefing del Día', 'Tu hoja de ruta diaria con lo más urgente: firmas pendientes, documentos reclamados y últimas novedades.', true),
('DEM', '/project/:id', 2, '[data-tour="invite-agent"]', 'Invitar Agentes', 'Gestiona el equipo del proyecto invitando a los agentes necesarios.', true),
('DEM', '/project/:id', 3, '[data-tour="module-docs"]', 'Documentación de Proyecto', 'Archivo documental base de la obra.', true),
('DEM', '/project/:id', 4, '[data-tour="module-plans"]', 'Planos Válidos', 'Gestión de la última información técnica aprobada con control de versiones.', true),
('DEM', '/project/:id', 5, '[data-tour="module-brain"]', 'Cerebro de Obra', 'Asistente IA que resuelve dudas sobre la memoria y mediciones de este proyecto.', true),
('DEM', '/project/:id', 6, '[data-tour="module-dwg"]', 'Metro Digital', 'Herramienta para medir distancias y superficies sobre plano.', true),
('DEM', '/project/:id', 7, '[data-tour="module-gantt"]', 'Diagrama de Gantt', 'Cronograma y estado de los hitos.', true),
('DEM', '/project/:id', 8, '[data-tour="module-orders"]', 'Libro de Órdenes', 'Registro de órdenes de ejecución material.', true),
('DEM', '/project/:id', 9, '[data-tour="module-signatures"]', 'Firma de Documentos', 'Gestión de firmas con validez legal.', true),
('DEM', '/project/:id', 10, '[data-tour="module-costs"]', 'Validación Económica', 'Certificaciones pendientes de firma técnica.', true),
('DEM', '/project/:id', 11, '[data-tour="module-cfo"]', 'Docs Finales (CFO)', 'Certificado Final de Obra con auditoría documental.', true),
-- CON
('CON', '/project/:id', 1, 'body', 'Briefing del Día', 'Tu hoja de ruta diaria con lo más urgente.', true),
('CON', '/project/:id', 2, '[data-tour="module-docs"]', 'Documentación de Proyecto', 'Archivo documental base de la obra.', true),
('CON', '/project/:id', 3, '[data-tour="module-plans"]', 'Planos Válidos', 'Gestión de la última información técnica aprobada.', true),
('CON', '/project/:id', 4, '[data-tour="module-brain"]', 'Cerebro de Obra', 'Asistente IA que resuelve dudas sobre la memoria y mediciones.', true),
('CON', '/project/:id', 5, '[data-tour="module-dwg"]', 'Metro Digital', 'Mide distancias y superficies sobre plano.', true),
('CON', '/project/:id', 6, '[data-tour="module-gantt"]', 'Diagrama de Gantt', 'Cronograma y estado de los hitos.', true),
('CON', '/project/:id', 7, '[data-tour="module-orders"]', 'Órdenes Recibidas', 'Consulta las órdenes de ejecución emitidas por el DEM.', true),
('CON', '/project/:id', 8, '[data-tour="module-costs"]', 'Certificaciones', 'Sube certificaciones y sigue su estado de aprobación.', true),
('CON', '/project/:id', 9, '[data-tour="module-cfo"]', 'Documentos de Cierre', 'Sube la documentación técnica obligatoria para el CFO.', true),
-- PRO
('PRO', '/project/:id', 1, 'body', 'Briefing del Día', 'Tu hoja de ruta diaria con lo más urgente.', true),
('PRO', '/project/:id', 2, '[data-tour="module-docs"]', 'Documentación de Proyecto', 'Archivo documental base de la obra.', true),
('PRO', '/project/:id', 3, '[data-tour="module-plans"]', 'Planos Válidos', 'Planos aprobados con control de versiones.', true),
('PRO', '/project/:id', 4, '[data-tour="module-brain"]', 'Cerebro de Obra', 'Asistente IA del proyecto.', true),
('PRO', '/project/:id', 5, '[data-tour="module-dwg"]', 'Metro Digital', 'Mide distancias y áreas sobre plano.', true),
('PRO', '/project/:id', 6, '[data-tour="module-gantt"]', 'Diagrama de Gantt', 'Cronograma visual de hitos.', true),
('PRO', '/project/:id', 7, '[data-tour="module-costs"]', 'Autorización de Pagos', 'Revisa y autoriza las certificaciones aprobadas técnicamente.', true),
('PRO', '/project/:id', 8, '[data-tour="module-signatures"]', 'Firma de Documentos', 'Firma documentos con certificado digital o firma manual.', true),
-- CSS
('CSS', '/project/:id', 1, 'body', 'Briefing del Día', 'Tu hoja de ruta diaria con lo más urgente.', true),
('CSS', '/project/:id', 2, '[data-tour="module-docs"]', 'Documentación de Proyecto', 'Archivo documental base de la obra.', true),
('CSS', '/project/:id', 3, '[data-tour="module-plans"]', 'Planos Válidos', 'Planos aprobados con control de versiones.', true),
('CSS', '/project/:id', 4, '[data-tour="module-brain"]', 'Cerebro de Obra', 'Asistente IA del proyecto.', true),
('CSS', '/project/:id', 5, '[data-tour="module-dwg"]', 'Metro Digital', 'Mide distancias y áreas sobre plano.', true),
('CSS', '/project/:id', 6, '[data-tour="module-gantt"]', 'Diagrama de Gantt', 'Cronograma visual de hitos.', true),
('CSS', '/project/:id', 7, '[data-tour="module-incidents"]', 'Libro de Incidencias', 'Registra y gestiona las incidencias de seguridad y salud.', true),
('CSS', '/project/:id', 8, '[data-tour="module-cfo"]', 'Documentos de Seguridad', 'Sube la documentación de seguridad obligatoria para el CFO.', true),

-- ═══════ PLANOS VÁLIDOS (/project/:id/plans) ═══════
-- DO & DEM - upload + validation
('DO', '/project/:id/plans', 1, '[data-tour="new-plan"]', 'Crear Plano', 'Crea una entrada para cada plano de la obra (ej: Planta Baja - Estructura).', true),
('DO', '/project/:id/plans', 2, 'body', 'Subir Versión', 'Al subir una versión nueva, la anterior queda automáticamente registrada en el histórico; solo la nueva es válida para obra.', true),
('DO', '/project/:id/plans', 3, 'body', 'Sistema de Validación', 'El plano solo se dará por Confirmado cuando cada rol implicado complete su validación individual.', true),
('DEM', '/project/:id/plans', 1, '[data-tour="new-plan"]', 'Crear Plano', 'Crea entradas de plano y sube las versiones actualizadas.', true),
('DEM', '/project/:id/plans', 2, 'body', 'Subir Versión', 'Al subir una versión nueva, la anterior queda en el histórico; solo la nueva es válida para obra.', true),
('DEM', '/project/:id/plans', 3, 'body', 'Sistema de Validación', 'El plano se confirma cuando cada agente del proyecto firma su conformidad individual.', true),
-- Other roles - view only
('CON', '/project/:id/plans', 1, 'body', 'Planos del Proyecto', 'Aquí encontrarás los planos vigentes. Descárgalos y firma tu conformidad cuando hayas revisado cada versión.', true),
('PRO', '/project/:id/plans', 1, 'body', 'Planos del Proyecto', 'Consulta los planos vigentes y firma tu conformidad tras revisarlos.', true),
('CSS', '/project/:id/plans', 1, 'body', 'Planos del Proyecto', 'Revisa los planos y firma tu conformidad como Coordinador de Seguridad.', true),

-- ═══════ CEREBRO DE OBRA (/project/:id/brain) ═══════
('DO', '/project/:id/brain', 1, 'body', 'Cerebro de Obra', 'Asistente IA que responde preguntas basándose en la memoria del proyecto, mediciones y órdenes de ejecución. Escribe tu pregunta como si hablaras con un técnico de la obra.', true),
('DEM', '/project/:id/brain', 1, 'body', 'Cerebro de Obra', 'IA que combina los documentos del proyecto con las órdenes de ejecución para darte respuestas actualizadas. Las órdenes recientes prevalecen sobre documentos de diseño.', true),
('CON', '/project/:id/brain', 1, 'body', 'Asistente IA', 'Pregunta cualquier duda técnica sobre el proyecto. El asistente consulta la memoria, mediciones y órdenes vigentes.', true),
('PRO', '/project/:id/brain', 1, 'body', 'Asistente IA', 'Consulta información del proyecto. El asistente accede a los documentos y mediciones para responderte.', true),
('CSS', '/project/:id/brain', 1, 'body', 'Asistente IA', 'Consulta dudas técnicas. El asistente conoce la memoria, mediciones y órdenes del proyecto.', true),

-- ═══════ METRO DIGITAL (/project/:id/dwg) ═══════
('DO', '/project/:id/dwg', 1, 'body', 'Metro Digital', 'Herramienta de medición sobre planos PDF. Carga un plano, calibra la escala y mide distancias o áreas directamente sobre el dibujo.', true),
('DO', '/project/:id/dwg', 2, 'body', 'Flujo de Uso', '1º Cargar PDF → 2º Mover y zoom con scroll → 3º Calibrar escala → 4º Medir distancias → 5º Calcular áreas → 6º Limpiar mediciones.', true),
('DEM', '/project/:id/dwg', 1, 'body', 'Metro Digital', 'Mide directamente sobre los planos PDF del proyecto. Calibra la escala y toma medidas de distancia y superficie.', true),
('DEM', '/project/:id/dwg', 2, 'body', 'Flujo de Uso', '1º Cargar PDF → 2º Mover y zoom con scroll → 3º Calibrar escala → 4º Medir distancias → 5º Calcular áreas → 6º Limpiar mediciones.', true),
('CON', '/project/:id/dwg', 1, 'body', 'Metro Digital', 'Mide sobre plano: carga un PDF, calibra y usa las herramientas de distancia y área.', true),
('CON', '/project/:id/dwg', 2, 'body', 'Flujo de Uso', '1º Cargar PDF → 2º Mover y zoom → 3º Calibrar → 4º Medir → 5º Área → 6º Limpiar.', true),
('PRO', '/project/:id/dwg', 1, 'body', 'Metro Digital', 'Carga un plano PDF, calibra la escala y toma medidas de distancia o superficie.', true),
('CSS', '/project/:id/dwg', 1, 'body', 'Metro Digital', 'Mide sobre plano para verificaciones de seguridad: distancias de evacuación, áreas de trabajo...', true),

-- ═══════ DOCS FINALES CFO (/project/:id/cfo) ═══════
('DO', '/project/:id/cfo', 1, '[data-tour="cfo-audit"]', 'Auditoría de Archivo', 'Revisa qué documentos faltan de los 16 puntos de control obligatorios.', true),
('DO', '/project/:id/cfo', 2, '[data-tour="cfo-reclaim"]', 'Reclamar Documentos', 'Envía notificaciones personalizadas a los agentes responsables para que suban la documentación pendiente.', true),
('DEM', '/project/:id/cfo', 1, '[data-tour="cfo-audit"]', 'Auditoría de Archivo', 'Detecta documentos faltantes de los 16 puntos obligatorios.', true),
('DEM', '/project/:id/cfo', 2, '[data-tour="cfo-reclaim"]', 'Reclamar Documentos', 'Reclama la subida de documentos pendientes a los agentes responsables.', true),
('CON', '/project/:id/cfo', 1, 'body', 'Tus Documentos', 'Sube la documentación técnica obligatoria asignada a tu rol (certificados, ensayos, actas...).', true),
('PRO', '/project/:id/cfo', 1, 'body', 'Expediente de Cierre', 'Consulta el estado del Certificado Final de Obra y la documentación aportada por cada agente.', true),
('CSS', '/project/:id/cfo', 1, 'body', 'Documentos de Seguridad', 'Sube el Plan de Seguridad, actas de coordinación y toda la documentación CSS obligatoria.', true),

-- ═══════ VALIDACIÓN ECONÓMICA (/project/:id/costs) ═══════
('CON', '/project/:id/costs', 1, '[data-tour="new-cost"]', 'Subir Certificación', 'Sube el documento de certificación con importe y concepto. Es imprescindible rellenar ambos campos antes de enviar.', true),
('CON', '/project/:id/costs', 2, 'body', 'Flujo de Aprobación', 'Tu certificación pasará por: 1) Firma técnica del DEM, 2) Firma técnica del DO, 3) Autorización de pago del Promotor.', true),
('DEM', '/project/:id/costs', 1, 'body', 'Validación Técnica', 'Revisa las certificaciones pendientes. Abre el documento, verifica los datos y firma técnicamente.', true),
('DEM', '/project/:id/costs', 2, 'body', 'Firma con Certificado Digital', 'Carga tu certificado (.pfx/.p12) e introduce tu contraseña. El sistema recordará la contraseña para futuras firmas con este certificado.', true),
('DEM', '/project/:id/costs', 3, 'body', 'Firma Manual', 'Alternativa: firma válida con hash, huella y geolocalización (excepto para certificaciones oficiales, donde se exige certificado digital).', true),
('DO', '/project/:id/costs', 1, 'body', 'Firma de Certificaciones', 'Revisa y firma técnicamente las certificaciones ya validadas por el DEM.', true),
('DO', '/project/:id/costs', 2, 'body', 'Firma con Certificado Digital', 'Carga tu certificado (.pfx/.p12) e introduce tu contraseña. El sistema la recordará para futuras firmas.', true),
('DO', '/project/:id/costs', 3, 'body', 'Firma Manual', 'Firma válida con hash, huella y geolocalización (no válida para certificaciones oficiales).', true),
('PRO', '/project/:id/costs', 1, 'body', 'Autorización de Pago', 'Revisa las certificaciones aprobadas técnicamente y autoriza su pago.', true),
('PRO', '/project/:id/costs', 2, 'body', 'Firma con Certificado Digital', 'Usa tu certificado digital para firmar la autorización de pago.', true),

-- ═══════ FIRMA DE DOCUMENTOS (/project/:id/signatures) ═══════
('DO', '/project/:id/signatures', 1, 'body', 'Firma de Documentos', 'Gestiona los documentos que requieren tu firma. Puedes usar certificado digital (.p12/.pfx) o firma manual.', true),
('DO', '/project/:id/signatures', 2, 'body', 'Certificado Digital', 'Carga tu certificado, introduce la contraseña (se recordará para futuras firmas) y firma con validez PAdES compatible con Adobe.', true),
('DO', '/project/:id/signatures', 3, 'body', 'Firma Manual', 'Dibuja tu firma en el canvas. Incluye hash SHA-256, huella digital y geolocalización.', true),
('DEM', '/project/:id/signatures', 1, 'body', 'Firma de Documentos', 'Firma los documentos pendientes con certificado digital o firma manual.', true),
('DEM', '/project/:id/signatures', 2, 'body', 'Certificado Digital', 'Carga tu certificado (.p12/.pfx). La contraseña se recordará para futuras firmas.', true),
('CON', '/project/:id/signatures', 1, 'body', 'Firma de Documentos', 'Firma los documentos que te han enviado usando certificado digital o firma manual.', true),
('PRO', '/project/:id/signatures', 1, 'body', 'Firma de Documentos', 'Firma documentos con certificado digital (recomendado) o firma manual con canvas.', true),
('CSS', '/project/:id/signatures', 1, 'body', 'Firma de Documentos', 'Firma la documentación de seguridad con certificado digital o firma manual.', true),

-- ═══════ GANTT (/project/:id/gantt) ═══════
('DO', '/project/:id/gantt', 1, 'body', 'Diagrama de Gantt', 'Visualiza el cronograma de obra. Crea hitos, asigna fechas y sigue el progreso de cada fase.', true),
('DEM', '/project/:id/gantt', 1, 'body', 'Diagrama de Gantt', 'Gestiona el cronograma: crea y edita hitos con fechas de inicio y fin.', true),
('CON', '/project/:id/gantt', 1, 'body', 'Diagrama de Gantt', 'Consulta el cronograma de obra y los plazos de cada hito.', true),
('PRO', '/project/:id/gantt', 1, 'body', 'Diagrama de Gantt', 'Sigue el avance de la obra con la vista de hitos temporales.', true),
('CSS', '/project/:id/gantt', 1, 'body', 'Diagrama de Gantt', 'Consulta los hitos para planificar las inspecciones de seguridad.', true);
