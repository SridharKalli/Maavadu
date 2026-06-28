import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { walletApi, WalletInfo, WalletTxn } from "@/src/lib/api";
import { colors, spacing, radius, shadow } from "@/src/lib/theme";

function dateLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleString("en-IN", { weekday: "long",
                                      day: "numeric", month: "short" });
}

function dateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

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
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setRequesting(null);
    }
  }

  if (loading || !wallet) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }

  const low = wallet.low;

  // Group recent txns by calendar date (newest first).
  const sorted = [...wallet.recent].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const groups: { key: string; label: string; items: WalletTxn[] }[] = [];
  let current: { key: string; label: string; items: WalletTxn[] } | null = null;
  for (const t of sorted) {
    const k = dateKey(t.created_at);
    if (!current || current.key !== k) {
      current = { key: k, label: dateLabel(t.created_at), items: [] };
      groups.push(current);
    }
    current.items.push(t);
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Wallet</Text>
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

        {/* History grouped by date */}
        <Text style={styles.section}>Activity</Text>
        {groups.length === 0 ? (
          <View style={styles.emptyHist}>
            <Feather name="clock" size={20} color={colors.onSurfaceMuted} />
            <Text style={styles.emptyHistText}>
              No transactions yet. Your deliveries will show here.
            </Text>
          </View>
        ) : (
          groups.map((g) => (
            <View key={g.key} testID={`txn-group-${g.key}`}>
              <Text style={styles.dateHeader}>{g.label}</Text>
              <View style={styles.histCard}>
                {g.items.map((t, i) => {
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
                          {new Date(t.created_at).toLocaleTimeString([],
                            { hour: "2-digit", minute: "2-digit" })}
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
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  title: { fontSize: 26, fontWeight: "700", color: colors.onSurface,
           letterSpacing: -0.5 },

  heroCard: { backgroundColor: colors.brand, borderRadius: radius.lg,
              padding: spacing.xl, alignItems: "center", ...shadow.card },
  heroCardWarn: { backgroundColor: colors.error },
  heroLabel: { color: colors.onBrand, fontSize: 12, fontWeight: "700",
               letterSpacing: 0.5, textTransform: "uppercase", opacity: 0.85 },
  heroAmount: { color: colors.onBrand, fontSize: 44, fontWeight: "700",
                letterSpacing: -1, marginTop: 4 },
  heroMeta: { flexDirection: "row", alignItems: "center", marginTop: spacing.lg,
              gap: spacing.xl },
  metaCol: { alignItems: "center" },
  metaNum: { color: colors.onBrand, fontSize: 18, fontWeight: "700" },
  metaLabel: { color: colors.onBrand, fontSize: 11, opacity: 0.85, marginTop: 2 },
  metaDivider: { width: 1, height: 32, backgroundColor: "rgba(255,255,255,0.3)" },
  warnRow: { flexDirection: "row", alignItems: "center", gap: 6,
             marginTop: spacing.md, backgroundColor: colors.surface,
             paddingHorizontal: spacing.sm, paddingVertical: 6,
             borderRadius: radius.pill },
  warnText: { color: colors.error, fontSize: 12, fontWeight: "700" },

  section: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceMuted,
             letterSpacing: 0.5, marginTop: spacing.xl, marginBottom: spacing.xs,
             textTransform: "uppercase" },
  helper: { color: colors.onSurfaceMuted, fontSize: 12,
            marginBottom: spacing.md },

  chipsRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  topupChip: {
    flexBasis: "30%", flexGrow: 1,
    backgroundColor: colors.brand, borderRadius: radius.md,
    paddingVertical: spacing.md, alignItems: "center", ...shadow.card,
  },
  topupChipSent: { backgroundColor: colors.success },
  topupAmt: { color: colors.onBrand, fontSize: 18, fontWeight: "700" },
  topupDays: { color: colors.onBrand, fontSize: 10, opacity: 0.85, marginTop: 2 },
  successText: { color: colors.success, fontWeight: "700",
                 marginTop: spacing.md, textAlign: "center" },

  dateHeader: { fontSize: 13, fontWeight: "700", color: colors.brand,
                marginTop: spacing.md, marginBottom: spacing.xs,
                paddingHorizontal: 2 },
  histCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
              padding: spacing.md, ...shadow.card },
  txnRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm,
            paddingVertical: spacing.sm },
  txnDiv: { borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.divider, paddingTop: spacing.md },
  txnIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center",
             justifyContent: "center" },
  txnReason: { fontSize: 13, fontWeight: "600", color: colors.onSurface },
  txnDate: { fontSize: 11, color: colors.onSurfaceMuted, marginTop: 2 },
  txnAmt: { fontSize: 14, fontWeight: "700" },
  txnBal: { fontSize: 10, color: colors.onSurfaceMuted, marginTop: 1 },

  emptyHist: { flexDirection: "row", alignItems: "center",
               gap: spacing.sm, backgroundColor: colors.surfaceSecondary,
               borderRadius: radius.md, padding: spacing.lg },
  emptyHistText: { color: colors.onSurfaceMuted, fontSize: 13, flex: 1 },
});
