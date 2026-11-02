import { createContext, useContext } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Connection } from "@send-thing/contracts";
import type { useHost } from "@send-thing/client-runtime/react";
import type { useDeviceProfile } from "@send-thing/client-runtime/device-profile";
import type { Draft } from "./storage.ts";

export type Routes = {
  Home: undefined;
  Connect: { link?: string } | undefined;
  Settings: { groupId: string };
  DeviceSettings: undefined;
  CreateGroup: undefined;
};
export type ScreenProps<K extends keyof Routes> = NativeStackScreenProps<
  Routes,
  K
>;

interface AppContextValue {
  connections: Connection[];
  selectedHostId: string;
  selectHost: (id: string) => void;
  selectedGroupId: string | null;
  selectGroup: (hostId: string, groupId: string | null) => void;
  save: (connections: Connection[]) => Promise<void>;
  host: ReturnType<typeof useHost>;
  deviceSettings: ReturnType<typeof useDeviceProfile>;
  incoming: Draft | null;
  setIncoming: (draft: Draft | null) => void;
  sending: boolean;
  setSending: (sending: boolean) => void;
}
export const AppContext = createContext<AppContextValue | null>(null);
export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("AppContext is not available.");
  return value;
}
