
-- Clear old onboarding steps for orders and incidents routes
DELETE FROM public.onboarding_steps WHERE page_route IN ('/project/:id/orders', '/project/:id/incidents');

-- Reset user onboarding status for these routes
DELETE FROM public.user_onboarding_status WHERE page_route IN ('/project/:id/orders', '/project/:id/incidents');

-- Orders onboarding steps
INSERT INTO public.onboarding_steps (role, page_route, step_order, target_element, title, content, is_active) VALUES
('DO', '/project/:id/orders', 1, NULL, 'Libro de Órdenes Digital', 'Este módulo replica el Libro de Órdenes oficial con validez jurídica ante Colegios Profesionales. Cada orden queda firmada, sellada y bloqueada.', true),
('DO', '/project/:id/orders', 2, '[data-tour="book-cover"]', 'Configurar Portada Legal', 'Antes de crear órdenes, configura la portada con el nº de libro, colegio oficial y datos de los agentes. Es obligatorio para adscribir el libro.', true),
('DO', '/project/:id/orders', 3, '[data-tour="new-order"]', 'Nueva Orden', 'Una vez configurada la portada, crea órdenes indicando destinatario, emisor, asunto y contenido. Puedes dictar por voz y la IA estructurará el texto.', true),
('DEM', '/project/:id/orders', 1, NULL, 'Libro de Órdenes Digital', 'Este módulo replica el Libro de Órdenes oficial con validez jurídica ante Colegios Profesionales. Cada orden queda firmada, sellada y bloqueada.', true),
('DEM', '/project/:id/orders', 2, '[data-tour="book-cover"]', 'Configurar Portada Legal', 'Configura la portada del libro: nº de libro adscrito, colegio oficial, agentes intervinientes y fecha de comienzo.', true),
('DEM', '/project/:id/orders', 3, '[data-tour="new-order"]', 'Nueva Orden', 'Crea órdenes con identificación legal completa. Firma con certificado digital o firma manual. La orden se bloquea tras la firma.', true),
('CSS', '/project/:id/orders', 1, NULL, 'Libro de Órdenes Digital', 'Este módulo contiene el Libro de Órdenes oficial del proyecto. Consulta las órdenes registradas por la Dirección Facultativa.', true),
('CON', '/project/:id/orders', 1, NULL, 'Libro de Órdenes Digital', 'Aquí puedes consultar las órdenes dirigidas al constructor. Cada orden está firmada digitalmente y tiene validez legal.', true),
('PRO', '/project/:id/orders', 1, NULL, 'Libro de Órdenes Digital', 'Consulta las órdenes del libro oficial del proyecto. Las órdenes están firmadas y selladas con trazabilidad completa.', true);

-- Incidents onboarding steps
INSERT INTO public.onboarding_steps (role, page_route, step_order, target_element, title, content, is_active) VALUES
('CSS', '/project/:id/incidents', 1, NULL, 'Libro de Incidencias Digital', 'Este módulo replica el Libro de Incidencias oficial de Seguridad y Salud con validez legal ante los organismos competentes.', true),
('CSS', '/project/:id/incidents', 2, '[data-tour="book-cover"]', 'Configurar Portada Legal', 'Configura la portada del libro con el nº adscrito, colegio oficial y datos de los agentes. Es requisito obligatorio.', true),
('CSS', '/project/:id/incidents', 3, '[data-tour="new-incident"]', 'Nueva Incidencia', 'Registra incidencias indicando gravedad, destinatario, asunto y descripción del riesgo. Firma obligatoria para bloqueo jurídico.', true),
('DO', '/project/:id/incidents', 1, NULL, 'Libro de Incidencias', 'Consulta las incidencias de seguridad registradas por el Coordinador CSS. Cada incidencia está firmada y bloqueada.', true),
('DEM', '/project/:id/incidents', 1, NULL, 'Libro de Incidencias', 'Consulta las incidencias de seguridad y salud del proyecto. Las incidencias quedan selladas con trazabilidad legal.', true),
('CON', '/project/:id/incidents', 1, NULL, 'Libro de Incidencias', 'Revisa las incidencias de seguridad dirigidas al constructor. Cada registro tiene firma digital y hash de integridad.', true),
('PRO', '/project/:id/incidents', 1, NULL, 'Libro de Incidencias', 'Consulta las incidencias de seguridad del proyecto. Todas las incidencias están firmadas y selladas digitalmente.', true);
