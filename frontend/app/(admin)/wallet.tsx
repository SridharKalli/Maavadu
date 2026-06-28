import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
  RefreshControl, TextInput, Modal, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { walletApi, User, WalletTxn } from "@/src/lib/api";
import { colors, spacing, radius, shadow } from "@/src/lib/theme";

const SUGGESTIONS = [1500, 2000, 3000, 5000];

export default function AdminWallet() {
  const [customers, setCustomers] = useState<User[]>([]);
  const [txns, setTxns] = useState<WalletTxn[]>([]);
  const [editing, setEditing] = useState<User | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("Top-up");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const [c, t] = await Promise.all([
        walletApi.adminCustomers(),
        walletApi.adminTxns(),
      ]);
      setCustomers(c);
      setTxns(t);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function credit() {
    if (!editing) return;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return;
    setBusy(true);
    try {
      await walletApi.adminCredit(editing.id, amt, reason || "Top-up");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditing(null);
      setAmount(""); setReason("Top-up");
      load();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally { setBusy(false); }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? customers.filter((c) =>
        (c.name || "").toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.pincode || "").includes(q))
    : customers;
  const lowCount = customers.filter(
    (c) => (c.wallet_balance ?? 0) < (c.wallet_threshold ?? 500)).length;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Wallet</Text>
        <Text style={styles.sub}>
          {customers.length} customers · {lowCount} low-balance
        </Text>
      </View>

      <View style={styles.searchWrap}>
        <Feather name="search" size={16} color={colors.onSurfaceMuted} />
        <TextInput
          testID="wallet-search"
          style={styles.searchInput}
          value={search} onChangeText={setSearch}
          placeholder="Search by name, phone, pincode"
          placeholderTextColor={colors.onSurfaceMuted}
        />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        {filtered.map((c) => {
          const bal = c.wallet_balance ?? 0;
          const low = bal < (c.wallet_threshold ?? 500);
          return (
            <Pressable key={c.id} testID={`wallet-customer-${c.id}`}
              style={[styles.row, low && styles.rowLow]}
              onPress={() => { setEditing(c); setAmount(""); setReason("Top-up"); }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{c.name || "(unnamed)"}</Text>
                <Text style={styles.rowMeta}>{c.phone} · {c.pincode || "—"}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.rowBal, low && { color: colors.error }]}>
                  ₹{bal.toFixed(0)}
                </Text>
                {low && (
                  <View style={styles.lowPill}>
                    <Text style={styles.lowPillText}>LOW</Text>
                  </View>
                )}
              </View>
              <Feather name="chevron-right" size={18}
                color={colors.onSurfaceMuted} style={{ marginLeft: 8 }} />
            </Pressable>
          );
        })}

        <Text style={styles.sectionH}>Recent transactions</Text>
        {txns.length === 0 ? (
          <Text style={styles.empty}>No transactions yet.</Text>
        ) : (
          <View style={styles.txnCard}>
            {txns.slice(0, 20).map((t, i) => {
              const isCredit = t.type === "credit";
              const cust = customers.find((u) => u.id === t.user_id);
              return (
                <View key={t.id} style={[styles.txnRow, i > 0 && styles.txnDiv]}>
                  <View style={[styles.txnIcon,
                    { backgroundColor: isCredit ? "#E5EFE5" : "#FBE9E9" }]}>
                    <Feather
                      name={isCredit ? "arrow-down-left" : "arrow-up-right"}
                      size={12}
                      color={isCredit ? colors.success : colors.error}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txnCust}>
                      {cust?.name || "Customer"}
                    </Text>
                    <Text style={styles.txnReason} numberOfLines={1}>
                      {t.reason}
                    </Text>
                  </View>
                  <Text style={[styles.txnAmt,
                    { color: isCredit ? colors.success : colors.error }]}>
                    {isCredit ? "+" : "−"}₹{t.amount.toFixed(0)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Credit modal */}
      <Modal visible={!!editing} transparent animationType="slide"
             onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={styles.backdrop} onPress={() => setEditing(null)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>
              Top up — {editing?.name || editing?.phone}
            </Text>
            <Text style={styles.sheetSub}>
              Current balance: ₹{(editing?.wallet_balance ?? 0).toFixed(0)}
            </Text>

            <View style={styles.suggestRow}>
              {SUGGESTIONS.map((a) => (
                <Pressable
                  key={a}
                  testID={`admin-suggest-${a}`}
                  style={[styles.suggest, amount === String(a) && styles.suggestActive]}
                  onPress={() => setAmount(String(a))}>
                  <Text style={[styles.suggestText,
                    amount === String(a) && { color: colors.onBrand }]}>
                    ₹{a}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Amount</Text>
            <TextInput
              testID="admin-amount"
              style={styles.input}
              value={amount} onChangeText={(t) => setAmount(t.replace(/[^\d.]/g, ""))}
              placeholder="e.g. 2000" keyboardType="decimal-pad"
              placeholderTextColor={colors.onSurfaceMuted}
            />
            <Text style={styles.label}>Note</Text>
            <TextInput
              testID="admin-reason"
              style={styles.input}
              value={reason} onChangeText={setReason}
              placeholder="Top-up / Refund / Goodwill"
              placeholderTextColor={colors.onSurfaceMuted}
            />

            <Pressable testID="admin-credit-confirm"
              style={[styles.cta, (busy || !amount) && styles.ctaDisabled]}
              disabled={busy || !amount}
              onPress={credit}>
              {busy ? <ActivityIndicator color={colors.onBrand} /> :
                <Text style={styles.ctaText}>Credit wallet</Text>}
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
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 4 },
  title: { fontSize: 24, fontWeight: "700", color: colors.onSurface,
           letterSpacing: -0.5 },
  sub: { color: colors.onSurfaceMuted, fontSize: 13, marginTop: 2 },

  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    marginHorizontal: spacing.lg, marginTop: spacing.md, marginBottom: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.onSurface, padding: 0 },

  row: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm, ...shadow.card,
  },
  rowLow: { borderLeftWidth: 4, borderLeftColor: colors.error },
  rowName: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  rowMeta: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },
  rowBal: { fontSize: 18, fontWeight: "700", color: colors.onSurface,
            letterSpacing: -0.3 },
  lowPill: { backgroundColor: "#FBE9E9", paddingHorizontal: 6, paddingVertical: 2,
             borderRadius: radius.pill, marginTop: 4 },
  lowPillText: { color: colors.error, fontSize: 9, fontWeight: "700",
                 letterSpacing: 1 },

  sectionH: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceMuted,
              letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm,
              textTransform: "uppercase" },
  empty: { color: colors.onSurfaceMuted, fontStyle: "italic" },
  txnCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
             padding: spacing.md, ...shadow.card },
  txnRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm,
            paddingVertical: spacing.sm },
  txnDiv: { borderTopWidth: 1, borderTopColor: colors.divider },
  txnIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center",
             justifyContent: "center" },
  txnCust: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  txnReason: { fontSize: 11, color: colors.onSurfaceMuted, marginTop: 1 },
  txnAmt: { fontSize: 14, fontWeight: "700" },

  // Modal
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.xl, paddingBottom: spacing.xxl,
  },
  handle: { alignSelf: "center", width: 44, height: 4, borderRadius: 2,
            backgroundColor: colors.borderStrong, marginBottom: spacing.lg },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: colors.onSurface },
  sheetSub: { color: colors.onSurfaceMuted, fontSize: 13, marginTop: 2,
              marginBottom: spacing.md },
  suggestRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap",
                marginBottom: spacing.md },
  suggest: { paddingHorizontal: spacing.md, paddingVertical: 8,
             borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
             backgroundColor: colors.surface },
  suggestActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  suggestText: { fontWeight: "700", fontSize: 13, color: colors.onSurface },
  label: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceMuted,
           letterSpacing: 0.5, marginBottom: spacing.xs, marginTop: spacing.sm,
           textTransform: "uppercase" },
  input: {
    backgroundColor: colors.surface, borderWidth: 1,
    borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, fontSize: 15, color: colors.onSurface,
  },
  cta: { backgroundColor: colors.brand, paddingVertical: 14,
         borderRadius: radius.md, alignItems: "center", marginTop: spacing.lg },
  ctaDisabled: { backgroundColor: colors.borderStrong },
  ctaText: { color: colors.onBrand, fontWeight: "700", fontSize: 15 },
  ghost: { alignItems: "center", padding: spacing.md },
  ghostText: { color: colors.onSurfaceMuted, fontWeight: "600" },
});
