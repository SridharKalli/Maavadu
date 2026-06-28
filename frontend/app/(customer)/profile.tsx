import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable,
  KeyboardAvoidingView, Platform, ActivityIndicator, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import {
  auth, subsApi, Role, MealKey, SizeKey, LunchVariant, Subscription,
} from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius, shadow } from "@/src/lib/theme";

const ROLE_LABEL: Record<Role, string> = {
  customer: "Customer", admin: "Owner / Admin",
  delivery: "Delivery Partner", agent: "Support Agent",
};

const MEALS: MealKey[] = ["breakfast", "lunch", "dinner"];
const MEAL_LBL: Record<MealKey, string> = {
  breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner",
};
const SIZES: { key: SizeKey; label: string; members: string }[] = [
  { key: "single", label: "Single", members: "1" },
  { key: "couple", label: "Couple", members: "2" },
  { key: "family", label: "Family", members: "4" },
];

export default function Profile() {
  const { user, signOut, refresh } = useAuth();
  const router = useRouter();
  const [name, setName] = useState(user?.name || "");
  const [address, setAddress] = useState(user?.address || "");
  const [notes, setNotes] = useState(user?.notes || "");
  const [saving, setSaving] = useState(false);
  const [savedFlag, setSavedFlag] = useState<"profile" | "prefs" | null>(null);

  const [sub, setSub] = useState<Subscription | null>(null);
  const [meals, setMeals] = useState<MealKey[]>([]);
  const [size, setSize] = useState<SizeKey>("single");
  const [variant, setVariant] = useState<LunchVariant>("with_rice");
  const [loadingSub, setLoadingSub] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [signoutOpen, setSignoutOpen] = useState(false);

  const loadSub = useCallback(async () => {
    try {
      const s = await subsApi.me();
      if (s) {
        setSub(s);
        setMeals(s.meals || []);
        setSize(s.default_size || "single");
        setVariant(s.default_lunch_variant || "with_rice");
      }
    } finally { setLoadingSub(false); }
  }, []);

  useEffect(() => {
    setName(user?.name || "");
    setAddress(user?.address || "");
    setNotes(user?.notes || "");
  }, [user]);

  useEffect(() => { loadSub(); }, [loadSub]);

  async function saveProfile() {
    setSaving(true);
    setSavedFlag(null);
    try {
      await auth.updateMe({ name, address, notes });
      await refresh();
      setSavedFlag("profile");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setSavedFlag(null), 2000);
    } finally { setSaving(false); }
  }

  function toggleMeal(m: MealKey) {
    Haptics.selectionAsync();
    setMeals((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);
  }

  async function savePrefs() {
    if (meals.length === 0) return;
    setSavingPrefs(true);
    setSavedFlag(null);
    try {
      const updated = await subsApi.update({
        meals, default_size: size, default_lunch_variant: variant,
      });
      setSub(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSavedFlag("prefs");
      setTimeout(() => setSavedFlag(null), 2400);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally { setSavingPrefs(false); }
  }

  async function doSignOut() {
    await signOut();
    setSignoutOpen(false);
  }

  const isCustomer = user?.role === "customer";

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Pressable testID="profile-back" onPress={() => router.back()}
            style={styles.backBtn} hitSlop={8}>
            <Feather name="arrow-left" size={20} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>Profile</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled">
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

          {/* DEFAULT PREFERENCES (customer only) */}
          {isCustomer && (
            <View style={styles.section}>
              <View style={styles.sectionHeadRow}>
                <Text style={styles.sectionTitle}>Daily defaults</Text>
                <Feather name="settings" size={14} color={colors.onSurfaceMuted} />
              </View>
              <Text style={styles.sectionHelper}>
                These power each day&apos;s order automatically. You can still
                tweak any single day from Home.
              </Text>

              {loadingSub ? (
                <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.md }} />
              ) : !sub ? (
                <Text style={styles.sectionHelper}>No subscription yet.</Text>
              ) : (
                <>
                  <Text style={styles.label}>Meals</Text>
                  <View style={styles.chipRow}>
                    {MEALS.map((m) => {
                      const active = meals.includes(m);
                      return (
                        <Pressable key={m}
                          testID={`prefs-meal-${m}`}
                          onPress={() => toggleMeal(m)}
                          style={[styles.chip, active && styles.chipActive]}>
                          <Feather
                            name={active ? "check-circle" : "circle"}
                            size={13}
                            color={active ? colors.onBrand : colors.onSurfaceMuted} />
                          <Text style={[styles.chipText,
                            active && { color: colors.onBrand }]}>
                            {MEAL_LBL[m]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={styles.label}>Family size</Text>
                  <View style={styles.sizeRow}>
                    {SIZES.map((s) => {
                      const active = size === s.key;
                      return (
                        <Pressable key={s.key}
                          testID={`prefs-size-${s.key}`}
                          onPress={() => { setSize(s.key); Haptics.selectionAsync(); }}
                          style={[styles.sizeBtn, active && styles.sizeBtnActive]}>
                          <Text style={[styles.sizeLabel,
                            active && { color: colors.onBrand }]}>{s.label}</Text>
                          <Text style={[styles.sizeMembers,
                            active && { color: colors.onBrand }]}>
                            {s.members} member{s.key !== "single" ? "s" : ""}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {meals.includes("lunch") && (
                    <>
                      <Text style={styles.label}>Lunch style</Text>
                      <View style={styles.variantRow}>
                        {(["with_rice", "without_rice"] as LunchVariant[]).map((v) => {
                          const active = variant === v;
                          return (
                            <Pressable key={v}
                              testID={`prefs-variant-${v}`}
                              onPress={() => { setVariant(v); Haptics.selectionAsync(); }}
                              style={[styles.variantBtn, active && styles.variantBtnActive]}>
                              <Feather
                                name={active ? "check-circle" : "circle"}
                                size={13}
                                color={active ? colors.onBrand : colors.onSurfaceMuted} />
                              <Text style={[styles.variantText,
                                active && { color: colors.onBrand }]}>
                                {v === "with_rice" ? "With rice" : "No rice"}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  )}

                  <Pressable testID="prefs-save"
                    onPress={savePrefs}
                    disabled={savingPrefs || meals.length === 0}
                    style={[styles.cta,
                      (savingPrefs || meals.length === 0) && styles.ctaDisabled]}>
                    {savingPrefs ? <ActivityIndicator color={colors.onBrand} /> :
                      <Text style={styles.ctaText}>
                        {savedFlag === "prefs" ? "Saved ✓" : "Save daily defaults"}
                      </Text>}
                  </Pressable>
                  {savedFlag === "prefs" && (
                    <Text testID="prefs-saved" style={styles.savedHint}>
                      Defaults updated. Upcoming orders are being reshaped.
                    </Text>
                  )}
                </>
              )}
            </View>
          )}

          {/* PROFILE FIELDS */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Contact &amp; address</Text>
            <Text style={styles.label}>Full name</Text>
            <TextInput testID="profile-name" style={styles.input}
              value={name} onChangeText={setName}
              placeholder="Family name" placeholderTextColor={colors.onSurfaceMuted} />

            <Text style={styles.label}>Delivery address</Text>
            <TextInput testID="profile-address" style={[styles.input, styles.area]}
              value={address} onChangeText={setAddress}
              multiline numberOfLines={3}
              placeholder="House / flat, building, area"
              placeholderTextColor={colors.onSurfaceMuted} />

            <Text style={styles.label}>Delivery notes</Text>
            <TextInput testID="profile-notes" style={[styles.input, styles.area]}
              value={notes} onChangeText={setNotes}
              multiline numberOfLines={2}
              placeholder="Ring twice, leave at gate, etc."
              placeholderTextColor={colors.onSurfaceMuted} />

            <Pressable testID="profile-save"
              style={[styles.cta, saving && { opacity: 0.6 }]}
              onPress={saveProfile} disabled={saving}>
              <Text style={styles.ctaText}>
                {savedFlag === "profile" ? "Saved ✓"
                  : saving ? "Saving…" : "Save changes"}
              </Text>
            </Pressable>
          </View>

          <Pressable testID="logout-button" style={styles.logout}
            onPress={() => setSignoutOpen(true)}>
            <Feather name="log-out" size={18} color={colors.error} />
            <Text style={styles.logoutText}>Sign out</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

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
            <Pressable testID="signout-confirm" onPress={doSignOut}
              style={[styles.confirmCta, { backgroundColor: colors.error }]}>
              <Text style={styles.confirmCtaText}>Yes, sign me out</Text>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
            borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "700", color: colors.onSurface,
           letterSpacing: -0.3 },

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

  section: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.lg, marginBottom: spacing.lg, ...shadow.card,
  },
  sectionHeadRow: { flexDirection: "row", alignItems: "center",
                    justifyContent: "space-between" },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface,
                  letterSpacing: -0.2 },
  sectionHelper: { fontSize: 12, color: colors.onSurfaceMuted,
                   marginTop: spacing.xs, lineHeight: 18 },

  label: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceMuted,
           letterSpacing: 0.5, marginBottom: spacing.xs, marginTop: spacing.md,
           textTransform: "uppercase" },
  input: {
    backgroundColor: colors.surface, borderWidth: 1,
    borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, fontSize: 15, color: colors.onSurface,
  },
  area: { minHeight: 80, textAlignVertical: "top" },

  chipRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    backgroundColor: colors.surface, borderWidth: 1,
    borderColor: colors.border, borderRadius: radius.pill,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 13, fontWeight: "700", color: colors.onSurface },

  sizeRow: { flexDirection: "row", gap: spacing.sm },
  sizeBtn: { flex: 1, alignItems: "center", paddingVertical: spacing.md,
             backgroundColor: colors.surface, borderWidth: 1,
             borderColor: colors.border, borderRadius: radius.md },
  sizeBtnActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  sizeLabel: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  sizeMembers: { fontSize: 11, color: colors.onSurfaceMuted, marginTop: 2,
                 fontWeight: "600" },

  variantRow: { flexDirection: "row", gap: spacing.sm },
  variantBtn: {
    flex: 1, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 6,
    paddingVertical: spacing.md, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
  },
  variantBtnActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  variantText: { fontSize: 13, fontWeight: "700", color: colors.onSurface },

  cta: { backgroundColor: colors.brand, paddingVertical: 14,
         borderRadius: radius.md, alignItems: "center", marginTop: spacing.lg },
  ctaDisabled: { backgroundColor: colors.borderStrong },
  ctaText: { color: colors.onBrand, fontWeight: "700", fontSize: 15 },
  savedHint: { fontSize: 12, color: colors.success, marginTop: spacing.sm,
               textAlign: "center", fontWeight: "600" },

  logout: {
    flexDirection: "row", gap: spacing.sm, alignItems: "center",
    justifyContent: "center", marginTop: spacing.md, padding: spacing.md,
  },
  logoutText: { color: colors.error, fontWeight: "700", fontSize: 14 },

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
  confirmCta: { paddingVertical: 14, paddingHorizontal: spacing.xl,
                borderRadius: radius.md, alignSelf: "stretch", alignItems: "center" },
  confirmCtaText: { color: colors.onBrand, fontWeight: "700", fontSize: 15 },
  confirmCancel: { paddingVertical: spacing.md, alignSelf: "stretch",
                   alignItems: "center" },
  confirmCancelText: { color: colors.onSurfaceMuted, fontWeight: "600",
                       fontSize: 14 },
});
