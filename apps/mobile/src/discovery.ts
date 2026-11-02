import Zeroconf from "react-native-zeroconf";
import {
  DISCOVERY_SERVICE,
  discoveredUrls,
} from "@send-thing/contracts/network";

export function discoverHost(
  hostId: string,
  signal: AbortSignal,
): Promise<string[]> {
  if (signal.aborted) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    let zeroconf: Zeroconf | undefined;
    let settled = false;
    const urls = new Set<string>();
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      zeroconf?.stop();
      zeroconf?.removeDeviceListeners();
      zeroconf?.removeAllListeners();
      if (error) reject(error);
      else resolve([...urls]);
    };
    const abort = () => finish();
    const timer = setTimeout(finish, 3_500);
    signal.addEventListener("abort", abort, { once: true });
    try {
      zeroconf = new Zeroconf();
      zeroconf.on("resolved", (service) => {
        for (const url of discoveredUrls(service, hostId)) urls.add(url);
      });
      zeroconf.on("error", (error) => finish(error));
      zeroconf.scan({
        type: DISCOVERY_SERVICE,
        protocol: "tcp",
        domain: "local.",
      });
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
