import { useState } from "react";
import type { ProfileInput, Connection } from "@send-thing/contracts";
import { errorText } from "@send-thing/client-runtime/client";
import { Button } from "./components/ui/button.tsx";
import { prepareAvatar } from "./avatar.ts";

export function DeviceSettings({
  profile,
  onSave,
  connections,
  localHostId,
  onForget,
}: {
  profile: ProfileInput;
  onSave: (profile: ProfileInput) => Promise<void>;
  connections: Connection[];
  localHostId?: string;
  onForget: (hostId: string) => Promise<void>;
}) {
  const [avatar, setAvatar] = useState(profile.avatar);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  async function saveAvatar(next: string | null) {
    setBusy(true);
    setError(null);
    setSaved(false);
    setAvatar(next);
    try {
      await onSave({ ...profile, avatar: next });
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="form"
      onChange={() => setSaved(false)}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setBusy(true);
        setError(null);
        setSaved(false);
        void onSave({
          name: String(data.get("name")),
          kind: String(data.get("kind")) as ProfileInput["kind"],
          avatar,
        })
          .then(() => setSaved(true))
          .catch((e) => setError(errorText(e)))
          .finally(() => setBusy(false));
      }}
    >
      <label>
        Name
        <input
          name="name"
          defaultValue={profile.name}
          maxLength={100}
          required
          disabled={busy}
        />
      </label>
      <label>
        Device type
        <select name="kind" defaultValue={profile.kind} disabled={busy}>
          {["desktop", "laptop", "phone", "tablet", "server"].map((kind) => (
            <option key={kind}>{kind}</option>
          ))}
        </select>
      </label>
      <label>
        Device image
        <input
          type="file"
          accept="image/*"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setBusy(true);
            setError(null);
            setSaved(false);
            void prepareAvatar(file)
              .then(saveAvatar)
              .catch((e) => setError(errorText(e)))
              .finally(() => setBusy(false));
          }}
        />
      </label>
      {avatar && (
        <div className="member">
          <img className="profile-avatar" alt="Device image" src={avatar} />
          <Button
            size="small"
            disabled={busy}
            onClick={() => {
              void saveAvatar(null);
            }}
          >
            Remove image
          </Button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        Save device settings
      </Button>
      {saved && (
        <p role="status" className="muted">
          Saved.
        </p>
      )}
      {connections.length > 0 && (
        <section className="settings-section">
          <h3>Connections</h3>
          {connections.map((connection) => (
            <div className="member" key={connection.hostId}>
              <div>
                <strong>
                  {connection.hostId === localHostId
                    ? profile.name
                    : connection.label}
                </strong>
              </div>
              {connection.hostId !== localHostId && (
                <Button
                  size="small"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    setError(null);
                    void onForget(connection.hostId)
                      .catch((e) => setError(errorText(e)))
                      .finally(() => setBusy(false));
                  }}
                >
                  Forget host
                </Button>
              )}
            </div>
          ))}
        </section>
      )}
    </form>
  );
}
