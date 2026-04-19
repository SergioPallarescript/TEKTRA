import { supabase } from "@/integrations/supabase/client";

export type Volume1Data = {
  id?: string;
  project_id: string;
  municipio?: string | null;
  municipio_ai?: boolean;
  emplazamiento?: string | null;
  emplazamiento_ai?: boolean;
  codigo_postal?: string | null;
  codigo_postal_ai?: boolean;
  nrc?: string | null;
  nrc_ai?: boolean;
  registro_numero?: string | null;
  registro_numero_ai?: boolean;
  tomo?: string | null;
  tomo_ai?: boolean;
  libro?: string | null;
  libro_ai?: boolean;
  folio?: string | null;
  folio_ai?: boolean;
  finca?: string | null;
  finca_ai?: boolean;
  poliza_decenal_compania?: string | null;
  poliza_decenal_compania_ai?: boolean;
  poliza_decenal_numero?: string | null;
  poliza_decenal_numero_ai?: boolean;
  superficie_parcela?: number | null;
  superficie_parcela_ai?: boolean;
  superficie_construida?: number | null;
  superficie_construida_ai?: boolean;
  superficie_util?: number | null;
  superficie_util_ai?: boolean;
  numero_viviendas?: number | null;
  numero_viviendas_ai?: boolean;
  numero_plantas?: number | null;
  numero_plantas_ai?: boolean;
  fecha_licencia_obra?: string | null;
  fecha_licencia_obra_ai?: boolean;
  numero_licencia_obra?: string | null;
  numero_licencia_obra_ai?: boolean;
  fecha_inicio_obra?: string | null;
  fecha_inicio_obra_ai?: boolean;
  fecha_fin_obra?: string | null;
  fecha_fin_obra_ai?: boolean;
  last_ai_scan_at?: string | null;
  last_ai_scan_by?: string | null;
};

export type LirDraft = {
  id: string;
  project_id: string;
  material_key: string;
  material_label: string;
  category: string;
  limpieza: string | null;
  inspeccion: string | null;
  normas_uso: string | null;
  reparacion: string | null;
  is_validated: boolean;
  validated_at: string | null;
  validated_by: string | null;
  generated_at: string;
};

export const runCfoAiAnalysis = async (projectId: string) => {
  const { data, error } = await supabase.functions.invoke("cfo-ai-analyze", {
    body: { projectId },
  });
  if (error) throw error;
  return data as { ok: boolean; suggestionsApplied: number; draftsCreated: number; totalDrafts: number };
};

export const fetchVolume1Data = async (projectId: string): Promise<Volume1Data | null> => {
  const { data, error } = await supabase
    .from("cfo_volume1_data")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw error;
  return data as Volume1Data | null;
};

export const upsertVolume1Field = async (
  projectId: string,
  field: string,
  value: string | number | null,
) => {
  const aiField = `${field}_ai`;
  const payload = {
    project_id: projectId,
    [field]: value,
    [aiField]: false, // edición manual = validado
  } as never;
  const { error } = await supabase
    .from("cfo_volume1_data")
    .upsert(payload, { onConflict: "project_id" });
  if (error) throw error;
};

export const validateVolume1Field = async (projectId: string, field: string) => {
  const aiField = `${field}_ai`;
  const { error } = await supabase
    .from("cfo_volume1_data")
    .update({ [aiField]: false })
    .eq("project_id", projectId);
  if (error) throw error;
};

export const fetchLirDrafts = async (projectId: string): Promise<LirDraft[]> => {
  const { data, error } = await supabase
    .from("cfo_lir_drafts")
    .select("*")
    .eq("project_id", projectId)
    .order("category")
    .order("material_label");
  if (error) throw error;
  return (data || []) as LirDraft[];
};

export const updateLirDraft = async (id: string, patch: Partial<LirDraft>) => {
  const { error } = await supabase.from("cfo_lir_drafts").update(patch).eq("id", id);
  if (error) throw error;
};

export const validateLirDraft = async (id: string, userId: string) => {
  const { error } = await supabase
    .from("cfo_lir_drafts")
    .update({
      is_validated: true,
      validated_at: new Date().toISOString(),
      validated_by: userId,
    })
    .eq("id", id);
  if (error) throw error;
};

export const deleteLirDraft = async (id: string) => {
  const { error } = await supabase.from("cfo_lir_drafts").delete().eq("id", id);
  if (error) throw error;
};
