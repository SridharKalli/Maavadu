import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { adminApi, User, Role } from "@/src/lib/api";
import { colors, spacing, radius, shadow } from "@/src/lib/theme";

const ROLES: { key: Role; label: string; icon: any; desc: string }[] = [
  { key: "admin", label: "Admin", icon: "shield",
    desc: "Full access — menu, pricing, wallets, pincodes" },
  { key: "agent", label: "Support Agent", icon: "headphones",
    desc: "Replies to customer chat, credits wallets" },
  { key: "delivery", label: "Delivery Partner", icon: "truck",
    desc: "Daily route, hotbox pickups" },
];
const ROLE_LABEL: Record<Role, string> = {
  customer: "Customer", admin: "Admin",
  delivery: "Delivery", agent: "Support",
};

export default function AdminTeam() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("agent");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setUsers(await adminApi.users()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openSheet() {
    Haptics.selectionAsync();
    setPhone(""); setName(""); setRole("agent"); setError(null);
    setOpen(true);
  }

  async function submit() {
    setError(null);
    let p = phone.trim().replace(/\s/g, "");
    if (!p.startsWith("+")) p = "+91" + p.replace(/^0/, "");
    if (!/^\+\d{10,15}$/.test(p)) {
      setError("Enter a valid phone number with country code (e.g. +919876543210)");
      return;
    }
    if (!name.trim()) {
      setError("Please enter a name");
      return;
    }
    setBusy(true);
    try {
      await adminApi.createUser({ phone: p, name: name.trim(), role });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setOpen(false);
      await load();
    } catch (e: any) {
      setError(e.message || "Failed to add team member");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const team = users.filter((u) => u.role !== "customer");
  const grouped: Record<"admin" | "agent" | "delivery", User[]> = {
    admin: team.filter((u) => u.role === "admin"),
    agent: team.filter((u) => u.role === "agent"),
    delivery: team.filter((u) => u.role === "delivery"),
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="team-back" onPress={() => router.back()}
          style={styles.iconBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Team</Text>
        <Pressable testID="team-add" onPress={openSheet}
          style={[styles.iconBtn, { backgroundColor: colors.brand }]}>
          <Feather name="plus" size={20} color={colors.onBrand} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }}>
        <Text style={styles.helper}>
          Add admins, support agents and delivery partners. They sign in by
          OTP using the phone number you set here.
        </Text>

        {(Object.keys(grouped) as ("admin" | "agent" | "delivery")[]).map((key) => {
          const list = grouped[key];
          const role = ROLES.find((r) => r.key === key);
          return (
            <View key={key} style={{ marginTop: spacing.lg }}>
              <Text style={styles.groupTitle}>
                {ROLE_LABEL[key]} · {list.length}
              </Text>
              {list.length === 0 ? (
                <View style={[styles.card, styles.empty]}>
                  <Feather name={role?.icon || "users"} size={22}
                    color={colors.onSurfaceMuted} />
                  <Text style={styles.emptyText}>
                    No {ROLE_LABEL[key].toLowerCase()} yet
                  </Text>
                </View>
              ) : (
                <View style={styles.card}>
                  {list.map((u, i) => (
                    <View key={u.id} style={[styles.row, i > 0 && styles.div]}
                      testID={`team-${u.id}`}>
                      <View style={[styles.avatar,
                        key === "admin" && { backgroundColor: colors.brand },
                        key === "agent" && { backgroundColor: colors.brandSecondary },
                        key === "delivery" && { backgroundColor: colors.success }]}>
                        <Feather name={role?.icon || "user"} size={16}
                          color={colors.onBrand} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowName}>{u.name || "(unnamed)"}</Text>
                        <Text style={styles.rowSub}>{u.phone}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Add modal */}
      <Modal visible={open} transparent animationType="slide"
        onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Add team member</Text>
            <Text style={styles.sheetSub}>They&apos;ll sign in using OTP.</Text>

            <Text style={styles.label}>Role</Text>
            <View style={{ gap: spacing.sm }}>
              {ROLES.map((r) => {
                const active = role === r.key;
                return (
                  <Pressable key={r.key}
                    testID={`role-${r.key}`}
                    onPress={() => { setRole(r.key); Haptics.selectionAsync(); }}
                    style={[styles.roleCard, active && styles.roleCardActive]}>
                    <View style={[styles.roleIcon,
                      active && { backgroundColor: colors.brand }]}>
                      <Feather name={r.icon} size={16}
                        color={active ? colors.onBrand : colors.brand} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.roleLabel}>{r.label}</Text>
                      <Text style={styles.roleDesc}>{r.desc}</Text>
                    </View>
                    {active && <Feather name="check-circle" size={16}
                      color={colors.brand} />}
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>Full name</Text>
            <TextInput
              testID="team-name"
              style={styles.input}
              value={name} onChangeText={setName}
              placeholder="e.g. Anand Kumar"
              placeholderTextColor={colors.onSurfaceMuted}
            />

            <Text style={styles.label}>Phone</Text>
            <TextInput
              testID="team-phone"
              style={styles.input}
              value={phone} onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="+91 98765 43210"
              placeholderTextColor={colors.onSurfaceMuted}
            />

            {error && (
              <View style={styles.errorBox} testID="team-error">
                <Feather name="alert-triangle" size={14} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Pressable testID="team-submit"
              onPress={submit} disabled={busy}
              style={[styles.cta, busy && styles.ctaDisabled]}>
              {busy ? <ActivityIndicator color={colors.onBrand} /> :
                <Text style={styles.ctaText}>Add to team</Text>}
            </Pressable>
            <Pressable onPress={() => setOpen(false)} style={styles.ghost}>
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
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  iconBtn: { width: 36, height: 36, borderRadius: 18,
             backgroundColor: colors.surfaceSecondary,
             alignItems: "center", justifyContent: "center",
             borderWidth: 1, borderColor: colors.border },
  title: { fontSize: 22, fontWeight: "700", color: colors.onSurface,
           letterSpacing: -0.3 },
  helper: { color: colors.onSurfaceMuted, fontSize: 13, lineHeight: 18 },

  groupTitle: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceMuted,
                letterSpacing: 0.5, marginBottom: spacing.sm,
                textTransform: "uppercase" },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
          padding: spacing.lg, ...shadow.card },
  empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  emptyText: { color: colors.onSurfaceMuted, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md,
         paddingVertical: spacing.sm },
  div: { borderTopWidth: 1, borderTopColor: colors.divider,
         paddingTop: spacing.md, marginTop: spacing.xs },
  avatar: { width: 36, height: 36, borderRadius: 18,
            alignItems: "center", justifyContent: "center" },
  rowName: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  rowSub: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },

  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject,
              backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.xl, paddingBottom: spacing.xxl,
    maxHeight: "90%",
  },
  handle: { alignSelf: "center", width: 44, height: 4, borderRadius: 2,
            backgroundColor: colors.borderStrong, marginBottom: spacing.lg },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: colors.onSurface },
  sheetSub: { color: colors.onSurfaceMuted, fontSize: 13, marginTop: 2,
              marginBottom: spacing.md },
  label: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceMuted,
           letterSpacing: 0.5, marginBottom: spacing.xs, marginTop: spacing.md,
           textTransform: "uppercase" },
  roleCard: { flexDirection: "row", gap: spacing.md, alignItems: "center",
              backgroundColor: colors.surface, borderRadius: radius.md,
              padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  roleCardActive: { borderColor: colors.brand, backgroundColor: "#FFF8EE" },
  roleIcon: { width: 32, height: 32, borderRadius: 16,
              alignItems: "center", justifyContent: "center",
              backgroundColor: colors.surfaceTertiary },
  roleLabel: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  roleDesc: { fontSize: 11, color: colors.onSurfaceMuted, marginTop: 1 },
  input: { backgroundColor: colors.surface, borderWidth: 1,
           borderColor: colors.border, borderRadius: radius.md,
           padding: spacing.md, fontSize: 15, color: colors.onSurface },
  errorBox: { flexDirection: "row", gap: 6, alignItems: "center",
              backgroundColor: "#FBE9E9", padding: spacing.md,
              borderRadius: radius.sm, marginTop: spacing.md },
  errorText: { color: colors.error, fontSize: 13, fontWeight: "600", flex: 1 },
  cta: { backgroundColor: colors.brand, paddingVertical: 14,
         borderRadius: radius.md, alignItems: "center", marginTop: spacing.lg },
  ctaDisabled: { backgroundColor: colors.borderStrong },
  ctaText: { color: colors.onBrand, fontWeight: "700", fontSize: 15 },
  ghost: { alignItems: "center", padding: spacing.md },
  ghostText: { color: colors.onSurfaceMuted, fontWeight: "600" },
});
