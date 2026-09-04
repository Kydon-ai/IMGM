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

type SearchHistorySource = "directory" | "ai";

type SearchHistoryEntry = {
  source: SearchHistorySource;
  label: string;
  images: string[];
  createdAt: number;
};

type SearchHistoryState = {
  entries: SearchHistoryEntry[];
  pointer: number;
};

type SettingsProvider = {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  enabled: boolean;
};

type SettingsSnapshot = {
  llmProviders: SettingsProvider[];
  activeLlmProviderId: string;
  searchHistoryLimit: number;
  shortcuts: {
    startSearch: string;
    refreshGallery: string;
    openImageIndex: string;
    previousCache: string;
    nextCache: string;
    switchMenu: string;
  };
  defaultRirUrl: string;
};

type ShortcutAction = keyof SettingsSnapshot["shortcuts"];

const DEFAULT_SHORTCUTS: SettingsSnapshot["shortcuts"] = {
  startSearch: "Ctrl+Enter",
  refreshGallery: "Ctrl+R",
  openImageIndex: "Ctrl+I",
  previousCache: "Alt+ArrowLeft",
  nextCache: "Alt+ArrowRight",
  switchMenu: "Ctrl+Shift+M",
};

let currentAppSettings: SettingsSnapshot | null = null;

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

function updateSearchHistoryControls(state: SearchHistoryState): void {
  const previous = getElementByIdOrThrow<HTMLButtonElement>("search-history-previous");
  const next = getElementByIdOrThrow<HTMLButtonElement>("search-history-next");
  previous.disabled = state.pointer <= 0;
  next.disabled = state.pointer < 0 || state.pointer >= state.entries.length - 1;
  previous.title = state.pointer > 0 ? `查看：${state.entries[state.pointer - 1].label}` : "没有更早的搜索结果";
  next.title = state.pointer >= 0 && state.pointer < state.entries.length - 1
    ? `查看：${state.entries[state.pointer + 1].label}`
    : "没有更新的搜索结果";
}

async function showSearchHistoryEntry(entry: SearchHistoryEntry): Promise<void> {
  await Promise.all([
    window.electron.setData(GALLERY_STORAGE.local.targetList, entry.images),
    window.electron.setData(GALLERY_STORAGE.local.imageList, entry.images),
    window.electron.setData(GALLERY_STORAGE.local.page, 1),
    window.electron.setData("mode", "local"),
  ]);
  if (entry.source === "directory") {
    const filePathElement = getElementByIdOrThrow<HTMLElement>("file-path");
    filePathElement.textContent = entry.label;
    await window.electron.setData("scanPath", entry.label);
  }
  await updatePagination("local");
  window.electron.refresh(false);
}

async function moveToSearchHistory(delta: -1 | 1): Promise<void> {
  const state = await window.electron.moveSearchHistory(delta);
  const entry = state.entries[state.pointer];
  if (entry) {
    await showSearchHistoryEntry(entry);
  }
  updateSearchHistoryControls(state);
}

document.addEventListener("DOMContentLoaded", async () => {
  bindCopyActions();
  bindSidebarNavigation();
  await bindSettingsDialog();
  bindGlobalShortcuts();
  bindEmbeddingIndex();
  window.addEventListener("search-history-changed", (event) => {
    const state = (event as CustomEvent<SearchHistoryState>).detail;
    if (state) {
      updateSearchHistoryControls(state);
    }
  });
  updateSearchHistoryControls(await window.electron.getSearchHistory());

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
      const images = await window.electron.scanDir(filePath);
      const historyState = await window.electron.appendSearchHistory({
        source: "directory",
        label: filePath,
        images,
        createdAt: Date.now(),
      });
      updateSearchHistoryControls(historyState);
      await window.electron.setData("mode", "local");
      await updatePagination("local");
      window.electron.showMessage("success", "搜索完毕!!!");
      await window.electron.refresh();
    } else {
      alert("文件路径为空或者无效");
    }
  });

  getElementByIdOrThrow<HTMLButtonElement>("refresh-pic").addEventListener("click", async () => {
    const historyState = await window.electron.activateLatestDirectorySearch();
    const entry = historyState.entries[historyState.pointer];
    if (entry) {
      await showSearchHistoryEntry(entry);
    } else {
      await refreshAndResetPage();
    }
    updateSearchHistoryControls(historyState);
  });

  getElementByIdOrThrow<HTMLButtonElement>("rir-refresh-pic").addEventListener("click", async () => {
    await refreshAndResetPage();
  });

  getElementByIdOrThrow<HTMLButtonElement>("search-history-previous").addEventListener("click", async () => {
    await moveToSearchHistory(-1);
  });

  getElementByIdOrThrow<HTMLButtonElement>("search-history-next").addEventListener("click", async () => {
    await moveToSearchHistory(1);
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
  const progressClose = getElementByIdOrThrow<HTMLButtonElement>("embedding-index-progress-close");
  let rootPath = "";
  let groups: ImageIndexGroup[] = [];
  let selected = new Set<string>();
  let progressHideTimer: ReturnType<typeof setTimeout> | null = null;

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
    if (progressHideTimer) {
      clearTimeout(progressHideTimer);
      progressHideTimer = null;
    }
    progressCard.hidden = false;
    const percent = progress.total === 0 ? (progress.phase === "completed" ? 100 : 0) : Math.round((progress.completed / progress.total) * 100);
    progressBar.value = percent;
    progressTitle.textContent = `${progress.message || "正在处理图片索引"} · ${progress.completed}/${progress.total}`;
    progressFile.textContent = progress.currentPath
      ? progress.currentPath.split(/[\\/]/).pop() || progress.currentPath
      : "";
    progressCard.classList.toggle("is-error", progress.phase === "error");
    progressCard.classList.toggle("is-complete", progress.phase === "completed");
    if (progress.phase === "completed") {
      progressHideTimer = setTimeout(() => {
        progressCard.hidden = true;
        progressHideTimer = null;
      }, 5000);
    }
  };

  window.electron.onImageIndexProgress(showProgress);
  progressClose.addEventListener("click", () => {
    if (progressHideTimer) {
      clearTimeout(progressHideTimer);
      progressHideTimer = null;
    }
    progressCard.hidden = true;
  });
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

/** 打开完整设置弹窗，并管理设置草稿、供应商和快捷键配置。 */
async function bindSettingsDialog(): Promise<void> {
  const settingsButton = getElementByIdOrThrow<HTMLButtonElement>("settings-button");
  const settingsPopover = getElementByIdOrThrow<HTMLDivElement>("settings-popover");
  const closeButton = getElementByIdOrThrow<HTMLButtonElement>("settings-close");
  const cancelButton = getElementByIdOrThrow<HTMLButtonElement>("settings-cancel");
  const saveButton = getElementByIdOrThrow<HTMLButtonElement>("settings-save");
  const settingsPath = getElementByIdOrThrow<HTMLElement>("settings-path");
  const consoleToggle = getElementByIdOrThrow<HTMLInputElement>("forward-renderer-console");
  const settingsStatus = getElementByIdOrThrow<HTMLElement>("settings-status");
  const activeProviderSelect = getElementByIdOrThrow<HTMLSelectElement>("llm-active-provider");
  const providerList = getElementByIdOrThrow<HTMLDivElement>("llm-provider-list");
  const providerStatus = getElementByIdOrThrow<HTMLElement>("llm-settings-status");
  const historyLimitInput = getElementByIdOrThrow<HTMLInputElement>("search-history-limit");
  const historyLimitSummary = getElementByIdOrThrow<HTMLElement>("settings-history-limit-summary");
  const activeLlmSummary = getElementByIdOrThrow<HTMLElement>("settings-active-llm");
  const defaultRirInput = getElementByIdOrThrow<HTMLInputElement>("default-rir-url");
  const rirParseInput = getElementByIdOrThrow<HTMLInputElement>("rir-parse-input");
  let loading = false;

  const setStatus = (element: HTMLElement, message: string, type: "success" | "error" | "" = ""): void => {
    element.textContent = message;
    element.classList.toggle("success", type === "success");
    element.classList.toggle("error", type === "error");
  };

  const getProviderField = (card: HTMLElement, field: string): HTMLInputElement | null =>
    card.querySelector<HTMLInputElement>(`[data-provider-field="${field}"]`);

  const readProviderCard = (card: HTMLElement): SettingsProvider => ({
    id: card.dataset.providerId || crypto.randomUUID(),
    name: getProviderField(card, "name")?.value.trim() || "未命名供应商",
    baseUrl: getProviderField(card, "baseUrl")?.value.trim() || "",
    model: getProviderField(card, "model")?.value.trim() || "",
    apiKey: getProviderField(card, "apiKey")?.value || "",
    enabled: getProviderField(card, "enabled")?.checked ?? true,
  });

  const collectProviderCards = (): SettingsProvider[] =>
    Array.from(providerList.querySelectorAll<HTMLElement>(".llm-provider-card")).map(readProviderCard);

  const updateProviderSelector = (selectedId = activeProviderSelect.value): void => {
    const providers = collectProviderCards();
    activeProviderSelect.replaceChildren();
    providers.forEach((provider) => {
      const option = document.createElement("option");
      option.value = provider.id;
      option.textContent = provider.name || "未命名供应商";
      activeProviderSelect.appendChild(option);
    });
    if (providers.some((provider) => provider.id === selectedId)) {
      activeProviderSelect.value = selectedId;
    } else if (providers[0]) {
      activeProviderSelect.value = providers[0].id;
    }
  };

  const createProviderField = (labelText: string, field: string, value: string, full = false): HTMLLabelElement => {
    const label = document.createElement("label");
    label.className = `settings-field${full ? " full" : ""}`;
    const title = document.createElement("span");
    title.textContent = labelText;
    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    input.dataset.providerField = field;
    label.append(title, input);
    return label;
  };

  const renderProviders = (providers: SettingsProvider[], selectedId: string): void => {
    providerList.replaceChildren();
    providers.forEach((provider) => {
      const card = document.createElement("article");
      card.className = "llm-provider-card";
      card.dataset.providerId = provider.id;

      const header = document.createElement("div");
      header.className = "llm-provider-card-header";
      const title = document.createElement("div");
      title.className = "llm-provider-card-title";
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = provider.name;
      nameInput.dataset.providerField = "name";
      nameInput.setAttribute("aria-label", "供应商名称");
      title.appendChild(nameInput);

      const actions = document.createElement("div");
      actions.className = "llm-provider-card-actions";
      const enabledLabel = document.createElement("label");
      enabledLabel.className = "settings-check-label";
      const enabled = document.createElement("input");
      enabled.type = "checkbox";
      enabled.checked = provider.enabled;
      enabled.dataset.providerField = "enabled";
      enabledLabel.append(enabled, document.createTextNode("启用"));
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "settings-delete-button";
      deleteButton.textContent = "删除";
      deleteButton.disabled = providers.length <= 1;
      deleteButton.addEventListener("click", () => {
        if (providerList.children.length <= 1) {
          setStatus(providerStatus, "至少保留一个供应商配置", "error");
          return;
        }
        card.remove();
        updateProviderSelector();
      });
      actions.append(enabledLabel, deleteButton);
      header.append(title, actions);

      const grid = document.createElement("div");
      grid.className = "settings-form-grid";
      grid.append(
        createProviderField("API 地址", "baseUrl", provider.baseUrl),
        createProviderField("模型名称", "model", provider.model),
      );

      const keyLabel = document.createElement("label");
      keyLabel.className = "settings-field full";
      const keyTitle = document.createElement("span");
      keyTitle.textContent = "API 密钥";
      const keyWrapper = document.createElement("span");
      keyWrapper.className = "settings-input-with-action";
      const keyInput = document.createElement("input");
      keyInput.type = "password";
      keyInput.value = provider.apiKey;
      keyInput.dataset.providerField = "apiKey";
      keyInput.autocomplete = "off";
      const toggleKey = document.createElement("button");
      toggleKey.type = "button";
      toggleKey.className = "settings-input-action";
      toggleKey.textContent = "显示";
      toggleKey.addEventListener("click", () => {
        const visible = keyInput.type === "text";
        keyInput.type = visible ? "password" : "text";
        toggleKey.textContent = visible ? "显示" : "隐藏";
      });
      keyWrapper.append(keyInput, toggleKey);
      keyLabel.append(keyTitle, keyWrapper);
      grid.appendChild(keyLabel);

      const footer = document.createElement("div");
      footer.className = "llm-provider-card-footer";
      const testButton = document.createElement("button");
      testButton.type = "button";
      testButton.className = "settings-action-button";
      testButton.textContent = "测试连通性";
      const testStatus = document.createElement("span");
      testStatus.className = "llm-provider-status";
      testButton.addEventListener("click", async () => {
        testButton.disabled = true;
        setStatus(testStatus, "测试中…");
        try {
          const result = await window.electron.testLlmConnection(readProviderCard(card));
          setStatus(testStatus, result.message, result.ok ? "success" : "error");
        } catch (error) {
          setStatus(testStatus, error instanceof Error ? error.message : String(error), "error");
        } finally {
          testButton.disabled = false;
        }
      });
      footer.append(testButton, testStatus);

      nameInput.addEventListener("input", () => updateProviderSelector(activeProviderSelect.value));
      card.append(header, grid, footer);
      providerList.appendChild(card);
    });
    updateProviderSelector(selectedId);
  };

  const renderSettings = (settings: SettingsSnapshot): void => {
    currentAppSettings = {
      ...settings,
      llmProviders: settings.llmProviders.map((provider) => ({ ...provider })),
      shortcuts: { ...settings.shortcuts },
    };
    renderProviders(currentAppSettings.llmProviders, currentAppSettings.activeLlmProviderId);
    historyLimitInput.value = String(currentAppSettings.searchHistoryLimit);
    historyLimitSummary.textContent = `${currentAppSettings.searchHistoryLimit} 条`;
    const activeProvider = currentAppSettings.llmProviders.find((provider) => provider.id === currentAppSettings?.activeLlmProviderId);
    activeLlmSummary.textContent = activeProvider?.name || "未配置";
    defaultRirInput.value = currentAppSettings.defaultRirUrl;
    rirParseInput.value = currentAppSettings.defaultRirUrl;
    document.querySelectorAll<HTMLInputElement>("[data-shortcut-action]").forEach((input) => {
      const action = input.dataset.shortcutAction as ShortcutAction;
      input.value = currentAppSettings?.shortcuts[action] || "";
    });
  };

  const collectSettings = (): SettingsSnapshot => {
    if (!currentAppSettings) {
      throw new Error("设置尚未加载完成");
    }
    const providers = collectProviderCards();
    if (new Set(providers.map((provider) => provider.id)).size !== providers.length) {
      throw new Error("供应商配置 ID 重复，请重新打开设置");
    }
    const shortcutValues = { ...currentAppSettings.shortcuts };
    document.querySelectorAll<HTMLInputElement>("[data-shortcut-action]").forEach((input) => {
      const action = input.dataset.shortcutAction as ShortcutAction;
      shortcutValues[action] = input.value.trim();
    });
    const configuredShortcuts = Object.values(shortcutValues).filter(Boolean);
    if (new Set(configuredShortcuts).size !== configuredShortcuts.length) {
      throw new Error("快捷键不能重复，请重新设置");
    }
    const historyLimit = Number(historyLimitInput.value);
    if (!Number.isInteger(historyLimit) || historyLimit < 1 || historyLimit > 500) {
      throw new Error("搜索结果缓存上限必须是 1 到 500 之间的整数");
    }
    return {
      llmProviders: providers,
      activeLlmProviderId: activeProviderSelect.value,
      searchHistoryLimit: historyLimit,
      shortcuts: shortcutValues,
      defaultRirUrl: defaultRirInput.value.trim(),
    };
  };

  const loadSettings = async (): Promise<void> => {
    if (loading) {
      return;
    }
    loading = true;
    try {
      const [settings, path, consoleForwardingEnabled] = await Promise.all([
        window.electron.getSettings(),
        window.electron.getData<string>("scanPath"),
        window.electron.getData<boolean>("forwardRendererConsole"),
      ]);
      renderSettings(settings);
      settingsPath.textContent = path || "未选择";
      consoleToggle.checked = consoleForwardingEnabled !== false;
      setStatus(settingsStatus, "");
      setStatus(providerStatus, "");
    } catch (error) {
      setStatus(settingsStatus, error instanceof Error ? error.message : String(error), "error");
    } finally {
      loading = false;
    }
  };

  const closePopover = (): void => {
    settingsPopover.hidden = true;
    settingsButton.setAttribute("aria-expanded", "false");
  };

  settingsButton.addEventListener("click", async () => {
    const willOpen = settingsPopover.hidden;
    settingsPopover.hidden = !willOpen;
    settingsButton.setAttribute("aria-expanded", String(willOpen));

    if (willOpen) {
      await loadSettings();
      closeButton.focus();
    }
  });

  closeButton.addEventListener("click", closePopover);
  cancelButton.addEventListener("click", closePopover);
  settingsPopover.querySelector<HTMLElement>("[data-settings-close]")?.addEventListener("click", closePopover);

  saveButton.addEventListener("click", async () => {
    saveButton.disabled = true;
    setStatus(settingsStatus, "保存中…");
    try {
      const settings = collectSettings();
      const saved = await window.electron.saveSettings(settings);
      renderSettings(saved);
      currentAppSettings = saved;
      historyLimitSummary.textContent = `${saved.searchHistoryLimit} 条`;
      const activeProvider = saved.llmProviders.find((provider) => provider.id === saved.activeLlmProviderId);
      activeLlmSummary.textContent = activeProvider?.name || "未配置";
      setStatus(settingsStatus, "设置已保存", "success");
      window.dispatchEvent(new CustomEvent("app-settings-changed", { detail: saved }));
    } catch (error) {
      setStatus(settingsStatus, error instanceof Error ? error.message : String(error), "error");
    } finally {
      saveButton.disabled = false;
    }
  });

  document.querySelectorAll<HTMLButtonElement>("[data-settings-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.settingsTab;
      if (!target) {
        return;
      }
      document.querySelectorAll<HTMLButtonElement>("[data-settings-tab]").forEach((item) => item.classList.toggle("active", item === tab));
      document.querySelectorAll<HTMLElement>("[data-settings-section]").forEach((section) => {
        section.hidden = section.dataset.settingsSection !== target;
      });
    });
  });

  getElementByIdOrThrow<HTMLButtonElement>("llm-add-provider").addEventListener("click", () => {
    if (!currentAppSettings) {
      return;
    }
    const providers = collectProviderCards();
    providers.push({
      id: crypto.randomUUID(),
      name: "新供应商",
      baseUrl: "https://api.openai.com/v1",
      model: "",
      apiKey: "",
      enabled: true,
    });
    renderProviders(providers, activeProviderSelect.value);
  });

  consoleToggle.addEventListener("change", async () => {
    const enabled = consoleToggle.checked;

    try {
      await window.electron.setData("forwardRendererConsole", enabled);
    } catch (error) {
      consoleToggle.checked = !enabled;
      console.error("保存终端日志开关失败:", error);
    }
  });

  settingsPopover.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePopover();
    }
  });

  settingsPopover.hidden = true;
  await loadSettings();
}

/** 将键盘事件规范化为设置页面使用的快捷键格式。 */
function formatShortcutEvent(event: KeyboardEvent): string {
  if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) {
    return "";
  }
  const modifiers: string[] = [];
  if (event.ctrlKey) modifiers.push("Ctrl");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  if (event.metaKey) modifiers.push("Meta");
  const keyNames: Record<string, string> = {
    " ": "Space",
    Escape: "Esc",
    ArrowUp: "ArrowUp",
    ArrowDown: "ArrowDown",
    ArrowLeft: "ArrowLeft",
    ArrowRight: "ArrowRight",
    Backspace: "Backspace",
    Delete: "Delete",
    Tab: "Tab",
  };
  const key = keyNames[event.key] || (event.key.length === 1 ? event.key.toUpperCase() : event.key);
  return [...modifiers, key].join("+");
}

/** 执行设置中配置的应用级快捷键。 */
function bindGlobalShortcuts(): void {
  document.querySelectorAll<HTMLInputElement>("[data-shortcut-action]").forEach((input) => {
    input.addEventListener("keydown", (event) => {
      event.preventDefault();
      input.value = event.key === "Escape" ? "" : formatShortcutEvent(event);
    });
  });

  document.addEventListener("keydown", (event) => {
    const settingsDialog = document.getElementById("settings-popover");
    if (!currentAppSettings || (settingsDialog && !settingsDialog.hidden)) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.matches("input, textarea, [contenteditable='true']")) {
      return;
    }
    const shortcut = formatShortcutEvent(event);
    if (!shortcut) {
      return;
    }
    const action = (Object.keys(currentAppSettings.shortcuts) as ShortcutAction[]).find((key) => currentAppSettings?.shortcuts[key] === shortcut);
    if (!action) {
      return;
    }
    event.preventDefault();
    if (action === "startSearch") {
      getElementByIdOrThrow<HTMLButtonElement>("start-search").click();
    } else if (action === "openImageIndex") {
      getElementByIdOrThrow<HTMLButtonElement>("add-embedding").click();
    } else if (action === "previousCache") {
      getElementByIdOrThrow<HTMLButtonElement>("search-history-previous").click();
    } else if (action === "nextCache") {
      getElementByIdOrThrow<HTMLButtonElement>("search-history-next").click();
    } else if (action === "switchMenu") {
      const navItems = Array.from(document.querySelectorAll<HTMLButtonElement>(".imgm-nav-item"));
      const activeIndex = navItems.findIndex((item) => item.classList.contains("active"));
      navItems[(activeIndex + 1 + navItems.length) % navItems.length]?.click();
    } else if (action === "refreshGallery") {
      void getCurrentGalleryMode().then((mode) => {
        getElementByIdOrThrow<HTMLButtonElement>(mode === "rir" ? "rir-refresh-pic" : "refresh-pic").click();
      });
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
