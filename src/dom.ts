type GalleryMode = "local" | "rir";

const GALLERY_STORAGE = {
  local: { targetList: "localTargetList", imageList: "localImgList", page: "localPage", pageSize: 8 },
  rir: { targetList: "rirTargetList", imageList: "rirImgList", page: "rirPage", pageSize: 12 },
} as const;

type ImageIndexItem = {
  filePath: string;
  fileName: string;
  fileUrl: string;
  indexed: boolean;
};

type ImageIndexGroup = {
  directoryPath: string;
  images: ImageIndexItem[];
};

type ImageIndexProgress = {
  phase: "starting" | "processing" | "completed" | "error";
  currentPath?: string;
  completed: number;
  total: number;
  added: number;
  removed: number;
  unchanged: number;
  message?: string;
};

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
  bindEmbeddingIndex();

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

/** 管理指定目录的图片向量索引；默认仅勾选已在数据库中的图片。 */
function bindEmbeddingIndex(): void {
  const openButton = getElementByIdOrThrow<HTMLButtonElement>("add-embedding");
  const dialog = getElementByIdOrThrow<HTMLDivElement>("embedding-index-dialog");
  const groupsContainer = getElementByIdOrThrow<HTMLDivElement>("embedding-index-groups");
  const title = getElementByIdOrThrow<HTMLElement>("embedding-index-path");
  const summary = getElementByIdOrThrow<HTMLElement>("embedding-index-summary");
  const applyButton = getElementByIdOrThrow<HTMLButtonElement>("embedding-index-apply");
  const cancelButton = getElementByIdOrThrow<HTMLButtonElement>("embedding-index-cancel");
  const progressCard = getElementByIdOrThrow<HTMLElement>("embedding-index-progress");
  const progressBar = getElementByIdOrThrow<HTMLProgressElement>("embedding-index-progress-bar");
  const progressTitle = getElementByIdOrThrow<HTMLElement>("embedding-index-progress-title");
  const progressFile = getElementByIdOrThrow<HTMLElement>("embedding-index-progress-file");
  let rootPath = "";
  let groups: ImageIndexGroup[] = [];
  let selected = new Set<string>();

  const updateSummary = (): void => {
    const total = groups.reduce((count, group) => count + group.images.length, 0);
    summary.textContent = `已选择 ${selected.size} / ${total} 张图片（已索引图片默认勾选）`;
  };
  const updateGroupCheckboxes = (): void => {
    groupsContainer.querySelectorAll<HTMLInputElement>("[data-index-group]").forEach((checkbox) => {
      const group = groups[Number(checkbox.dataset.indexGroup)];
      const count = group?.images.filter((item) => selected.has(item.filePath)).length || 0;
      checkbox.checked = count > 0 && count === (group?.images.length || 0);
      checkbox.indeterminate = count > 0 && count < (group?.images.length || 0);
    });
    groupsContainer.querySelectorAll<HTMLInputElement>("[data-index-file]").forEach((checkbox) => {
      checkbox.checked = selected.has(checkbox.dataset.indexFile || "");
    });
    updateSummary();
  };
  const renderGroups = (): void => {
    groupsContainer.replaceChildren();
    groups.forEach((group, groupIndex) => {
      const section = document.createElement("section");
      section.className = "embedding-index-group";
      const header = document.createElement("div");
      header.className = "embedding-index-group-header";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.indexGroup = String(groupIndex);
      checkbox.setAttribute("aria-label", `选择目录 ${group.directoryPath} 中的全部图片`);
      checkbox.addEventListener("change", () => {
        group.images.forEach((item) => checkbox.checked ? selected.add(item.filePath) : selected.delete(item.filePath));
        updateGroupCheckboxes();
      });
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "embedding-index-group-toggle";
      toggle.setAttribute("aria-expanded", "false");
      const label = document.createElement("span");
      label.textContent = `${group.directoryPath}（${group.images.length} 张）`;
      toggle.append("›", label);
      const items = document.createElement("div");
      items.className = "embedding-index-items";
      items.hidden = true;
      toggle.addEventListener("click", () => {
        const opening = items.hidden;
        items.hidden = !opening;
        toggle.setAttribute("aria-expanded", String(opening));
      });
      header.append(checkbox, toggle);
      group.images.forEach((item) => {
        const row = document.createElement("label");
        row.className = "embedding-index-item";
        const fileCheckbox = document.createElement("input");
        fileCheckbox.type = "checkbox";
        fileCheckbox.dataset.indexFile = item.filePath;
        fileCheckbox.checked = selected.has(item.filePath);
        fileCheckbox.addEventListener("change", () => {
          fileCheckbox.checked ? selected.add(item.filePath) : selected.delete(item.filePath);
          updateGroupCheckboxes();
        });
        const name = document.createElement("span");
        name.className = "embedding-index-file-name";
        name.textContent = item.fileName;
        name.title = item.filePath;
        const preview = document.createElement("img");
        preview.className = "embedding-index-preview";
        preview.src = item.fileUrl;
        preview.alt = item.fileName;
        preview.addEventListener("error", () => { preview.src = "./public/img/404.png"; });
        row.append(fileCheckbox, name, preview);
        items.append(row);
      });
      section.append(header, items);
      groupsContainer.append(section);
    });
    updateGroupCheckboxes();
  };
  const closeDialog = (): void => { dialog.hidden = true; };
  const showProgress = (progress: ImageIndexProgress): void => {
    progressCard.hidden = false;
    const percent = progress.total === 0 ? (progress.phase === "completed" ? 100 : 0) : Math.round((progress.completed / progress.total) * 100);
    progressBar.value = percent;
    progressTitle.textContent = `${progress.message || "正在处理图片索引"} · ${progress.completed}/${progress.total}`;
    progressFile.textContent = progress.currentPath || "";
    progressCard.classList.toggle("is-error", progress.phase === "error");
  };

  window.electron.onImageIndexProgress(showProgress);
  openButton.addEventListener("click", async () => {
    const pathElement = getElementByIdOrThrow<HTMLElement>("file-path");
    rootPath = pathElement.textContent?.trim() || "";
    if (!rootPath || !(await window.electron.checkDir(rootPath))) {
      window.electron.showMessage("error", "请先选择有效的图片目录");
      return;
    }
    dialog.hidden = false;
    title.textContent = rootPath;
    summary.textContent = "正在扫描图片…";
    groupsContainer.replaceChildren();
    applyButton.disabled = true;
    try {
      groups = await window.electron.scanImageIndexGroups(rootPath);
      selected = new Set(groups.flatMap((group) => group.images.filter((item) => item.indexed).map((item) => item.filePath)));
      renderGroups();
      applyButton.disabled = false;
      if (groups.length === 0) {
        summary.textContent = "该路径下未发现支持的图片文件";
      }
    } catch (error) {
      groups = [];
      summary.textContent = error instanceof Error ? error.message : String(error);
      window.electron.showMessage("error", "扫描图片目录失败");
    }
  });
  cancelButton.addEventListener("click", closeDialog);
  dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDialog(); });
  applyButton.addEventListener("click", async () => {
    applyButton.disabled = true;
    closeDialog();
    showProgress({ phase: "starting", completed: 0, total: 0, added: 0, removed: 0, unchanged: 0, message: "图片索引任务已提交" });
    try {
      const result = await window.electron.applyImageIndexSelection({ rootPath, selectedPaths: [...selected] });
      window.electron.showMessage("success", `索引完成：新增 ${result.added}，移除 ${result.removed}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showProgress({ phase: "error", completed: 0, total: 0, added: 0, removed: 0, unchanged: 0, message });
      window.electron.showMessage("error", "图片索引失败");
    } finally {
      applyButton.disabled = false;
    }
  });
}

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
