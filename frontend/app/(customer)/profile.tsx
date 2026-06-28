import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { auth, Role } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius, shadow } from "@/src/lib/theme";

const ROLE_LABEL: Record<Role, string> = {
  customer: "Customer", admin: "Owner / Admin", delivery: "Delivery Partner",
};

export default function Profile() {
  const { user, signOut, refresh } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [address, setAddress] = useState(user?.address || "");
  const [notes, setNotes] = useState(user?.notes || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(user?.name || ""); setAddress(user?.address || ""); setNotes(user?.notes || "");
  }, [user]);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await auth.updateMe({ name, address, notes });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
          <Text style={styles.title}>Profile</Text>
          <View style={styles.identity}>
            <View style={styles.avatar}>
              <Feather name="user" size={28} color={colors.onBrand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{user?.name || "Welcome"}</Text>
              <Text style={styles.phone}>{user?.phone}</Text>
              <View style={styles.rolePill}>
                <Text style={styles.roleText}>{ROLE_LABEL[user?.role || "customer"]}</Text>
              </View>
            </View>
          </View>

          <Text style={styles.label}>Full name</Text>
          <TextInput
            testID="profile-name"
            style={styles.input} value={name} onChangeText={setName}
            placeholder="Family name" placeholderTextColor={colors.onSurfaceMuted}
          />

          <Text style={styles.label}>Delivery address</Text>
          <TextInput
            testID="profile-address"
            style={[styles.input, styles.area]}
            value={address} onChangeText={setAddress}
            multiline numberOfLines={3}
            placeholder="House / flat, building, area"
            placeholderTextColor={colors.onSurfaceMuted}
          />

          <Text style={styles.label}>Delivery notes</Text>
          <TextInput
            testID="profile-notes"
            style={[styles.input, styles.area]}
            value={notes} onChangeText={setNotes}
            multiline numberOfLines={2}
            placeholder="Ring twice, leave at gate, etc."
            placeholderTextColor={colors.onSurfaceMuted}
          />

          <Pressable testID="profile-save" style={[styles.cta, saving && { opacity: 0.6 }]}
            onPress={save} disabled={saving}>
            <Text style={styles.ctaText}>{saved ? "Saved ✓" : saving ? "Saving..." : "Save changes"}</Text>
          </Pressable>

          <Pressable testID="logout-button" style={styles.logout} onPress={signOut}>
            <Feather name="log-out" size={18} color={colors.error} />
            <Text style={styles.logoutText}>Sign out</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  title: { fontSize: 28, fontWeight: "700", color: colors.onSurface,
           letterSpacing: -0.5, marginBottom: spacing.lg },
  identity: {
    flexDirection: "row", gap: spacing.md, alignItems: "center",
    backgroundColor: colors.surfaceSecondary, padding: spacing.lg,
    borderRadius: radius.lg, marginBottom: spacing.lg, ...shadow.card,
  },
  avatar: {
    width: 56, height: 56, borderRadius: radius.pill,
    backgroundColor: colors.brand, alignItems: "center", justifyContent: "center",
  },
  name: { fontSize: 18, fontWeight: "700", color: colors.onSurface },
  phone: { fontSize: 13, color: colors.onSurfaceMuted, marginTop: 2 },
  rolePill: {
    alignSelf: "flex-start", marginTop: spacing.xs,
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
    borderRadius: radius.pill,
  },
  roleText: { fontSize: 11, fontWeight: "700", color: colors.onBrandTertiary,
              letterSpacing: 0.4 },
  label: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceMuted,
           letterSpacing: 0.5, marginBottom: spacing.xs, marginTop: spacing.md,
           textTransform: "uppercase" },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, fontSize: 15, color: colors.onSurface,
  },
  area: { minHeight: 80, textAlignVertical: "top" },
  cta: {
    backgroundColor: colors.brand, paddingVertical: 14,
    borderRadius: radius.md, alignItems: "center", marginTop: spacing.xl,
  },
  ctaText: { color: colors.onBrand, fontWeight: "700", fontSize: 15 },
  logout: {
    flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center",
    marginTop: spacing.md, padding: spacing.md,
  },
  logoutText: { color: colors.error, fontWeight: "700", fontSize: 14 },
});
