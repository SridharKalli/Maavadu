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
  SizeKey, LunchVariant, PricingGrid,
} from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius, shadow, DAY_NAMES_FULL } from "@/src/lib/theme";

const HERO = "https://images.pexels.com/photos/35008222/pexels-photo-35008222.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";
const ALL_MEALS: MealKey[] = ["breakfast", "lunch", "dinner"];
const MEAL_ICONS = { breakfast: "sunrise", lunch: "sun", dinner: "moon" } as const;

type SegKey = "skip" | "single" | "couple" | "family";
const SEG_OPTIONS: { key: SegKey; label: string }[] = [
  { key: "skip", label: "Skip" },
  { key: "single", label: "Single" },
  { key: "couple", label: "Couple" },
  { key: "family", label: "Family" },
];

function mealCurrentSeg(m: OrderMeal): SegKey {
  if (!m.enabled || m.quantity === 0) return "skip";
  return (m.size as SegKey) || "single";
}

function priceFor(meal: MealKey, size: SizeKey,
                  variant: LunchVariant, pricing?: PricingGrid): number {
  if (!pricing) return 0;
  if (meal === "lunch") return pricing[`lunch_${variant}` as const][size];
  return pricing[meal][size];
}

function formatNice(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return `${DAY_NAMES_FULL[d.getDay()]}, ${d.getDate()} ${d.toLocaleString("en-US",
    { month: "short" })}`;
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

  async function setSize(orderId: string, meal: MealKey, size: SegKey) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (size === "skip") {
        await ordersApi.modify(orderId, meal, { enabled: false });
      } else {
        await ordersApi.modify(orderId, meal, { size });
      }
      load();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  async function toggleLunchVariant(orderId: string, current: LunchVariant) {
    Haptics.selectionAsync();
    const next: LunchVariant = current === "with_rice" ? "without_rice" : "with_rice";
    try {
      await ordersApi.modify(orderId, "lunch", { lunch_variant: next });
      load();
    } catch {}
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
          <Text style={styles.section}>Today&apos;s menu</Text>
          {today ? (
            <View style={styles.card} testID="today-card">
              {MEALS.map((m, i) => {
                const meal = today[m];
                const sz = mealCurrentSeg(meal);
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
                        {SEG_OPTIONS.find((o) => o.key === sz)?.label}
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
              to change tomorrow&apos;s order
            </Text>
          </View>

          {/* TOMORROW */}
          <Text style={styles.section}>Tomorrow&apos;s plan</Text>
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
                const sz = mealCurrentSeg(meal);
                const locked = !!tomorrow.cutoff_passed;
                const variant: LunchVariant =
                  (meal.lunch_variant as LunchVariant) || "with_rice";
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

                    {m === "lunch" && (
                      <View style={styles.variantRow}>
                        {(["with_rice", "without_rice"] as LunchVariant[]).map((v) => {
                          const active = variant === v;
                          return (
                            <Pressable
                              key={v}
                              testID={`tomorrow-lunch-variant-${v}`}
                              disabled={locked}
                              onPress={() => !active &&
                                toggleLunchVariant(tomorrow.id, variant)}
                              style={[styles.variantChip,
                                active && styles.variantChipActive,
                                locked && { opacity: 0.4 }]}
                            >
                              <Feather
                                name={active ? "check-circle" : "circle"}
                                size={12}
                                color={active ? colors.onBrand : colors.onSurfaceMuted}
                              />
                              <Text style={[styles.variantText,
                                active && { color: colors.onBrand }]}>
                                {v === "with_rice" ? "With rice" : "No rice"}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}

                    <View style={styles.segmented}>
                      {SEG_OPTIONS.map((opt) => {
                        const active = opt.key === sz;
                        const isSkip = opt.key === "skip";
                        const price = isSkip
                          ? 0
                          : priceFor(m, opt.key as SizeKey, variant, wallet?.pricing);
                        return (
                          <Pressable
                            key={opt.key}
                            testID={`tomorrow-${m}-${opt.key}`}
                            disabled={locked}
                            onPress={() => !active && setSize(tomorrow.id, m, opt.key)}
                            style={[
                              styles.segBtn,
                              active && (isSkip ? styles.segBtnSkipActive
                                                : styles.segBtnActive),
                              locked && { opacity: 0.4 },
                            ]}
                          >
                            <Text style={[styles.segLabel,
                              active && (isSkip ? { color: colors.error }
                                                : { color: colors.onBrand })]}>
                              {opt.label}
                            </Text>
                            {!isSkip && (
                              <Text style={[styles.segQty,
                                active && { color: colors.onBrand }]}>
                                ₹{price}
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

  variantRow: { flexDirection: "row", gap: 6, marginBottom: spacing.sm },
  variantChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  variantChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  variantText: { fontSize: 11, fontWeight: "700", color: colors.onSurface },
});
