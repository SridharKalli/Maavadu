import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable,
  TextInput, Modal, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { menuApi, WeeklyMenu, MealItem } from "@/src/lib/api";
import { colors, spacing, radius, shadow, DAY_NAMES_FULL } from "@/src/lib/theme";

const MEALS: ("breakfast" | "lunch" | "dinner")[] = ["breakfast", "lunch", "dinner"];

export default function AdminMenu() {
  const [week, setWeek] = useState<WeeklyMenu[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ day: number; meal: typeof MEALS[number] } | null>(null);
  const [nameVal, setNameVal] = useState("");
  const [descVal, setDescVal] = useState("");

  const load = useCallback(async () => {
    try { setWeek(await menuApi.week()); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function openEdit(day: number, meal: typeof MEALS[number]) {
    const m = week.find((w) => w.day_of_week === day);
    const item = m?.[meal] as MealItem | null;
    setNameVal(item?.name || "");
    setDescVal(item?.description || "");
    setEditing({ day, meal });
  }

  async function save() {
    if (!editing) return;
    const updated = await menuApi.update(editing.day,
      { [editing.meal]: { name: nameVal, description: descVal } } as any);
    setWeek((prev) => prev.map((m) => m.day_of_week === editing.day ? updated : m));
    setEditing(null);
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Manage Menu</Text>
        <Text style={styles.sub}>Tap any meal to edit · Sunday is a holiday</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
        {week.map((day) => (
          <View key={day.id} style={styles.dayCard}>
            <Text style={styles.dayName}>{DAY_NAMES_FULL[day.day_of_week]}</Text>
            {day.is_holiday ? (
              <View style={styles.holiday}>
                <Feather name="coffee" size={18} color={colors.onSurfaceMuted} />
                <Text style={styles.holidayText}>Holiday — kitchen closed</Text>
              </View>
            ) : (
              MEALS.map((m, i) => {
                const item = day[m] as MealItem | null;
                return (
                  <Pressable
                    key={m}
                    testID={`edit-${day.day_of_week}-${m}`}
                    style={[styles.meal, i > 0 && styles.div]}
                    onPress={() => openEdit(day.day_of_week, m)}
                  >
                    <Text style={styles.mealKey}>{m.toUpperCase()}</Text>
                    <Text style={styles.mealName}>{item?.name || "Tap to add"}</Text>
                    {item?.description ? (
                      <Text style={styles.mealDesc}>{item.description}</Text>
                    ) : null}
                    <Feather name="edit-2" size={14}
                      color={colors.onSurfaceMuted} style={styles.editIcon} />
                  </Pressable>
                );
              })
            )}
          </View>
        ))}
      </ScrollView>

      <Modal visible={!!editing} transparent animationType="slide"
             onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={styles.backdrop} onPress={() => setEditing(null)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>
              {editing && `${DAY_NAMES_FULL[editing.day]} · ${editing.meal}`}
            </Text>
            <Text style={styles.label}>Dish name</Text>
            <TextInput
              testID="menu-edit-name"
              style={styles.input} value={nameVal} onChangeText={setNameVal}
              placeholder="e.g. Rajma Chawal"
              placeholderTextColor={colors.onSurfaceMuted}
            />
            <Text style={styles.label}>Description</Text>
            <TextInput
              testID="menu-edit-desc"
              style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
              value={descVal} onChangeText={setDescVal}
              placeholder="Short note about the dish"
              multiline numberOfLines={2}
              placeholderTextColor={colors.onSurfaceMuted}
            />
            <Pressable testID="menu-edit-save" style={styles.cta} onPress={save}>
              <Text style={styles.ctaText}>Save</Text>
            </Pressable>
            <Pressable style={styles.ghost} onPress={() => setEditing(null)}>
              <Text style={styles.ghostText}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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

  dayCard: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.lg, marginBottom: spacing.md, ...shadow.card,
  },
  dayName: { fontSize: 16, fontWeight: "700", color: colors.brand,
             marginBottom: spacing.sm },
  holiday: {
    flexDirection: "row", gap: spacing.sm, alignItems: "center",
    backgroundColor: colors.surfaceTertiary,
    padding: spacing.md, borderRadius: radius.md,
  },
  holidayText: { color: colors.onBrandTertiary, fontWeight: "600" },

  meal: { paddingVertical: spacing.md, position: "relative" },
  div: { borderTopWidth: 1, borderTopColor: colors.divider },
  mealKey: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceMuted,
             letterSpacing: 1 },
  mealName: { fontSize: 15, color: colors.onSurface, fontWeight: "600", marginTop: 2 },
  mealDesc: { fontSize: 13, color: colors.onSurfaceMuted, marginTop: 2 },
  editIcon: { position: "absolute", right: 0, top: spacing.md },

  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.xl, paddingBottom: spacing.xxl,
  },
  handle: { alignSelf: "center", width: 44, height: 4, borderRadius: 2,
            backgroundColor: colors.borderStrong, marginBottom: spacing.lg },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: colors.onSurface,
                marginBottom: spacing.md, textTransform: "capitalize" },
  label: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceMuted,
           letterSpacing: 0.5, marginBottom: spacing.xs, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, fontSize: 15, color: colors.onSurface,
  },
  cta: { backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.md,
         alignItems: "center", marginTop: spacing.lg },
  ctaText: { color: colors.onBrand, fontWeight: "700", fontSize: 15 },
  ghost: { alignItems: "center", padding: spacing.md },
  ghostText: { color: colors.onSurfaceMuted, fontWeight: "600" },
});
