import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  Pressable, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { adminApi, User } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius, shadow } from "@/src/lib/theme";

type Stats = {
  total_customers: number; active_subscriptions: number;
  today_orders: number; delivered_today: number;
  pincodes: number; wallet_low: number; pending_onboarding: number;
};

export default function AdminDashboard() {
  const { user, signOut } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, u] = await Promise.all([adminApi.stats(), adminApi.users()]);
      setStats(s as Stats); setUsers(u);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function confirmSignOut() {
    Alert.alert(
      "Sign out?",
      "You'll need to enter the OTP again to log back in.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: () => signOut() },
      ],
    );
  }

  const customers = users.filter((u) => u.role === "customer");
  const delivery = users.filter((u) => u.role === "delivery");

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        <View style={styles.topRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greet} testID="admin-greeting">
              Hello, {user?.name || "Admin"}
            </Text>
            <Text style={styles.title}>Today at a glance</Text>
          </View>
          <Pressable
            testID="admin-signout"
            onPress={confirmSignOut}
            style={styles.signoutBtn}
            hitSlop={8}
          >
            <Feather name="log-out" size={18} color={colors.error} />
          </Pressable>
        </View>

        <View style={styles.statsGrid}>
          <StatCard testID="stat-customers" icon="users" label="Families"
            value={stats?.total_customers} tint={colors.brand} />
          <StatCard testID="stat-subs" icon="repeat" label="Active Subs"
            value={stats?.active_subscriptions} tint={colors.success} />
          <StatCard testID="stat-orders" icon="package" label="Today's Orders"
            value={stats?.today_orders} tint={colors.warning} />
          <StatCard testID="stat-delivered" icon="check-circle" label="Delivered"
            value={stats?.delivered_today} tint={colors.info} />
          <StatCard testID="stat-low-balance" icon="alert-circle"
            label="Low Balance" value={stats?.wallet_low ?? 0}
            tint={colors.error} />
          <StatCard testID="stat-pincodes" icon="map-pin" label="Pincodes"
            value={stats?.pincodes} tint={colors.brandSecondary} />
        </View>

        <Text style={styles.sectionH}>Delivery team</Text>
        <View style={styles.card}>
          {delivery.length === 0 ? (
            <Text style={styles.empty}>No delivery partners yet</Text>
          ) : (
            delivery.map((d, i) => (
              <View key={d.id} style={[styles.row, i > 0 && styles.div]}>
                <View style={styles.avatar}>
                  <Feather name="truck" size={18} color={colors.onBrand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{d.name || "(unnamed)"}</Text>
                  <Text style={styles.rowSub}>{d.phone}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        <Text style={styles.sectionH}>Customers · {customers.length}</Text>
        <View style={styles.card}>
          {customers.map((c, i) => {
            const bal = Number(c.wallet_balance ?? 0);
            const threshold = Number(c.wallet_threshold ?? 500);
            const isLow = bal < threshold;
            return (
              <View key={c.id} style={[styles.row, i > 0 && styles.div]}>
                <View style={[styles.avatar, { backgroundColor: colors.brandSecondary }]}>
                  <Feather name="user" size={18} color={colors.onSurface} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} testID={`customer-${i}-name`}>
                    {c.name || "(unnamed)"}
                  </Text>
                  <Text style={styles.rowSub}>{c.phone}</Text>
                  {c.address ? <Text style={styles.rowAddr}>{c.address}</Text> : null}
                </View>
                <View style={[styles.balPill,
                  isLow && { backgroundColor: "#FBE9E9" }]}>
                  <Text style={[styles.balText,
                    isLow && { color: colors.error }]}>
                    ₹{Math.round(bal)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ icon, label, value, tint, testID }: any) {
  return (
    <View style={styles.statCard} testID={testID}>
      <View style={[styles.statIcon, { backgroundColor: tint }]}>
        <Feather name={icon} size={18} color={colors.onBrand} />
      </View>
      <Text style={styles.statValue}>{value ?? "—"}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topRow: { flexDirection: "row", alignItems: "flex-start",
            marginBottom: spacing.lg, gap: spacing.md },
  greet: { color: colors.onSurfaceMuted, fontSize: 14, marginBottom: 4 },
  title: { fontSize: 28, fontWeight: "700", color: colors.onSurface,
           letterSpacing: -0.5 },
  signoutBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border, ...shadow.card,
  },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  statCard: {
    flexBasis: "47%", flexGrow: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg, padding: spacing.lg, ...shadow.card,
  },
  statIcon: {
    width: 36, height: 36, borderRadius: radius.pill,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.md,
  },
  statValue: { fontSize: 28, fontWeight: "700", color: colors.onSurface,
               letterSpacing: -0.5 },
  statLabel: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2,
               fontWeight: "600" },

  sectionH: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceMuted,
              letterSpacing: 0.5, marginTop: spacing.xl, marginBottom: spacing.sm,
              textTransform: "uppercase" },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
          padding: spacing.lg, ...shadow.card },
  empty: { color: colors.onSurfaceMuted, fontSize: 14, textAlign: "center",
           paddingVertical: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md,
         paddingVertical: spacing.sm },
  div: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.md,
         marginTop: spacing.xs },
  avatar: { width: 36, height: 36, borderRadius: radius.pill,
            backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  rowName: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  rowSub: { fontSize: 12, color: colors.onSurfaceMuted },
  rowAddr: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },
  balPill: {
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.pill,
  },
  balText: { fontSize: 12, fontWeight: "700", color: colors.onSurface },
});
