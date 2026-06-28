import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, Pressable,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ordersApi, DailyOrder } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius, shadow, DAY_NAMES_FULL } from "@/src/lib/theme";

const HERO = "https://images.pexels.com/photos/35008222/pexels-photo-35008222.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";
const MEALS: ("breakfast" | "lunch" | "dinner")[] = ["breakfast", "lunch", "dinner"];
const MEAL_ICONS = { breakfast: "sunrise", lunch: "sun", dinner: "moon" } as const;

function formatNice(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const day = DAY_NAMES_FULL[d.getDay()];
  return `${day}, ${d.getDate()} ${d.toLocaleString("en-US", { month: "short" })}`;
}

export default function CustomerHome() {
  const { user } = useAuth();
  const [today, setToday] = useState<DailyOrder | null>(null);
  const [tomorrow, setTomorrow] = useState<DailyOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const upcoming = await ordersApi.upcoming();
      const todayStr = new Date().toISOString().split("T")[0];
      const tomorrowDate = new Date();
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const tomStr = tomorrowDate.toISOString().split("T")[0];
      setToday(upcoming.find((o) => o.date === todayStr) || null);
      setTomorrow(upcoming.find((o) => o.date === tomStr) || null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function modify(orderId: string, meal: "breakfast" | "lunch" | "dinner",
                        patch: { enabled?: boolean; quantity?: number }) {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await ordersApi.modify(orderId, meal, patch);
      load();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        <View style={styles.hero}>
          <Image source={HERO} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={["rgba(44,42,40,0.2)", "rgba(44,42,40,0.85)"]}
            style={StyleSheet.absoluteFill} />
          <SafeAreaView edges={["top"]} style={styles.heroInner}>
            <Text style={styles.heroGreet} testID="home-greeting">
              Namaste, {user?.name?.split(" ")[0] || "friend"} 🙏
            </Text>
            <Text style={styles.heroTitle}>Today's Menu</Text>
            <Text style={styles.heroDate}>{formatNice(new Date().toISOString().split("T")[0])}</Text>
          </SafeAreaView>
        </View>

        <View style={styles.body}>
          {/* Today's meals */}
          <Text style={styles.section}>What's cooking today</Text>
          {today ? (
            <View style={styles.card}>
              {MEALS.map((m, i) => (
                <View key={m} style={[styles.mealRow, i > 0 && styles.divider]}>
                  <Feather name={MEAL_ICONS[m]} size={20} color={colors.brand} />
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <Text style={styles.mealLabel}>{m.toUpperCase()}</Text>
                    <Text style={styles.mealName} testID={`today-${m}-name`}>
                      {today[m].item_name || "—"}
                    </Text>
                  </View>
                  <Text style={styles.qty}>
                    {today[m].enabled ? `×${today[m].quantity}` : "Skipped"}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={[styles.card, styles.empty]}>
              <Feather name="coffee" size={28} color={colors.onSurfaceMuted} />
              <Text style={styles.emptyText}>No meals today — enjoy your holiday!</Text>
            </View>
          )}

          {/* Cutoff banner */}
          <View style={styles.cutoffBanner} testID="cutoff-banner">
            <Feather name="clock" size={18} color={colors.warning} />
            <Text style={styles.cutoffText}>
              <Text style={{ fontWeight: "700" }}>8 PM cutoff</Text> to change tomorrow's order ·
              up to 3 members per meal
            </Text>
          </View>

          {/* Tomorrow's meals — editable */}
          <Text style={styles.section}>Tomorrow's plan</Text>
          {tomorrow ? (
            <View style={styles.card}>
              <Text style={styles.tomorrowDate}>{formatNice(tomorrow.date)}</Text>
              {tomorrow.cutoff_passed && (
                <View style={styles.lockedRow}>
                  <Feather name="lock" size={14} color={colors.error} />
                  <Text style={styles.lockedText}>Changes locked — past 8 PM cutoff</Text>
                </View>
              )}
              {MEALS.map((m, i) => {
                const meal = tomorrow[m];
                const locked = tomorrow.cutoff_passed;
                return (
                  <View key={m} style={[styles.mealRow, i > 0 && styles.divider]}>
                    <Feather name={MEAL_ICONS[m]} size={20}
                      color={meal.enabled ? colors.brand : colors.onSurfaceMuted} />
                    <View style={{ flex: 1, marginLeft: spacing.md }}>
                      <Text style={styles.mealLabel}>{m.toUpperCase()}</Text>
                      <Text style={[styles.mealName,
                        !meal.enabled && { textDecorationLine: "line-through",
                                            color: colors.onSurfaceMuted }]}
                        testID={`tomorrow-${m}-name`}>
                        {meal.item_name || "—"}
                      </Text>
                    </View>
                    <View style={styles.actions}>
                      <Pressable
                        testID={`tomorrow-${m}-minus`}
                        disabled={locked || meal.quantity <= 0}
                        style={[styles.qtyBtn, (locked || meal.quantity <= 0) && styles.qtyBtnDisabled]}
                        onPress={() => modify(tomorrow.id, m, {
                          quantity: Math.max(0, meal.quantity - 1),
                          enabled: meal.quantity - 1 > 0,
                        })}
                      >
                        <Feather name="minus" size={16} color={colors.onSurface} />
                      </Pressable>
                      <Text style={styles.qtyVal} testID={`tomorrow-${m}-qty`}>
                        {meal.enabled ? meal.quantity : 0}
                      </Text>
                      <Pressable
                        testID={`tomorrow-${m}-plus`}
                        disabled={locked || meal.quantity >= 3}
                        style={[styles.qtyBtn, (locked || meal.quantity >= 3) && styles.qtyBtnDisabled]}
                        onPress={() => modify(tomorrow.id, m, {
                          quantity: Math.min(3, meal.quantity + 1), enabled: true,
                        })}
                      >
                        <Feather name="plus" size={16} color={colors.onSurface} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={[styles.card, styles.empty]}>
              <Feather name="coffee" size={28} color={colors.onSurfaceMuted} />
              <Text style={styles.emptyText}>Tomorrow is a holiday (Sunday).</Text>
            </View>
          )}
          <View style={{ height: spacing.xxl }} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center",
            backgroundColor: colors.surface },
  hero: { height: 240, backgroundColor: colors.surfaceInverse },
  heroInner: { flex: 1, padding: spacing.xl, justifyContent: "flex-end" },
  heroGreet: { color: colors.brandTertiary, fontSize: 14, marginBottom: spacing.xs },
  heroTitle: { color: colors.onSurfaceInverse, fontSize: 32, fontWeight: "700",
               letterSpacing: -0.5 },
  heroDate: { color: colors.brandTertiary, fontSize: 14, marginTop: spacing.xs },

  body: { padding: spacing.lg, marginTop: -spacing.lg },
  section: { fontSize: 14, fontWeight: "700", color: colors.onSurfaceMuted,
             letterSpacing: 0.5, marginBottom: spacing.sm, marginTop: spacing.md,
             textTransform: "uppercase" },

  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
  },
  empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { color: colors.onSurfaceMuted, fontSize: 14 },

  mealRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  mealLabel: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceMuted,
               letterSpacing: 1, marginBottom: 2 },
  mealName: { fontSize: 15, color: colors.onSurface, fontWeight: "600" },
  qty: { fontSize: 14, fontWeight: "700", color: colors.brand },

  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  qtyBtn: {
    width: 32, height: 32, borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  qtyBtnDisabled: { opacity: 0.4 },
  qtyVal: { minWidth: 24, textAlign: "center", fontSize: 16,
            fontWeight: "700", color: colors.onSurface },

  cutoffBanner: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.warningBg,
    borderRadius: radius.md, padding: spacing.md,
    marginTop: spacing.lg,
    borderLeftWidth: 4, borderLeftColor: colors.warning,
  },
  cutoffText: { color: colors.onSurface, fontSize: 14, flex: 1 },

  tomorrowDate: { fontSize: 14, fontWeight: "700", color: colors.brand,
                  marginBottom: spacing.sm },
  lockedRow: {
    flexDirection: "row", gap: spacing.xs, alignItems: "center",
    backgroundColor: "#FBE9E9", padding: spacing.sm, borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  lockedText: { color: colors.error, fontSize: 12, fontWeight: "600" },
});
