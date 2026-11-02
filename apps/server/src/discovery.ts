import Bonjour from "bonjour-service";
import { networkInterfaces } from "node:os";
import {
  DISCOVERY_SERVICE,
  discoveredUrls,
  isLanAddress,
} from "@send-thing/contracts/network";

export function hostAddresses(bind: string, port: number, scheme: string) {
  if (bind === "127.0.0.1" || bind === "::1") return [];
  const addresses = Object.values(networkInterfaces()).flatMap((entries) =>
    (entries ?? [])
      .filter((entry) => entry.family === "IPv4" && !entry.internal)
      .map((entry) => entry.address),
  );
  return [...new Set(addresses)]
    .filter(
      (address) =>
        (bind === "0.0.0.0" || bind === "::" || bind === address) &&
        (isLanAddress(address) ||
          /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(address)),
    )
    .slice(0, 16)
    .map((address) => `${scheme}://${address}:${port}`);
}

export function advertiseHost(
  hostId: string,
  bind: string,
  port: number,
  scheme: string,
) {
  let bonjour: Bonjour | undefined;
  let previous = "";
  let failed = false;
  const refresh = () => {
    const addresses = hostAddresses(bind, port, scheme);
    const signature = addresses.slice().sort().join("\n");
    if (signature === previous && bonjour && !failed) return;
    bonjour?.destroy();
    bonjour = undefined;
    previous = signature;
    failed = false;
    if (!addresses.some((url) => isLanAddress(new URL(url).hostname))) return;
    try {
      bonjour = new Bonjour(undefined, (error: Error) => {
        failed = true;
        console.warn("LAN discovery unavailable:", error.message);
      });
      bonjour
        .publish({
          name: `send-thing-${hostId}`,
          type: DISCOVERY_SERVICE,
          port,
          host: `send-thing-${hostId}.local`,
          disableIPv6: true,
          txt: { hostId, scheme },
        })
        .on("error", (error) =>
          console.warn("LAN announcement failed:", error.message),
        );
    } catch (error) {
      bonjour?.destroy();
      bonjour = undefined;
      console.warn("LAN discovery unavailable:", error);
    }
  };
  refresh();
  const timer = setInterval(refresh, 5_000);
  timer.unref();
  return () => {
    clearInterval(timer);
    bonjour?.destroy();
  };
}

export function discoverHost(
  hostId: string,
  signal?: AbortSignal,
): Promise<string[]> {
  if (signal?.aborted) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    const urls = new Set<string>();
    let bonjour: Bonjour | undefined;
    let browser: Bonjour.Browser | undefined;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      browser?.stop();
      bonjour?.destroy();
      if (error) reject(error);
      else resolve([...urls]);
    };
    const abort = () => finish();
    const timer = setTimeout(finish, 3_500);
    signal?.addEventListener("abort", abort, { once: true });
    try {
      bonjour = new Bonjour(undefined, (error: Error) => finish(error));
      browser = bonjour.find({ type: DISCOVERY_SERVICE }, (service) => {
        for (const url of discoveredUrls(service, hostId)) urls.add(url);
      });
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
