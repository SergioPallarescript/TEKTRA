import { supabase } from "@/integrations/supabase/client";

const FILE_TYPE_MAP: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  dwg: "application/acad",
  dxf: "application/dxf",
};

export const sanitizeFileName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");

export const getFileContentType = (file: File) => {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  return FILE_TYPE_MAP[extension] || "application/octet-stream";
};

export async function uploadFileWithFallback({
  bucket = "plans",
  path,
  file,
  cacheControl = "3600",
  upsert = false,
}: {
  bucket?: string;
  path: string;
  file: File;
  cacheControl?: string;
  upsert?: boolean;
}) {
  const contentType = getFileContentType(file);

  const firstAttempt = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl,
    upsert,
    contentType,
  });

  if (!firstAttempt.error) return firstAttempt;

  const shouldRetryWithBinary = /failed to fetch|network|fetch/i.test(firstAttempt.error.message || "");
  if (!shouldRetryWithBinary) return firstAttempt;

  const binaryBuffer = await file.arrayBuffer();

  return supabase.storage.from(bucket).upload(path, binaryBuffer, {
    cacheControl,
    upsert,
    contentType,
  });
}