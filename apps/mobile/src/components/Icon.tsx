// T3 uses per-icon Tabler imports to avoid registering the entire icon set in Metro.
import IconPaperclip from "@tabler/icons-react-native/IconPaperclip";
import IconArrowUp from "@tabler/icons-react-native/IconArrowUp";
import IconArrowDown from "@tabler/icons-react-native/IconArrowDown";
import IconCamera from "@tabler/icons-react-native/IconCamera";
import IconPhoto from "@tabler/icons-react-native/IconPhoto";
import IconVideo from "@tabler/icons-react-native/IconVideo";
import IconFile from "@tabler/icons-react-native/IconFile";
import IconX from "@tabler/icons-react-native/IconX";
import IconQrcode from "@tabler/icons-react-native/IconQrcode";
import IconChevronRight from "@tabler/icons-react-native/IconChevronRight";
import IconChevronDown from "@tabler/icons-react-native/IconChevronDown";
import IconDevices from "@tabler/icons-react-native/IconDevices";
import IconDots from "@tabler/icons-react-native/IconDots";
import IconPlayerPlay from "@tabler/icons-react-native/IconPlayerPlay";
import IconCheck from "@tabler/icons-react-native/IconCheck";
import IconDeviceMobile from "@tabler/icons-react-native/IconDeviceMobile";
import IconDeviceTablet from "@tabler/icons-react-native/IconDeviceTablet";
import IconDeviceLaptop from "@tabler/icons-react-native/IconDeviceLaptop";
import IconWifiOff from "@tabler/icons-react-native/IconWifiOff";
import IconPlugConnectedX from "@tabler/icons-react-native/IconPlugConnectedX";
import { useTheme } from "../ui.tsx";

const icons = {
  offline: IconWifiOff,
  connection: IconPlugConnectedX,
  attachment: IconPaperclip,
  send: IconArrowUp,
  down: IconArrowDown,
  camera: IconCamera,
  photo: IconPhoto,
  video: IconVideo,
  file: IconFile,
  close: IconX,
  qr: IconQrcode,
  chevron: IconChevronRight,
  expand: IconChevronDown,
  devices: IconDevices,
  more: IconDots,
  play: IconPlayerPlay,
  check: IconCheck,
  phone: IconDeviceMobile,
  tablet: IconDeviceTablet,
  computer: IconDeviceLaptop,
};
export type IconName = keyof typeof icons;
export function Icon({
  name,
  size = 20,
  color,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const theme = useTheme();
  const Component = icons[name];
  return (
    <Component
      size={size}
      color={color ?? theme.text}
      strokeWidth={1.75}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
