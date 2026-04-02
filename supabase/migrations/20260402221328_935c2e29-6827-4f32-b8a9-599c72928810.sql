
-- Tabla de pasos de onboarding
CREATE TABLE public.onboarding_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  page_route text NOT NULL,
  step_order integer NOT NULL DEFAULT 0,
  target_element text,
  title text NOT NULL,
  content text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.onboarding_steps ENABLE ROW LEVEL SECURITY;

-- Todos los autenticados pueden leer los pasos
CREATE POLICY "Authenticated users can read onboarding steps"
  ON public.onboarding_steps FOR SELECT TO authenticated
  USING (true);

-- Solo admin puede gestionar
CREATE POLICY "Admin can manage onboarding steps"
  ON public.onboarding_steps FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- Tabla de estado de onboarding por usuario
CREATE TABLE public.user_onboarding_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  page_route text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, page_route)
);

ALTER TABLE public.user_onboarding_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own onboarding status"
  ON public.user_onboarding_status FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Trigger updated_at
CREATE TRIGGER set_onboarding_steps_updated_at
  BEFORE UPDATE ON public.onboarding_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed: Dashboard
INSERT INTO public.onboarding_steps (role, page_route, step_order, target_element, title, content) VALUES
('DO', '/', 1, '[data-tour="project-card"]', 'Tus Proyectos', 'Aquí verás todos los proyectos donde participas como Director de Obra. Pulsa en cualquier tarjeta para acceder al detalle.'),
('DO', '/', 2, '[data-tour="create-project"]', 'Crear Proyecto', 'Como Director de Obra, puedes crear nuevos proyectos y gestionar el equipo técnico desde aquí.'),
('DEM', '/', 1, '[data-tour="project-card"]', 'Tus Proyectos', 'Aquí aparecen los proyectos donde has sido asignado como Director de Ejecución Material.'),
('CON', '/', 1, '[data-tour="project-card"]', 'Proyectos Asignados', 'Verás los proyectos en los que participas como Contratista. Accede para gestionar certificaciones y órdenes.'),
('PRO', '/', 1, '[data-tour="project-card"]', 'Tus Proyectos', 'Como Promotor, aquí tienes una vista general del estado de tus obras.'),
('CSS', '/', 1, '[data-tour="project-card"]', 'Proyectos de Seguridad', 'Aquí verás los proyectos donde eres Coordinador de Seguridad y Salud.');

-- Seed: Detalle de proyecto
INSERT INTO public.onboarding_steps (role, page_route, step_order, target_element, title, content) VALUES
('DO', '/project/:id', 1, '[data-tour="team-section"]', 'Equipo Técnico', 'Gestiona los agentes del proyecto: invita a DEM, Contratista, Promotor y CSS con sus roles.'),
('DO', '/project/:id', 2, '[data-tour="module-orders"]', 'Libro de Órdenes', 'Accede al Libro de Órdenes de obra para dictar y firmar instrucciones técnicas.'),
('DO', '/project/:id', 3, '[data-tour="module-costs"]', 'Economía de Obra', 'Revisa y firma certificaciones, relaciones valoradas y controla el presupuesto.'),
('DEM', '/project/:id', 1, '[data-tour="module-orders"]', 'Libro de Órdenes', 'Aquí dictarás las órdenes de obra. Usa el dictado por voz para agilizar el proceso.'),
('DEM', '/project/:id', 2, '[data-tour="module-cfo"]', 'Control de Calidad (CFO)', 'Gestiona el control documental de calidad: ensayos, certificados de materiales y actas.'),
('DEM', '/project/:id', 3, '[data-tour="module-plans"]', 'Gestión de Planos', 'Sube y versiona los planos del proyecto. El equipo recibirá notificación de cada actualización.'),
('CON', '/project/:id', 1, '[data-tour="module-costs"]', 'Certificaciones', 'Presenta tus certificaciones mensuales y sigue el flujo de aprobación técnica y económica.'),
('CON', '/project/:id', 2, '[data-tour="module-orders"]', 'Órdenes Recibidas', 'Consulta las órdenes de obra emitidas por la Dirección Facultativa y acúsalas de recibo.'),
('PRO', '/project/:id', 1, '[data-tour="module-costs"]', 'Estado Económico', 'Consulta el estado de las certificaciones y autoriza pagos como Promotor.'),
('CSS', '/project/:id', 1, '[data-tour="module-incidents"]', 'Libro de Incidencias', 'Registra incidencias de seguridad y salud en obra, con fotos y nivel de gravedad.'),
('CSS', '/project/:id', 2, '[data-tour="module-plans"]', 'Plan de Seguridad', 'Revisa y da conformidad a las versiones del Plan de Seguridad y Salud.');

-- Seed: Libro de Órdenes
INSERT INTO public.onboarding_steps (role, page_route, step_order, target_element, title, content) VALUES
('DEM', '/project/:id/orders', 1, '[data-tour="new-order"]', 'Nueva Orden', 'Pulsa aquí para crear una nueva orden de obra. Puedes usar dictado por voz o escribir manualmente.'),
('DEM', '/project/:id/orders', 2, '[data-tour="order-list"]', 'Historial de Órdenes', 'Todas las órdenes quedan registradas cronológicamente con validez legal.'),
('CON', '/project/:id/orders', 1, '[data-tour="order-list"]', 'Órdenes Pendientes', 'Revisa las órdenes pendientes de acuse de recibo y valídalas con tu firma.'),
('DO', '/project/:id/orders', 1, '[data-tour="order-list"]', 'Supervisión de Órdenes', 'Revisa todas las órdenes emitidas y su estado de validación por el Contratista.');

-- Seed: Economía
INSERT INTO public.onboarding_steps (role, page_route, step_order, target_element, title, content) VALUES
('CON', '/project/:id/costs', 1, '[data-tour="new-claim"]', 'Nueva Certificación', 'Presenta una nueva certificación mensual adjuntando la documentación de mediciones.'),
('DEM', '/project/:id/costs', 1, '[data-tour="claims-list"]', 'Revisión Técnica', 'Como DEM, debes revisar técnicamente las certificaciones antes de que pasen al DO.'),
('DO', '/project/:id/costs', 1, '[data-tour="claims-list"]', 'Aprobación de Certificaciones', 'Revisa y firma las certificaciones que han pasado la revisión técnica del DEM.'),
('PRO', '/project/:id/costs', 1, '[data-tour="claims-list"]', 'Autorización de Pago', 'Como Promotor, autorizas el pago de las certificaciones aprobadas por la DF.');
