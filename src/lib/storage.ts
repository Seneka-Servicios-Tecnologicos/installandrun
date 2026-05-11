import { supabase } from "@/integrations/supabase/client";

export async function uploadMedia(
  userId: string,
  projectId: string,
  blob: Blob,
  extension: string,
  contentType: string,
): Promise<string> {
  const filename = `${crypto.randomUUID()}.${extension}`;
  const path = `${userId}/${projectId}/${filename}`;
  const { error } = await supabase.storage
    .from("project-media")
    .upload(path, blob, { contentType, upsert: false });
  if (error) throw error;
  return path;
}

function normalizeSignedUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return url;
  return `${supabaseUrl.replace(/\/$/, "")}${url.startsWith("/") ? url : `/${url}`}`;
}

export async function getSignedUrl(path: string, expiresIn = 3600): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from("project-media")
    .createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return null;
  return normalizeSignedUrl(data.signedUrl);
}

export async function deleteMedia(paths: string[]): Promise<void> {
  const valid = paths.filter(Boolean);
  if (valid.length === 0) return;
  await supabase.storage.from("project-media").remove(valid);
}

export async function uploadClientLogo(clientId: string, blob: Blob): Promise<string> {
  const path = `${clientId}/logo.jpg`;
  const { error } = await supabase.storage
    .from("client-logos")
    .upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
  return path;
}

export async function deleteClientLogo(path: string): Promise<void> {
  if (!path) return;
  await supabase.storage.from("client-logos").remove([path]);
}

export function getClientLogoUrl(path: string | null | undefined, cacheKey?: string): string | null {
  if (!path) return null;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return null;
  const base = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/client-logos/${path}`;
  return cacheKey ? `${base}?v=${encodeURIComponent(cacheKey)}` : base;
}

