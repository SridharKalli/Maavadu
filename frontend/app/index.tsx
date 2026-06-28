import { View, ActivityIndicator, StyleSheet } from "react-native";
import { colors } from "@/src/lib/theme";

export default function Index() {
  return (
    <View style={styles.container} testID="boot-screen">
      <ActivityIndicator size="large" color={colors.brand} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
});
