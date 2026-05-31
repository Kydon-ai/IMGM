import { clipboard, contextBridge, ipcRenderer, nativeImage } from "electron";
import { Notyf } from "notyf";

type CopyWebImageResult = {
  success: boolean;
  error?: string;
};

contextBridge.exposeInMainWorld("electron", {
  clipboard: {
    copyWebImage: async (url: string): Promise<CopyWebImageResult> => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP错误: ${response.status}`);
        }

        const blob = await response.blob();

        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === "string") {
              resolve(reader.result);
              return;
            }
            reject(new Error("图片读取失败"));
          };
          reader.onerror = () => reject(reader.error || new Error("图片读取失败"));
          reader.readAsDataURL(blob);
        });

        const image = nativeImage.createFromDataURL(dataUrl);
        clipboard.writeImage(image);

        return { success: true };
      } catch (error) {
        const err = error as Error;
        console.error("复制失败:", err);
        return { success: false, error: err.message };
      }
    },
  },
  ipcRenderer: {
    send: (channel: string, data: unknown) => ipcRenderer.send(channel, data),
    on: (channel: string, func: (...args: unknown[]) => void) =>
      ipcRenderer.on(channel, (_event, ...args) => func(...args)),
  },
  openDirectory: () => ipcRenderer.invoke("openDirectory"),
  scanDir: (dirPath: string) => ipcRenderer.invoke("scanDir", dirPath),
  checkDir: (dirPath: string) => ipcRenderer.invoke("checkDir", dirPath),
  getData: (key: string) => ipcRenderer.invoke("getData", key),
  setData: (key: string, data: unknown) => {
    ipcRenderer.invoke("setData", key, data);
  },
  refresh: () => {
    refreshPage();
    showMessage("success", "刷新当前浏览");
  },
  sendMsg: (msg: string) => ipcRenderer.send("message", msg),
  showMessage: (type: string, msg: string) => {
    showMessage(type, msg);
  },
  getUser: () => {
    const userInfo = ipcRenderer.invoke("getUserInfo");
    showMessage("success", `当前用户：${String((userInfo as any)?.username || "")}`);
    return userInfo;
  },
  getCache: async () => {
    const store = await ipcRenderer.invoke("getAllStore");
    return store;
  },
  openRenameModel: async (datas: { src: string }) => {
    const msg = await ipcRenderer.invoke("openRenameModel", datas);
    return msg;
  },
});

function showMessage(type: string, msg: string): void {
  const notyf = new Notyf({
    duration: 1500,
    position: { x: "center", y: "top" },
    ripple: true,
  });

  if (type === "success") {
    notyf.success(msg);
  } else if (type === "error" || type === "warn") {
    notyf.error(msg);
  } else {
    notyf.error("未知消息类型！");
  }
}

async function refreshPage(): Promise<void> {
  const imgList = (await ipcRenderer.invoke("getData", "imgList")) as string[];
  const currentPage = (await ipcRenderer.invoke("getData", "page")) as number;

  const pageSize = 8;
  const pageOfImages = getImageList(imgList || [], currentPage || 1, pageSize);
  setImgUrl(pageOfImages);
}

function getImageList(imgList: string[], currentPage: number, pageSize: number): string[] {
  const left = pageSize * (currentPage - 1);
  const right = Math.min(left + pageSize, imgList.length);
  const pageOfImages = imgList.slice(left, right);

  if (!pageOfImages || pageOfImages.length === 0) {
    return [];
  }

  return pageOfImages;
}

function setImgUrl(pageOfImages: string[]): void {
  const imgElements = document.getElementsByTagName("img");
  const renameElements = document.getElementsByClassName("rename-btn");

  for (let i = 0; i < imgElements.length; i += 1) {
    const renameElement = renameElements[i] as HTMLButtonElement | undefined;
    if (i < pageOfImages.length) {
      imgElements[i].src = pageOfImages[i];
      if (renameElement) {
        renameElement.disabled = false;
      }
    } else {
      imgElements[i].src = "./public/img/404.png";
      if (renameElement) {
        renameElement.disabled = true;
      }
    }
  }
}
