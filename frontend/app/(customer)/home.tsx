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
import { useRouter } from "expo-router";

import {
  ordersApi, walletApi, DailyOrder, MealKey, WalletInfo, OrderMeal,
} from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius, shadow, DAY_NAMES_FULL } from "@/src/lib/theme";

const HERO = "https://images.pexels.com/photos/35008222/pexels-photo-35008222.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";
const ALL_MEALS: MealKey[] = ["breakfast", "lunch", "dinner"];
const MEAL_ICONS = { breakfast: "sunrise", lunch: "sun", dinner: "moon" } as const;
const PLAN_LABEL = { day: "Day pass", week: "Weekly", month: "Monthly" } as const;

type SizeKey = "skip" | "single" | "couple" | "family";
const SIZE_OPTIONS: { key: SizeKey; label: string; qty: number; enabled: boolean }[] = [
  { key: "skip", label: "Skip", qty: 0, enabled: false },
  { key: "single", label: "Single", qty: 1, enabled: true },
  { key: "couple", label: "Couple", qty: 2, enabled: true },
  { key: "family", label: "Family", qty: 3, enabled: true },
];

function mealToSize(m: OrderMeal): SizeKey {
  if (!m.enabled || m.quantity === 0) return "skip";
  if (m.quantity === 1) return "single";
  if (m.quantity === 2) return "couple";
  return "family";
}

function formatNice(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return `${DAY_NAMES_FULL[d.getDay()]}, ${d.getDate()} ${d.toLocaleString("en-US",
    { month: "short" })}`;
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T23:59:59");
  return Math.ceil((target.getTime() - Date.now()) / (24 * 3600 * 1000));
}

export default function CustomerHome() {
  const { user } = useAuth();
  const router = useRouter();
  const [today, setToday] = useState<DailyOrder | null>(null);
  const [tomorrow, setTomorrow] = useState<DailyOrder | null>(null);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [upcoming, w] = await Promise.all([ordersApi.upcoming(), walletApi.me()]);
      const todayStr = new Date().toISOString().split("T")[0];
      const tomorrowDate = new Date();
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const tomStr = tomorrowDate.toISOString().split("T")[0];
      setToday(upcoming.find((o) => o.date === todayStr) || null);
      setTomorrow(upcoming.find((o) => o.date === tomStr) || null);
      setWallet(w);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // MEALS: derive from upcoming orders so we still hide breakfast etc. if
  // not subscribed. Falls back to all meals while loading.
  const subscribedMeals: MealKey[] = tomorrow
    ? ALL_MEALS.filter((m) => tomorrow[m].item_name || tomorrow[m].enabled)
    : (today
        ? ALL_MEALS.filter((m) => today[m].item_name || today[m].enabled)
        : ALL_MEALS);
  const MEALS = subscribedMeals.length > 0 ? subscribedMeals : ALL_MEALS;

  async function setSize(orderId: string, meal: MealKey, size: SizeKey) {
    const opt = SIZE_OPTIONS.find((o) => o.key === size)!;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await ordersApi.modify(orderId, meal,
        { enabled: opt.enabled, quantity: opt.qty });
      load();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }

  const lowBalance = wallet?.low === true;

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        {/* HERO */}
        <View style={styles.hero}>
          <Image source={HERO} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={["rgba(44,42,40,0.2)", "rgba(44,42,40,0.85)"]}
            style={StyleSheet.absoluteFill} />
          <SafeAreaView edges={["top"]} style={styles.heroInner}>
            <Text style={styles.heroGreet} testID="home-greeting">
              Namaste, {user?.name?.split(" ")[0] || "friend"} 🙏
            </Text>
            <Text style={styles.heroTitle}>Home Tiffin</Text>
            <Text style={styles.heroDate}>
              {formatNice(new Date().toISOString().split("T")[0])}
            </Text>
          </SafeAreaView>
        </View>

        <View style={styles.body}>
          {/* WALLET BANNER */}
          {wallet && (
            <Pressable
              testID="wallet-banner"
              onPress={() => router.push("/(customer)/wallet")}
              style={[styles.subCard, lowBalance && styles.subCardWarn]}
            >
              <View style={styles.walletTopRow}>
                <View>
                  <Text style={styles.walletLabel}>Wallet balance</Text>
                  <Text
                    testID="wallet-balance"
                    style={[styles.walletBalance,
                      lowBalance && { color: colors.error }]}
                  >
                    ₹{wallet.balance.toFixed(0)}
                  </Text>
                </View>
                <View style={styles.walletMeta}>
                  <Text style={styles.walletMetaLabel}>
                    {wallet.daily_burn > 0 ? `≈ ${wallet.days_left} days` : "—"}
                  </Text>
                  <Text style={styles.walletMetaSub}>
                    at ₹{wallet.daily_burn.toFixed(0)}/day
                  </Text>
                </View>
              </View>
              {lowBalance && (
                <View style={styles.lowBalanceRow} testID="low-balance-row">
                  <Feather name="alert-circle" size={14} color={colors.error} />
                  <Text style={styles.lowBalanceText}>
                    Balance is low. Top up to keep meals coming.
                  </Text>
                </View>
              )}
              <View style={styles.walletCtaRow}>
                <Text style={styles.walletCtaText}>
                  Tap to top up & view history
                </Text>
                <Feather name="chevron-right" size={16}
                  color={lowBalance ? colors.error : colors.brand} />
              </View>
            </Pressable>
          )}

          {/* TODAY */}
          <Text style={styles.section}>Today's menu</Text>
          {today ? (
            <View style={styles.card} testID="today-card">
              {MEALS.map((m, i) => {
                const meal = today[m];
                const sz = mealToSize(meal);
                return (
                  <View key={m} style={[styles.todayRow, i > 0 && styles.divider]}>
                    <Feather name={MEAL_ICONS[m]} size={20}
                      color={meal.enabled ? colors.brand : colors.onSurfaceMuted} />
                    <View style={{ flex: 1, marginLeft: spacing.md }}>
                      <Text style={styles.mealLabel}>{m.toUpperCase()}</Text>
                      <Text style={[styles.mealName,
                        !meal.enabled && styles.skipped]}
                        testID={`today-${m}-name`}>
                        {meal.item_name || "—"}
                      </Text>
                    </View>
                    <View style={[styles.statusChip, styles[`chip_${sz}`]]}>
                      <Text style={[styles.statusChipText,
                        sz === "skip" && { color: colors.onSurfaceMuted }]}>
                        {SIZE_OPTIONS.find((o) => o.key === sz)?.label}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={[styles.card, styles.empty]}>
              <Feather name="coffee" size={28} color={colors.onSurfaceMuted} />
              <Text style={styles.emptyText}>No meals today — enjoy your holiday!</Text>
            </View>
          )}

          {/* CUTOFF BANNER */}
          <View style={styles.cutoffBanner} testID="cutoff-banner">
            <Feather name="clock" size={18} color={colors.warning} />
            <Text style={styles.cutoffText}>
              <Text style={{ fontWeight: "700" }}>8 PM cutoff</Text>{" "}
              to change tomorrow's order
            </Text>
          </View>

          {/* TOMORROW */}
          <Text style={styles.section}>Tomorrow's plan</Text>
          {tomorrow ? (
            <View testID="tomorrow-card">
              <Text style={styles.tomorrowDate}>{formatNice(tomorrow.date)}</Text>
              {tomorrow.cutoff_passed && (
                <View style={styles.lockedRow}>
                  <Feather name="lock" size={14} color={colors.error} />
                  <Text style={styles.lockedText}>
                    Changes locked — past 8 PM cutoff
                  </Text>
                </View>
              )}
              {MEALS.map((m) => {
                const meal = tomorrow[m];
                const sz = mealToSize(meal);
                const locked = !!tomorrow.cutoff_passed;
                return (
                  <View key={m} style={styles.mealCard} testID={`tomorrow-${m}-card`}>
                    <View style={styles.mealCardHead}>
                      <Feather name={MEAL_ICONS[m]} size={20}
                        color={meal.enabled ? colors.brand : colors.onSurfaceMuted} />
                      <View style={{ flex: 1, marginLeft: spacing.md }}>
                        <Text style={styles.mealLabel}>{m.toUpperCase()}</Text>
                        <Text style={[styles.mealName,
                          !meal.enabled && styles.skipped]}
                          testID={`tomorrow-${m}-name`}>
                          {meal.item_name || "—"}
                        </Text>
                      </View>
                    </View>

                    {/* Segmented size selector */}
                    <View style={styles.segmented}>
                      {SIZE_OPTIONS.map((opt) => {
                        const active = opt.key === sz;
                        return (
                          <Pressable
                            key={opt.key}
                            testID={`tomorrow-${m}-${opt.key}`}
                            disabled={locked}
                            onPress={() => !active && setSize(tomorrow.id, m, opt.key)}
                            style={[
                              styles.segBtn,
                              active && (opt.key === "skip"
                                ? styles.segBtnSkipActive : styles.segBtnActive),
                              locked && { opacity: 0.4 },
                            ]}
                          >
                            <Text style={[styles.segLabel,
                              active && (opt.key === "skip"
                                ? { color: colors.error }
                                : { color: colors.onBrand })]}>
                              {opt.label}
                            </Text>
                            {opt.qty > 0 && (
                              <Text style={[styles.segQty,
                                active && { color: colors.onBrand }]}>
                                ×{opt.qty}
                              </Text>
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={[styles.card, styles.empty]}>
              <Feather name="coffee" size={28} color={colors.onSurfaceMuted} />
              <Text style={styles.emptyText}>
                Tomorrow is a holiday (Sunday).
              </Text>
            </View>
          )}
          <View style={{ height: spacing.xxxl }} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center",
            backgroundColor: colors.surface },
  hero: { height: 220, backgroundColor: colors.surfaceInverse },
  heroInner: { flex: 1, padding: spacing.xl, justifyContent: "flex-end" },
  heroGreet: { color: colors.brandTertiary, fontSize: 14, marginBottom: spacing.xs },
  heroTitle: { color: colors.onSurfaceInverse, fontSize: 32, fontWeight: "700",
               letterSpacing: -0.5 },
  heroDate: { color: colors.brandTertiary, fontSize: 14, marginTop: spacing.xs },

  body: { padding: spacing.lg, marginTop: -spacing.lg },

  // Subscription banner
  subCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg, padding: spacing.lg, ...shadow.card,
    borderLeftWidth: 4, borderLeftColor: colors.brand,
  },
  subCardWarn: { borderLeftColor: colors.error },

  walletTopRow: { flexDirection: "row", justifyContent: "space-between",
                  alignItems: "flex-end" },
  walletLabel: { fontSize: 11, color: colors.onSurfaceMuted, fontWeight: "700",
                 letterSpacing: 0.5, textTransform: "uppercase" },
  walletBalance: { fontSize: 32, fontWeight: "700", color: colors.onSurface,
                   letterSpacing: -0.5, marginTop: 2 },
  walletMeta: { alignItems: "flex-end" },
  walletMetaLabel: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  walletMetaSub: { fontSize: 11, color: colors.onSurfaceMuted },
  lowBalanceRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: spacing.sm, padding: spacing.sm,
    backgroundColor: "#FBE9E9", borderRadius: radius.sm,
  },
  lowBalanceText: { color: colors.error, fontSize: 12, fontWeight: "600", flex: 1 },
  walletCtaRow: {
    marginTop: spacing.sm, flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
  },
  walletCtaText: { color: colors.brand, fontSize: 12, fontWeight: "700" },

  section: { fontSize: 14, fontWeight: "700", color: colors.onSurfaceMuted,
             letterSpacing: 0.5, marginBottom: spacing.sm, marginTop: spacing.xl,
             textTransform: "uppercase" },

  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg, padding: spacing.lg, ...shadow.card,
  },
  empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { color: colors.onSurfaceMuted, fontSize: 14 },

  todayRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  mealLabel: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceMuted,
               letterSpacing: 1, marginBottom: 2 },
  mealName: { fontSize: 15, color: colors.onSurface, fontWeight: "600" },
  skipped: { textDecorationLine: "line-through", color: colors.onSurfaceMuted },

  statusChip: {
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.pill,
  },
  statusChipText: { color: colors.onBrand, fontWeight: "700", fontSize: 11 },
  chip_skip: { backgroundColor: colors.surfaceTertiary },
  chip_single: { backgroundColor: colors.brandSecondary },
  chip_couple: { backgroundColor: colors.brand },
  chip_family: { backgroundColor: colors.surfaceInverse },

  cutoffBanner: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.warningBg,
    borderRadius: radius.md, padding: spacing.md,
    marginTop: spacing.lg,
    borderLeftWidth: 4, borderLeftColor: colors.warning,
  },
  cutoffText: { color: colors.onSurface, fontSize: 14, flex: 1 },

  tomorrowDate: { fontSize: 14, fontWeight: "700", color: colors.brand,
                  marginBottom: spacing.md },
  lockedRow: {
    flexDirection: "row", gap: spacing.xs, alignItems: "center",
    backgroundColor: "#FBE9E9", padding: spacing.sm, borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  lockedText: { color: colors.error, fontSize: 12, fontWeight: "600" },

  mealCard: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.lg, marginBottom: spacing.md, ...shadow.card,
  },
  mealCardHead: { flexDirection: "row", alignItems: "center",
                  marginBottom: spacing.md },

  segmented: {
    flexDirection: "row", gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.md, padding: 4,
    borderWidth: 1, borderColor: colors.border,
  },
  segBtn: {
    flex: 1, paddingVertical: 8, alignItems: "center",
    borderRadius: radius.sm,
  },
  segBtnActive: { backgroundColor: colors.brand },
  segBtnSkipActive: { backgroundColor: "#FBE9E9" },
  segLabel: { fontSize: 12, fontWeight: "700", color: colors.onSurface,
              letterSpacing: 0.2 },
  segQty: { fontSize: 10, color: colors.onSurfaceMuted, marginTop: 1,
            fontWeight: "700" },
});
