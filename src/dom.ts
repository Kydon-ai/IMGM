type GalleryMode = "local" | "rir";

const GALLERY_STORAGE = {
  local: { targetList: "localTargetList", imageList: "localImgList", page: "localPage", pageSize: 8 },
  rir: { targetList: "rirTargetList", imageList: "rirImgList", page: "rirPage", pageSize: 12 },
} as const;

/** 获取当前图片列表所属模块，缺省时使用本地图片库。 */
async function getCurrentGalleryMode(): Promise<GalleryMode> {
  const mode = await window.electron.getData<string>("mode");
  return mode === "rir" ? "rir" : "local";
}

/** 更新当前模块的分页信息。 */
async function updatePagination(mode?: GalleryMode): Promise<void> {
  const activeMode = mode || (await getCurrentGalleryMode());
  const storage = GALLERY_STORAGE[activeMode];
  const page = (await window.electron.getData<number>(storage.page)) || 1;
  const imageList = (await window.electron.getData<string[]>(storage.imageList)) || [];
  getElementByIdOrThrow<HTMLElement>("page-num").textContent = String(page);
  getElementByIdOrThrow<HTMLElement>("all-page-num").textContent = String(getMaxPage(imageList, storage.pageSize));
}

/** 切换当前展示模块，并刷新该模块自己的图片列表和分页。 */
async function switchGalleryMode(mode: GalleryMode): Promise<void> {
  await window.electron.setData("mode", mode);
  await updatePagination(mode);
  await window.electron.refresh();
}

document.addEventListener("DOMContentLoaded", async () => {
  window.electron.ipcRenderer.on("modalData", () => {
    window.electron.refresh();
  });

  bindCopyActions();
  bindRenameActions();
  bindSidebarNavigation();
  bindSettingsPopover();

  await window.electron.refresh();
  await updatePagination();

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
      await window.electron.setData("mode", "local");
      await updatePagination("local");
      window.electron.showMessage("success", "搜索完毕!!!");
      await window.electron.refresh();
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
    const mode = await getCurrentGalleryMode();
    const storage = GALLERY_STORAGE[mode];
    let page = await window.electron.getData<number>(storage.page);
    page = Math.max((page || 1) - 1, 1);

    await window.electron.setData(storage.page, page);
    await window.electron.refresh();
    getElementByIdOrThrow<HTMLElement>("page-num").textContent = String(page);
  });

  getElementByIdOrThrow<HTMLButtonElement>("backward").addEventListener("click", async () => {
    const mode = await getCurrentGalleryMode();
    const storage = GALLERY_STORAGE[mode];
    let page = (await window.electron.getData<number>(storage.page)) || 1;
    const list = (await window.electron.getData<string[]>(storage.imageList)) || [];
    const maxPage = getMaxPage(list, storage.pageSize);
    page = Math.min(maxPage, page + 1);

    await window.electron.setData(storage.page, page);
    await window.electron.refresh();
    getElementByIdOrThrow<HTMLElement>("page-num").textContent = String(page);
  });

  getElementByIdOrThrow<HTMLButtonElement>("check-cache").addEventListener("click", async () => {
    const store = await window.electron.getCache();
    console.log("打印当前缓存", store);
  });

  getElementByIdOrThrow<HTMLButtonElement>("search-button").addEventListener("click", async () => {
    const searchText = getElementByIdOrThrow<HTMLInputElement>("search-input").value;
    const targetList = (await window.electron.getData<string[]>(GALLERY_STORAGE.local.targetList)) || [];
    const imgList = filterPictures(targetList, searchText);
    await window.electron.setData(GALLERY_STORAGE.local.imageList, imgList);
    await window.electron.setData(GALLERY_STORAGE.local.page, 1);
    await window.electron.setData("mode", "local");

    await updatePagination("local");
    await window.electron.refresh();
  });

  getElementByIdOrThrow<HTMLButtonElement>("rir-search-button").addEventListener("click", async () => {
    const searchText = getElementByIdOrThrow<HTMLInputElement>("rir-search-input").value;
    const targetList = (await window.electron.getData<string[]>(GALLERY_STORAGE.rir.targetList)) || [];
    const imgList = filterPictures(targetList, searchText);
    await window.electron.setData(GALLERY_STORAGE.rir.imageList, imgList);
    await window.electron.setData(GALLERY_STORAGE.rir.page, 1);
    await window.electron.setData("mode", "rir");

    await updatePagination("rir");
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
      await window.electron.setData(GALLERY_STORAGE.rir.targetList, result.list);
      await window.electron.setData(GALLERY_STORAGE.rir.imageList, result.list);
      await window.electron.setData(GALLERY_STORAGE.rir.page, 1);
      await window.electron.setData("mode", "rir");
      getElementByIdOrThrow<HTMLElement>("rir-file-path").textContent = result.target;
      await updatePagination("rir");
      await window.electron.refresh();
    } catch (error) {
      console.error("Could not parse RIR file: ", error);
    }
  });
});

/** 绑定 QQ 风格侧栏导航，点击后滚动到对应功能区域。 */
function bindSidebarNavigation(): void {
  const navItems = Array.from(document.querySelectorAll<HTMLButtonElement>(".imgm-nav-item"));
  const appShell = getElementByIdOrThrow<HTMLElement>("app-shell");
  const pageSections = Array.from(document.querySelectorAll<HTMLElement>(".browser-section[data-page-section]"));

  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      const targetId = item.dataset.target;
      if (!targetId) {
        return;
      }

      const isRirPage = targetId === "rir-section";
      const isAiEntry = targetId === "ai-panel";
      const pageTargetId = isRirPage ? "rir-section" : "local-section";

      pageSections.forEach((section) => {
        section.classList.toggle("active", section.id === pageTargetId);
      });
      appShell.classList.toggle("rir-mode", isRirPage);
      void switchGalleryMode(isRirPage ? "rir" : "local");

      document.getElementById(isAiEntry ? "ai-panel" : pageTargetId)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      navItems.forEach((navItem) => {
        const isActive = navItem === item;
        navItem.classList.toggle("active", isActive);
        if (isActive) {
          navItem.setAttribute("aria-current", "page");
        } else {
          navItem.removeAttribute("aria-current");
        }
      });
    });
  });
}

/** 打开或关闭侧栏左下角的设置浮层。 */
function bindSettingsPopover(): void {
  const settingsButton = getElementByIdOrThrow<HTMLButtonElement>("settings-button");
  const settingsPopover = getElementByIdOrThrow<HTMLDivElement>("settings-popover");
  const closeButton = getElementByIdOrThrow<HTMLButtonElement>("settings-close");
  const settingsPath = getElementByIdOrThrow<HTMLElement>("settings-path");
  const consoleToggle = getElementByIdOrThrow<HTMLInputElement>("forward-renderer-console");

  const closePopover = (): void => {
    settingsPopover.hidden = true;
    settingsButton.setAttribute("aria-expanded", "false");
  };

  settingsButton.addEventListener("click", async () => {
    const willOpen = settingsPopover.hidden;
    settingsPopover.hidden = !willOpen;
    settingsButton.setAttribute("aria-expanded", String(willOpen));

    if (willOpen) {
      const [path, consoleForwardingEnabled] = await Promise.all([
        window.electron.getData<string>("scanPath"),
        window.electron.getData<boolean>("forwardRendererConsole"),
      ]);
      settingsPath.textContent = path || "未选择";
      consoleToggle.checked = consoleForwardingEnabled !== false;
    }
  });

  closeButton.addEventListener("click", closePopover);

  consoleToggle.addEventListener("change", async () => {
    const enabled = consoleToggle.checked;

    try {
      await window.electron.setData("forwardRendererConsole", enabled);
    } catch (error) {
      consoleToggle.checked = !enabled;
      console.error("保存终端日志开关失败:", error);
    }
  });
}

/** 绑定本地和远程图片的复制操作。 */
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
          window.electron.showMessage(
            result.success ? "success" : "error",
            result.success
              ? result.clipboardMode === "file" ? "复制成功（动图文件已写入剪贴板）" : result.animated ? "复制成功（已附带动图数据）" : "复制成功"
              : `复制失败：${result.error || "远程图片无法写入剪贴板"}`,
          );
        } else {
          window.electron.showMessage("error", "未知模式，请先以任意一种方式获取图片列表！！");
        }
      } catch (err) {
        console.error("Could not copy image: ", err);
      }
    });
  });
}

/** 绑定图片重命名模态框入口。 */
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

/** 重置分页并刷新图片列表。 */
async function refreshAndResetPage(): Promise<void> {
  const mode = await getCurrentGalleryMode();
  await window.electron.setData(GALLERY_STORAGE[mode].page, 1);
  await updatePagination(mode);

  await window.electron.refresh();
}

/** 根据当前模块的每页数量计算最大页数。 */
function getMaxPage(imgList: string[], pageSize: number): number {
  if (!imgList || imgList.length === 0) {
    return 1;
  }
  return Math.floor(imgList.length / pageSize) + (imgList.length % pageSize ? 1 : 0);
}

/** 获取必需 DOM 元素，不存在时立即抛错。 */
function getElementByIdOrThrow<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element not found: ${id}`);
  }
  return element as T;
}

/** 通过浏览器剪贴板 API 复制图片二进制。 */
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

/** 使用 DOM 选区复制本地图片。 */
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

/** 转义用户输入中的正则表达式字符。 */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 使用字符顺序模糊匹配过滤图片名称。 */
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

/** 动态加载远程 RIR 模块并返回图片清单。 */
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
