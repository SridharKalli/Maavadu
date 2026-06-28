import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { walletApi, WalletInfo } from "@/src/lib/api";
import { colors, spacing, radius, shadow } from "@/src/lib/theme";

export default function CustomerWallet() {
  const router = useRouter();
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requesting, setRequesting] = useState<number | null>(null);
  const [sent, setSent] = useState<number | null>(null);

  const load = useCallback(async () => {
    try { setWallet(await walletApi.me()); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function requestTopup(amount: number) {
    setRequesting(amount);
    setSent(null);
    try {
      await walletApi.requestTopup(amount);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSent(amount);
      setTimeout(() => router.push("/(customer)/support"), 800);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setRequesting(null);
    }
  }

  if (loading || !wallet) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }

  const low = wallet.low;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="wallet-back" onPress={() => router.back()}
          style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Wallet</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        {/* Balance hero */}
        <View style={[styles.heroCard, low && styles.heroCardWarn]}>
          <Text style={styles.heroLabel}>Available balance</Text>
          <Text testID="wallet-amount" style={styles.heroAmount}>
            ₹{wallet.balance.toFixed(0)}
          </Text>
          <View style={styles.heroMeta}>
            <View style={styles.metaCol}>
              <Text style={styles.metaNum}>{wallet.days_left}</Text>
              <Text style={styles.metaLabel}>days left</Text>
            </View>
            <View style={styles.metaDivider} />
            <View style={styles.metaCol}>
              <Text style={styles.metaNum}>₹{wallet.daily_burn.toFixed(0)}</Text>
              <Text style={styles.metaLabel}>per day</Text>
            </View>
          </View>
          {low && (
            <View style={styles.warnRow} testID="wallet-low-warn">
              <Feather name="alert-circle" size={14} color={colors.error} />
              <Text style={styles.warnText}>
                Below ₹{wallet.threshold.toFixed(0)} — top up soon.
              </Text>
            </View>
          )}
        </View>

        {/* Pricing */}
        <Text style={styles.section}>Per-meal pricing</Text>
        <View style={styles.priceCard}>
          {(["breakfast", "lunch", "dinner"] as const).map((m, i) => (
            <View key={m} style={[styles.priceRow, i > 0 && styles.priceDiv]}>
              <Text style={styles.priceMeal}>
                {m[0].toUpperCase()}{m.slice(1)}
              </Text>
              <Text style={styles.priceVal}>₹{wallet.pricing[m]} per portion</Text>
            </View>
          ))}
          <Text style={styles.priceFoot}>
            Couple = 2 portions · Family = 3 portions
          </Text>
        </View>

        {/* Top-up suggestions */}
        <Text style={styles.section}>Top up</Text>
        <Text style={styles.helper}>
          Tap an amount — our agent will confirm a quick payment over chat.
        </Text>
        <View style={styles.chipsRow}>
          {wallet.suggested_topups.map((a) => (
            <Pressable
              key={a}
              testID={`topup-${a}`}
              disabled={requesting !== null}
              onPress={() => requestTopup(a)}
              style={[styles.topupChip, sent === a && styles.topupChipSent]}
            >
              {requesting === a ? (
                <ActivityIndicator size="small" color={colors.onBrand} />
              ) : (
                <>
                  <Text style={styles.topupAmt}>₹{a}</Text>
                  <Text style={styles.topupDays}>
                    {wallet.daily_burn > 0
                      ? `~${Math.floor(a / wallet.daily_burn)} days`
                      : ""}
                  </Text>
                </>
              )}
            </Pressable>
          ))}
        </View>
        {sent !== null && (
          <Text style={styles.successText} testID="topup-requested">
            ✓ Top-up request sent to support. Opening chat…
          </Text>
        )}

        {/* History */}
        <Text style={styles.section}>Recent activity</Text>
        {wallet.recent.length === 0 ? (
          <View style={styles.emptyHist}>
            <Feather name="clock" size={20} color={colors.onSurfaceMuted} />
            <Text style={styles.emptyHistText}>
              No transactions yet. Your deliveries will show here.
            </Text>
          </View>
        ) : (
          <View style={styles.histCard}>
            {wallet.recent.map((t, i) => {
              const isCredit = t.type === "credit";
              return (
                <View key={t.id}
                  style={[styles.txnRow, i > 0 && styles.txnDiv]}
                  testID={`txn-${t.id}`}>
                  <View style={[styles.txnIcon,
                    { backgroundColor: isCredit ? "#E5EFE5" : "#FBE9E9" }]}>
                    <Feather
                      name={isCredit ? "arrow-down-left" : "arrow-up-right"}
                      size={14}
                      color={isCredit ? colors.success : colors.error}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txnReason} numberOfLines={2}>
                      {t.reason || (isCredit ? "Top-up" : "Delivery")}
                    </Text>
                    <Text style={styles.txnDate}>
                      {new Date(t.created_at).toLocaleString([],
                        { day: "numeric", month: "short", hour: "2-digit",
                          minute: "2-digit" })}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.txnAmt,
                      { color: isCredit ? colors.success : colors.error }]}>
                      {isCredit ? "+" : "−"}₹{t.amount.toFixed(0)}
                    </Text>
                    <Text style={styles.txnBal}>
                      Bal ₹{t.balance_after.toFixed(0)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
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

  heroCard: {
    backgroundColor: colors.surfaceInverse,
    borderRadius: radius.lg, padding: spacing.xl,
    alignItems: "center", ...shadow.card,
  },
  heroCardWarn: { backgroundColor: "#3A1F1A" },
  heroLabel: { color: colors.brandTertiary, fontSize: 12, fontWeight: "700",
               letterSpacing: 1, textTransform: "uppercase" },
  heroAmount: { color: colors.onSurfaceInverse, fontSize: 48, fontWeight: "700",
                letterSpacing: -1, marginTop: spacing.sm },
  heroMeta: { flexDirection: "row", marginTop: spacing.lg, gap: spacing.xl,
              alignItems: "center" },
  metaCol: { alignItems: "center" },
  metaNum: { color: colors.onSurfaceInverse, fontSize: 18, fontWeight: "700" },
  metaLabel: { color: colors.brandTertiary, fontSize: 11, fontWeight: "600",
               marginTop: 2 },
  metaDivider: { width: 1, height: 30, backgroundColor: "rgba(255,255,255,0.2)" },
  warnRow: { flexDirection: "row", alignItems: "center", gap: 6,
             marginTop: spacing.lg, backgroundColor: "rgba(255,255,255,0.1)",
             paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
             borderRadius: radius.md },
  warnText: { color: "#FFC7C7", fontSize: 12, fontWeight: "600" },

  section: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceMuted,
             letterSpacing: 0.5, marginTop: spacing.xl, marginBottom: spacing.sm,
             textTransform: "uppercase" },
  helper: { color: colors.onSurfaceMuted, fontSize: 13, marginBottom: spacing.md },

  priceCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
               padding: spacing.lg, ...shadow.card },
  priceRow: { flexDirection: "row", justifyContent: "space-between",
              paddingVertical: spacing.sm },
  priceDiv: { borderTopWidth: 1, borderTopColor: colors.divider },
  priceMeal: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  priceVal: { fontSize: 14, color: colors.onSurfaceMuted, fontWeight: "600" },
  priceFoot: { fontSize: 11, color: colors.onSurfaceMuted, marginTop: spacing.sm,
               fontStyle: "italic" },

  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  topupChip: {
    flexBasis: "47%", flexGrow: 1, backgroundColor: colors.brand,
    paddingVertical: spacing.md, borderRadius: radius.md,
    alignItems: "center", ...shadow.card,
  },
  topupChipSent: { backgroundColor: colors.success },
  topupAmt: { color: colors.onBrand, fontWeight: "700", fontSize: 20,
              letterSpacing: -0.3 },
  topupDays: { color: colors.brandTertiary, fontSize: 11, fontWeight: "600",
               marginTop: 2 },
  successText: { color: colors.success, fontWeight: "700", marginTop: spacing.md,
                 textAlign: "center" },

  emptyHist: { alignItems: "center", paddingVertical: spacing.xl, gap: spacing.sm,
               backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg },
  emptyHistText: { color: colors.onSurfaceMuted, fontSize: 13, textAlign: "center",
                   maxWidth: 240 },

  histCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
              padding: spacing.md, ...shadow.card },
  txnRow: { flexDirection: "row", alignItems: "center", gap: spacing.md,
            paddingVertical: spacing.sm },
  txnDiv: { borderTopWidth: 1, borderTopColor: colors.divider },
  txnIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center",
             justifyContent: "center" },
  txnReason: { fontSize: 13, color: colors.onSurface, fontWeight: "600" },
  txnDate: { fontSize: 11, color: colors.onSurfaceMuted, marginTop: 1 },
  txnAmt: { fontSize: 14, fontWeight: "700" },
  txnBal: { fontSize: 10, color: colors.onSurfaceMuted, marginTop: 1 },
});
