import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import {
  menuApi, onboarding, MealKey, PlanType, WeeklyMenu, Pincode,
} from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius, shadow, DAY_NAMES_FULL } from "@/src/lib/theme";

type Step = "menu" | "name" | "pincode" | "address" | "plan" | "done";

const MEALS: MealKey[] = ["breakfast", "lunch", "dinner"];
const MEAL_LABEL: Record<MealKey, string> = {
  breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner",
};
const PLANS: { key: PlanType; title: string; sub: string; days: number }[] = [
  { key: "day", title: "Try a Day", sub: "Sample for 1 day", days: 1 },
  { key: "week", title: "Weekly", sub: "6 days · 1 hot box loop", days: 7 },
  { key: "month", title: "Monthly", sub: "30 days · best value", days: 30 },
];

export default function Onboarding() {
  const { refresh } = useAuth();
  const [step, setStep] = useState<Step>("menu");

  const [week, setWeek] = useState<WeeklyMenu[]>([]);
  const [name, setName] = useState("");
  const [pincode, setPincode] = useState("");
  const [pincodeStatus, setPincodeStatus] = useState<{ ok: boolean; area: string } | null>(null);
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [meals, setMeals] = useState<MealKey[]>(["lunch", "dinner"]);
  const [plan, setPlan] = useState<PlanType>("month");
  const [members, setMembers] = useState<number>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    menuApi.weekPublic().then(setWeek).catch(() => setWeek([]));
  }, []);

  const stepIdx = ["menu", "name", "pincode", "address", "plan", "done"].indexOf(step);

  function toggleMeal(m: MealKey) {
    Haptics.selectionAsync();
    setMeals((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);
  }

  async function checkPincode() {
    setError(null);
    if (!/^\d{6}$/.test(pincode)) {
      setError("Pincode must be 6 digits");
      return;
    }
    setBusy(true);
    try {
      const r = await onboarding.checkPincode(pincode);
      if (r.serviceable && r.pincode) {
        setPincodeStatus({ ok: true, area: r.pincode.area });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setStep("address");
      } else {
        setPincodeStatus({ ok: false, area: "" });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setError(null);
    if (meals.length === 0) {
      setError("Pick at least one meal");
      return;
    }
    setBusy(true);
    try {
      await onboarding.complete({
        name, address, pincode, notes,
        plan_type: plan, meals, default_quantity: members,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep("done");
      setTimeout(() => refresh(), 800);
    } catch (e: any) {
      setError(e.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  }

  function back() {
    Haptics.selectionAsync();
    if (step === "name") setStep("menu");
    else if (step === "pincode") setStep("name");
    else if (step === "address") setStep("pincode");
    else if (step === "plan") setStep("address");
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Progress bar */}
        <View style={styles.topBar}>
          {step !== "menu" && step !== "done" ? (
            <Pressable testID="onboarding-back" onPress={back} style={styles.backBtn}>
              <Feather name="arrow-left" size={20} color={colors.onSurface} />
            </Pressable>
          ) : <View style={{ width: 36 }} />}
          <View style={styles.progress}>
            <View style={[styles.progressFill,
              { width: `${(Math.max(0, stepIdx) / 5) * 100}%` }]} />
          </View>
          <Text style={styles.stepNum}>{stepIdx + 1}/6</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">
          {step === "menu" && (
            <>
              <Text style={styles.h1}>This week's menu</Text>
              <Text style={styles.muted}>
                Home-cooked, Chennai-style. Browse what's cooking, then sign up.
              </Text>
              {week.map((d) => (
                <View key={d.id} style={styles.menuCard}>
                  <Text style={styles.menuDay}>{DAY_NAMES_FULL[d.day_of_week]}</Text>
                  {d.is_holiday ? (
                    <Text style={styles.holiday}>Kitchen closed — Sunday holiday</Text>
                  ) : (
                    MEALS.map((m) => {
                      const item = d[m];
                      return (
                        <View key={m} style={styles.mealLine}>
                          <Text style={styles.mealKey}>{m[0].toUpperCase()}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.mealName}>{item?.name || "—"}</Text>
                            {item?.description ? (
                              <Text style={styles.mealDesc}>{item.description}</Text>
                            ) : null}
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              ))}
              <Pressable testID="onboarding-start" style={styles.cta}
                onPress={() => setStep("name")}>
                <Text style={styles.ctaText}>Looks good — sign me up</Text>
              </Pressable>
            </>
          )}

          {step === "name" && (
            <>
              <Text style={styles.h1}>What's your family name?</Text>
              <Text style={styles.muted}>So we know who to greet at the door.</Text>
              <TextInput
                testID="onboarding-name"
                style={styles.input} value={name} onChangeText={setName}
                placeholder="Sharma Family" placeholderTextColor={colors.onSurfaceMuted}
                autoFocus
              />
              <Pressable testID="onboarding-next-name"
                style={[styles.cta, !name.trim() && styles.ctaDisabled]}
                onPress={() => name.trim() && setStep("pincode")}
                disabled={!name.trim()}>
                <Text style={styles.ctaText}>Continue</Text>
              </Pressable>
            </>
          )}

          {step === "pincode" && (
            <>
              <Text style={styles.h1}>Where in Chennai?</Text>
              <Text style={styles.muted}>
                Enter your pincode — we'll check if we deliver there.
              </Text>
              <TextInput
                testID="onboarding-pincode"
                style={[styles.input, { letterSpacing: 8, textAlign: "center", fontSize: 22 }]}
                value={pincode}
                onChangeText={(t) => { setPincode(t.replace(/\D/g, "").slice(0, 6));
                                       setPincodeStatus(null); setError(null); }}
                placeholder="600020" keyboardType="number-pad"
                maxLength={6} placeholderTextColor={colors.onSurfaceMuted} autoFocus
              />
              {pincodeStatus && !pincodeStatus.ok && (
                <View style={styles.errorBox} testID="pincode-not-serviceable">
                  <Feather name="alert-triangle" size={16} color={colors.error} />
                  <Text style={styles.errorText}>
                    Sorry, we don't deliver to {pincode} yet. We're expanding daily —
                    leave your number and we'll let you know!
                  </Text>
                </View>
              )}
              {error && <Text style={styles.error}>{error}</Text>}
              <Pressable testID="onboarding-check-pincode"
                style={[styles.cta, (busy || pincode.length !== 6) && styles.ctaDisabled]}
                onPress={checkPincode}
                disabled={busy || pincode.length !== 6}>
                {busy ? <ActivityIndicator color={colors.onBrand} /> :
                  <Text style={styles.ctaText}>Check serviceability</Text>}
              </Pressable>
            </>
          )}

          {step === "address" && (
            <>
              <Text style={styles.h1}>Delivery address</Text>
              <View style={styles.pinPill}>
                <Feather name="map-pin" size={14} color={colors.success} />
                <Text style={styles.pinPillText}>
                  {pincode} · {pincodeStatus?.area || "serviceable"}
                </Text>
              </View>
              <TextInput
                testID="onboarding-address"
                style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
                value={address} onChangeText={setAddress}
                placeholder="Flat / house, building, area, landmark"
                placeholderTextColor={colors.onSurfaceMuted}
                multiline numberOfLines={3} autoFocus
              />
              <Text style={styles.label}>Delivery notes (optional)</Text>
              <TextInput
                testID="onboarding-notes"
                style={styles.input} value={notes} onChangeText={setNotes}
                placeholder="Ring twice / leave at security"
                placeholderTextColor={colors.onSurfaceMuted}
              />
              <Pressable testID="onboarding-next-address"
                style={[styles.cta, !address.trim() && styles.ctaDisabled]}
                onPress={() => address.trim() && setStep("plan")}
                disabled={!address.trim()}>
                <Text style={styles.ctaText}>Continue</Text>
              </Pressable>
            </>
          )}

          {step === "plan" && (
            <>
              <Text style={styles.h1}>Pick your meals & plan</Text>
              <Text style={styles.muted}>
                Any combination — breakfast, lunch, dinner, or all three.
              </Text>

              <Text style={styles.label}>Which meals?</Text>
              <View style={styles.mealChips}>
                {MEALS.map((m) => {
                  const active = meals.includes(m);
                  return (
                    <Pressable
                      key={m}
                      testID={`meal-chip-${m}`}
                      onPress={() => toggleMeal(m)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Feather
                        name={active ? "check-circle" : "circle"}
                        size={14}
                        color={active ? colors.onBrand : colors.onSurfaceMuted}
                      />
                      <Text style={[styles.chipText, active && { color: colors.onBrand }]}>
                        {MEAL_LABEL[m]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Members per meal</Text>
              <View style={styles.memberRow}>
                {[1, 2, 3].map((n) => (
                  <Pressable
                    key={n}
                    testID={`members-${n}`}
                    onPress={() => { setMembers(n); Haptics.selectionAsync(); }}
                    style={[styles.memberBtn, members === n && styles.memberBtnActive]}
                  >
                    <Text style={[styles.memberNum, members === n && { color: colors.onBrand }]}>
                      {n}
                    </Text>
                    <Text style={[styles.memberLabel,
                      members === n && { color: colors.onBrand }]}>
                      member{n > 1 ? "s" : ""}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Plan duration</Text>
              {PLANS.map((p) => (
                <Pressable
                  key={p.key}
                  testID={`plan-${p.key}`}
                  onPress={() => { setPlan(p.key); Haptics.selectionAsync(); }}
                  style={[styles.planCard, plan === p.key && styles.planCardActive]}
                >
                  <View style={[styles.planRadio,
                    plan === p.key && { backgroundColor: colors.brand,
                                         borderColor: colors.brand }]}>
                    {plan === p.key && (
                      <Feather name="check" size={12} color={colors.onBrand} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planTitle}>{p.title}</Text>
                    <Text style={styles.planSub}>{p.sub}</Text>
                  </View>
                  {p.key === "month" && (
                    <View style={styles.bestBadge}>
                      <Text style={styles.bestBadgeText}>Best</Text>
                    </View>
                  )}
                </Pressable>
              ))}

              {error && <Text style={styles.error}>{error}</Text>}

              <Pressable testID="onboarding-submit"
                style={[styles.cta, (busy || meals.length === 0) && styles.ctaDisabled]}
                onPress={submit}
                disabled={busy || meals.length === 0}>
                {busy ? <ActivityIndicator color={colors.onBrand} /> :
                  <Text style={styles.ctaText}>Confirm & start cooking</Text>}
              </Pressable>
            </>
          )}

          {step === "done" && (
            <View style={styles.done}>
              <View style={styles.doneIcon}>
                <Feather name="check" size={36} color={colors.onBrand} />
              </View>
              <Text style={styles.h1}>You're all set!</Text>
              <Text style={styles.muted}>
                Your first delivery is being scheduled. Welcome to the family 🙏
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  topBar: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  progress: {
    flex: 1, height: 6, borderRadius: 3,
    backgroundColor: colors.surfaceTertiary, overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: colors.brand },
  stepNum: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceMuted },

  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.sm },
  h1: { fontSize: 26, fontWeight: "700", color: colors.onSurface,
        letterSpacing: -0.5 },
  muted: { color: colors.onSurfaceMuted, fontSize: 14, marginTop: spacing.xs,
           marginBottom: spacing.lg, lineHeight: 20 },

  input: {
    backgroundColor: colors.surfaceSecondary, borderWidth: 1,
    borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, fontSize: 16, color: colors.onSurface,
  },
  label: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceMuted,
           letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm,
           textTransform: "uppercase" },

  cta: { backgroundColor: colors.brand, paddingVertical: 16,
         borderRadius: radius.md, alignItems: "center", marginTop: spacing.xl },
  ctaDisabled: { backgroundColor: colors.borderStrong },
  ctaText: { color: colors.onBrand, fontWeight: "700", fontSize: 16,
             letterSpacing: 0.3 },

  error: { color: colors.error, fontSize: 14, marginTop: spacing.sm,
           backgroundColor: "#FBE9E9", padding: spacing.md, borderRadius: radius.sm },
  errorBox: {
    flexDirection: "row", gap: spacing.sm, alignItems: "flex-start",
    backgroundColor: "#FBE9E9", padding: spacing.md,
    borderRadius: radius.md, marginTop: spacing.md,
    borderLeftWidth: 4, borderLeftColor: colors.error,
  },
  errorText: { color: colors.onSurface, fontSize: 13, flex: 1, lineHeight: 18 },

  menuCard: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.lg, marginBottom: spacing.md, ...shadow.card,
  },
  menuDay: { fontSize: 14, fontWeight: "700", color: colors.brand,
             marginBottom: spacing.sm, letterSpacing: 0.3 },
  holiday: { color: colors.onSurfaceMuted, fontStyle: "italic" },
  mealLine: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm,
              paddingTop: spacing.sm,
              borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  mealKey: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.surfaceTertiary, color: colors.onBrandTertiary,
    fontWeight: "700", fontSize: 11, textAlign: "center", lineHeight: 24,
  },
  mealName: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  mealDesc: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },

  pinPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start", backgroundColor: "#E5EFE5",
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.pill, marginBottom: spacing.md,
  },
  pinPillText: { color: colors.success, fontWeight: "700", fontSize: 12 },

  mealChips: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontWeight: "700", color: colors.onSurface, fontSize: 14 },

  memberRow: { flexDirection: "row", gap: spacing.sm },
  memberBtn: {
    flex: 1, paddingVertical: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    alignItems: "center",
  },
  memberBtnActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  memberNum: { fontSize: 26, fontWeight: "700", color: colors.onSurface,
               letterSpacing: -0.5 },
  memberLabel: { fontSize: 11, fontWeight: "600", color: colors.onSurfaceMuted },

  planCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  planCardActive: { borderColor: colors.brand, backgroundColor: "#FFFCF7" },
  planRadio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: colors.borderStrong,
    alignItems: "center", justifyContent: "center",
  },
  planTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  planSub: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },
  bestBadge: {
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill,
  },
  bestBadgeText: { fontSize: 10, fontWeight: "700",
                   color: colors.onBrandTertiary, letterSpacing: 0.5 },

  done: { alignItems: "center", paddingTop: spacing.xxxl, gap: spacing.md },
  doneIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.success, alignItems: "center", justifyContent: "center",
    marginBottom: spacing.md,
  },
});
