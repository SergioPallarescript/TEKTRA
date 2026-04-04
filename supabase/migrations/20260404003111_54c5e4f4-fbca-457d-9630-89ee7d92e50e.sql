
-- Reset all module steps and re-insert with proper body intro steps + dynamic steps
DELETE FROM onboarding_steps WHERE page_route IN (
  '/project/:id/docs', '/project/:id/plans', '/project/:id/orders',
  '/project/:id/costs', '/project/:id/dwg', '/project/:id/cfo',
  '/project/:id/signatures'
);

-- ═══ DOCUMENTACIÓN (/project/:id/docs) ═══
-- All roles get same intro
INSERT INTO onboarding_steps (role, page_route, step_order, target_element, title, content, is_active) VALUES
('DO',  '/project/:id/docs', 1, 'body', 'Documentación de Proyecto', 'Aquí se almacena toda la documentación técnica del proyecto. Los archivos subidos alimentan el Cerebro de Obra para responder consultas inteligentes.', true),
('DO',  '/project/:id/docs', 2, '[data-tour="upload-docs"]', 'Subir Documentos', 'Pulsa aquí para subir documentos técnicos (PDF, Word, Excel, imágenes). Solo DO y DEM pueden subir archivos. Máximo 50 MB por archivo.', true),
('DO',  '/project/:id/docs', 3, '[data-tour="docs-list"]', 'Listado de Documentos', 'Aquí aparecen todos los documentos subidos. Haz clic en cualquiera para descargarlo.', true),
('DEM', '/project/:id/docs', 1, 'body', 'Documentación de Proyecto', 'Aquí se almacena toda la documentación técnica del proyecto. Los archivos subidos alimentan el Cerebro de Obra para responder consultas inteligentes.', true),
('DEM', '/project/:id/docs', 2, '[data-tour="upload-docs"]', 'Subir Documentos', 'Pulsa aquí para subir documentos técnicos (PDF, Word, Excel, imágenes). Solo DO y DEM pueden subir archivos. Máximo 50 MB por archivo.', true),
('DEM', '/project/:id/docs', 3, '[data-tour="docs-list"]', 'Listado de Documentos', 'Aquí aparecen todos los documentos subidos. Haz clic en cualquiera para descargarlo.', true),
('CON', '/project/:id/docs', 1, 'body', 'Documentación de Proyecto', 'Aquí se almacena toda la documentación técnica del proyecto. Puedes consultar y descargar todos los documentos subidos por la dirección de obra.', true),
('CON', '/project/:id/docs', 2, '[data-tour="docs-list"]', 'Listado de Documentos', 'Haz clic en cualquier documento para descargarlo a tu dispositivo.', true),
('PRO', '/project/:id/docs', 1, 'body', 'Documentación de Proyecto', 'Aquí se almacena toda la documentación técnica del proyecto. Puedes consultar y descargar todos los documentos disponibles.', true),
('PRO', '/project/:id/docs', 2, '[data-tour="docs-list"]', 'Listado de Documentos', 'Haz clic en cualquier documento para descargarlo.', true),
('CSS', '/project/:id/docs', 1, 'body', 'Documentación de Proyecto', 'Aquí se almacena toda la documentación técnica del proyecto. Consulta y descarga los documentos que necesites.', true),
('CSS', '/project/:id/docs', 2, '[data-tour="docs-list"]', 'Listado de Documentos', 'Haz clic en cualquier documento para descargarlo.', true);

-- ═══ PLANOS VÁLIDOS (/project/:id/plans) ═══
INSERT INTO onboarding_steps (role, page_route, step_order, target_element, title, content, is_active) VALUES
('DO',  '/project/:id/plans', 1, 'body', 'Planos Válidos', 'Gestiona los planos oficiales del proyecto. Cada plano puede tener múltiples versiones y requiere la conformidad de todos los agentes para ser válido.', true),
('DO',  '/project/:id/plans', 2, '[data-tour="upload-version"]', 'Subir Nueva Versión', 'Sube una nueva versión del plano. Al subir una nueva versión, las conformidades anteriores se invalidan y todos los agentes deben volver a confirmar.', true),
('DO',  '/project/:id/plans', 3, '[data-tour="conformity-section"]', 'Estado de Conformidad', 'Aquí se muestra el estado de conformidad de la última versión. Todos los roles deben confirmar para que el plano sea válido.', true),
('DO',  '/project/:id/plans', 4, '[data-tour="confirm-conformity"]', 'Confirmar Conformidad', 'Pulsa aquí para registrar tu conformidad digital con esta versión del plano. Se registrará tu identidad, hora y ubicación.', true),
('DO',  '/project/:id/plans', 5, '[data-tour="conformity-roles"]', 'Validación por Roles', 'Cada rol del proyecto debe confirmar la conformidad. Los iconos verdes indican roles que ya han firmado, los grises están pendientes.', true),
('DEM', '/project/:id/plans', 1, 'body', 'Planos Válidos', 'Gestiona los planos oficiales del proyecto. Sube versiones actualizadas y gestiona la conformidad de todos los agentes.', true),
('DEM', '/project/:id/plans', 2, '[data-tour="upload-version"]', 'Subir Nueva Versión', 'Sube una nueva versión del plano. Al subir una nueva versión, las conformidades anteriores se invalidan automáticamente.', true),
('DEM', '/project/:id/plans', 3, '[data-tour="conformity-section"]', 'Estado de Conformidad', 'Aquí se muestra el estado de conformidad de la última versión. Todos los roles deben confirmar.', true),
('DEM', '/project/:id/plans', 4, '[data-tour="confirm-conformity"]', 'Confirmar Conformidad', 'Pulsa aquí para registrar tu conformidad digital con esta versión del plano.', true),
('DEM', '/project/:id/plans', 5, '[data-tour="conformity-roles"]', 'Validación por Roles', 'Cada rol del proyecto debe confirmar. Verde = firmado, gris = pendiente.', true),
('CON', '/project/:id/plans', 1, 'body', 'Planos Válidos', 'Consulta los planos oficiales del proyecto y confirma tu conformidad cuando se publiquen nuevas versiones.', true),
('CON', '/project/:id/plans', 2, '[data-tour="conformity-section"]', 'Estado de Conformidad', 'Estado de conformidad de la última versión. Necesitas confirmar cada nueva versión.', true),
('CON', '/project/:id/plans', 3, '[data-tour="confirm-conformity"]', 'Confirmar Conformidad', 'Pulsa para registrar tu conformidad con esta versión del plano.', true),
('CON', '/project/:id/plans', 4, '[data-tour="conformity-roles"]', 'Validación por Roles', 'Todos los roles deben confirmar para que el plano sea válido.', true),
('PRO', '/project/:id/plans', 1, 'body', 'Planos Válidos', 'Consulta los planos del proyecto y confirma tu conformidad como promotor.', true),
('PRO', '/project/:id/plans', 2, '[data-tour="conformity-section"]', 'Estado de Conformidad', 'Estado de conformidad de cada versión del plano.', true),
('PRO', '/project/:id/plans', 3, '[data-tour="confirm-conformity"]', 'Confirmar Conformidad', 'Registra tu conformidad con esta versión.', true),
('PRO', '/project/:id/plans', 4, '[data-tour="conformity-roles"]', 'Validación por Roles', 'Todos los roles deben confirmar para validar el plano.', true),
('CSS', '/project/:id/plans', 1, 'body', 'Planos Válidos', 'Consulta los planos del proyecto y confirma tu conformidad como CSS.', true),
('CSS', '/project/:id/plans', 2, '[data-tour="conformity-section"]', 'Estado de Conformidad', 'Estado de conformidad de la última versión.', true),
('CSS', '/project/:id/plans', 3, '[data-tour="confirm-conformity"]', 'Confirmar Conformidad', 'Registra tu conformidad con esta versión.', true),
('CSS', '/project/:id/plans', 4, '[data-tour="conformity-roles"]', 'Validación por Roles', 'Todos los roles deben confirmar.', true);

-- ═══ LIBRO DE ÓRDENES (/project/:id/orders) ═══
INSERT INTO onboarding_steps (role, page_route, step_order, target_element, title, content, is_active) VALUES
('DO',  '/project/:id/orders', 1, 'body', 'Libro de Órdenes', 'Registro oficial de las órdenes e instrucciones de la Dirección Facultativa. Las órdenes se generan con estructura profesional y quedan registradas con trazabilidad completa.', true),
('DO',  '/project/:id/orders', 2, '[data-tour="new-order"]', 'Nueva Orden', 'Crea una nueva orden. Puedes dictarla por voz, adjuntar fotos y el sistema la formateará automáticamente en secciones profesionales.', true),
('DEM', '/project/:id/orders', 1, 'body', 'Libro de Órdenes', 'Registro oficial de las órdenes e instrucciones de la Dirección Facultativa. Crea órdenes con dictado por voz y adjunta fotografías.', true),
('DEM', '/project/:id/orders', 2, '[data-tour="new-order"]', 'Nueva Orden', 'Crea una nueva orden. Puedes dictarla por voz, adjuntar fotos y el sistema la formateará profesionalmente.', true),
('CON', '/project/:id/orders', 1, 'body', 'Órdenes Recibidas', 'Aquí puedes consultar todas las órdenes e instrucciones emitidas por la Dirección Facultativa para este proyecto.', true),
('PRO', '/project/:id/orders', 1, 'body', 'Libro de Órdenes', 'Consulta las órdenes emitidas por la Dirección Facultativa en este proyecto.', true),
('CSS', '/project/:id/orders', 1, 'body', 'Libro de Órdenes', 'Consulta las órdenes de obra emitidas y su estado de validación.', true);

-- ═══ VALIDACIÓN ECONÓMICA (/project/:id/costs) ═══
INSERT INTO onboarding_steps (role, page_route, step_order, target_element, title, content, is_active) VALUES
('DO',  '/project/:id/costs', 1, 'body', 'Validación Económica', 'Gestiona presupuestos y certificaciones del proyecto. Los documentos requieren firma digital de los agentes técnicos antes de poder autorizar el pago.', true),
('DO',  '/project/:id/costs', 2, '[data-tour="cost-preview"]', 'Previsualización del Documento', 'Revisa el documento PDF antes de firmarlo. Verifica que toda la información es correcta.', true),
('DO',  '/project/:id/costs', 3, '[data-tour="cost-download"]', 'Descargar Documento', 'Descarga el documento a tu dispositivo. Si lo descargas antes de firmarlo, se descargará sin tu firma técnica.', true),
('DO',  '/project/:id/costs', 4, '[data-tour="cost-signature-panel"]', 'Panel de Firma', 'Aquí puedes firmar el documento con certificado digital o firma manual.', true),
('DO',  '/project/:id/costs', 5, '[data-tour="cost-certificate-tab"]', 'Certificado Digital', 'Selecciona esta pestaña para firmar con tu certificado .p12/.pfx. El sistema recordará tu contraseña para futuras firmas.', true),
('DO',  '/project/:id/costs', 6, '[data-tour="cost-manual-tab"]', 'Firma Manual', 'Firma válida con hash SHA-256, timestamp y geolocalización. No válida para certificaciones económicas oficiales.', true),
('DEM', '/project/:id/costs', 1, 'body', 'Validación Económica', 'Gestiona presupuestos y certificaciones. Las certificaciones requieren tu firma técnica digital obligatoria junto con la del DO.', true),
('DEM', '/project/:id/costs', 2, '[data-tour="cost-preview"]', 'Previsualización del Documento', 'Revisa el documento PDF antes de firmarlo.', true),
('DEM', '/project/:id/costs', 3, '[data-tour="cost-download"]', 'Descargar Documento', 'Descarga el documento. Sin firma técnica si no lo has firmado previamente.', true),
('DEM', '/project/:id/costs', 4, '[data-tour="cost-signature-panel"]', 'Panel de Firma', 'Firma el documento con certificado digital o firma manual.', true),
('DEM', '/project/:id/costs', 5, '[data-tour="cost-certificate-tab"]', 'Certificado Digital', 'Carga tu certificado .p12/.pfx. El sistema recordará la contraseña para futuras firmas con este certificado.', true),
('DEM', '/project/:id/costs', 6, '[data-tour="cost-manual-tab"]', 'Firma Manual', 'Firma con hash y geolocalización. No válida para certificaciones oficiales.', true),
('CON', '/project/:id/costs', 1, 'body', 'Validación Económica', 'Sube presupuestos y certificaciones para validación por la Dirección Facultativa y el Promotor.', true),
('CON', '/project/:id/costs', 2, '[data-tour="new-cost"]', 'Nuevo Documento', 'Pulsa aquí para enviar un nuevo presupuesto o certificación con su documento PDF adjunto.', true),
('PRO', '/project/:id/costs', 1, 'body', 'Validación Económica', 'Revisa y autoriza el pago de presupuestos y certificaciones una vez validados por la Dirección Facultativa.', true),
('PRO', '/project/:id/costs', 2, '[data-tour="cost-preview"]', 'Previsualización del Documento', 'Revisa el documento antes de autorizar el pago.', true),
('PRO', '/project/:id/costs', 3, '[data-tour="cost-download"]', 'Descargar Documento', 'Descarga el documento para tu archivo.', true),
('PRO', '/project/:id/costs', 4, '[data-tour="cost-signature-panel"]', 'Panel de Firma', 'Firma con certificado digital para aceptar el presupuesto.', true),
('PRO', '/project/:id/costs', 5, '[data-tour="cost-certificate-tab"]', 'Certificado Digital', 'Carga tu certificado .p12/.pfx para firmar.', true),
('CSS', '/project/:id/costs', 1, 'body', 'Validación Económica', 'Consulta el estado de los documentos económicos del proyecto.', true);

-- ═══ METRO DIGITAL (/project/:id/dwg) ═══
INSERT INTO onboarding_steps (role, page_route, step_order, target_element, title, content, is_active) VALUES
('DO',  '/project/:id/dwg', 1, 'body', 'Metro Digital', 'Carga un plano PDF, calibra la escala con una cota conocida y mide distancias y áreas con precisión directamente sobre el documento.', true),
('DO',  '/project/:id/dwg', 2, '[data-tour="dwg-upload"]', 'Subir Plano', 'Sube un archivo PDF con tu plano. Solo DO y DEM pueden subir archivos.', true),
('DO',  '/project/:id/dwg', 3, '[data-tour="dwg-load-pdf"]', 'Cargar PDF', 'Selecciona un plano y pulsa "Cargar PDF" para renderizarlo en alta resolución.', true),
('DO',  '/project/:id/dwg', 4, '[data-tour="dwg-toolbar"]', 'Barra de Herramientas', 'Todas las herramientas de medición están aquí. El flujo es: Calibrar → Medir → Área.', true),
('DO',  '/project/:id/dwg', 5, '[data-tour="dwg-move"]', 'Mover y Zoom', 'Usa esta herramienta para navegar por el plano. Zoom con la rueda del ratón o pellizco en móvil.', true),
('DO',  '/project/:id/dwg', 6, '[data-tour="dwg-calibrate"]', 'Calibrar Escala', 'PASO 1: Marca dos puntos de una cota conocida e introduce la distancia real. Sin calibrar no puedes medir.', true),
('DO',  '/project/:id/dwg', 7, '[data-tour="dwg-measure"]', 'Medir Distancias', 'PASO 2: Marca dos puntos para medir la distancia real entre ellos en metros.', true),
('DO',  '/project/:id/dwg', 8, '[data-tour="dwg-area"]', 'Calcular Áreas', 'PASO 3: Marca los vértices del polígono para calcular el área en m². Pulsa "Cerrar Área" al terminar.', true),
('DO',  '/project/:id/dwg', 9, '[data-tour="dwg-clean"]', 'Limpiar Mediciones', 'Borra todas las mediciones del plano para empezar de nuevo.', true),
('DEM', '/project/:id/dwg', 1, 'body', 'Metro Digital', 'Carga un plano PDF, calibra la escala y mide distancias y áreas con precisión.', true),
('DEM', '/project/:id/dwg', 2, '[data-tour="dwg-upload"]', 'Subir Plano', 'Sube un archivo PDF con tu plano.', true),
('DEM', '/project/:id/dwg', 3, '[data-tour="dwg-load-pdf"]', 'Cargar PDF', 'Pulsa "Cargar PDF" para renderizar el plano.', true),
('DEM', '/project/:id/dwg', 4, '[data-tour="dwg-toolbar"]', 'Barra de Herramientas', 'Flujo: Calibrar → Medir → Área.', true),
('DEM', '/project/:id/dwg', 5, '[data-tour="dwg-move"]', 'Mover y Zoom', 'Navega por el plano con esta herramienta.', true),
('DEM', '/project/:id/dwg', 6, '[data-tour="dwg-calibrate"]', 'Calibrar Escala', 'Marca dos puntos de una cota conocida e introduce la distancia real.', true),
('DEM', '/project/:id/dwg', 7, '[data-tour="dwg-measure"]', 'Medir Distancias', 'Marca dos puntos para medir la distancia en metros.', true),
('DEM', '/project/:id/dwg', 8, '[data-tour="dwg-area"]', 'Calcular Áreas', 'Marca vértices para calcular el área en m².', true),
('DEM', '/project/:id/dwg', 9, '[data-tour="dwg-clean"]', 'Limpiar Mediciones', 'Borra todas las mediciones.', true),
('CON', '/project/:id/dwg', 1, 'body', 'Metro Digital', 'Carga un plano PDF, calibra la escala y mide distancias y áreas directamente sobre el documento.', true),
('CON', '/project/:id/dwg', 2, '[data-tour="dwg-load-pdf"]', 'Cargar PDF', 'Selecciona un plano y cárgalo para medir.', true),
('CON', '/project/:id/dwg', 3, '[data-tour="dwg-toolbar"]', 'Herramientas', 'Calibra → Mide → Calcula áreas.', true),
('CON', '/project/:id/dwg', 4, '[data-tour="dwg-calibrate"]', 'Calibrar', 'Calibra la escala con una cota conocida.', true),
('CON', '/project/:id/dwg', 5, '[data-tour="dwg-measure"]', 'Medir', 'Mide distancias entre dos puntos.', true),
('CON', '/project/:id/dwg', 6, '[data-tour="dwg-area"]', 'Área', 'Calcula áreas cerrando polígonos.', true),
('CON', '/project/:id/dwg', 7, '[data-tour="dwg-clean"]', 'Limpiar', 'Borra las mediciones.', true),
('PRO', '/project/:id/dwg', 1, 'body', 'Metro Digital', 'Herramienta de medición sobre planos PDF. Calibra y mide distancias y áreas.', true),
('PRO', '/project/:id/dwg', 2, '[data-tour="dwg-load-pdf"]', 'Cargar PDF', 'Carga un plano para medir.', true),
('PRO', '/project/:id/dwg', 3, '[data-tour="dwg-calibrate"]', 'Calibrar', 'Calibra con una cota conocida.', true),
('PRO', '/project/:id/dwg', 4, '[data-tour="dwg-measure"]', 'Medir', 'Mide distancias en metros.', true),
('PRO', '/project/:id/dwg', 5, '[data-tour="dwg-area"]', 'Área', 'Calcula áreas en m².', true),
('PRO', '/project/:id/dwg', 6, '[data-tour="dwg-clean"]', 'Limpiar', 'Borra mediciones.', true),
('CSS', '/project/:id/dwg', 1, 'body', 'Metro Digital', 'Mide distancias y áreas sobre planos PDF del proyecto.', true),
('CSS', '/project/:id/dwg', 2, '[data-tour="dwg-load-pdf"]', 'Cargar PDF', 'Carga un plano para medir.', true),
('CSS', '/project/:id/dwg', 3, '[data-tour="dwg-calibrate"]', 'Calibrar', 'Calibra la escala.', true),
('CSS', '/project/:id/dwg', 4, '[data-tour="dwg-measure"]', 'Medir', 'Mide distancias.', true),
('CSS', '/project/:id/dwg', 5, '[data-tour="dwg-area"]', 'Área', 'Calcula áreas.', true),
('CSS', '/project/:id/dwg', 6, '[data-tour="dwg-clean"]', 'Limpiar', 'Borra mediciones.', true);

-- ═══ DOCS FINALES (/project/:id/cfo) ═══
INSERT INTO onboarding_steps (role, page_route, step_order, target_element, title, content, is_active) VALUES
('DO',  '/project/:id/cfo', 1, 'body', 'Docs Finales (CFO)', 'Gestiona los 16 puntos obligatorios del expediente de cierre de obra. Audita documentos faltantes y reclama a los agentes responsables.', true),
('DO',  '/project/:id/cfo', 2, '[data-tour="cfo-audit"]', 'Auditoría de Archivo', 'Comprueba qué documentos de los 16 puntos de control faltan por subir.', true),
('DO',  '/project/:id/cfo', 3, '[data-tour="cfo-reclaim"]', 'Reclamar Documentos', 'Envía notificaciones a los agentes para que suban la documentación pendiente.', true),
('DEM', '/project/:id/cfo', 1, 'body', 'Docs Finales (CFO)', 'Gestiona los documentos obligatorios del expediente de cierre. Audita y reclama los documentos faltantes.', true),
('DEM', '/project/:id/cfo', 2, '[data-tour="cfo-audit"]', 'Auditoría de Archivo', 'Detecta documentos faltantes de los 16 puntos obligatorios.', true),
('DEM', '/project/:id/cfo', 3, '[data-tour="cfo-reclaim"]', 'Reclamar Documentos', 'Reclama a los agentes la subida de documentos pendientes.', true),
('CON', '/project/:id/cfo', 1, 'body', 'Documentos de Cierre', 'Sube la documentación técnica asignada a tu rol (certificados, ensayos, actas...).', true),
('PRO', '/project/:id/cfo', 1, 'body', 'Expediente de Cierre', 'Consulta el estado del expediente de cierre y la documentación aportada.', true),
('CSS', '/project/:id/cfo', 1, 'body', 'Documentos de Seguridad', 'Sube el Plan de Seguridad, actas de coordinación y documentación CSS obligatoria.', true);

-- ═══ FIRMA DE DOCUMENTOS (/project/:id/signatures) ═══
INSERT INTO onboarding_steps (role, page_route, step_order, target_element, title, content, is_active) VALUES
('DO',  '/project/:id/signatures', 1, 'body', 'Firma de Documentos', 'Envía y recibe documentos para firma digital. Puedes firmar con certificado .p12/.pfx o firma manuscrita con trazabilidad legal.', true),
('DO',  '/project/:id/signatures', 2, '[data-tour="signature-preview"]', 'Previsualización', 'Revisa el documento antes de firmarlo.', true),
('DO',  '/project/:id/signatures', 3, '[data-tour="signature-certificate-tab"]', 'Certificado Digital', 'Firma con tu certificado .p12/.pfx. El sistema recordará la contraseña.', true),
('DEM', '/project/:id/signatures', 1, 'body', 'Firma de Documentos', 'Envía documentos para firma y firma los que recibas con certificado digital o firma manuscrita.', true),
('DEM', '/project/:id/signatures', 2, '[data-tour="signature-preview"]', 'Previsualización', 'Revisa el documento antes de firmarlo.', true),
('DEM', '/project/:id/signatures', 3, '[data-tour="signature-certificate-tab"]', 'Certificado Digital', 'Firma con certificado .p12/.pfx.', true),
('CON', '/project/:id/signatures', 1, 'body', 'Firma de Documentos', 'Consulta y firma los documentos que te han enviado para firma.', true),
('CON', '/project/:id/signatures', 2, '[data-tour="signature-preview"]', 'Previsualización', 'Revisa el documento antes de firmarlo.', true),
('PRO', '/project/:id/signatures', 1, 'body', 'Firma de Documentos', 'Consulta y firma documentos enviados por la dirección de obra.', true),
('PRO', '/project/:id/signatures', 2, '[data-tour="signature-preview"]', 'Previsualización', 'Revisa el documento antes de firmarlo.', true),
('CSS', '/project/:id/signatures', 1, 'body', 'Firma de Documentos', 'Firma los documentos de seguridad que te envíen.', true),
('CSS', '/project/:id/signatures', 2, '[data-tour="signature-preview"]', 'Previsualización', 'Revisa el documento antes de firmarlo.', true);

-- Reset user onboarding status for these routes so guides re-trigger
DELETE FROM user_onboarding_status WHERE page_route IN (
  '/project/:id/docs', '/project/:id/plans', '/project/:id/orders',
  '/project/:id/costs', '/project/:id/dwg', '/project/:id/cfo',
  '/project/:id/signatures'
);
