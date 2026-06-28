import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, Pressable,
  ActivityIndicator, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";

import {
  ordersApi, walletApi, subsApi, DailyOrder, MealKey, WalletInfo,
  OrderMeal, SizeKey, LunchVariant, PricingGrid,
} from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { istDateStr } from "@/src/lib/ist";
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

const MEAL_LBL: Record<MealKey, string> = {
  breakfast: "breakfast", lunch: "lunch", dinner: "dinner",
};

type PendingChange =
  | { kind: "size"; orderId: string; meal: MealKey; from: SegKey; to: SegKey }
  | { kind: "variant"; orderId: string; from: LunchVariant; to: LunchVariant };

export default function CustomerHome() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [today, setToday] = useState<DailyOrder | null>(null);
  const [tomorrow, setTomorrow] = useState<DailyOrder | null>(null);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [subMeals, setSubMeals] = useState<MealKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [signoutOpen, setSignoutOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [upcoming, w, sub] = await Promise.all([
        ordersApi.upcoming(), walletApi.me(),
        subsApi.me().catch(() => null),
      ]);
      const todayStr = istDateStr(0);
      const tomStr = istDateStr(1);
      setToday(upcoming.find((o) => o.date === todayStr) || null);
      setTomorrow(upcoming.find((o) => o.date === tomStr) || null);
      setWallet(w);
      setSubMeals((sub as any)?.meals || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const subscribedMeals: MealKey[] = tomorrow
    ? ALL_MEALS.filter((m) => tomorrow[m].item_name || tomorrow[m].enabled)
    : (today
        ? ALL_MEALS.filter((m) => today[m].item_name || today[m].enabled)
        : ALL_MEALS);
  const MEALS = subscribedMeals.length > 0 ? subscribedMeals : ALL_MEALS;

  // Meals NOT in the customer's subscription — drive upsell. Source of truth
  // is the subscription itself; do NOT infer from order rows because the
  // backend keeps `item_name` populated even when a meal was switched off.
  const missing: MealKey[] = subMeals.length > 0
    ? ALL_MEALS.filter((m) => !subMeals.includes(m))
    : [];

  async function addMealToPlan(m: MealKey) {
    Haptics.selectionAsync();
    try {
      const current = subMeals;
      await subsApi.update({ meals: Array.from(new Set([...current, m])) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      load();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  function requestSize(orderId: string, meal: MealKey,
                       from: SegKey, to: SegKey) {
    if (from === to) return;
    Haptics.selectionAsync();
    setPending({ kind: "size", orderId, meal, from, to });
  }

  function requestVariant(orderId: string, from: LunchVariant) {
    Haptics.selectionAsync();
    const to: LunchVariant = from === "with_rice" ? "without_rice" : "with_rice";
    setPending({ kind: "variant", orderId, from, to });
  }

  async function confirmPending() {
    if (!pending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (pending.kind === "size") {
        if (pending.to === "skip") {
          await ordersApi.modify(pending.orderId, pending.meal, { enabled: false });
        } else {
          await ordersApi.modify(pending.orderId, pending.meal, { size: pending.to });
        }
      } else {
        await ordersApi.modify(pending.orderId, "lunch",
                               { lunch_variant: pending.to });
      }
      setPending(null);
      load();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  async function doSignOut() {
    await signOut();
    setSignoutOpen(false);
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }

  const lowBalance = wallet?.low === true;
  const pricing = wallet?.pricing;

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        {/* HERO with profile + logout icons in top-right */}
        <View style={styles.hero}>
          <Image source={HERO} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={["rgba(44,42,40,0.2)", "rgba(44,42,40,0.85)"]}
            style={StyleSheet.absoluteFill} />
          <SafeAreaView edges={["top"]} style={styles.heroInner}>
            <View style={styles.headerBar}>
              <View style={{ flex: 1 }} />
              <Pressable
                testID="header-profile"
                onPress={() => router.push("/(customer)/profile")}
                style={styles.iconBtn}
                hitSlop={8}
              >
                <Feather name="user" size={18} color={colors.onSurfaceInverse} />
              </Pressable>
              <Pressable
                testID="header-signout"
                onPress={() => setSignoutOpen(true)}
                style={styles.iconBtn}
                hitSlop={8}
              >
                <Feather name="log-out" size={18} color={colors.onSurfaceInverse} />
              </Pressable>
            </View>
            <View style={styles.heroBottom}>
              <Text style={styles.heroGreet} testID="home-greeting">
                Namaste, {user?.name?.split(" ")[0] || "friend"} 🙏
              </Text>
              <Text style={styles.heroTitle}>Home Tiffin</Text>
              <Text style={styles.heroDate}>
                {formatNice(istDateStr(0))}
              </Text>
            </View>
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

          {/* UPSELL — meals not yet in their plan */}
          {missing.length > 0 && pricing && (
            <View style={styles.upsellWrap} testID="upsell-card">
              <Text style={styles.upsellTitle}>
                Add more meals to your tiffin 🍽️
              </Text>
              <Text style={styles.upsellSub}>
                Save a trip to the kitchen — let us cook these too.
              </Text>
              {missing.map((m) => {
                const todayItem = today?.[m]?.item_name
                  || tomorrow?.[m]?.item_name || "Chef's surprise";
                // Upsell shows a "from ₹X" starting price, so we always
                // anchor on the cheapest size (Single) and the default rice
                // variant. The previous implementation tried to read the
                // size off `tomorrow[m]` — which is unsubscribed and thus
                // disabled — so the assertion chain always resolved to
                // "single" anyway but was unreadable and tripped TS.
                const startSize: SizeKey = "single";
                const startVariant: LunchVariant = "with_rice";
                const price = priceFor(m, startSize, startVariant, pricing);
                return (
                  <View key={m} style={styles.upsellRow} testID={`upsell-${m}`}>
                    <Feather name={MEAL_ICONS[m]} size={22}
                      color={colors.brand} />
                    <View style={{ flex: 1, marginLeft: spacing.md }}>
                      <Text style={styles.upsellMeal}>{m.toUpperCase()}</Text>
                      <Text style={styles.upsellItem} numberOfLines={2}>
                        {todayItem}
                      </Text>
                      <Text style={styles.upsellPrice}>
                        from ₹{price}/meal
                      </Text>
                    </View>
                    <Pressable
                      testID={`upsell-add-${m}`}
                      onPress={() => addMealToPlan(m)}
                      style={styles.upsellCta}>
                      <Feather name="plus" size={14} color={colors.onBrand} />
                      <Text style={styles.upsellCtaText}>Add</Text>
                    </Pressable>
                  </View>
                );
              })}
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
                                requestVariant(tomorrow.id, variant)}
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
                          : priceFor(m, opt.key as SizeKey, variant, pricing);
                        return (
                          <Pressable
                            key={opt.key}
                            testID={`tomorrow-${m}-${opt.key}`}
                            disabled={locked}
                            onPress={() => requestSize(tomorrow.id, m, sz, opt.key)}
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

          {/* PRICING (bottom of home) */}
          {pricing && (
            <>
              <Text style={styles.section}>Homely Meals at Affordable Cost</Text>
              <View style={styles.priceCard} testID="home-pricing-card">
                <View style={styles.priceHeaderRow}>
                  <Text style={[styles.priceMeal, { flex: 1.2 }]}>Meal</Text>
                  <Text style={styles.priceColHead}>Single</Text>
                  <Text style={styles.priceColHead}>Couple</Text>
                  <Text style={styles.priceColHead}>Family</Text>
                </View>
                {([
                  ["breakfast", "Breakfast", pricing.breakfast],
                  ["lunch_with_rice", "Lunch (with rice)", pricing.lunch_with_rice],
                  ["lunch_without_rice", "Lunch (no rice)", pricing.lunch_without_rice],
                  ["dinner", "Dinner", pricing.dinner],
                ] as const).map(([key, label, prices], i) => (
                  <View key={key} style={[styles.priceGridRow, i > 0 && styles.priceDiv]}>
                    <Text style={[styles.priceMeal, { flex: 1.2 }]}>{label}</Text>
                    <Text style={styles.priceCell}>₹{prices.single}</Text>
                    <Text style={styles.priceCell}>₹{prices.couple}</Text>
                    <Text style={styles.priceCell}>₹{prices.family}</Text>
                  </View>
                ))}
                <Text style={styles.priceFoot}>
                  Single = 1 · Couple = 2 · Family = 4 members
                </Text>
              </View>
            </>
          )}

          <View style={{ height: spacing.xxxl }} />
        </View>
      </ScrollView>

      {/* Confirm-change Modal (size or lunch variant) */}
      <Modal visible={pending !== null} transparent animationType="fade"
        onRequestClose={() => setPending(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setPending(null)} />
          <View style={styles.confirmCard}>
            <View style={[styles.confirmIcon, { backgroundColor: "#FBEBD3" }]}>
              <Feather name="refresh-cw" size={22} color={colors.warning} />
            </View>
            <Text style={styles.confirmTitle}>Confirm change</Text>
            {pending && pending.kind === "size" && (
              <Text style={styles.confirmBody}>
                Change <Text style={styles.bold}>{MEAL_LBL[pending.meal]}</Text> from{" "}
                <Text style={styles.bold}>
                  {SEG_OPTIONS.find((o) => o.key === pending.from)?.label}
                </Text>{" "}to{" "}
                <Text style={styles.bold}>
                  {SEG_OPTIONS.find((o) => o.key === pending.to)?.label}
                </Text>{" "}for tomorrow?
              </Text>
            )}
            {pending && pending.kind === "variant" && (
              <Text style={styles.confirmBody}>
                Change tomorrow&apos;s lunch from{" "}
                <Text style={styles.bold}>
                  {pending.from === "with_rice" ? "With rice" : "No rice"}
                </Text>{" "}to{" "}
                <Text style={styles.bold}>
                  {pending.to === "with_rice" ? "With rice" : "No rice"}
                </Text>?
              </Text>
            )}
            <Pressable testID="confirm-change-yes"
              onPress={confirmPending}
              style={styles.confirmCta}>
              <Text style={styles.confirmCtaText}>Yes, change it</Text>
            </Pressable>
            <Pressable testID="confirm-change-no"
              onPress={() => setPending(null)}
              style={styles.confirmCancel}>
              <Text style={styles.confirmCancelText}>Keep as is</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Sign-out confirm Modal */}
      <Modal visible={signoutOpen} transparent animationType="fade"
        onRequestClose={() => setSignoutOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setSignoutOpen(false)} />
          <View style={styles.confirmCard}>
            <View style={[styles.confirmIcon, { backgroundColor: "#FBE9E9" }]}>
              <Feather name="log-out" size={22} color={colors.error} />
            </View>
            <Text style={styles.confirmTitle}>Sign out?</Text>
            <Text style={styles.confirmBody}>
              You&apos;ll need to enter the OTP again to log back in.
            </Text>
            <Pressable testID="signout-confirm"
              onPress={doSignOut}
              style={[styles.confirmCta, { backgroundColor: colors.error }]}>
              <Text style={styles.confirmCtaText}>Yes, sign me out</Text>
            </Pressable>
            <Pressable testID="signout-cancel"
              onPress={() => setSignoutOpen(false)}
              style={styles.confirmCancel}>
              <Text style={styles.confirmCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center",
            backgroundColor: colors.surface },
  hero: { height: 240, backgroundColor: colors.surfaceInverse },
  heroInner: { flex: 1 },
  headerBar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
  },
  heroBottom: { flex: 1, padding: spacing.xl, justifyContent: "flex-end" },
  heroGreet: { color: colors.brandTertiary, fontSize: 14, marginBottom: spacing.xs },
  heroTitle: { color: colors.onSurfaceInverse, fontSize: 32, fontWeight: "700",
               letterSpacing: -0.5 },
  heroDate: { color: colors.brandTertiary, fontSize: 14, marginTop: spacing.xs },

  body: { padding: spacing.lg, marginTop: -spacing.lg },

  contactCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md,
    ...shadow.card,
    borderLeftWidth: 4, borderLeftColor: colors.brandSecondary,
  },
  contactIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
  },
  contactName: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  contactPhone: { fontSize: 16, fontWeight: "700", color: colors.brand,
                  letterSpacing: 0.3, marginTop: 2 },
  contactHours: { fontSize: 11, color: colors.onSurfaceMuted, marginTop: 2 },

  subCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg, padding: spacing.lg, ...shadow.card,
    borderLeftWidth: 4, borderLeftColor: colors.brand,
  },
  subCardWarn: { borderLeftColor: colors.error },
  walletTopRow: { flexDirection: "row", alignItems: "flex-start",
                  justifyContent: "space-between" },
  walletLabel: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceMuted,
                 letterSpacing: 0.5, textTransform: "uppercase" },
  walletBalance: { fontSize: 30, fontWeight: "700", color: colors.onSurface,
                   letterSpacing: -1, marginTop: 4 },
  walletMeta: { alignItems: "flex-end" },
  walletMetaLabel: { fontSize: 14, fontWeight: "700", color: colors.brand },
  walletMetaSub: { fontSize: 11, color: colors.onSurfaceMuted, marginTop: 2 },
  lowBalanceRow: { flexDirection: "row", gap: 6, alignItems: "center",
                   marginTop: spacing.sm },
  lowBalanceText: { color: colors.error, fontSize: 12, fontWeight: "600" },
  walletCtaRow: { flexDirection: "row", alignItems: "center",
                  justifyContent: "space-between", marginTop: spacing.md,
                  paddingTop: spacing.sm,
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.divider },
  walletCtaText: { color: colors.brand, fontWeight: "700", fontSize: 13 },

  section: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceMuted,
             letterSpacing: 0.5, marginTop: spacing.xl, marginBottom: spacing.sm,
             textTransform: "uppercase" },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
          padding: spacing.lg, ...shadow.card },
  todayRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider,
             paddingTop: spacing.md, marginTop: spacing.xs },
  mealLabel: { fontSize: 10, fontWeight: "700", color: colors.onSurfaceMuted,
               letterSpacing: 0.5 },
  mealName: { fontSize: 15, fontWeight: "600", color: colors.onSurface,
              marginTop: 2 },
  skipped: { textDecorationLine: "line-through", color: colors.onSurfaceMuted },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4,
                borderRadius: radius.pill, minWidth: 60, alignItems: "center" },
  chip_skip: { backgroundColor: colors.surfaceTertiary },
  chip_single: { backgroundColor: colors.brand },
  chip_couple: { backgroundColor: colors.brand },
  chip_family: { backgroundColor: colors.brand },
  statusChipText: { color: colors.onBrand, fontSize: 11, fontWeight: "700",
                    letterSpacing: 0.3 },

  empty: { alignItems: "center", paddingVertical: spacing.xl, gap: spacing.sm },
  emptyText: { color: colors.onSurfaceMuted, fontSize: 14, textAlign: "center" },

  upsellWrap: {
    backgroundColor: "#FFF7E5", borderRadius: radius.lg,
    padding: spacing.lg, marginTop: spacing.lg,
    borderWidth: 1, borderColor: "#F5D58B", ...shadow.card,
  },
  upsellTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface,
                 letterSpacing: -0.3 },
  upsellSub: { fontSize: 12, color: colors.onSurfaceMuted,
               marginTop: 2, marginBottom: spacing.md },
  upsellRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm,
               backgroundColor: colors.surface, borderRadius: radius.md,
               padding: spacing.md, marginBottom: spacing.sm },
  upsellMeal: { fontSize: 10, fontWeight: "700", color: colors.brand,
                letterSpacing: 0.5 },
  upsellItem: { fontSize: 14, fontWeight: "600", color: colors.onSurface,
                marginTop: 2 },
  upsellPrice: { fontSize: 11, color: colors.onSurfaceMuted, marginTop: 4,
                 fontWeight: "600" },
  upsellCta: { flexDirection: "row", alignItems: "center", gap: 4,
               backgroundColor: colors.brand, paddingHorizontal: spacing.md,
               paddingVertical: 8, borderRadius: radius.pill },
  upsellCtaText: { color: colors.onBrand, fontWeight: "700", fontSize: 13 },

  cutoffBanner: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: "#FBEBD3", borderRadius: radius.md,
    padding: spacing.md, marginTop: spacing.lg,
  },
  cutoffText: { color: colors.onSurface, fontSize: 13, flex: 1 },

  tomorrowDate: { fontSize: 14, fontWeight: "700", color: colors.brand,
                  marginBottom: spacing.md },
  lockedRow: { flexDirection: "row", alignItems: "center", gap: 6,
               marginBottom: spacing.sm, marginTop: -spacing.xs },
  lockedText: { color: colors.error, fontSize: 12, fontWeight: "600" },

  mealCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
              padding: spacing.lg, marginBottom: spacing.md, ...shadow.card },
  mealCardHead: { flexDirection: "row", alignItems: "center" },

  variantRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  variantChip: {
    flex: 1, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 6, paddingVertical: 8,
    backgroundColor: colors.surface, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  variantChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  variantText: { fontSize: 12, fontWeight: "700", color: colors.onSurface },

  segmented: { flexDirection: "row", gap: 4, marginTop: spacing.md,
               backgroundColor: colors.surface, padding: 4, borderRadius: radius.sm,
               borderWidth: 1, borderColor: colors.border },
  segBtn: { flex: 1, paddingVertical: 8, alignItems: "center",
            borderRadius: radius.sm },
  segBtnActive: { backgroundColor: colors.brand },
  segBtnSkipActive: { backgroundColor: "#FBE9E9" },
  segLabel: { fontSize: 12, fontWeight: "700", color: colors.onSurface },
  segQty: { fontSize: 10, fontWeight: "600", color: colors.onSurfaceMuted,
            marginTop: 2 },

  // Pricing card on home
  priceCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
               padding: spacing.lg, ...shadow.card },
  priceHeaderRow: { flexDirection: "row", alignItems: "center",
                    paddingBottom: spacing.sm,
                    borderBottomWidth: 1, borderBottomColor: colors.divider },
  priceGridRow: { flexDirection: "row", alignItems: "center",
                  paddingVertical: 10 },
  priceDiv: { borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: colors.divider },
  priceMeal: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  priceColHead: { flex: 1, textAlign: "center", fontSize: 11,
                  fontWeight: "700", color: colors.onSurfaceMuted,
                  letterSpacing: 0.4, textTransform: "uppercase" },
  priceCell: { flex: 1, textAlign: "center", fontSize: 14,
               fontWeight: "700", color: colors.onSurface },
  priceFoot: { fontSize: 11, color: colors.onSurfaceMuted,
               marginTop: spacing.sm, textAlign: "center" },

  // Confirm modal
  modalRoot: { flex: 1, alignItems: "center", justifyContent: "center",
               padding: spacing.lg },
  backdrop: { ...StyleSheet.absoluteFillObject,
              backgroundColor: "rgba(0,0,0,0.5)" },
  confirmCard: {
    width: "100%", maxWidth: 360,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.xl, alignItems: "center", ...shadow.card,
  },
  confirmIcon: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.md,
  },
  confirmTitle: { fontSize: 20, fontWeight: "700", color: colors.onSurface,
                  letterSpacing: -0.3 },
  confirmBody: { fontSize: 14, color: colors.onSurface,
                 marginTop: spacing.xs, marginBottom: spacing.lg,
                 textAlign: "center", lineHeight: 20 },
  bold: { fontWeight: "700", color: colors.brand },
  confirmCta: { backgroundColor: colors.brand, paddingVertical: 14,
                paddingHorizontal: spacing.xl, borderRadius: radius.md,
                alignSelf: "stretch", alignItems: "center" },
  confirmCtaText: { color: colors.onBrand, fontWeight: "700", fontSize: 15 },
  confirmCancel: { paddingVertical: spacing.md, alignSelf: "stretch",
                   alignItems: "center" },
  confirmCancelText: { color: colors.onSurfaceMuted, fontWeight: "600",
                       fontSize: 14 },
});
