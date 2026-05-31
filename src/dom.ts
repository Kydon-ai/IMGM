const PAGE_SIZE = 8;

document.addEventListener("DOMContentLoaded", async () => {
  for (const name in window.electron) {
    console.log("打印：", name, window.electron[name as keyof typeof window.electron]);
  }

  window.electron.ipcRenderer.on("modalData", () => {
    window.electron.refresh();
  });

  bindCopyActions();
  bindRenameActions();

  await window.electron.refresh();

  const filePathElement = getElementByIdOrThrow<HTMLElement>("file-path");
  const historyPath = await window.electron.getData<string>("scanPath");
  if (historyPath) {
    filePathElement.textContent = historyPath;
  } else {
    const userInfo = await window.electron.getUser();
    filePathElement.textContent = `C:\\Users\\${userInfo.username}\\Pictures`;
  }

  getElementByIdOrThrow<HTMLButtonElement>("select-folder").addEventListener("click", async () => {
    let filePath = await window.electron.openDirectory();
    const targetPath = filePath[0];
    filePathElement.textContent = targetPath;
    await window.electron.setData("scanPath", targetPath);
  });

  getElementByIdOrThrow<HTMLButtonElement>("clear-path").addEventListener("click", () => {
    filePathElement.textContent = "";
  });

  getElementByIdOrThrow<HTMLButtonElement>("start-search").addEventListener("click", async () => {
    const filePath = filePathElement.textContent || "";

    if (filePath && (await window.electron.checkDir(filePath))) {
      await window.electron.scanDir(filePath);
      window.electron.showMessage("success", "搜索完毕!!!");
      await window.electron.setData("mode", "local");
    } else {
      alert("文件路径为空或者无效");
    }
  });

  getElementByIdOrThrow<HTMLButtonElement>("refresh-pic").addEventListener("click", async () => {
    await refreshAndResetPage();
  });

  getElementByIdOrThrow<HTMLButtonElement>("rir-refresh-pic").addEventListener("click", async () => {
    await refreshAndResetPage();
  });

  getElementByIdOrThrow<HTMLButtonElement>("forward").addEventListener("click", async () => {
    let page = await window.electron.getData<number>("page");
    page = Math.max((page || 1) - 1, 1);

    await window.electron.setData("page", page);
    await window.electron.refresh();
    getElementByIdOrThrow<HTMLElement>("page-num").textContent = String(page);
  });

  getElementByIdOrThrow<HTMLButtonElement>("backward").addEventListener("click", async () => {
    let page = (await window.electron.getData<number>("page")) || 1;
    const list = (await window.electron.getData<string[]>("imgList")) || [];
    const maxPage = getMaxPage(list);
    page = Math.min(maxPage, page + 1);

    await window.electron.setData("page", page);
    await window.electron.refresh();
    getElementByIdOrThrow<HTMLElement>("page-num").textContent = String(page);
  });

  getElementByIdOrThrow<HTMLButtonElement>("check-cache").addEventListener("click", async () => {
    const store = await window.electron.getCache();
    console.log("打印当前缓存", store);
  });

  getElementByIdOrThrow<HTMLButtonElement>("search-button").addEventListener("click", async () => {
    const searchText = getElementByIdOrThrow<HTMLInputElement>("search-input").value;
    const targetList = (await window.electron.getData<string[]>("targetList")) || [];
    const imgList = filterPictures(targetList, searchText);
    await window.electron.setData("imgList", imgList);

    getElementByIdOrThrow<HTMLElement>("all-page-num").textContent = String(getMaxPage(imgList));
    await window.electron.refresh();
  });

  getElementByIdOrThrow<HTMLButtonElement>("rir-search-button").addEventListener("click", async () => {
    const searchText = getElementByIdOrThrow<HTMLInputElement>("rir-search-input").value;
    const targetList = (await window.electron.getData<string[]>("targetList")) || [];
    const imgList = filterPictures(targetList, searchText);
    await window.electron.setData("imgList", imgList);

    getElementByIdOrThrow<HTMLElement>("all-page-num").textContent = String(getMaxPage(imgList));
    await window.electron.refresh();
  });

  getElementByIdOrThrow<HTMLButtonElement>("rir-parse-button").addEventListener("click", async () => {
    const parseInput = getElementByIdOrThrow<HTMLInputElement>("rir-parse-input").value;
    const url = `${parseInput}?timestamp=${Date.now()}`;

    try {
      const result = await loadModuleVariable(url);
      if (!result) {
        window.electron.showMessage("error", "RIR 解析失败");
        return;
      }

      result.list = result.list.map((element) => result.target + element);
      await window.electron.setData("targetList", result.list);
      await window.electron.setData("imgList", result.list);
      await window.electron.refresh();

      getElementByIdOrThrow<HTMLElement>("rir-file-path").textContent = result.target;
      await window.electron.setData("mode", "rir");

      const maxPageList = (await window.electron.getData<string[]>("imgList")) || [];
      getElementByIdOrThrow<HTMLElement>("all-page-num").textContent = String(getMaxPage(maxPageList));
    } catch (error) {
      console.error("Could not parse RIR file: ", error);
    }
  });
});

function bindCopyActions(): void {
  document.querySelectorAll<HTMLButtonElement>(".copy-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const img = button.previousElementSibling;
      if (!(img instanceof HTMLImageElement)) {
        return;
      }

      try {
        const mode = await window.electron.getData<string>("mode");
        if (mode === "local") {
          copyImage(img.src);
        } else if (mode === "rir") {
          const result = await window.electron.clipboard.copyWebImage(img.src);
          window.electron.showMessage(result.success ? "success" : "error", `复制${result.success ? "成功" : "失败"}`);
        } else {
          window.electron.showMessage("error", "未知模式，请先以任意一种方式获取图片列表！！");
        }
      } catch (err) {
        console.error("Could not copy image: ", err);
      }
    });
  });
}

function bindRenameActions(): void {
  document.querySelectorAll<HTMLButtonElement>(".rename-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const maybeImg = button.previousElementSibling?.previousElementSibling;
      if (!(maybeImg instanceof HTMLImageElement)) {
        return;
      }

      try {
        await window.electron.openRenameModel({ src: maybeImg.src });
      } catch (err) {
        console.error("Could not open modal: ", err);
      }
    });
  });
}

async function refreshAndResetPage(): Promise<void> {
  await window.electron.setData("page", 1);
  getElementByIdOrThrow<HTMLElement>("page-num").textContent = "1";

  const maxPageList = (await window.electron.getData<string[]>("imgList")) || [];
  getElementByIdOrThrow<HTMLElement>("all-page-num").textContent = String(getMaxPage(maxPageList));

  await window.electron.refresh();
}

function getMaxPage(imgList: string[]): number {
  if (!imgList || imgList.length === 0) {
    return 1;
  }
  return Math.floor(imgList.length / PAGE_SIZE) + (imgList.length % PAGE_SIZE ? 1 : 0);
}

function getElementByIdOrThrow<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element not found: ${id}`);
  }
  return element as T;
}

async function copyImageToClipboard(imageUrl: string): Promise<void> {
  const response = await fetch(imageUrl);
  const contentType = response.headers.get("Content-Type") || "image/png";
  const isSupportedImageType = contentType.startsWith("image/");
  if (!isSupportedImageType) {
    throw new Error("Unsupported image type");
  }

  const blob = await response.blob();
  const imgElement = new Image();
  imgElement.src = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    imgElement.onload = async () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context is null"));
          return;
        }

        if (contentType === "image/gif") {
          const item = new ClipboardItem({ "image/gif": blob });
          await navigator.clipboard.write([item]);
          resolve();
        } else {
          canvas.width = imgElement.width;
          canvas.height = imgElement.height;
          ctx.drawImage(imgElement, 0, 0);

          canvas.toBlob(async (newBlob) => {
            if (!newBlob) {
              reject(new Error("Canvas toBlob failed"));
              return;
            }
            const item = new ClipboardItem({ "image/png": newBlob });
            await navigator.clipboard.write([item]);
            resolve();
          }, "image/png");
        }
      } catch (error) {
        reject(error);
      }
    };

    imgElement.onerror = () => reject(new Error("Image load failed"));
  });
}

function copyImage(imgUrl: string): void {
  const tempImg = document.createElement("img");
  tempImg.crossOrigin = "Anonymous";
  tempImg.src = imgUrl;
  document.body.appendChild(tempImg);

  const range = document.createRange();
  range.selectNode(tempImg);

  const selection = window.getSelection();
  if (!selection) {
    document.body.removeChild(tempImg);
    return;
  }

  selection.removeAllRanges();
  selection.addRange(range);

  document.execCommand("copy");

  selection.removeAllRanges();
  document.body.removeChild(tempImg);

  window.electron.showMessage("success", "图片已复制到粘贴板");
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function filterPictures(picList: string[], userInput: string): string[] {
  const escapedInput = userInput.split("").map(escapeRegExp).join("(.*?)");
  const regexPattern = `(.*?)${escapedInput}(.*?)`;
  const regex = new RegExp(regexPattern, "i");

  return picList.filter((pic) => {
    const fileName = pic.split(/[\\/]/).pop() || "";
    const lastDotIndex = fileName.lastIndexOf(".");
    const nameWithoutExtension =
      lastDotIndex !== -1 ? fileName.substring(0, lastDotIndex) : fileName;
    return regex.test(nameWithoutExtension);
  });
}

type RirPayload = {
  target: string;
  list: string[];
};

async function loadModuleVariable(url: string): Promise<RirPayload | null> {
  try {
    const module = await import(url);
    if (module.default) {
      return module.default as RirPayload;
    }
    throw new Error("模块未导出目标变量");
  } catch (error) {
    console.error("加载模块失败:", error);
    return null;
  }
}
