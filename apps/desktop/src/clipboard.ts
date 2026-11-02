import { clipboard, ClipboardItem } from "electron";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export async function copyNativeFile(path: string) {
  if (process.platform === "win32") {
    // The Windows shell requires CF_HDROP, not a registered custom format or text path.
    await promisify(execFile)(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-STA",
        "-Command",
        "$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.Windows.Forms; $files = New-Object System.Collections.Specialized.StringCollection; [void]$files.Add($env:SEND_THING_COPY_FILE); [System.Windows.Forms.Clipboard]::SetFileDropList($files)",
      ],
      {
        env: { ...process.env, SEND_THING_COPY_FILE: path },
        windowsHide: true,
        timeout: 10_000,
      },
    );
    return;
  }
  const url = pathToFileURL(path).href;
  const raw = (format: string) =>
    `electron application/osclipboard;format="${format}"`;
  let formats: Record<string, Blob>;
  if (process.platform === "darwin") {
    const escaped = path
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    formats = {
      [raw("public.file-url")]: new Blob([url]),
      [raw("NSFilenamesPboardType")]: new Blob([
        `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><array><string>${escaped}</string></array></plist>`,
      ]),
    };
  } else {
    formats = {
      [raw("text/uri-list")]: new Blob([`${url}\r\n`]),
      [raw("x-special/gnome-copied-files")]: new Blob([`copy\n${url}`]),
    };
  }
  // Electron 44 commits all native representations together in the main process.
  // https://www.electronjs.org/docs/latest/api/clipboard
  await clipboard.write([new ClipboardItem(formats)]);
}
