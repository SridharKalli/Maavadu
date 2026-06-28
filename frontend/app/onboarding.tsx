import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import {
  menuApi, onboarding, walletApi, MealKey, WeeklyMenu,
  SizeKey, LunchVariant, PricingGrid,
} from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius, shadow, DAY_NAMES_FULL } from "@/src/lib/theme";

type Step =
  | "menu" | "name" | "pincode" | "address"
  | "preferences" | "topup" | "done";

const STEP_ORDER: Step[] = [
  "menu", "name", "pincode", "address", "preferences", "topup", "done",
];

const MEALS: MealKey[] = ["breakfast", "lunch", "dinner"];
const MEAL_LABEL: Record<MealKey, string> = {
  breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner",
};

const SIZE_OPTIONS: { key: SizeKey; label: string; members: string }[] = [
  { key: "single", label: "Single", members: "1 member" },
  { key: "couple", label: "Couple", members: "2 members" },
  { key: "family", label: "Family", members: "4 members" },
];

const TOPUP_PRESETS = [3000, 6000, 10000];

export default function Onboarding() {
  const { refresh } = useAuth();
  const [step, setStep] = useState<Step>("menu");

  const [week, setWeek] = useState<WeeklyMenu[]>([]);
  const [pricing, setPricing] = useState<PricingGrid | null>(null);
  const [name, setName] = useState("");
  const [pincode, setPincode] = useState("");
  const [pincodeStatus, setPincodeStatus] = useState<{ ok: boolean; area: string } | null>(null);
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [meals, setMeals] = useState<MealKey[]>(["lunch", "dinner"]);
  const [size, setSize] = useState<SizeKey>("single");
  const [lunchVariant, setLunchVariant] = useState<LunchVariant>("with_rice");
  const [topup, setTopup] = useState<number>(6000);
  const [customMode, setCustomMode] = useState(false);
  const [customAmt, setCustomAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    menuApi.weekPublic().then(setWeek).catch(() => setWeek([]));
    walletApi.pricing().then(setPricing).catch(() => setPricing(null));
  }, []);

  const stepIdx = STEP_ORDER.indexOf(step);

  function toggleMeal(m: MealKey) {
    Haptics.selectionAsync();
    setMeals((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);
  }

  function dailyBurn(): number {
    if (!pricing) return 0;
    let total = 0;
    for (const m of meals) {
      if (m === "lunch") {
        total += pricing[`lunch_${lunchVariant}` as const][size];
      } else {
        total += pricing[m][size];
      }
    }
    return total;
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
      const finalTopup = customMode
        ? Number(customAmt.replace(/[^\d]/g, "")) || 0
        : topup;
      await onboarding.complete({
        name, address, pincode, notes,
        meals, default_size: size,
        default_lunch_variant: lunchVariant,
        initial_topup: finalTopup,
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
    else if (step === "preferences") setStep("address");
    else if (step === "topup") setStep("preferences");
  }

  const daily = dailyBurn();
  const selectedAmt = customMode
    ? (Number(customAmt.replace(/[^\d]/g, "")) || 0)
    : topup;
  const daysCovered = daily > 0 ? Math.floor(selectedAmt / daily) : 0;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.topBar}>
          {step !== "menu" && step !== "done" ? (
            <Pressable testID="onboarding-back" onPress={back} style={styles.backBtn}>
              <Feather name="arrow-left" size={20} color={colors.onSurface} />
            </Pressable>
          ) : <View style={{ width: 36 }} />}
          <View style={styles.progress}>
            <View style={[styles.progressFill,
              { width: `${(Math.max(0, stepIdx) / (STEP_ORDER.length - 1)) * 100}%` }]} />
          </View>
          <Text style={styles.stepNum}>
            {stepIdx + 1}/{STEP_ORDER.length}
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">
          {step === "menu" && (
            <>
              <Text style={styles.h1}>This week&apos;s menu</Text>
              <Text style={styles.muted}>
                Home-cooked, Chennai-style. Browse what&apos;s cooking, then sign up.
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
              <Text style={styles.h1}>What&apos;s your family name?</Text>
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
                Enter your pincode — we&apos;ll check if we deliver there.
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
                    Sorry, we don&apos;t deliver to {pincode} yet. We&apos;re expanding daily —
                    leave your number and we&apos;ll let you know!
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
                onPress={() => address.trim() && setStep("preferences")}
                disabled={!address.trim()}>
                <Text style={styles.ctaText}>Continue</Text>
              </Pressable>
            </>
          )}

          {step === "preferences" && (
            <>
              <Text style={styles.h1}>Your daily preferences</Text>
              <Text style={styles.muted}>
                Pick the meals you&apos;d like delivered and your family size.
                You can change any of this anytime.
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

              <Text style={styles.label}>Family size</Text>
              <View style={styles.sizeRow}>
                {SIZE_OPTIONS.map((opt) => {
                  const active = size === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      testID={`size-${opt.key}`}
                      onPress={() => { setSize(opt.key); Haptics.selectionAsync(); }}
                      style={[styles.sizeBtn, active && styles.sizeBtnActive]}
                    >
                      <Text style={[styles.sizeLabel,
                        active && { color: colors.onBrand }]}>
                        {opt.label}
                      </Text>
                      <Text style={[styles.sizeMembers,
                        active && { color: colors.onBrand }]}>
                        {opt.members}
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
                      const active = lunchVariant === v;
                      return (
                        <Pressable
                          key={v}
                          testID={`variant-${v}`}
                          onPress={() => { setLunchVariant(v); Haptics.selectionAsync(); }}
                          style={[styles.variantBtn, active && styles.variantBtnActive]}
                        >
                          <Feather
                            name={active ? "check-circle" : "circle"}
                            size={14}
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
                </>
              )}

              {pricing && daily > 0 && (
                <View style={styles.estCard} testID="onboarding-daily-estimate">
                  <Text style={styles.estLabel}>Estimated per day</Text>
                  <Text style={styles.estAmount}>₹{daily}</Text>
                  <Text style={styles.estSub}>
                    Wallet auto-debits this amount on every delivery.
                  </Text>
                </View>
              )}

              <Pressable testID="onboarding-next-prefs"
                style={[styles.cta, meals.length === 0 && styles.ctaDisabled]}
                onPress={() => meals.length > 0 && setStep("topup")}
                disabled={meals.length === 0}>
                <Text style={styles.ctaText}>Continue</Text>
              </Pressable>
            </>
          )}

          {step === "topup" && (
            <>
              <Text style={styles.h1}>Add your wallet balance</Text>
              <Text style={styles.muted}>
                Pre-pay so deliveries start instantly. Each meal is auto-deducted —
                no card swipes, no daily friction.
              </Text>

              <View style={styles.chipsRow}>
                {TOPUP_PRESETS.map((a) => {
                  const active = !customMode && topup === a;
                  const days = daily > 0 ? Math.floor(a / daily) : 0;
                  return (
                    <Pressable
                      key={a}
                      testID={`topup-${a}`}
                      onPress={() => {
                        setCustomMode(false); setTopup(a);
                        Haptics.selectionAsync();
                      }}
                      style={[styles.topupChip, active && styles.topupChipActive]}
                    >
                      <Text style={[styles.topupAmt,
                        active && { color: colors.onBrand }]}>
                        ₹{a.toLocaleString("en-IN")}
                      </Text>
                      {days > 0 && (
                        <Text style={[styles.topupDays,
                          active && { color: colors.brandTertiary }]}>
                          ~{days} days
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
                <Pressable
                  testID="topup-custom-toggle"
                  onPress={() => {
                    setCustomMode(true);
                    Haptics.selectionAsync();
                  }}
                  style={[styles.topupChip, customMode && styles.topupChipActive]}
                >
                  <Text style={[styles.topupAmt,
                    customMode && { color: colors.onBrand }]}>
                    Custom
                  </Text>
                  <Text style={[styles.topupDays,
                    customMode && { color: colors.brandTertiary }]}>
                    enter amount
                  </Text>
                </Pressable>
              </View>

              {customMode && (
                <View style={styles.customRow}>
                  <Text style={styles.rupee}>₹</Text>
                  <TextInput
                    testID="topup-custom-input"
                    style={styles.customInput}
                    value={customAmt}
                    onChangeText={(t) => setCustomAmt(t.replace(/[^\d]/g, ""))}
                    placeholder="5000"
                    placeholderTextColor={colors.onSurfaceMuted}
                    keyboardType="number-pad" autoFocus
                  />
                </View>
              )}

              {selectedAmt > 0 && daily > 0 && (
                <Text style={styles.helper} testID="topup-summary">
                  ₹{selectedAmt.toLocaleString("en-IN")} covers about{" "}
                  <Text style={{ fontWeight: "700", color: colors.brand }}>
                    {daysCovered} {daysCovered === 1 ? "day" : "days"}
                  </Text>{" "}
                  at ₹{daily}/day.
                </Text>
              )}

              <Pressable
                testID="onboarding-skip-topup"
                style={styles.skipBtn}
                onPress={() => {
                  setCustomMode(false); setTopup(0); setCustomAmt("");
                  Haptics.selectionAsync();
                }}
              >
                <Text style={styles.skipText}>
                  Skip for now (top up later from chat)
                </Text>
              </Pressable>

              {error && <Text style={styles.error}>{error}</Text>}

              <Pressable testID="onboarding-submit"
                style={[styles.cta, busy && styles.ctaDisabled]}
                onPress={submit} disabled={busy}>
                {busy ? <ActivityIndicator color={colors.onBrand} /> :
                  <Text style={styles.ctaText}>
                    {selectedAmt > 0
                      ? `Top up ₹${selectedAmt.toLocaleString("en-IN")} & finish`
                      : "Finish setup"}
                  </Text>}
              </Pressable>
            </>
          )}

          {step === "done" && (
            <View style={styles.done}>
              <View style={styles.doneIcon}>
                <Feather name="check" size={36} color={colors.onBrand} />
              </View>
              <Text style={styles.h1}>You&apos;re all set!</Text>
              <Text style={styles.muted}>
                Your wallet is loaded and your first delivery is being scheduled.
                Welcome to the family 🙏
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

  sizeRow: { flexDirection: "row", gap: spacing.sm },
  sizeBtn: {
    flex: 1, paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    alignItems: "center",
  },
  sizeBtnActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  sizeLabel: { fontSize: 16, fontWeight: "700", color: colors.onSurface,
               letterSpacing: -0.3 },
  sizeMembers: { fontSize: 11, fontWeight: "600", color: colors.onSurfaceMuted,
                 marginTop: 4 },

  variantRow: { flexDirection: "row", gap: spacing.sm },
  variantBtn: {
    flex: 1, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 6,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
  },
  variantBtnActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  variantText: { fontSize: 14, fontWeight: "700", color: colors.onSurface },

  estCard: {
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.lg, padding: spacing.lg,
    marginTop: spacing.xl, alignItems: "center",
  },
  estLabel: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceMuted,
              letterSpacing: 0.5, textTransform: "uppercase" },
  estAmount: { fontSize: 36, fontWeight: "700", color: colors.brand,
               letterSpacing: -1, marginTop: 4 },
  estSub: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: spacing.xs,
            textAlign: "center" },

  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  topupChip: {
    flexBasis: "47%", flexGrow: 1,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingVertical: spacing.md, alignItems: "center", ...shadow.card,
  },
  topupChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  topupAmt: { fontSize: 20, fontWeight: "700", color: colors.onSurface,
              letterSpacing: -0.3 },
  topupDays: { fontSize: 11, fontWeight: "600", color: colors.onSurfaceMuted,
               marginTop: 4 },

  customRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md,
    marginTop: spacing.md, paddingHorizontal: spacing.md,
  },
  rupee: { fontSize: 22, fontWeight: "700", color: colors.brand,
           marginRight: spacing.sm },
  customInput: { flex: 1, paddingVertical: spacing.md, fontSize: 20,
                 color: colors.onSurface, fontWeight: "700" },

  helper: { color: colors.onSurfaceMuted, fontSize: 13,
            marginTop: spacing.md, textAlign: "center" },

  skipBtn: { marginTop: spacing.md, padding: spacing.sm, alignItems: "center" },
  skipText: { color: colors.onSurfaceMuted, fontSize: 13, fontWeight: "600",
              textDecorationLine: "underline" },

  done: { alignItems: "center", paddingTop: spacing.xxxl, gap: spacing.md },
  doneIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.success, alignItems: "center", justifyContent: "center",
    marginBottom: spacing.md,
  },
});
