import { contextBridge, ipcRenderer } from "electron";
import type { Attachment, Connection } from "@send-thing/contracts";

contextBridge.exposeInMainWorld("sendThing", {
  platform: process.platform,
  copyMenu: (
    target:
      | { kind: "link"; url: string }
      | { kind: "file"; connection: Connection; file: Attachment },
  ) => ipcRenderer.invoke("copy:menu", target),
  bootstrap: () => ipcRenderer.invoke("bootstrap"),
  dismiss: () => ipcRenderer.send("window:dismiss"),
  mediaSource: (connection: Connection, file: Attachment) =>
    ipcRenderer.invoke("media:source", connection, file),
  releaseMediaSource: (url: string) => ipcRenderer.invoke("media:release", url),
  openMedia: (connection: Connection, file: Attachment) =>
    ipcRenderer.invoke("media:open", connection, file),
  mediaData: () => ipcRenderer.invoke("media:data"),
  saveMedia: () => ipcRenderer.invoke("media:save"),
  closeMedia: () => ipcRenderer.invoke("media:close"),
  saveConnections: (connections: Connection[]) =>
    ipcRenderer.invoke("connections:save", connections),
  prepareFile: (connection: Connection, file: Attachment) =>
    ipcRenderer.invoke("file:prepare", connection, file),
  saveFile: (connection: Connection, file: Attachment) =>
    ipcRenderer.invoke("file:save", connection, file),
  dragFile: (key: string) => ipcRenderer.send("file:drag", key),
});
