// One useFonts() call that loads BOTH the vector-icon font files (only
// needed under Expo Go where Metro can't resolve them) AND our brand
// typography (Fraunces for display, Nunito for body).
//
// We deliberately use expo-font + local TTF assets here rather than the
// `@expo-google-fonts/*` packages — the project standard is to keep the
// font pipeline owned in this repo so dev/native/web behave identically.

import Constants, { ExecutionEnvironment } from "expo-constants";
import { useFonts } from "expo-font";

const ICON_VECTOR_VERSION = "15.1.1";

// short internal fontName (what the library queries) -> CDN .ttf file name
const ICON_FAMILIES: Record<string, string> = {
  anticon: "AntDesign",
  entypo: "Entypo",
  evilicons: "EvilIcons",
  feather: "Feather",
  FontAwesome: "FontAwesome",
  Fontisto: "Fontisto",
  foundation: "Foundation",
  ionicons: "Ionicons",
  "material-community": "MaterialCommunityIcons",
  material: "MaterialIcons",
  octicons: "Octicons",
  "simple-line-icons": "SimpleLineIcons",
  zocial: "Zocial",
  "FontAwesome5Free-Regular": "FontAwesome5_Regular",
  "FontAwesome5Free-Solid": "FontAwesome5_Solid",
  "FontAwesome5Free-Brand": "FontAwesome5_Brands",
  "FontAwesome6Free-Regular": "FontAwesome6_Regular",
  "FontAwesome6Free-Solid": "FontAwesome6_Solid",
  "FontAwesome6Free-Brand": "FontAwesome6_Brands",
};

const cdnUrl = (file: string): string =>
  `https://cdn.jsdelivr.net/npm/@expo/vector-icons@${ICON_VECTOR_VERSION}/build/vendor/react-native-vector-icons/Fonts/${file}.ttf`;

const iconFontMap = (): Record<string, any> =>
  Object.fromEntries(
    Object.entries(ICON_FAMILIES).map(([key, file]) => [key, cdnUrl(file)]),
  );

// Brand fonts — referenced from /app/frontend/src/lib/theme.ts (`font.*`).
// The require() keeps Metro happy and works on web + native.
const brandFontMap = (): Record<string, any> => ({
  Fraunces_700Bold: require("../../assets/fonts/Fraunces-Bold.ttf"),
  Nunito_400Regular: require("../../assets/fonts/Nunito-Regular.ttf"),
  Nunito_700Bold: require("../../assets/fonts/Nunito-Bold.ttf"),
});

export const useAppFonts = (): readonly [boolean, Error | null] => {
  const inExpoGo =
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  return useFonts({
    ...(inExpoGo ? iconFontMap() : {}),
    ...brandFontMap(),
  });
};
