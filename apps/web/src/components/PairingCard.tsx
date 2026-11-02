import { useEffect, useRef, useState } from "react";
import { Copy, QrCode, RotateCw } from "lucide-react";
import { createPairingLink } from "@send-thing/contracts/pairing";
import { normalizeHostUrl, type Group } from "@send-thing/contracts";
import { errorText, type HostClient } from "@send-thing/client-runtime/client";
import { Button } from "./ui/button.tsx";
import { QRCodeSvg } from "./ui/qr-code.tsx";

export function PairingCard({
  client,
  group,
  addresses,
  autoCreate = false,
}: {
  client: HostClient;
  group: Group;
  addresses: string[];
  autoCreate?: boolean;
}) {
  const [address, setAddress] = useState(addresses[0] ?? client.connection.url);
  const [invite, setInvite] = useState<{
    token: string;
    expiresAt: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (addresses.length && !addresses.includes(address)) {
      setAddress(addresses[0]!);
      setInvite(null);
    }
  }, [addresses, address]);
  useEffect(() => {
    if (autoCreate && !started.current) {
      started.current = true;
      void create();
    }
  }, [autoCreate]);
  useEffect(() => {
    if (!invite) return;
    const update = () => setExpired(Date.now() >= Date.parse(invite.expiresAt));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [invite]);
  async function create() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const url = normalizeHostUrl(address);
      const hostname = new URL(url).hostname;
      if (
        hostname === "localhost" ||
        hostname === "[::1]" ||
        /^127\./.test(hostname) ||
        hostname === "0.0.0.0"
      )
        throw new Error(
          "Choose this host’s LAN or Tailscale address so your phone can reach it.",
        );
      setAddress(url);
      setInvite(await client.invite(group.id));
      setExpired(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function copy(link: string) {
    setError(null);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch (e) {
      setError(errorText(e));
    }
  }
  const link = invite
    ? createPairingLink({
        url: address,
        hostId: client.connection.hostId,
        group: group.name,
        invite: invite.token,
        expiresAt: invite.expiresAt,
      })
    : null;
  return (
    <section className="settings-section">
      {!autoCreate && <h3>Add device</h3>}
      {link && !expired ? (
        <div className="pairing-card">
          <QRCodeSvg
            value={link}
            size={220}
            level="M"
            marginSize={4}
            title={`Join ${group.name}`}
          />
          <p className="muted">Scan in Send Thing on your phone.</p>
          <p className="muted">
            Single use · expires{" "}
            {new Date(invite!.expiresAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <Button size="small" tone="ghost" onClick={() => void copy(link)}>
            <Copy />
            {copied ? "Copied" : "Copy pairing link"}
          </Button>
        </div>
      ) : expired ? (
        <p className="muted" role="status">
          QR code expired.
        </p>
      ) : null}
      <label>
        Connect over
        {addresses.length ? (
          <select
            disabled={busy}
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              setInvite(null);
              setExpired(false);
            }}
          >
            {addresses.map((url) => (
              <option key={url} value={url}>
                {url}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="url"
            disabled={busy}
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              setInvite(null);
              setExpired(false);
            }}
            placeholder="Host LAN or Tailscale address"
          />
        )}
      </label>
      <Button disabled={busy} onClick={() => void create()}>
        {invite ? <RotateCw /> : <QrCode />}
        {busy ? "Creating…" : invite ? "New QR code" : "Show QR code"}
      </Button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
