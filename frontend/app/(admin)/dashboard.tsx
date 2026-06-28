import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  Pressable, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { adminApi } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius, shadow } from "@/src/lib/theme";

type Stats = {
  total_customers: number; pending_onboarding: number;
  active_subscriptions: number;
  today_orders: number; delivered_today: number;
  pincodes: number; wallet_low: number;
  members_with_balance: number; total_positive_balance: number;
  households_today: number;
  today_breakfast: number; today_lunch: number; today_dinner: number;
  support_tickets: number; support_open: number;
  support_avg_response_seconds: number;
};

function formatINR(n: number): string {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${Math.round(n)}`;
}

function formatDuration(sec: number): string {
  if (!sec) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mins = m % 60;
  return mins ? `${h}h ${mins}m` : `${h}h`;
}

export default function AdminDashboard() {
  const { user, signOut } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [signoutOpen, setSignoutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await adminApi.stats();
      setStats(s as Stats);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function doSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      setSignoutOpen(false);
    } finally { setSigningOut(false); }
  }

  if (loading || !stats) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }}
          tintColor={colors.brand} />}
      >
        <View style={styles.topRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greet} testID="admin-greeting">
              Hello, {user?.name || "Admin"}
            </Text>
            <Text style={styles.title}>Today&apos;s pulse</Text>
          </View>
          <Pressable testID="admin-signout"
            onPress={() => setSignoutOpen(true)}
            style={styles.signoutBtn} hitSlop={8}>
            <Feather name="log-out" size={18} color={colors.error} />
          </Pressable>
        </View>

        {/* TOTALS section */}
        <Section title="Totals" subtitle="All-time customer base">
          <View style={styles.grid}>
            <BigStat testID="stat-total-members" icon="users"
              label="Members" value={String(stats.total_customers)}
              tint={colors.brand} />
            <BigStat testID="stat-members-with-balance" icon="check-circle"
              label="With balance" value={String(stats.members_with_balance)}
              tint={colors.success}
              sub={`${stats.total_customers - stats.members_with_balance} at ₹0`} />
            <BigStat testID="stat-total-positive-balance" icon="rupee"
              isCustomIcon
              label="Wallet pool"
              value={formatINR(stats.total_positive_balance)}
              tint={colors.brandSecondary}
              sub="across customers" />
            <BigStat testID="stat-low-balance" icon="alert-circle"
              label="Low balance" value={String(stats.wallet_low)}
              tint={colors.error}
              sub="below threshold" />
          </View>
        </Section>

        {/* TODAY section */}
        <Section title="Today" subtitle="Live snapshot">
          <View style={styles.grid}>
            <BigStat testID="stat-households-today" icon="home"
              label="Households"
              value={String(stats.households_today)}
              tint={colors.brand}
              sub={`${stats.delivered_today}/${stats.today_orders} delivered`} />
            <BigStat testID="stat-today-bf" icon="sunrise"
              label="Breakfast" value={String(stats.today_breakfast)}
              tint="#E6BB75" />
            <BigStat testID="stat-today-lunch" icon="sun"
              label="Lunch" value={String(stats.today_lunch)}
              tint={colors.warning} />
            <BigStat testID="stat-today-dinner" icon="moon"
              label="Dinner" value={String(stats.today_dinner)}
              tint={colors.info} />
          </View>
        </Section>

        {/* SUPPORT section */}
        <Section title="Support" subtitle="Today's chat performance">
          <View style={styles.supportRow}>
            <View style={styles.supportCard} testID="stat-support-tickets">
              <Feather name="message-square" size={18} color={colors.brand} />
              <Text style={styles.supportNum}>{stats.support_tickets}</Text>
              <Text style={styles.supportLabel}>Tickets today</Text>
            </View>
            <View style={[styles.supportCard,
              stats.support_open > 0 && styles.supportCardWarn]}
              testID="stat-support-open">
              <Feather name="clock" size={18}
                color={stats.support_open > 0 ? colors.error : colors.success} />
              <Text style={[styles.supportNum,
                stats.support_open > 0 && { color: colors.error }]}>
                {stats.support_open}
              </Text>
              <Text style={styles.supportLabel}>Awaiting reply</Text>
            </View>
            <View style={styles.supportCard} testID="stat-support-response">
              <Feather name="zap" size={18} color={colors.warning} />
              <Text style={styles.supportNum}>
                {formatDuration(stats.support_avg_response_seconds)}
              </Text>
              <Text style={styles.supportLabel}>Avg response</Text>
            </View>
          </View>
        </Section>

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>

      <Modal visible={signoutOpen} transparent animationType="fade"
        onRequestClose={() => setSignoutOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setSignoutOpen(false)}
            testID="signout-backdrop" />
          <View style={styles.confirmCard}>
            <View style={[styles.confirmIcon, { backgroundColor: "#FBE9E9" }]}>
              <Feather name="log-out" size={22} color={colors.error} />
            </View>
            <Text style={styles.confirmTitle}>Sign out?</Text>
            <Text style={styles.confirmBody}>
              You&apos;ll need to enter the OTP again to log back in as admin.
            </Text>
            <Pressable testID="signout-confirm" onPress={doSignOut}
              disabled={signingOut}
              style={[styles.confirmCta, signingOut && { opacity: 0.5 }]}>
              {signingOut
                ? <ActivityIndicator color={colors.onBrand} />
                : <Text style={styles.confirmCtaText}>Yes, sign me out</Text>}
            </Pressable>
            <Pressable testID="signout-cancel"
              onPress={() => setSignoutOpen(false)} style={styles.confirmCancel}>
              <Text style={styles.confirmCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Section({ title, subtitle, children }: {
  title: string; subtitle?: string; children: any;
}) {
  return (
    <View style={{ marginTop: spacing.xl }}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle && <Text style={styles.sectionSub}>{subtitle}</Text>}
      </View>
      {children}
    </View>
  );
}

function BigStat({ icon, isCustomIcon, label, value, tint, sub, testID }: any) {
  return (
    <View style={styles.bigCard} testID={testID}>
      <View style={[styles.bigIcon, { backgroundColor: tint }]}>
        {isCustomIcon
          ? <Text style={{ color: colors.onBrand, fontWeight: "700",
                           fontSize: 16 }}>₹</Text>
          : <Feather name={icon} size={18} color={colors.onBrand} />}
      </View>
      <Text style={styles.bigValue}>{value}</Text>
      <Text style={styles.bigLabel}>{label}</Text>
      {sub && <Text style={styles.bigSub}>{sub}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  greet: { color: colors.onSurfaceMuted, fontSize: 14, marginBottom: 4 },
  title: { fontSize: 28, fontWeight: "700", color: colors.onSurface,
           letterSpacing: -0.5 },
  signoutBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border, ...shadow.card,
  },
  sectionHead: { marginBottom: spacing.md },
  sectionTitle: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceMuted,
                  letterSpacing: 0.7, textTransform: "uppercase" },
  sectionSub: { fontSize: 13, color: colors.onSurfaceMuted, marginTop: 2 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  bigCard: {
    flexBasis: "47%", flexGrow: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg, padding: spacing.lg, ...shadow.card,
  },
  bigIcon: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.sm,
  },
  bigValue: { fontSize: 26, fontWeight: "700", color: colors.onSurface,
              letterSpacing: -0.5 },
  bigLabel: { fontSize: 12, color: colors.onSurfaceMuted, fontWeight: "700",
              marginTop: 2 },
  bigSub: { fontSize: 11, color: colors.onSurfaceMuted, marginTop: 4 },

  supportRow: { flexDirection: "row", gap: spacing.md },
  supportCard: {
    flex: 1, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg, padding: spacing.md, alignItems: "center",
    gap: 4, ...shadow.card,
  },
  supportCardWarn: { borderWidth: 1, borderColor: colors.error },
  supportNum: { fontSize: 22, fontWeight: "700", color: colors.onSurface,
                letterSpacing: -0.5, marginTop: 4 },
  supportLabel: { fontSize: 11, color: colors.onSurfaceMuted,
                  fontWeight: "600", textAlign: "center" },

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
  confirmBody: { fontSize: 14, color: colors.onSurfaceMuted,
                 marginTop: spacing.xs, marginBottom: spacing.lg,
                 textAlign: "center", lineHeight: 20 },
  confirmCta: { backgroundColor: colors.error, paddingVertical: 14,
                paddingHorizontal: spacing.xl, borderRadius: radius.md,
                alignSelf: "stretch", alignItems: "center" },
  confirmCtaText: { color: colors.onBrand, fontWeight: "700", fontSize: 15 },
  confirmCancel: { paddingVertical: spacing.md, alignSelf: "stretch",
                   alignItems: "center" },
  confirmCancelText: { color: colors.onSurfaceMuted, fontWeight: "600",
                       fontSize: 14 },
});
