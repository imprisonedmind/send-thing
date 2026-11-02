import type { Attachment, Connection } from "@send-thing/contracts";
declare global {
  interface Window {
    sendThing?: {
      platform: string;
      discoverHost(hostId: string): Promise<string[]>;
      copyMenu(
        target:
          | { kind: "link"; url: string }
          | { kind: "file"; connection: Connection; file: Attachment },
      ): Promise<boolean>;
      dismiss(): void;
      mediaSource(connection: Connection, file: Attachment): Promise<string>;
      releaseMediaSource(url: string): Promise<void>;
      openMedia(connection: Connection, file: Attachment): Promise<void>;
      mediaData(): Promise<{ url: string; file: Attachment }>;
      saveMedia(): Promise<void>;
      closeMedia(): Promise<void>;
      bootstrap(): Promise<{
        connections: Connection[];
        addresses: string[];
        localHostId: string;
      }>;
      saveConnections(connections: Connection[]): Promise<void>;
      prepareFile(connection: Connection, file: Attachment): Promise<string>;
      saveFile(connection: Connection, file: Attachment): Promise<void>;
      dragFile(key: string): void;
    };
  }
}
