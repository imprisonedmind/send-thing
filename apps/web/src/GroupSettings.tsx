import { useEffect, useState } from "react";
import type { Device, Group, Session } from "@send-thing/contracts";
import { type HostClient, errorText } from "@send-thing/client-runtime/client";
import { Button } from "./components/ui/button.tsx";
import { PairingCard } from "./components/PairingCard.tsx";
import { Laptop, Smartphone } from "lucide-react";

export function GroupSettings({
  client,
  group,
  session,
  addresses,
  onLeave,
}: {
  client: HostClient;
  group: Group;
  session: Session;
  addresses: string[];
  onLeave: () => void;
}) {
  const [members, setMembers] = useState<readonly Device[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isHost = session.device.id === group.hostDeviceId;
  async function perform(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void client
      .members(group.id)
      .then(setMembers)
      .catch((error) => setError(errorText(error)));
  }, [client, group.id, session]);
  return (
    <div className="settings scroll">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {isHost && (
        <section className="settings-section">
          {deleting ? (
            <div
              role="alertdialog"
              aria-labelledby="delete-group-title"
              aria-describedby="delete-group-description"
              className="delete-confirmation"
            >
              <h3 id="delete-group-title">Delete {group.name}?</h3>
              <p id="delete-group-description" className="muted">
                This deletes the group’s messages and files for every device. It
                cannot be undone.
              </p>
              <div className="confirm-actions">
                <Button disabled={busy} onClick={() => setDeleting(false)}>
                  Cancel
                </Button>
                <Button
                  className="danger-button"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await client.deleteGroup(group.id);
                      onLeave();
                    })
                  }
                >
                  Delete group
                </Button>
              </div>
            </div>
          ) : (
            <Button
              tone="ghost"
              className="danger-button"
              onClick={() => setDeleting(true)}
            >
              Delete group
            </Button>
          )}
        </section>
      )}
      {isHost && (
        <PairingCard client={client} group={group} addresses={addresses} />
      )}
      <section className="settings-section">
        <h3>Devices</h3>
        {members.map((member) => (
          <div className="member" key={member.id}>
            {member.avatar ? (
              <img className="profile-avatar" alt="" src={member.avatar} />
            ) : (
              <span className="device-icon">
                {member.kind === "phone" || member.kind === "tablet" ? (
                  <Smartphone size={20} />
                ) : (
                  <Laptop size={20} />
                )}
              </span>
            )}
            <div>
              <strong>{member.name}</strong>
              <span className="muted">
                {member.id === group.hostDeviceId ? "Host" : member.kind}
              </span>
            </div>
            {isHost && member.id !== group.hostDeviceId && (
              <Button
                size="small"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await client.removeMember(group.id, member.id);
                    setMembers(await client.members(group.id));
                  })
                }
              >
                Remove
              </Button>
            )}
          </div>
        ))}
      </section>
      {!isHost && (
        <Button
          disabled={busy}
          onClick={() =>
            void perform(async () => {
              await client.removeMember(group.id, session.device.id);
              onLeave();
            })
          }
        >
          Leave group
        </Button>
      )}
    </div>
  );
}
