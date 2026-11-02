import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  screen,
  ipcMain,
  safeStorage,
  dialog,
  shell,
  clipboard,
} from "electron";
import { fork, type ChildProcess } from "node:child_process";
import { join, resolve } from "node:path";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  copyFile,
  rm,
  stat,
} from "node:fs/promises";
import { constants, createWriteStream, existsSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { createHash, randomUUID } from "node:crypto";
import * as Schema from "effect/Schema";
import { containsPoint, popoverBounds, POPOVER_SIZE } from "./popover.ts";
import { installMediaViewer } from "./media.ts";
import { copyNativeFile } from "./clipboard.ts";
import {
  Attachment,
  Connection,
  Connections,
  Id,
  normalizeHostUrl,
  safeFilename,
} from "@send-thing/contracts";

const dev = process.argv.includes("--dev");
app.setName("Send Thing");
if (dev) app.setPath("userData", resolve("../../.send-thing/desktop"));
const directory = app.getPath("userData");
let window: BrowserWindow | undefined;
let tray: Tray | undefined;
let backend: ChildProcess | undefined;
let quitting = false;
let sheetOpen = false;
let dialogOpen = false;
let contextMenuOpen = false;
let credentials: Connection[] = [];
let localHostId: string;
const prepared = new Map<string, string>();
const preparing = new Map<string, Promise<string>>();
const HostReady = Schema.Struct({
  type: Schema.Literal("ready"),
  hostId: Id,
  token: Id,
  url: Schema.String,
  addresses: Schema.Array(Schema.String),
});

function icon() {
  if (process.platform === "darwin") {
    // Trim the transparent margin of the supplied S silhouette, then provide
    // explicit Retina representations. macOS supplies the menu-bar tint.
    const source = nativeImage.createFromPath(
      join(__dirname, "../assets/send-thing-tray-template.png"),
    );
    if (source.isEmpty())
      throw new Error("The menu-bar icon asset is missing.");
    const silhouette = source.crop({ x: 245, y: 231, width: 748, height: 824 });
    const image = nativeImage.createEmpty();
    for (const scaleFactor of [1, 2, 3]) {
      image.addRepresentation({
        scaleFactor,
        buffer: silhouette
          .resize({
            width: 16 * scaleFactor,
            height: 18 * scaleFactor,
            quality: "best",
          })
          .toPNG(),
      });
    }
    image.setTemplateImage(true);
    return image;
  }
  const size = 22;
  const bytes = Buffer.alloc(size * size * 4);
  for (let y = 3; y < 19; y++)
    for (let x = 3; x < 19; x++) {
      if (
        (x >= 9 && x <= 12) ||
        (y <= 10 && Math.abs(x - 10.5) >= y - 4 && Math.abs(x - 10.5) <= y - 1)
      ) {
        const index = (y * size + x) * 4;
        bytes[index] = 216;
        bytes[index + 1] = 78;
        bytes[index + 2] = 27;
        bytes[index + 3] = 255;
      }
    }
  const image = nativeImage.createFromBitmap(bytes, {
    width: size,
    height: size,
    scaleFactor: 1,
  });
  image.setTemplateImage(false);
  return image;
}

function reveal() {
  if (!window || !tray || quitting) return;
  const trayBounds = tray.getBounds();
  // Some Linux tray hosts don't expose icon geometry. Anchor to the user's click.
  const anchor =
    trayBounds.width && trayBounds.height
      ? trayBounds
      : { ...screen.getCursorScreenPoint(), width: 0, height: 0 };
  const area = screen.getDisplayNearestPoint({
    x: anchor.x + anchor.width / 2,
    y: anchor.y + anchor.height / 2,
  }).workArea;
  window.setBounds(popoverBounds(anchor, area), false);
  window.show();
  window.focus();
}

function dismiss() {
  if (!sheetOpen && !dialogOpen && !contextMenuOpen) window?.hide();
}

async function persistConnections(next: Connection[]) {
  if (
    !safeStorage.isEncryptionAvailable() ||
    (process.platform === "linux" &&
      safeStorage.getSelectedStorageBackend() === "basic_text")
  )
    throw new Error(
      "Set up your operating system's credential store before saving connections.",
    );
  const path = join(directory, "connections.enc");
  await writeFile(
    `${path}.tmp`,
    safeStorage.encryptString(JSON.stringify(next)),
    { mode: 0o600 },
  );
  await rename(`${path}.tmp`, path);
  credentials = next;
}

function trusted(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame
  )
    throw new Error("Untrusted window.");
}

async function prepare(
  rawConnection: unknown,
  rawFile: unknown,
  fresh = false,
) {
  const connection = Schema.decodeUnknownSync(Connection)(rawConnection);
  const file = Schema.decodeUnknownSync(Attachment)(rawFile);
  if (
    !credentials.some(
      (saved) =>
        saved.hostId === connection.hostId &&
        saved.url === connection.url &&
        saved.token === connection.token,
    )
  )
    throw new Error("Unknown host connection.");
  const key = createHash("sha256")
    .update(`${connection.hostId}/${file.id}${fresh ? `/${randomUUID()}` : ""}`)
    .digest("hex");
  const cached = prepared.get(key);
  if (cached && existsSync(cached)) return key;
  const pending = preparing.get(key);
  if (pending) return pending;
  const operation = (async () => {
    if (connection.hostId === localHostId) {
      const metadataResponse = await fetch(
        `${normalizeHostUrl(connection.url)}/api/files/${file.id}/metadata`,
        {
          headers: { Authorization: `Bearer ${connection.token}` },
          redirect: "error",
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (!metadataResponse.ok)
        throw new Error("This file is no longer available.");
      const metadata = Schema.decodeUnknownSync(Attachment)(
        await metadataResponse.json(),
      );
      const folder = join(directory, "downloads", key);
      await mkdir(folder, { recursive: true, mode: 0o700 });
      const path = join(folder, safeFilename(metadata.name));
      try {
        await stat(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        const source = join(directory, "host", "files", metadata.id);
        // A hard link would let another app edit the group's original attachment.
        // Reflink when supported; copyFile otherwise makes an independent copy.
        await copyFile(source, `${path}.part`, constants.COPYFILE_FICLONE);
        await rename(`${path}.part`, path);
      }
      prepared.set(key, path);
      return key;
    }
    const response = await fetch(
      `${normalizeHostUrl(connection.url)}/api/files/${file.id}`,
      {
        headers: { Authorization: `Bearer ${connection.token}` },
        redirect: "error",
        signal: AbortSignal.timeout(10 * 60_000),
      },
    );
    if (!response.ok || !response.body)
      throw new Error(`Could not download ${file.name} (${response.status}).`);
    const folder = join(directory, "downloads", key);
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const path = join(folder, safeFilename(file.name));
    let bytes = 0;
    const meter = new Transform({
      transform(chunk, _encoding, callback) {
        bytes += chunk.length;
        callback(
          bytes > file.size
            ? new Error("Download exceeded its expected size.")
            : null,
          chunk,
        );
      },
    });
    try {
      await pipeline(
        Readable.fromWeb(
          response.body as import("node:stream/web").ReadableStream,
        ),
        meter,
        createWriteStream(`${path}.part`, { mode: 0o600 }),
      );
      if (bytes !== file.size) throw new Error("Download was incomplete.");
      await rename(`${path}.part`, path);
      prepared.set(key, path);
      return key;
    } finally {
      await rm(`${path}.part`, { force: true });
    }
  })();
  preparing.set(key, operation);
  try {
    return await operation;
  } finally {
    preparing.delete(key);
  }
}

async function start() {
  // Hiding the Dock alone leaves ordinary window semantics for window managers.
  if (process.platform === "darwin") app.setActivationPolicy("accessory");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    const encrypted = await readFile(join(directory, "connections.enc"));
    credentials = [
      ...Schema.decodeUnknownSync(Connections)(
        JSON.parse(safeStorage.decryptString(encrypted)),
      ),
    ];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const ready = await new Promise<typeof HostReady.Type>((accept, reject) => {
    backend = fork(join(__dirname, "server.cjs"), [], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        SEND_THING_HOME: join(directory, "host"),
        SEND_THING_WEB_ROOT: dev ? "" : join(process.resourcesPath, "web"),
      },
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    const timeout = setTimeout(() => {
      backend?.kill();
      reject(new Error("Host startup timed out."));
    }, 20_000);
    backend.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    backend.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Host exited (${code}).`));
    });
    backend.once("message", (message) => {
      clearTimeout(timeout);
      try {
        accept(Schema.decodeUnknownSync(HostReady)(message));
      } catch (error) {
        reject(error);
      }
    });
  });
  const local: Connection = {
    hostId: ready.hostId,
    token: ready.token,
    url: ready.url,
    label: "This device",
  };
  localHostId = ready.hostId;
  credentials = [
    local,
    ...credentials.filter((c) => c.hostId !== local.hostId),
  ];
  backend?.on("exit", () => {
    if (!quitting) {
      dialog.showErrorBox(
        "Send Thing host stopped",
        "Restart Send Thing to resume sharing.",
      );
      app.quit();
    }
  });
  window = new BrowserWindow({
    ...POPOVER_SIZE,
    show: false,
    title: "Send Thing",
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    hasShadow: true,
    roundedCorners: true,
    skipTaskbar: true,
    autoHideMenuBar: true,
    ...(process.platform === "darwin" ? { type: "panel" } : {}),
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.on("preload-error", (_event, _path, error) => {
    console.error("[desktop] Preload failed:", error);
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    if (!quitting) {
      console.error(
        `[desktop] Renderer stopped: ${details.reason} (exit ${details.exitCode}).`,
      );
    }
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url))
      void shell
        .openExternal(url)
        .catch((error) =>
          dialog.showErrorBox("Could not open link", String(error)),
        );
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      dismiss();
    }
  });
  if (process.platform === "darwin") {
    window.setAlwaysOnTop(true, "floating");
    window.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });
    window.on("sheet-begin", () => {
      sheetOpen = true;
    });
    window.on("sheet-end", () => {
      sheetOpen = false;
    });
  }
  window.on("blur", () => {
    // Let the tray click toggle an already-open popover, rather than reopening it
    // after blur has hidden it. Native attachment/save sheets also retain it.
    if (tray && containsPoint(tray.getBounds(), screen.getCursorScreenPoint()))
      return;
    dismiss();
  });
  // The renderer gives menus first refusal on Escape before dismissing the panel.
  ipcMain.on("window:dismiss", (event) => {
    trusted(event);
    dismiss();
  });
  screen.on("display-removed", dismiss);
  screen.on("display-metrics-changed", dismiss);

  ipcMain.handle("bootstrap", (event) => {
    trusted(event);
    return {
      connections: credentials,
      addresses: ready.addresses,
      localHostId: ready.hostId,
    };
  });
  installMediaViewer({
    rendererUrl: dev ? "http://localhost:5173" : ready.url,
    preload: join(__dirname, "preload.cjs"),
    trusted,
    resolveFile: async (connection, rawFile) => {
      const file = Schema.decodeUnknownSync(Attachment)(rawFile);
      const key = await prepare(connection, file);
      return { path: prepared.get(key)!, file };
    },
  });
  ipcMain.handle("connections:save", async (event, raw) => {
    trusted(event);
    const next = [...Schema.decodeUnknownSync(Connections)(raw)];
    if (
      !next.some(
        (c) =>
          c.hostId === local.hostId &&
          c.token === local.token &&
          c.url === local.url,
      )
    )
      throw new Error("The local host connection cannot be removed.");
    for (const connection of next) normalizeHostUrl(connection.url);
    await persistConnections(next);
  });
  ipcMain.handle("file:prepare", async (event, connection, file) => {
    trusted(event);
    return prepare(connection, file);
  });
  ipcMain.handle("copy:menu", async (event, raw) => {
    trusted(event);
    if (contextMenuOpen) return false;
    const target = Schema.decodeUnknownSync(
      Schema.Union([
        Schema.Struct({
          kind: Schema.Literal("link"),
          url: Schema.String.check(Schema.isMaxLength(32_000)),
        }),
        Schema.Struct({
          kind: Schema.Literal("file"),
          connection: Connection,
          file: Attachment,
        }),
      ]),
    )(raw);
    if (target.kind === "link") {
      const url = new URL(target.url);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error("Invalid link.");
    }
    return new Promise<boolean>((resolve, reject) => {
      let selected = false;
      const menu = Menu.buildFromTemplate([
        {
          label: target.kind === "file" ? "Copy file" : "Copy link",
          click: () => {
            selected = true;
            void (async () => {
              if (target.kind === "link") await clipboard.writeText(target.url);
              else {
                // A prior drag/paste may have let another app edit a cached copy.
                const key = await prepare(target.connection, target.file, true);
                await copyNativeFile(prepared.get(key)!);
              }
            })().then(() => resolve(true), reject);
          },
        },
      ]);
      contextMenuOpen = true;
      try {
        menu.popup({
          window: window!,
          callback: () => {
            contextMenuOpen = false;
            if (!selected) resolve(false);
          },
        });
      } catch (error) {
        contextMenuOpen = false;
        reject(error);
      }
    });
  });
  ipcMain.handle("file:save", async (event, connection, rawFile) => {
    trusted(event);
    const file = Schema.decodeUnknownSync(Attachment)(rawFile);
    dialogOpen = true;
    let result: Electron.SaveDialogReturnValue;
    try {
      result = await dialog.showSaveDialog(window!, { defaultPath: file.name });
    } finally {
      dialogOpen = false;
    }
    if (!result.canceled && result.filePath) {
      const key = await prepare(connection, file, true);
      await copyFile(prepared.get(key)!, result.filePath);
    }
  });
  ipcMain.on("file:drag", (event, key: unknown) => {
    trusted(event);
    if (typeof key !== "string") return;
    const file = prepared.get(key);
    if (file && existsSync(file))
      event.sender.startDrag({ file, icon: icon() });
  });
  tray = new Tray(icon());
  tray.setToolTip("Send Thing");
  if (process.platform === "darwin") tray.setIgnoreDoubleClickEvents(true);
  tray.on("click", () => (window?.isVisible() ? dismiss() : reveal()));
  tray.on("right-click", () => {
    dismiss();
    tray?.popUpContextMenu(
      Menu.buildFromTemplate([
        { label: "Open Send Thing", click: reveal },
        ...(process.platform === "linux"
          ? []
          : [
              {
                label: "Start at login",
                type: "checkbox" as const,
                checked: app.getLoginItemSettings().openAtLogin,
                click: (item: Electron.MenuItem) =>
                  app.setLoginItemSettings({ openAtLogin: item.checked }),
              },
            ]),
        { type: "separator" },
        { label: "Quit Send Thing", click: () => app.quit() },
      ]),
    );
  });
  try {
    await window.loadURL(dev ? "http://localhost:5173" : ready.url);
  } catch (error) {
    throw new Error(
      dev
        ? "Could not load the desktop UI at http://localhost:5173. Start pnpm dev:web in another terminal, then restart pnpm dev:desktop."
        : "Could not load the desktop UI from the local host.",
      { cause: error },
    );
  }
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", reveal);
  app.on("window-all-closed", () => {});
  app.on("before-quit", (event) => {
    if (quitting) return;
    quitting = true;
    const child = backend;
    if (child && child.exitCode === null && child.signalCode === null) {
      event.preventDefault();
      const timeout = setTimeout(() => child.kill("SIGKILL"), 5_000);
      child.once("exit", () => {
        clearTimeout(timeout);
        app.quit();
      });
      // IPC disconnect requests the child's scoped shutdown on every platform.
      if (child.connected) child.disconnect();
      else child.kill();
    }
  });
  process.once("SIGINT", () => app.quit());
  process.once("SIGTERM", () => app.quit());
  void app
    .whenReady()
    .then(start)
    .catch((error) => {
      console.error("[desktop] Startup failed:", error);
      dialog.showErrorBox("Could not start Send Thing", String(error));
      app.quit();
    });
}
