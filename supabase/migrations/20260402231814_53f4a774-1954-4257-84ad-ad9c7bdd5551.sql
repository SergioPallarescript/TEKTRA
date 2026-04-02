-- Delete old DWG steps for DO and DEM (will replace with multi-step)
DELETE FROM public.onboarding_steps WHERE id IN (
  'd323dddc-787a-4a6d-867d-bf9b4712be55',
  'a1db1f8c-c241-4d47-90cc-f05fb6921182'
);

-- Delete old CFO step 2 for DEM (body target -> will fix)
DELETE FROM public.onboarding_steps WHERE id = 'e2fac83a-d04d-49ed-8e6c-91c92c020d79';

-- Delete old CFO DO step (body -> will fix)
DELETE FROM public.onboarding_steps WHERE id = '383ece65-6d3b-42f2-9a09-35529aa43692';

-- DWG: DO steps (upload + toolbar guide)
INSERT INTO public.onboarding_steps (role, page_route, step_order, target_element, title, content, is_active) VALUES
('DO', '/project/:id/dwg', 1, '[data-tour="dwg-upload"]', 'Subir Plano PDF', 'Sube un plano en formato PDF para poder tomar medidas reales sobre él.', true),
('DO', '/project/:id/dwg', 2, '[data-tour="dwg-load-pdf"]', 'Cargar PDF', 'Selecciona un plano y pulsa Cargar PDF para abrirlo en el visor.', true),
('DO', '/project/:id/dwg', 3, '[data-tour="dwg-move"]', 'Mover y Zoom', 'Mueve el plano con el ratón y usa el scroll para hacer zoom.', true),
('DO', '/project/:id/dwg', 4, '[data-tour="dwg-calibrate"]', 'Calibrar Escala', 'Marca dos puntos de una cota conocida e introduce la distancia real en metros.', true),
('DO', '/project/:id/dwg', 5, '[data-tour="dwg-measure"]', 'Medir Distancias', 'Traza líneas entre puntos para medir distancias reales en el plano.', true),
('DO', '/project/:id/dwg', 6, '[data-tour="dwg-area"]', 'Calcular Áreas', 'Marca un polígono cerrado para calcular superficies reales.', true),
('DO', '/project/:id/dwg', 7, '[data-tour="dwg-clean"]', 'Limpiar Mediciones', 'Elimina todas las mediciones del plano para empezar de nuevo.', true);

-- DEM steps (same as DO)
INSERT INTO public.onboarding_steps (role, page_route, step_order, target_element, title, content, is_active) VALUES
('DEM', '/project/:id/dwg', 1, '[data-tour="dwg-upload"]', 'Subir Plano PDF', 'Sube un plano en formato PDF para poder tomar medidas reales sobre él.', true),
('DEM', '/project/:id/dwg', 2, '[data-tour="dwg-load-pdf"]', 'Cargar PDF', 'Selecciona un plano y pulsa Cargar PDF para abrirlo en el visor.', true),
('DEM', '/project/:id/dwg', 3, '[data-tour="dwg-move"]', 'Mover y Zoom', 'Mueve el plano con el ratón y usa el scroll para hacer zoom.', true),
('DEM', '/project/:id/dwg', 4, '[data-tour="dwg-calibrate"]', 'Calibrar Escala', 'Marca dos puntos de una cota conocida e introduce la distancia real en metros.', true),
('DEM', '/project/:id/dwg', 5, '[data-tour="dwg-measure"]', 'Medir Distancias', 'Traza líneas entre puntos para medir distancias reales en el plano.', true),
('DEM', '/project/:id/dwg', 6, '[data-tour="dwg-area"]', 'Calcular Áreas', 'Marca un polígono cerrado para calcular superficies reales.', true),
('DEM', '/project/:id/dwg', 7, '[data-tour="dwg-clean"]', 'Limpiar Mediciones', 'Elimina todas las mediciones del plano para empezar de nuevo.', true);

-- CON/CSS/PRO DWG toolbar guide steps
INSERT INTO public.onboarding_steps (role, page_route, step_order, target_element, title, content, is_active) VALUES
('CON', '/project/:id/dwg', 2, '[data-tour="dwg-load-pdf"]', 'Cargar PDF', 'Selecciona un plano y pulsa Cargar PDF para abrirlo.', true),
('CON', '/project/:id/dwg', 3, '[data-tour="dwg-move"]', 'Mover y Zoom', 'Mueve el plano y usa el scroll para zoom.', true),
('CON', '/project/:id/dwg', 4, '[data-tour="dwg-calibrate"]', 'Calibrar Escala', 'Marca dos puntos de una cota conocida e introduce la distancia real.', true),
('CON', '/project/:id/dwg', 5, '[data-tour="dwg-measure"]', 'Medir', 'Traza líneas para medir distancias reales.', true),
('CON', '/project/:id/dwg', 6, '[data-tour="dwg-area"]', 'Área', 'Marca un polígono para calcular superficies.', true),
('CON', '/project/:id/dwg', 7, '[data-tour="dwg-clean"]', 'Limpiar', 'Elimina las mediciones actuales.', true),
('CSS', '/project/:id/dwg', 2, '[data-tour="dwg-load-pdf"]', 'Cargar PDF', 'Selecciona un plano y pulsa Cargar PDF para abrirlo.', true),
('CSS', '/project/:id/dwg', 3, '[data-tour="dwg-move"]', 'Mover y Zoom', 'Mueve el plano y usa el scroll para zoom.', true),
('CSS', '/project/:id/dwg', 4, '[data-tour="dwg-calibrate"]', 'Calibrar Escala', 'Marca dos puntos de una cota conocida e introduce la distancia real.', true),
('CSS', '/project/:id/dwg', 5, '[data-tour="dwg-measure"]', 'Medir', 'Traza líneas para medir distancias reales.', true),
('CSS', '/project/:id/dwg', 6, '[data-tour="dwg-area"]', 'Área', 'Marca un polígono para calcular superficies.', true),
('CSS', '/project/:id/dwg', 7, '[data-tour="dwg-clean"]', 'Limpiar', 'Elimina las mediciones actuales.', true),
('PRO', '/project/:id/dwg', 2, '[data-tour="dwg-load-pdf"]', 'Cargar PDF', 'Selecciona un plano y pulsa Cargar PDF para abrirlo.', true),
('PRO', '/project/:id/dwg', 3, '[data-tour="dwg-move"]', 'Mover y Zoom', 'Mueve el plano y usa el scroll para zoom.', true),
('PRO', '/project/:id/dwg', 4, '[data-tour="dwg-calibrate"]', 'Calibrar Escala', 'Marca dos puntos de una cota conocida e introduce la distancia real.', true),
('PRO', '/project/:id/dwg', 5, '[data-tour="dwg-measure"]', 'Medir', 'Traza líneas para medir distancias reales.', true),
('PRO', '/project/:id/dwg', 6, '[data-tour="dwg-area"]', 'Área', 'Marca un polígono para calcular superficies.', true),
('PRO', '/project/:id/dwg', 7, '[data-tour="dwg-clean"]', 'Limpiar', 'Elimina las mediciones actuales.', true);

-- CFO: Fix DEM step 2 and DO step 1
INSERT INTO public.onboarding_steps (role, page_route, step_order, target_element, title, content, is_active) VALUES
('DEM', '/project/:id/cfo', 2, '[data-tour="cfo-reclaim"]', 'Reclamar Documentos', 'Pulsa Reclamar para enviar una notificación al agente responsable y solicitar la documentación pendiente.', true),
('DO', '/project/:id/cfo', 1, '[data-tour="cfo-audit"]', 'Auditoría de Archivo', 'Consulta el estado de los 16 puntos de control. El DEM ejecuta la auditoría y valida cada documento.', true);

-- Reset onboarding status for updated pages
DELETE FROM public.user_onboarding_status WHERE page_route IN ('/project/:id/dwg', '/project/:id/cfo', '/project/:id/brain');