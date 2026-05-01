
-- 1. Clean up outdated Subcontracting steps
DELETE FROM public.onboarding_steps
 WHERE page_route = '/project/:id/subcontracting';

-- 2. Remove the orphan empty-target step on home for DO
DELETE FROM public.onboarding_steps
 WHERE role = 'DO' AND page_route = '/' AND target_element IS NULL;

-- 3. Insert refreshed steps for the Subcontracting module
-- Roles with full write access: CON, DEM, DO
INSERT INTO public.onboarding_steps (role, page_route, target_element, title, content, step_order, is_active)
VALUES
  ('CON', '/project/:id/subcontracting', 'body',
   'Libro de Subcontratas y Seguridad',
   'Aquí digitalizas el Libro de Subcontratación físico y generas las Actas de Adhesión al Plan de Seguridad y Salud, todo desde un único módulo.',
   1, true),
  ('CON', '/project/:id/subcontracting', '[data-tour="subcontracting-digital"]',
   'Digitalización del Libro Físico',
   'Sube primero la hoja con los datos del contratista. Después puedes ir añadiendo una ficha por cada subcontrata: el sistema te pedirá su nombre antes de subir la imagen o el PDF.',
   2, true),
  ('CON', '/project/:id/subcontracting', '[data-tour="subcontracting-export"]',
   'Exportar el Libro Completo',
   'Cuando tengas todas las hojas digitalizadas, descarga el Libro de Subcontratación íntegro como un único PDF listo para entregar.',
   3, true),
  ('CON', '/project/:id/subcontracting', '[data-tour="subcontracting-create-act"]',
   'Crear Acta de Adhesión',
   'Genera el Acta de Adhesión al Plan de Seguridad y Salud para cada subcontrata. La obra, ubicación y promotor se autocompletan; sólo añades la empresa subcontratada y la tarea.',
   4, true),
  ('CON', '/project/:id/subcontracting', '[data-tour="subcontracting-acts"]',
   'Previsualizar y Gestionar Actas',
   'Cada acta generada queda guardada y puedes previsualizarla en pantalla, descargarla o eliminarla, igual que cualquier otro documento del proyecto.',
   5, true);

INSERT INTO public.onboarding_steps (role, page_route, target_element, title, content, step_order, is_active)
VALUES
  ('DEM', '/project/:id/subcontracting', 'body',
   'Libro de Subcontratas y Seguridad',
   'Como Dirección Ejecutiva supervisas la digitalización del Libro de Subcontratación y la emisión de las Actas de Adhesión al Plan de Seguridad y Salud.',
   1, true),
  ('DEM', '/project/:id/subcontracting', '[data-tour="subcontracting-digital"]',
   'Digitalización del Libro Físico',
   'Sube cada hoja del libro físico. La primera hoja contiene los datos del contratista; las siguientes corresponden a una subcontrata cada una, con su nombre identificativo.',
   2, true),
  ('DEM', '/project/:id/subcontracting', '[data-tour="subcontracting-create-act"]',
   'Acta de Adhesión al PSS',
   'Crea aquí el acta para cada subcontrata. El PDF se genera con el formato oficial y los cuadros de firma para Contratista y Subcontratista.',
   3, true),
  ('DEM', '/project/:id/subcontracting', '[data-tour="subcontracting-acts"]',
   'Histórico de Actas',
   'Todas las actas generadas se conservan aquí con previsualización inline, descarga y borrado. Forman parte del expediente del proyecto.',
   4, true);

INSERT INTO public.onboarding_steps (role, page_route, target_element, title, content, step_order, is_active)
VALUES
  ('DO', '/project/:id/subcontracting', 'body',
   'Libro de Subcontratas y Seguridad',
   'Como Dirección de Obra puedes consultar el Libro de Subcontratación digitalizado y emitir Actas de Adhesión al Plan de Seguridad cuando se incorpora una nueva subcontrata.',
   1, true),
  ('DO', '/project/:id/subcontracting', '[data-tour="subcontracting-digital"]',
   'Digitalización del Libro',
   'Cada hoja física del libro queda guardada y previsualizable inline. Pulsa una hoja para abrir su contenido sin tener que descargarla.',
   2, true),
  ('DO', '/project/:id/subcontracting', '[data-tour="subcontracting-create-act"]',
   'Generar Acta de Adhesión',
   'Crea el acta indicando subcontrata y tarea. El resto de datos (obra, ubicación, promotor) se rellenan automáticamente desde el proyecto.',
   3, true);

INSERT INTO public.onboarding_steps (role, page_route, target_element, title, content, step_order, is_active)
VALUES
  ('PRO', '/project/:id/subcontracting', 'body',
   'Libro de Subcontratas',
   'Como Promotor puedes consultar el Libro de Subcontratación digitalizado y todas las Actas de Adhesión al Plan de Seguridad y Salud emitidas en tu obra.',
   1, true),
  ('CSS', '/project/:id/subcontracting', 'body',
   'Libro de Subcontratas',
   'Aquí puedes consultar el Libro de Subcontratación digitalizado y las Actas de Adhesión al Plan de Seguridad y Salud emitidas para cada subcontrata.',
   1, true);

-- 4. Reset "seen" status so users see the refreshed guide
DELETE FROM public.user_onboarding_status
 WHERE page_route = '/project/:id/subcontracting';
