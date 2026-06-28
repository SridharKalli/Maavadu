import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable, RefreshControl,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { pincodesApi, Pincode } from "@/src/lib/api";
import { colors, spacing, radius, shadow } from "@/src/lib/theme";

export default function AdminPincodes() {
  const [list, setList] = useState<Pincode[]>([]);
  const [code, setCode] = useState("");
  const [area, setArea] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setList(await pincodesApi.adminList()); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function add() {
    setError(null);
    if (!/^\d{6}$/.test(code)) {
      setError("Pincode must be 6 digits");
      return;
    }
    try {
      await pincodesApi.create(code, area);
      setCode(""); setArea("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function bulkAdd() {
    setError(null);
    setBulkResult(null);
    try {
      const r = await pincodesApi.bulk(bulkText);
      setBulkResult(`Added ${r.added}, updated ${r.updated}`);
      setBulkText("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function remove(c: string) {
    try {
      await pincodesApi.remove(c);
      load();
    } catch {}
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }

  const active = list.filter((p) => p.active);
  const inactive = list.filter((p) => !p.active);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Text style={styles.title}>Serviceable Pincodes</Text>
          <Text style={styles.sub}>{active.length} active · Chennai delivery zones</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}>
          {/* Add single */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Add a pincode</Text>
            <View style={styles.row}>
              <TextInput
                testID="single-code"
                style={[styles.input, { width: 110, letterSpacing: 4, textAlign: "center" }]}
                value={code} onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
                placeholder="600020" keyboardType="number-pad"
                placeholderTextColor={colors.onSurfaceMuted}
              />
              <TextInput
                testID="single-area"
                style={[styles.input, { flex: 1 }]}
                value={area} onChangeText={setArea} placeholder="Area name (e.g. Adyar)"
                placeholderTextColor={colors.onSurfaceMuted}
              />
              <Pressable testID="add-pincode" style={styles.iconAdd} onPress={add}>
                <Feather name="plus" size={20} color={colors.onBrand} />
              </Pressable>
            </View>
            {error && <Text style={styles.error} testID="pincode-error">{error}</Text>}
          </View>

          {/* Bulk paste */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Bulk paste</Text>
            <Text style={styles.cardSub}>
              Paste pincodes separated by commas or new lines. Format:{" "}
              <Text style={{ fontWeight: "700" }}>600001:George Town</Text> or just{" "}
              <Text style={{ fontWeight: "700" }}>600001</Text>.
            </Text>
            <TextInput
              testID="bulk-text"
              style={[styles.input, { minHeight: 90, textAlignVertical: "top",
                                       marginTop: spacing.sm }]}
              value={bulkText} onChangeText={setBulkText}
              placeholder="600001:George Town, 600028:RA Puram, 600041"
              placeholderTextColor={colors.onSurfaceMuted}
              multiline
            />
            <Pressable testID="bulk-submit" style={styles.cta} onPress={bulkAdd}>
              <Text style={styles.ctaText}>Upload list</Text>
            </Pressable>
            {bulkResult && (
              <Text style={styles.okText} testID="bulk-result">{bulkResult}</Text>
            )}
          </View>

          {/* Active list */}
          <Text style={styles.sectionH}>Active · {active.length}</Text>
          {active.length === 0 ? (
            <Text style={styles.emptyText}>No active pincodes yet.</Text>
          ) : (
            <View style={styles.card}>
              {active.map((p, i) => (
                <View key={p.id} style={[styles.pinRow, i > 0 && styles.div]}>
                  <View>
                    <Text style={styles.pinCode}>{p.code}</Text>
                    <Text style={styles.pinArea}>{p.area || "—"}</Text>
                  </View>
                  <Pressable testID={`remove-${p.code}`} onPress={() => remove(p.code)}
                    style={styles.removeBtn}>
                    <Feather name="trash-2" size={16} color={colors.error} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {inactive.length > 0 && (
            <>
              <Text style={styles.sectionH}>Disabled · {inactive.length}</Text>
              <View style={[styles.card, { opacity: 0.6 }]}>
                {inactive.map((p, i) => (
                  <View key={p.id} style={[styles.pinRow, i > 0 && styles.div]}>
                    <View>
                      <Text style={styles.pinCode}>{p.code}</Text>
                      <Text style={styles.pinArea}>{p.area || "—"}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: 24, fontWeight: "700", color: colors.onSurface,
           letterSpacing: -0.5 },
  sub: { color: colors.onSurfaceMuted, fontSize: 13, marginTop: 2 },

  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.lg, marginBottom: spacing.md, ...shadow.card,
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface,
               marginBottom: spacing.sm },
  cardSub: { fontSize: 13, color: colors.onSurfaceMuted, marginBottom: spacing.xs,
             lineHeight: 18 },
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  input: {
    backgroundColor: colors.surface, borderWidth: 1,
    borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 12,
    fontSize: 15, color: colors.onSurface,
  },
  iconAdd: {
    width: 44, height: 44, borderRadius: radius.pill,
    backgroundColor: colors.brand, alignItems: "center", justifyContent: "center",
  },
  cta: { backgroundColor: colors.brand, paddingVertical: 12, borderRadius: radius.md,
         alignItems: "center", marginTop: spacing.md },
  ctaText: { color: colors.onBrand, fontWeight: "700", fontSize: 14 },

  sectionH: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceMuted,
              letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm,
              textTransform: "uppercase" },
  emptyText: { color: colors.onSurfaceMuted, fontStyle: "italic" },
  pinRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: spacing.sm,
  },
  div: { borderTopWidth: 1, borderTopColor: colors.divider },
  pinCode: { fontSize: 15, fontWeight: "700", color: colors.onSurface,
             letterSpacing: 0.5 },
  pinArea: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },
  removeBtn: { padding: spacing.sm },

  error: { color: colors.error, fontSize: 13, marginTop: spacing.sm },
  okText: { color: colors.success, fontSize: 13, marginTop: spacing.sm,
            fontWeight: "700" },
});
