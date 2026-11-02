import { BrowserWindow, dialog, ipcMain, net, protocol } from "electron";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { copyFile } from "node:fs/promises";
import type { Attachment } from "@send-thing/contracts";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "sendthing-media",
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
    },
  },
]);

export function installMediaViewer(options: {
  rendererUrl: string;
  preload: string;
  trusted: (event: Electron.IpcMainInvokeEvent) => void;
  resolveFile: (
    connection: unknown,
    file: unknown,
  ) => Promise<{ path: string; file: Attachment }>;
}) {
  const sources = new Map<
    string,
    { owner: number; path: string; file: Attachment }
  >();
  const viewers = new Map<number, { window: BrowserWindow; token: string }>();
  function source(owner: number, asset: { path: string; file: Attachment }) {
    if (
      !/^(image\/(png|jpeg|webp|gif|avif|heic|heif)|video\/[\w.+-]+)$/.test(
        asset.file.mime,
      )
    )
      throw new Error("This attachment is not a supported image or video.");
    const token = randomUUID();
    sources.set(token, { owner, ...asset });
    return { token, url: `sendthing-media://file/${token}` };
  }
  protocol.handle("sendthing-media", async (request) => {
    const url = new URL(request.url);
    const asset =
      url.hostname === "file" ? sources.get(url.pathname.slice(1)) : undefined;
    if (!asset) return new Response(null, { status: 404 });
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response(null, { status: 405 });
    const response = await net.fetch(pathToFileURL(asset.path).toString(), {
      method: request.method,
      headers: request.headers,
      signal: request.signal,
    });
    const headers = new Headers(response.headers);
    headers.set("Content-Type", asset.file.mime);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(response.body, { status: response.status, headers });
  });
  ipcMain.handle("media:source", async (event, connection, file) => {
    options.trusted(event);
    return source(event.sender.id, await options.resolveFile(connection, file))
      .url;
  });
  ipcMain.handle("media:release", (event, raw) => {
    options.trusted(event);
    if (typeof raw !== "string") return;
    const token = new URL(raw).pathname.slice(1);
    if (sources.get(token)?.owner === event.sender.id) sources.delete(token);
  });
  ipcMain.handle("media:open", async (event, connection, file) => {
    options.trusted(event);
    const asset = await options.resolveFile(connection, file);
    const viewer = new BrowserWindow({
      title: asset.file.name,
      width: 1000,
      height: 760,
      show: false,
      fullscreen: true,
      autoHideMenuBar: true,
      backgroundColor: "#000000",
      webPreferences: {
        preload: options.preload,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    const handle = source(viewer.webContents.id, asset);
    viewers.set(viewer.webContents.id, { window: viewer, token: handle.token });
    const id = viewer.webContents.id;
    viewer.on("closed", () => {
      sources.delete(handle.token);
      viewers.delete(id);
    });
    viewer.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    viewer.webContents.on("will-navigate", (event) => event.preventDefault());
    try {
      await viewer.loadURL(`${options.rendererUrl}#media`);
      viewer.show();
    } catch (error) {
      viewer.destroy();
      throw error;
    }
  });
  function viewerFor(event: Electron.IpcMainInvokeEvent) {
    const viewer = viewers.get(event.sender.id);
    if (!viewer || event.senderFrame !== event.sender.mainFrame)
      throw new Error("Untrusted media window.");
    return viewer;
  }
  ipcMain.handle("media:data", (event) => {
    const viewer = viewerFor(event);
    return {
      file: sources.get(viewer.token)!.file,
      url: `sendthing-media://file/${viewer.token}`,
    };
  });
  ipcMain.handle("media:save", async (event) => {
    const viewer = viewerFor(event);
    const asset = sources.get(viewer.token)!;
    const result = await dialog.showSaveDialog(viewer.window, {
      defaultPath: asset.file.name,
    });
    if (!result.canceled && result.filePath)
      await copyFile(asset.path, result.filePath);
  });
  ipcMain.handle("media:close", (event) => {
    viewerFor(event).window.close();
  });
}
