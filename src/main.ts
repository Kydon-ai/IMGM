import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, net, Notification } from "electron";
import { execFile } from "child_process";
import crypto from "crypto";
import Store from "electron-store";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import sharp from "sharp";
import { closeAiRuntime, registerAiIpc } from "./ai/ipc";
import { applyImageIndexSelection, ImageIndexProgress, scanImageIndexGroups } from "./ai/image-indexer";
import { getAiConfig } from "./ai/config";
import type { SearchHistoryEntry, SearchHistoryState } from "./types/search-history";

const execFileAsync = promisify(execFile);
const store = new Store();
const FORWARD_RENDERER_CONSOLE_KEY = "forwardRendererConsole";
const LOCAL_TARGET_LIST_KEY = "localTargetList";
const LOCAL_IMAGE_LIST_KEY = "localImgList";
const RIR_TARGET_LIST_KEY = "rirTargetList";
const RIR_IMAGE_LIST_KEY = "rirImgList";
const LOCAL_PAGE_KEY = "localPage";
const RIR_PAGE_KEY = "rirPage";
const SEARCH_HISTORY_KEY = "localSearchHistory";
const SEARCH_HISTORY_POINTER_KEY = "localSearchHistoryPointer";
const RIR_CLIPBOARD_DIRECTORY = "imgm-rir-clipboard";
const RIR_CLIPBOARD_FILE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
let forwardRendererConsole = store.get(FORWARD_RENDERER_CONSOLE_KEY, true);

const platform = getCurrentPlatform();
const DEFAULTFILEPATH: string[] = [];
if (platform === "linux") {
  DEFAULTFILEPATH.push(`${getCurrentUserInfo().homedir}/图片`);
} else {
  DEFAULTFILEPATH.push(`C:\\Users\\${getCurrentUserInfo().username}\\Pictures`);
}

let win: BrowserWindow | null = null;
let imageIndexTask: Promise<{ added: number; removed: number; unchanged: number }> | null = null;

const createWindow = (): void => {
  win = new BrowserWindow({
    width: 1403,
    height: 700,
    minWidth: 1403,
    minHeight: 700,
    frame: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // preload.ts 当前需要加载 notyf；Electron 33 默认 sandbox 会阻止该依赖被 require。
      sandbox: false,
    },
  });

  // 把渲染进程的 console 输出复制到启动 Electron 的终端。
  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (sourceId.startsWith("devtools://")) {
      return;
    }

    if (!forwardRendererConsole) {
      return;
    }

    const levelName = ["log", "info", "warn", "error"][level] || `level-${level}`;
    const source = sourceId ? `${path.basename(sourceId)}:${line}` : "renderer";
    const output = `[${source}][${levelName}] ${message}`;

    if (level >= 3) {
      console.error(output);
    } else if (level === 2) {
      console.warn(output);
    } else {
      console.log(output);
    }
  });

  win.loadFile(path.join(__dirname, "../index.html"));
  win.setMenuBarVisibility(false);

  const sysInfo = (msg: string): void => {
    const notification = new Notification({
      title: "IMGM已启动",
      body: msg,
    });
    notification.show();
  };

  sysInfo("process start!!!");

  if (!store.get("page")) {
    store.set("page", 1);
  }

  // 新版本将本地图片库和 RIR 资源分开保存；旧版本的共享列表迁移为本地列表。
  if (!store.get(LOCAL_TARGET_LIST_KEY)) {
    store.set(LOCAL_TARGET_LIST_KEY, store.get("targetList", []));
    if (store.get("mode") === "rir") {
      store.set("mode", "local");
    }
  }
  if (!store.get(LOCAL_IMAGE_LIST_KEY)) {
    store.set(LOCAL_IMAGE_LIST_KEY, store.get("imgList", []));
  }
  if (!store.get(RIR_TARGET_LIST_KEY)) {
    store.set(RIR_TARGET_LIST_KEY, []);
  }
  if (!store.get(RIR_IMAGE_LIST_KEY)) {
    store.set(RIR_IMAGE_LIST_KEY, []);
  }
  if (!store.get(LOCAL_PAGE_KEY)) {
    store.set(LOCAL_PAGE_KEY, store.get("page", 1));
  }
  if (!store.get(RIR_PAGE_KEY)) {
    store.set(RIR_PAGE_KEY, 1);
  }
  if (!store.get("mode")) {
    store.set("mode", "local");
  }

  if (!store.get("scanPath")) {
    store.set("scanPath", DEFAULTFILEPATH[0]);
  }

  IPCRegister(win);
  registerAiIpc();
};

/** 注册主窗口所需的文件、缓存与图片操作 IPC。 */
function getAnimatedImageExtension(format?: string): string | null {
  switch (format) {
    case "gif":
      return ".gif";
    case "webp":
      return ".webp";
    case "apng":
      return ".png";
    default:
      return null;
  }
}

async function setWindowsFileClipboard(filePath: string): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("Animated file clipboard is only supported on Windows");
  }

  const powershellPath = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    : "powershell.exe";
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Windows.Forms",
    "$paths = New-Object System.Collections.Specialized.StringCollection",
    "[void]$paths.Add($env:IMGM_CLIPBOARD_FILE)",
    "[System.Windows.Forms.Clipboard]::SetFileDropList($paths)",
  ].join("; ");

  try {
    await execFileAsync(
      powershellPath,
      ["-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-Command", command],
      {
        env: { ...process.env, IMGM_CLIPBOARD_FILE: filePath },
        timeout: 15000,
        windowsHide: true,
      },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Windows file clipboard failed: ${detail}`);
  }
}

async function cleanupRirClipboardFiles(directory: string, keepFile: string): Promise<void> {
  const cutoff = Date.now() - RIR_CLIPBOARD_FILE_MAX_AGE_MS;
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
    const filePath = path.join(directory, entry.name);
    if (filePath === keepFile) {
      return;
    }

    const stats = await fs.promises.stat(filePath);
    if (stats.mtimeMs < cutoff) {
      await fs.promises.rm(filePath, { force: true });
    }
  }));
}

async function writeAnimatedImageFileToClipboard(imageBuffer: Buffer, format?: string): Promise<void> {
  const extension = getAnimatedImageExtension(format);
  if (!extension) {
    throw new Error(`Unsupported animated image format: ${format || "unknown"}`);
  }

  const directory = path.join(app.getPath("temp"), RIR_CLIPBOARD_DIRECTORY);
  await fs.promises.mkdir(directory, { recursive: true });
  const filePath = path.join(directory, `rir-${Date.now()}-${crypto.randomUUID()}${extension}`);
  await fs.promises.writeFile(filePath, imageBuffer);

  try {
    await setWindowsFileClipboard(filePath);
  } catch (error) {
    await fs.promises.rm(filePath, { force: true }).catch(() => undefined);
    throw error;
  }

  void cleanupRirClipboardFiles(directory, filePath).catch(() => undefined);
}

function validateSearchHistoryEntry(value: unknown): SearchHistoryEntry {
  const entry = value as Partial<SearchHistoryEntry> | null;
  if (!entry || (entry.source !== "directory" && entry.source !== "ai")
    || typeof entry.label !== "string" || !Array.isArray(entry.images)
    || !entry.images.every((image) => typeof image === "string")) {
    throw new Error("搜索历史记录格式不正确");
  }
  return {
    source: entry.source,
    label: entry.label.slice(0, 2000),
    images: entry.images.slice(),
    createdAt: typeof entry.createdAt === "number" ? entry.createdAt : Date.now(),
  };
}

function readSearchHistory(): SearchHistoryState {
  const rawEntries = store.get(SEARCH_HISTORY_KEY, []) as unknown;
  const entries = Array.isArray(rawEntries)
    ? rawEntries.flatMap((item) => {
      try {
        return [validateSearchHistoryEntry(item)];
      } catch {
        return [];
      }
    })
    : [];
  const rawPointer = store.get(SEARCH_HISTORY_POINTER_KEY, entries.length - 1) as unknown;
  const requestedPointer = typeof rawPointer === "number" && Number.isInteger(rawPointer)
    ? rawPointer
    : entries.length - 1;
  return {
    entries,
    pointer: entries.length === 0 ? -1 : Math.max(0, Math.min(entries.length - 1, requestedPointer)),
  };
}

function writeSearchHistory(state: SearchHistoryState): void {
  store.set(SEARCH_HISTORY_KEY, state.entries);
  store.set(SEARCH_HISTORY_POINTER_KEY, state.pointer);
}

function IPCRegister(currentWin: BrowserWindow): void {
  ipcMain.handle("getSearchHistory", () => readSearchHistory());

  ipcMain.handle("appendSearchHistory", (_event, rawEntry: unknown) => {
    const entry = validateSearchHistoryEntry(rawEntry);
    const state = readSearchHistory();
    state.entries.push(entry);
    state.pointer = state.entries.length - 1;
    writeSearchHistory(state);
    return state;
  });

  ipcMain.handle("moveSearchHistory", (_event, rawDelta: unknown) => {
    const state = readSearchHistory();
    if (state.entries.length === 0 || (rawDelta !== -1 && rawDelta !== 1)) {
      return state;
    }
    state.pointer = Math.max(0, Math.min(state.entries.length - 1, state.pointer + rawDelta));
    writeSearchHistory(state);
    return state;
  });

  ipcMain.handle("activateLatestDirectorySearch", () => {
    const state = readSearchHistory();
    for (let index = state.entries.length - 1; index >= 0; index -= 1) {
      if (state.entries[index].source === "directory") {
        state.pointer = index;
        writeSearchHistory(state);
        return state;
      }
    }
    return state;
  });

  ipcMain.handle("scanImageIndexGroups", async (_event, rawRootPath: unknown) => {
    if (typeof rawRootPath !== "string" || !rawRootPath.trim()) {
      throw new Error("请先选择有效的图片目录");
    }
    return scanImageIndexGroups(rawRootPath, getAiConfig().imageDbPath);
  });

  ipcMain.handle("applyImageIndexSelection", async (_event, rawPayload: unknown) => {
    if (imageIndexTask) {
      throw new Error("已有图片索引任务正在执行，请等待完成");
    }
    const payload = rawPayload as { rootPath?: unknown; selectedPaths?: unknown } | null;
    if (!payload || typeof payload.rootPath !== "string" || !Array.isArray(payload.selectedPaths)
      || !payload.selectedPaths.every((item) => typeof item === "string")) {
      throw new Error("图片索引任务参数不正确");
    }

    const emit = (progress: ImageIndexProgress): void => {
      currentWin.webContents.send("imageIndexProgress", progress);
    };
    imageIndexTask = applyImageIndexSelection({
      rootPath: payload.rootPath,
      databasePath: getAiConfig().imageDbPath,
      selectedPaths: payload.selectedPaths as string[],
      onProgress: emit,
    });
    try {
      const result = await imageIndexTask;
      // The chat runtime keeps a SQLite connection. Reopen it after a write so
      // the next question always observes this task's committed index.
      await closeAiRuntime();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emit({ phase: "error", completed: 0, total: 0, added: 0, removed: 0, unchanged: 0, message });
      throw error;
    } finally {
      imageIndexTask = null;
    }
  });

  ipcMain.handle("copyRirImage", async (_event, rawUrl: unknown) => {
    try {
      if (typeof rawUrl !== "string" || !rawUrl.trim()) {
        throw new Error("远程图片地址为空");
      }

      const imageUrl = new URL(rawUrl);
      if (imageUrl.protocol !== "http:" && imageUrl.protocol !== "https:") {
        throw new Error("只支持 HTTP 或 HTTPS 图片地址");
      }

      const response = await net.fetch(imageUrl.toString());
      if (!response.ok) {
        throw new Error(`HTTP错误: ${response.status}`);
      }

      const imageBuffer = Buffer.from(await response.arrayBuffer());
      if (imageBuffer.length === 0) {
        throw new Error("远程图片内容为空");
      }

      // nativeImage 对部分 GIF/WebP 以及动图的原始解码并不稳定。
      // 先用 sharp 解码并固定为第一帧 PNG，剪贴板本身也只能保存静态图片。
      let pngBuffer: Buffer;
      let sourceFormat: string | undefined;
      let frameCount = 1;
      try {
        const sourceImage = sharp(imageBuffer, { animated: false, failOn: "none" });
        const metadata = await sourceImage.metadata();
        sourceFormat = metadata.format;
        frameCount = metadata.pages || 1;
        pngBuffer = await sourceImage.rotate().png().toBuffer();
      } catch (decodeError) {
        const contentType = response.headers.get("content-type") || "未知类型";
        const detail = decodeError instanceof Error ? decodeError.message : String(decodeError);
        throw new Error(`远程图片解码失败（${contentType}，${imageBuffer.length} 字节）：${detail}`);
      }

      const image = nativeImage.createFromBuffer(pngBuffer);
      if (image.isEmpty()) {
        throw new Error("远程图片解码失败，无法写入剪贴板");
      }

      if (frameCount > 1 && process.platform === "win32") {
        await writeAnimatedImageFileToClipboard(imageBuffer, sourceFormat);
        return { success: true, animated: true, clipboardMode: "file" };
      }

      if (frameCount > 1) {
        // 图片剪贴板通常只接受位图；同时写入内联 HTML，让支持富文本的目标应用保留动图。
        const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
        const mimeType = contentType?.startsWith("image/")
          ? contentType
          : ({ gif: "image/gif", webp: "image/webp", apng: "image/apng" } as Record<string, string>)[sourceFormat || ""] || "image/gif";
        const dataUrl = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
        clipboard.write({
          image,
          html: `<img src="${dataUrl}" alt="RIR image" />`,
        });
      } else {
        clipboard.writeImage(image);
      }

      return { success: true, animated: frameCount > 1, clipboardMode: frameCount > 1 ? "html" : "image" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("复制远程图片失败:", message);
      return { success: false, error: message };
    }
  });

  ipcMain.handle("openDirectory", async () => {
    const result = await dialog.showOpenDialog(currentWin, {
      properties: ["openDirectory", "multiSelections"],
    });

    if (result.filePaths.length === 0) {
      result.filePaths = DEFAULTFILEPATH;
    }

    return result.filePaths;
  });

  ipcMain.handle("scanDir", (_event, dirPath: string) => {
    const imgList = scanImagesInDirectory(dirPath);
    store.set(LOCAL_TARGET_LIST_KEY, imgList);
    store.set(LOCAL_IMAGE_LIST_KEY, imgList);
    store.set(LOCAL_PAGE_KEY, 1);
    return imgList;
  });

  ipcMain.handle("checkDir", (_event, dirPath: string) => {
    return fs.existsSync(dirPath);
  });

  ipcMain.handle("getData", (_event, key: string) => {
    return store.get(key);
  });

  ipcMain.handle("setData", (_event, key: string, data: unknown) => {
    store.set(key, data);

    if (key === FORWARD_RENDERER_CONSOLE_KEY && typeof data === "boolean") {
      forwardRendererConsole = data;
    }
  });

  ipcMain.handle("showInfo", (_event, message: string) => {
    console.log("showInfo:", message);
  });

  ipcMain.handle("getUserInfo", () => {
    return getCurrentUserInfo();
  });

  ipcMain.on("message", (_event, msg: string) => {
    const notification = new Notification({
      title: "图片检索工具通知",
      body: msg,
    });
    notification.show();
  });

  ipcMain.handle("getAllStore", () => {
    return store.store;
  });
}

/** 递归遍历目录并收集图片路径。 */
function traverseDirectory(dirPath: string, imagesList: string[]): void {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      traverseDirectory(fullPath, imagesList);
    } else if (stat.isFile() && isImageFile(file)) {
      imagesList.push(fullPath);
    }
  });
}

/** 判断文件扩展名是否属于支持的图片格式。 */
function isImageFile(file: string): boolean {
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif"];
  const ext = path.extname(file).toLowerCase();
  return imageExtensions.includes(ext);
}

/** 扫描目录并返回全部图片路径。 */
function scanImagesInDirectory(dirPath: string): string[] {
  const dataList: string[] = [];
  traverseDirectory(dirPath, dataList);
  return dataList;
}

/** 获取当前操作系统用户信息。 */
function getCurrentUserInfo(): os.UserInfo<string> {
  return os.userInfo();
}

/** 获取当前运行平台。 */
function getCurrentPlatform(): NodeJS.Platform {
  return os.platform();
}

app.whenReady().then(() => {
  createWindow();
});

app.on("before-quit", () => {
  void closeAiRuntime();
});
