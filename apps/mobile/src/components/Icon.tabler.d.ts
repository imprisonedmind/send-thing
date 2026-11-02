// Ported from T3's AppSymbol.tabler.d.ts: per-icon runtime exports omit declarations.
declare module "@tabler/icons-react-native/Icon*" {
  import type { Icon } from "@tabler/icons-react-native";
  const icon: Icon;
  export default icon;
}
