import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, Linking, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { useLanguage, TKey } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useSubscription } from "../context/SubscriptionContext";
import { spacing, radii } from "../constants/theme";
import {
  DocType, VaultDocument, DOC_TYPE_ICONS,
  getDocuments, uploadDocument, deleteDocument, getDocumentUrl,
} from "../lib/vault";
import { crossAlert } from "../lib/alert";

const isWeb = Platform.OS === "web";

let DocumentPicker: any = null;
if (!isWeb) {
  try { DocumentPicker = require("expo-document-picker"); } catch {}
}

const DOC_TYPES: DocType[] = ["deed", "permit", "contract", "insurance", "maintenance", "tax", "other"];

const DOC_TYPE_KEYS: Record<DocType, TKey> = {
  deed: "docTypeDeed" as TKey,
  permit: "docTypePermit" as TKey,
  contract: "docTypeContract" as TKey,
  insurance: "docTypeInsurance" as TKey,
  maintenance: "docTypeMaintenance" as TKey,
  tax: "docTypeTax" as TKey,
  other: "docTypeOther" as TKey,
};

export default function VaultScreen() {
  const { t, isRTL } = useLanguage();
  const { colors: C, shadow } = useTheme();
  const { session } = useAuth();
  const { isPro, hasFeature } = useSubscription();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ propertyId?: string; unitId?: string }>();

  const userId = session?.user?.id;

  const [docs, setDocs] = useState<VaultDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filterType, setFilterType] = useState<DocType | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);

  // Upload form state
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<DocType>("other");
  const [formPropertyId, setFormPropertyId] = useState<string | null>(params.propertyId ?? null);
  const [formExpiry, setFormExpiry] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<{
    uri: string; name: string; type: string; size?: number;
  } | null>(null);

  const S = useMemo(() => styles(C, isRTL), [C, isRTL]);

  // Pro gate
  useEffect(() => {
    if (!isPro) {
      router.replace("/paywall" as any);
    }
  }, [isPro]);

  // Load documents
  const loadDocs = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await getDocuments(userId, {
        propertyId: params.propertyId,
        unitId: params.unitId,
        type: filterType ?? undefined,
      });
      setDocs(data);
    } catch (e) {
      console.warn("Failed to load documents:", e);
    } finally {
      setLoading(false);
    }
  }, [userId, filterType, params.propertyId, params.unitId]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  // Load properties for selector
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("properties")
      .select("id, name")
      .eq("user_id", userId)
      .order("name")
      .then(({ data }) => setProperties(data ?? []));
  }, [userId]);

  // Pick document
  const pickDocument = async () => {
    if (isWeb) {
      // Web: use file input
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx";
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (file) {
          setSelectedFile({
            uri: URL.createObjectURL(file),
            name: file.name,
            type: file.type,
            size: file.size,
          });
          if (!formName) setFormName(file.name.replace(/\.[^.]+$/, ""));
        }
      };
      input.click();
    } else if (DocumentPicker) {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*", "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setSelectedFile({
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || "application/octet-stream",
          size: asset.size,
        });
        if (!formName) setFormName(asset.name.replace(/\.[^.]+$/, ""));
      }
    }
  };

  // Handle upload
  const handleUpload = async () => {
    if (!userId || !selectedFile || !formName.trim()) return;
    setUploading(true);
    try {
      await uploadDocument(userId, selectedFile, {
        name: formName.trim(),
        type: formType,
        propertyId: formPropertyId,
        expiryDate: formExpiry || null,
        notes: formNotes || null,
      });
      crossAlert(t("uploadSuccess"), "");
      resetForm();
      setShowUploadModal(false);
      loadDocs();
    } catch (e: any) {
      crossAlert("Error", e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setFormName("");
    setFormType("other");
    setFormPropertyId(params.propertyId ?? null);
    setFormExpiry("");
    setFormNotes("");
    setSelectedFile(null);
  };

  // Delete document
  const handleDelete = (doc: VaultDocument) => {
    crossAlert(t("deleteDocument"), t("deleteDocumentConfirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete" as TKey),
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDocument(doc.id, doc.file_path);
            loadDocs();
          } catch (e: any) {
            crossAlert("Error", e.message);
          }
        },
      },
    ]);
  };

  // View/download document
  const handleView = async (doc: VaultDocument) => {
    try {
      const url = await getDocumentUrl(doc.file_path);
      if (isWeb) {
        window.open(url, "_blank");
      } else {
        Linking.openURL(url);
      }
    } catch (e: any) {
      crossAlert("Error", e.message || "Failed to open document");
    }
  };

  // Expiry badge
  const getExpiryStatus = (expiry: string | null) => {
    if (!expiry) return null;
    const now = new Date();
    const exp = new Date(expiry);
    const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return { label: t("documentExpired"), color: "#EF4444", bg: "#FEE2E2" };
    if (daysLeft <= 30) return { label: t("documentExpiring"), color: "#F59E0B", bg: "#FEF3C7" };
    return { label: `${daysLeft}d`, color: "#10B981", bg: "#D1FAE5" };
  };

  if (!isPro) return null;

  return (
    <View style={[S.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[S.header, isRTL && { flexDirection: "row-reverse" }]}>
        <TouchableOpacity onPress={() => router.back()} style={S.backBtn}>
          <Ionicons name={isRTL ? "chevron-forward" : "chevron-back"} size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>{t("vaultTitle")}</Text>
        <TouchableOpacity
          onPress={() => { resetForm(); setShowUploadModal(true); }}
          style={[S.addBtn, { backgroundColor: C.accent }]}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={S.filterScroll}
        contentContainerStyle={[S.filterRow, isRTL && { flexDirection: "row-reverse" }]}
      >
        <TouchableOpacity
          style={[S.chip, !filterType && S.chipActive]}
          onPress={() => setFilterType(null)}
        >
          <Text style={[S.chipText, !filterType && S.chipTextActive]}>{t("allDocuments")}</Text>
        </TouchableOpacity>
        {DOC_TYPES.map((dt) => (
          <TouchableOpacity
            key={dt}
            style={[S.chip, filterType === dt && S.chipActive]}
            onPress={() => setFilterType(filterType === dt ? null : dt)}
          >
            <Text style={[S.chipText, filterType === dt && S.chipTextActive]}>
              {DOC_TYPE_ICONS[dt]} {t(DOC_TYPE_KEYS[dt])}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Document list */}
      {loading ? (
        <View style={S.center}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : docs.length === 0 ? (
        <View style={S.center}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>📁</Text>
          <Text style={S.emptyTitle}>{t("noDocuments")}</Text>
          <Text style={S.emptyDesc}>{t("noDocumentsDesc")}</Text>
        </View>
      ) : (
        <ScrollView style={S.list} contentContainerStyle={{ paddingBottom: 100 }}>
          {docs.map((doc) => {
            const expiry = getExpiryStatus(doc.expiry_date);
            return (
              <TouchableOpacity
                key={doc.id}
                style={[S.docCard, shadow]}
                onPress={() => handleView(doc)}
                onLongPress={() => handleDelete(doc)}
                activeOpacity={0.7}
              >
                <View style={[S.docRow, isRTL && { flexDirection: "row-reverse" }]}>
                  <View style={S.docIcon}>
                    <Text style={{ fontSize: 24 }}>{DOC_TYPE_ICONS[doc.type as DocType] || "📄"}</Text>
                  </View>
                  <View style={[S.docInfo, isRTL && { alignItems: "flex-end" }]}>
                    <Text style={[S.docName, isRTL && { textAlign: "right" }]} numberOfLines={1}>
                      {doc.name}
                    </Text>
                    <Text style={[S.docMeta, isRTL && { textAlign: "right" }]}>
                      {t(DOC_TYPE_KEYS[doc.type as DocType] || ("docTypeOther" as TKey))}
                      {doc.property_name ? ` · ${doc.property_name}` : ""}
                    </Text>
                    <Text style={[S.docDate, isRTL && { textAlign: "right" }]}>
                      {new Date(doc.created_at).toLocaleDateString(isRTL ? "ar-SA" : "en-US")}
                    </Text>
                  </View>
                  <View style={[S.docActions, isRTL && { flexDirection: "row-reverse" }]}>
                    {expiry && (
                      <View style={[S.expiryBadge, { backgroundColor: expiry.bg }]}>
                        <Text style={[S.expiryText, { color: expiry.color }]}>{expiry.label}</Text>
                      </View>
                    )}
                    <TouchableOpacity onPress={() => handleDelete(doc)} style={S.deleteBtn}>
                      <Ionicons name="trash-outline" size={18} color={C.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Upload Modal */}
      <Modal visible={showUploadModal} transparent animationType="slide">
        <View style={S.modalOverlay}>
          <View style={[S.modalContent, { backgroundColor: C.surface }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={[S.modalHeader, isRTL && { flexDirection: "row-reverse" }]}>
                <Text style={S.modalTitle}>{t("addDocument")}</Text>
                <TouchableOpacity onPress={() => setShowUploadModal(false)}>
                  <Ionicons name="close" size={24} color={C.textMuted} />
                </TouchableOpacity>
              </View>

              {/* File picker */}
              <TouchableOpacity style={[S.filePicker, { borderColor: C.border }]} onPress={pickDocument}>
                {selectedFile ? (
                  <Text style={S.filePickerText} numberOfLines={1}>📎 {selectedFile.name}</Text>
                ) : (
                  <View style={{ alignItems: "center" }}>
                    <Ionicons name="cloud-upload-outline" size={32} color={C.textMuted} />
                    <Text style={[S.filePickerHint, { color: C.textMuted }]}>
                      {t("addDocument")}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Name */}
              <Text style={S.label}>{t("documentName")}</Text>
              <TextInput
                style={[S.input, { borderColor: C.border, color: C.text, textAlign: isRTL ? "right" : "left" }]}
                value={formName}
                onChangeText={setFormName}
                placeholder={t("documentName")}
                placeholderTextColor={C.textMuted}
              />

              {/* Document type */}
              <Text style={S.label}>{t("documentType")}</Text>
              <View style={[S.typeGrid, isRTL && { flexDirection: "row-reverse" }]}>
                {DOC_TYPES.map((dt) => (
                  <TouchableOpacity
                    key={dt}
                    style={[S.typeChip, formType === dt && { backgroundColor: C.accent + "20", borderColor: C.accent }]}
                    onPress={() => setFormType(dt)}
                  >
                    <Text style={S.typeChipIcon}>{DOC_TYPE_ICONS[dt]}</Text>
                    <Text style={[S.typeChipText, formType === dt && { color: C.accent }]} numberOfLines={1}>
                      {t(DOC_TYPE_KEYS[dt])}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Property selector */}
              {properties.length > 0 && (
                <>
                  <Text style={S.label}>{t("selectProperty")}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={[{ flexDirection: "row", gap: 8 }, isRTL && { flexDirection: "row-reverse" }]}>
                      <TouchableOpacity
                        style={[S.propChip, !formPropertyId && { backgroundColor: C.accent + "20", borderColor: C.accent }]}
                        onPress={() => setFormPropertyId(null)}
                      >
                        <Text style={[S.propChipText, !formPropertyId && { color: C.accent }]}>{t("allDocuments")}</Text>
                      </TouchableOpacity>
                      {properties.map((p) => (
                        <TouchableOpacity
                          key={p.id}
                          style={[S.propChip, formPropertyId === p.id && { backgroundColor: C.accent + "20", borderColor: C.accent }]}
                          onPress={() => setFormPropertyId(formPropertyId === p.id ? null : p.id)}
                        >
                          <Text style={[S.propChipText, formPropertyId === p.id && { color: C.accent }]}>{p.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </>
              )}

              {/* Expiry date */}
              <Text style={S.label}>{t("expiryDate")}</Text>
              <TextInput
                style={[S.input, { borderColor: C.border, color: C.text, textAlign: isRTL ? "right" : "left" }]}
                value={formExpiry}
                onChangeText={setFormExpiry}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={C.textMuted}
                keyboardType="numeric"
              />

              {/* Upload button */}
              <TouchableOpacity
                style={[S.uploadBtn, { backgroundColor: C.accent, opacity: (!selectedFile || !formName.trim() || uploading) ? 0.5 : 1 }]}
                onPress={handleUpload}
                disabled={!selectedFile || !formName.trim() || uploading}
              >
                {uploading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={S.uploadBtnText}>{t("addDocument")}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = (C: any, isRTL: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: spacing.md, paddingVertical: 12,
    },
    backBtn: {
      width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface,
      alignItems: "center", justifyContent: "center",
    },
    headerTitle: { fontSize: 20, fontWeight: "700", color: C.text },
    addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
    filterScroll: { maxHeight: 48, paddingHorizontal: spacing.md, marginBottom: 8 },
    filterRow: { flexDirection: "row", gap: 8, alignItems: "center" },
    chip: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    },
    chipActive: { backgroundColor: C.accent, borderColor: C.accent },
    chipText: { fontSize: 13, color: C.textMuted, fontWeight: "500" },
    chipTextActive: { color: "#fff", fontWeight: "700" },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
    emptyTitle: { fontSize: 18, fontWeight: "600", color: C.text, marginBottom: 8, textAlign: "center" },
    emptyDesc: { fontSize: 14, color: C.textMuted, textAlign: "center" },
    list: { flex: 1, paddingHorizontal: spacing.md },
    docCard: {
      backgroundColor: C.surface, borderRadius: radii.lg, padding: 16,
      marginBottom: 12, borderWidth: 1, borderColor: C.border,
    },
    docRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    docIcon: {
      width: 48, height: 48, borderRadius: 12, backgroundColor: C.background,
      alignItems: "center", justifyContent: "center",
    },
    docInfo: { flex: 1 },
    docName: { fontSize: 15, fontWeight: "600", color: C.text, marginBottom: 2 },
    docMeta: { fontSize: 12, color: C.textMuted, marginBottom: 2 },
    docDate: { fontSize: 11, color: C.textMuted },
    docActions: { flexDirection: "row", alignItems: "center", gap: 8 },
    expiryBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    expiryText: { fontSize: 10, fontWeight: "700" },
    deleteBtn: { padding: 6 },
    // Modal
    modalOverlay: {
      flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end",
    },
    modalContent: {
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      padding: spacing.lg, maxHeight: "90%",
    },
    modalHeader: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      marginBottom: 20,
    },
    modalTitle: { fontSize: 20, fontWeight: "700", color: C.text },
    filePicker: {
      borderWidth: 2, borderStyle: "dashed", borderRadius: radii.lg,
      padding: 24, alignItems: "center", justifyContent: "center", marginBottom: 20,
    },
    filePickerText: { fontSize: 14, color: C.text, fontWeight: "500" },
    filePickerHint: { fontSize: 13, marginTop: 8 },
    label: {
      fontSize: 13, fontWeight: "600", color: C.textMuted, marginBottom: 6, marginTop: 12,
      textAlign: isRTL ? "right" : "left",
    },
    input: {
      borderWidth: 1, borderRadius: radii.md, paddingHorizontal: 14,
      paddingVertical: 12, fontSize: 15, marginBottom: 4,
    },
    typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
    typeChip: {
      flexDirection: "row", alignItems: "center", gap: 4,
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16,
      borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
    },
    typeChipIcon: { fontSize: 16 },
    typeChipText: { fontSize: 12, color: C.textMuted, fontWeight: "500" },
    propChip: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16,
      borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
    },
    propChipText: { fontSize: 13, color: C.textMuted, fontWeight: "500" },
    uploadBtn: {
      borderRadius: radii.md, paddingVertical: 16, alignItems: "center",
      justifyContent: "center", marginTop: 20, marginBottom: 20,
    },
    uploadBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  });
