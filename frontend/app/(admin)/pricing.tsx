import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { walletApi, PricingGrid, SizeKey } from "@/src/lib/api";
import { colors, spacing, radius, shadow } from "@/src/lib/theme";

type GridKey = keyof PricingGrid;
const ROWS: { key: GridKey; label: string; sub: string }[] = [
  { key: "breakfast", label: "Breakfast", sub: "Morning tiffin" },
  { key: "lunch_with_rice", label: "Lunch (with rice)", sub: "Full thali" },
  { key: "lunch_without_rice", label: "Lunch (no rice)", sub: "Roti / phulka thali" },
  { key: "dinner", label: "Dinner", sub: "Evening meal" },
];
const SIZES: { key: SizeKey; label: string; members: string }[] = [
  { key: "single", label: "Single", members: "1" },
  { key: "couple", label: "Couple", members: "2" },
  { key: "family", label: "Family", members: "4" },
];

type DraftGrid = Record<GridKey, Record<SizeKey, string>>;

function blankDraft(): DraftGrid {
  return {
    breakfast: { single: "", couple: "", family: "" },
    lunch_with_rice: { single: "", couple: "", family: "" },
    lunch_without_rice: { single: "", couple: "", family: "" },
    dinner: { single: "", couple: "", family: "" },
  };
}

function fromGrid(g: PricingGrid): DraftGrid {
  return {
    breakfast: {
      single: String(g.breakfast.single),
      couple: String(g.breakfast.couple),
      family: String(g.breakfast.family),
    },
    lunch_with_rice: {
      single: String(g.lunch_with_rice.single),
      couple: String(g.lunch_with_rice.couple),
      family: String(g.lunch_with_rice.family),
    },
    lunch_without_rice: {
      single: String(g.lunch_without_rice.single),
      couple: String(g.lunch_without_rice.couple),
      family: String(g.lunch_without_rice.family),
    },
    dinner: {
      single: String(g.dinner.single),
      couple: String(g.dinner.couple),
      family: String(g.dinner.family),
    },
  };
}

export default function AdminPricing() {
  const router = useRouter();
  const [original, setOriginal] = useState<PricingGrid | null>(null);
  const [draft, setDraft] = useState<DraftGrid>(blankDraft());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const g = await walletApi.pricing();
      setOriginal(g);
      setDraft(fromGrid(g));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function setCell(row: GridKey, size: SizeKey, value: string) {
    const clean = value.replace(/[^\d.]/g, "");
    setDraft((d) => ({ ...d, [row]: { ...d[row], [size]: clean } }));
    setError(null);
    setSaved(false);
  }

  function dirty(): boolean {
    if (!original) return false;
    for (const r of ROWS) {
      for (const s of SIZES) {
        if (Number(draft[r.key][s.key] || 0)
            !== Number((original as any)[r.key][s.key] || 0)) {
          return true;
        }
      }
    }
    return false;
  }

  function reset() {
    if (!original) return;
    setDraft(fromGrid(original));
    setError(null);
    setSaved(false);
    Haptics.selectionAsync();
  }

  async function save() {
    setError(null); setSaved(false);
    // Validate every cell is a positive number
    const payload: any = {};
    for (const r of ROWS) {
      const row: any = {};
      for (const s of SIZES) {
        const n = Number(draft[r.key][s.key]);
        if (!isFinite(n) || n < 0 || draft[r.key][s.key] === "") {
          setError(`${r.label} · ${s.label} must be a non-negative number.`);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          return;
        }
        row[s.key] = n;
      }
      payload[r.key] = row;
    }
    setSaving(true);
    try {
      const updated = await walletApi.updatePricing(payload);
      setOriginal(updated);
      setDraft(fromGrid(updated));
      setSaved(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setSaved(false), 2400);
    } catch (e: any) {
      setError(e.message || "Failed to save");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const isDirty = dirty();

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Pressable testID="pricing-back"
            onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <Feather name="arrow-left" size={20} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>Pricing</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.helper}>
            Edit per-meal pricing by family size. New prices take effect
            immediately for all future deliveries.
          </Text>

          <View style={styles.tableHead}>
            <Text style={[styles.headCell, { flex: 1.4, textAlign: "left" }]}>
              Meal
            </Text>
            {SIZES.map((s) => (
              <View key={s.key} style={styles.headSizeCol}>
                <Text style={styles.headCell}>{s.label}</Text>
                <Text style={styles.headSub}>{s.members} member{s.key !== "single" ? "s" : ""}</Text>
              </View>
            ))}
          </View>

          {ROWS.map((r) => (
            <View key={r.key} style={styles.rowCard}>
              <View style={{ flex: 1.4, paddingRight: spacing.sm }}>
                <Text style={styles.rowLabel}>{r.label}</Text>
                <Text style={styles.rowSub}>{r.sub}</Text>
              </View>
              {SIZES.map((s) => (
                <View key={s.key} style={styles.cellWrap}>
                  <Text style={styles.rupee}>₹</Text>
                  <TextInput
                    testID={`price-${r.key}-${s.key}`}
                    style={styles.cellInput}
                    value={draft[r.key][s.key]}
                    onChangeText={(t) => setCell(r.key, s.key, t)}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.onSurfaceMuted}
                  />
                </View>
              ))}
            </View>
          ))}

          {error && (
            <View style={styles.errorBox} testID="pricing-error">
              <Feather name="alert-triangle" size={14} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          {saved && (
            <View style={styles.successBox} testID="pricing-saved">
              <Feather name="check-circle" size={14} color={colors.success} />
              <Text style={styles.successText}>
                Saved. New prices are live.
              </Text>
            </View>
          )}

          <View style={styles.actions}>
            <Pressable
              testID="pricing-reset"
              onPress={reset}
              disabled={!isDirty || saving}
              style={[styles.ghostBtn,
                (!isDirty || saving) && { opacity: 0.4 }]}
            >
              <Text style={styles.ghostText}>Reset</Text>
            </Pressable>
            <Pressable
              testID="pricing-save"
              onPress={save}
              disabled={!isDirty || saving}
              style={[styles.cta,
                (!isDirty || saving) && styles.ctaDisabled]}
            >
              {saving
                ? <ActivityIndicator color={colors.onBrand} />
                : <Text style={styles.ctaText}>
                    {isDirty ? "Save changes" : "No changes"}
                  </Text>}
            </Pressable>
          </View>

          <View style={{ height: spacing.xxxl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "700", color: colors.onSurface,
           letterSpacing: -0.3 },
  scroll: { padding: spacing.lg },
  helper: { color: colors.onSurfaceMuted, fontSize: 13,
            marginBottom: spacing.lg, lineHeight: 18 },

  tableHead: { flexDirection: "row", alignItems: "flex-end",
               paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
               borderBottomWidth: 1, borderBottomColor: colors.divider,
               marginBottom: spacing.sm },
  headSizeCol: { flex: 1, alignItems: "center" },
  headCell: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceMuted,
              letterSpacing: 0.5, textTransform: "uppercase",
              textAlign: "center" },
  headSub: { fontSize: 10, fontWeight: "600", color: colors.onSurfaceMuted,
             marginTop: 2 },

  rowCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md, padding: spacing.md,
    marginBottom: spacing.sm, gap: spacing.xs, ...shadow.card,
  },
  rowLabel: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  rowSub: { fontSize: 11, color: colors.onSurfaceMuted, marginTop: 2 },

  cellWrap: {
    flex: 1, flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.sm, paddingHorizontal: 8,
  },
  rupee: { fontSize: 14, fontWeight: "700", color: colors.onSurfaceMuted,
           marginRight: 2 },
  cellInput: {
    flex: 1, fontSize: 15, fontWeight: "600", color: colors.onSurface,
    paddingVertical: 10, paddingHorizontal: 0,
  },

  errorBox: {
    flexDirection: "row", gap: 6, alignItems: "center",
    backgroundColor: "#FBE9E9", padding: spacing.md,
    borderRadius: radius.sm, marginTop: spacing.md,
  },
  errorText: { color: colors.error, fontSize: 13, fontWeight: "600", flex: 1 },
  successBox: {
    flexDirection: "row", gap: 6, alignItems: "center",
    backgroundColor: "#E5EFE5", padding: spacing.md,
    borderRadius: radius.sm, marginTop: spacing.md,
  },
  successText: { color: colors.success, fontSize: 13, fontWeight: "700",
                 flex: 1 },

  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl },
  ghostBtn: { paddingHorizontal: spacing.lg, paddingVertical: 14,
              borderRadius: radius.md, alignItems: "center",
              borderWidth: 1, borderColor: colors.border,
              backgroundColor: colors.surfaceSecondary },
  ghostText: { color: colors.onSurface, fontWeight: "700", fontSize: 14 },
  cta: { flex: 1, paddingVertical: 14, borderRadius: radius.md,
         alignItems: "center", backgroundColor: colors.brand },
  ctaDisabled: { backgroundColor: colors.borderStrong },
  ctaText: { color: colors.onBrand, fontWeight: "700", fontSize: 15,
             letterSpacing: 0.3 },
});
