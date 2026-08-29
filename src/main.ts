import { app, BrowserWindow, ipcMain, dialog, Notification } from "electron";
import Store from "electron-store";
import fs from "fs";
import os from "os";
import path from "path";
import { closeAiRuntime, registerAiIpc } from "./ai/ipc";

const store = new Store();
const FORWARD_RENDERER_CONSOLE_KEY = "forwardRendererConsole";
let forwardRendererConsole = store.get(FORWARD_RENDERER_CONSOLE_KEY, true);

const platform = getCurrentPlatform();
const DEFAULTFILEPATH: string[] = [];
if (platform === "linux") {
  DEFAULTFILEPATH.push(`${getCurrentUserInfo().homedir}/图片`);
} else {
  DEFAULTFILEPATH.push(`C:\\Users\\${getCurrentUserInfo().username}\\Pictures`);
}

let win: BrowserWindow | null = null;
let modalWindow: BrowserWindow | null = null;

type ModalFilePayload = {
  originPath: string;
  changeName: string;
  changeFileName: string;
};

const createWindow = (): void => {
  win = new BrowserWindow({
    width: 1403,
    height: 670,
    minWidth: 1403,
    minHeight: 658,
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

  if (!store.get("targetList")) {
    store.set("targetList", []);
    store.set("imgList", []);
  }

  if (!store.get("scanPath")) {
    store.set("scanPath", DEFAULTFILEPATH[0]);
  }

  IPCRegister(win);
  registerAiIpc();
};

/** 注册主窗口所需的文件、缓存与重命名 IPC。 */
function IPCRegister(currentWin: BrowserWindow): void {
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
    store.set("targetList", imgList);
    store.set("imgList", imgList);
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

  ipcMain.on("rename-file", (_event, payload: { oldName: string; newName: string }) => {
    const newPath = path.join(path.dirname(payload.oldName), payload.newName);
    fs.rename(payload.oldName, newPath, (err) => {
      if (err) {
        console.error("重命名失败:", err);
        return;
      }
      console.log(`文件重命名为: ${payload.newName}`);
    });
  });

  ipcMain.handle("getAllStore", () => {
    return store.store;
  });

  ipcMain.handle("openRenameModel", (_event, props: { src: string }) => {
    return createModalWindow(props);
  });

  ipcMain.on("modalToOther", (_event, filePayload: ModalFilePayload) => {
    const imgList = (store.get("targetList") as string[]) || [];
    filePayload.originPath = convertFileUrlToPath(filePayload.originPath);

    for (let i = 0; i < imgList.length; i += 1) {
      if (imgList[i] === filePayload.originPath) {
        const targetList = imgList[i].split("/");
        targetList[targetList.length - 1] = filePayload.changeName;
        imgList[i] = targetList.join("/");
        break;
      }
    }

    store.set("imgList", imgList);
    rename(filePayload.originPath, filePayload.changeFileName);

    if (win) {
      win.webContents.send("modalData", filePayload);
    }
  });
}

/** 创建图片重命名模态窗口。 */
function createModalWindow(props: { src: string }): string {
  if (modalWindow) {
    return "新建失败，模态框已存在";
  }

  if (!win) {
    return "新建失败，主窗口不存在";
  }

  modalWindow = new BrowserWindow({
    width: 400,
    height: 300,
    parent: win,
    modal: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  modalWindow.loadFile(path.join(__dirname, "../modal.html"));

  modalWindow.webContents.on("did-finish-load", () => {
    if (modalWindow) {
      modalWindow.webContents.send("data-from-main", props);
    }
  });

  modalWindow.on("closed", () => {
    modalWindow = null;
  });

  return "新建成功";
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

/** 将 file URL 转换为当前平台的文件系统路径。 */
function convertFileUrlToPath(fileUrl: string): string {
  const normalizedPath = fileUrl
    .replace(/^file:\/\//, "")
    .replace(/^\/([a-z]:)/i, "$1")
    .replace(/\//g, path.sep);

  return normalizedPath;
}

/** 把图片文件重命名为用户指定名称。 */
function rename(oldPath: string, fileName: string): void {
  const newPath = path.join(path.dirname(oldPath), fileName);
  fs.rename(oldPath, newPath, (err) => {
    if (err) {
      console.error("重命名失败:", err);
      return;
    }
    console.log(`文件重命名为: ${fileName},路径在${newPath}`);
  });
}
