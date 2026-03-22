import { supabase } from "./supabase";
import { Platform } from "react-native";

const isWeb = Platform.OS === "web";
const BUCKET = "vault-documents";

// ── Types ────────────────────────────────────────────────────────────────────

export type DocType =
  | "deed"
  | "permit"
  | "contract"
  | "insurance"
  | "maintenance"
  | "tax"
  | "other";

export interface VaultDocument {
  id: string;
  user_id: string;
  property_id: string | null;
  unit_id: string | null;
  name: string;
  type: DocType;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  expiry_date: string | null;
  notes: string | null;
  created_at: string;
  // joined fields
  property_name?: string;
}

export const DOC_TYPE_ICONS: Record<DocType, string> = {
  deed: "📜",
  permit: "🏗️",
  contract: "📝",
  insurance: "🛡️",
  maintenance: "🔧",
  tax: "🧾",
  other: "📄",
};

// ── CRUD Operations ──────────────────────────────────────────────────────────

export async function getDocuments(
  userId: string,
  filters?: { propertyId?: string; unitId?: string; type?: DocType }
): Promise<VaultDocument[]> {
  let query = supabase
    .from("documents")
    .select("*, properties:property_id(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (filters?.propertyId) query = query.eq("property_id", filters.propertyId);
  if (filters?.unitId) query = query.eq("unit_id", filters.unitId);
  if (filters?.type) query = query.eq("type", filters.type);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((d: any) => ({
    ...d,
    property_name: d.properties?.name ?? null,
    properties: undefined,
  }));
}

export async function uploadDocument(
  userId: string,
  file: { uri: string; name: string; type: string; size?: number },
  metadata: {
    name: string;
    type: DocType;
    propertyId?: string | null;
    unitId?: string | null;
    expiryDate?: string | null;
    notes?: string | null;
  }
): Promise<VaultDocument> {
  const ext = file.name.split(".").pop() || "bin";
  const storagePath = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  // Upload file to Supabase Storage
  let uploadData: any;
  if (isWeb) {
    // Web: fetch the file as blob
    const res = await fetch(file.uri);
    const blob = await res.blob();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, blob, { contentType: file.type });
    if (error) throw error;
    uploadData = data;
  } else {
    // Native: read file and upload
    const FileSystem = require("expo-file-system/legacy");
    const base64 = await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: file.type });
    if (error) throw error;
    uploadData = data;
  }

  // Insert metadata row
  const { data: doc, error: insertError } = await supabase
    .from("documents")
    .insert({
      user_id: userId,
      property_id: metadata.propertyId || null,
      unit_id: metadata.unitId || null,
      name: metadata.name,
      type: metadata.type,
      file_path: uploadData.path,
      file_size: file.size || null,
      mime_type: file.type || null,
      expiry_date: metadata.expiryDate || null,
      notes: metadata.notes || null,
    })
    .select()
    .single();

  if (insertError) throw insertError;
  return doc;
}

export async function deleteDocument(docId: string, filePath: string): Promise<void> {
  // Delete from storage
  await supabase.storage.from(BUCKET).remove([filePath]);
  // Delete metadata
  const { error } = await supabase.from("documents").delete().eq("id", docId);
  if (error) throw error;
}

export async function getDocumentUrl(filePath: string): Promise<string> {
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(filePath, 3600); // 1 hour expiry
  if (!data?.signedUrl) throw new Error("Failed to get document URL");
  return data.signedUrl;
}
