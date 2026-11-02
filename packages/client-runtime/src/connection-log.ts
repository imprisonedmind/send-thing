// Keep credentials, challenge bodies and message content out of connection logs.
export function connectionLog(
  event: string,
  details: {
    hostId?: string;
    url?: string;
    count?: number;
    attempt?: number;
    status?: string;
    code?: number;
    error?: string;
  } = {},
) {
  const { url, ...rest } = details;
  let origin: string | undefined;
  if (url) {
    try {
      origin = new URL(url).origin;
    } catch {
      origin = "invalid address";
    }
  }
  console.info(
    `[send-thing:connection] ${event}`,
    JSON.stringify({ ...rest, ...(origin ? { url: origin } : {}) }),
  );
}
