type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type ChatSearchHit = {
  id: string;
  filePath: string;
  url: string;
  fileName: string;
  category: string;
  tags: string[];
  score: number;
};

document.addEventListener("DOMContentLoaded", () => {
  const form = getAiElement<HTMLFormElement>("ai-form");
  const input = getAiElement<HTMLTextAreaElement>("ai-input");
  const sendButton = getAiElement<HTMLButtonElement>("ai-send");
  const status = getAiElement<HTMLElement>("ai-status");
  const messages = getAiElement<HTMLElement>("ai-messages");
  const resultsSection = getAiElement<HTMLElement>("ai-results-section");
  const results = getAiElement<HTMLElement>("ai-results");
  const resultsCount = getAiElement<HTMLElement>("ai-results-count");
  const showGallery = getAiElement<HTMLButtonElement>("ai-show-gallery");
  const resultsClose = getAiElement<HTMLButtonElement>("ai-results-close");
  const history: ChatMessage[] = [];
  const threadId = crypto.randomUUID();
  let activeRequestId = "";
  let assistantBubble: HTMLElement | null = null;
  let currentImages: ChatSearchHit[] = [];
  let resultsHideTimer: ReturnType<typeof setTimeout> | null = null;

  resultsSection.hidden = true;

  /** 添加一条聊天气泡并滚动到底部。 */
  function appendMessage(role: ChatRole, content: string): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = `ai-message-wrap ${role}`;
    const element = document.createElement("div");
    element.className = `ai-message ${role}`;
    element.textContent = content;
    wrapper.appendChild(element);
    messages.appendChild(wrapper);
    messages.scrollTop = messages.scrollHeight;
    return element;
  }

  /** 切换输入区忙碌状态。 */
  function setBusy(busy: boolean): void {
    sendButton.disabled = busy;
    input.disabled = busy;
  }

  /** 渲染 SQLite 返回的最多八张图片。 */
  function renderResults(images: ChatSearchHit[], reveal = true): void {
    if (resultsHideTimer) {
      clearTimeout(resultsHideTimer);
      resultsHideTimer = null;
    }
    currentImages = images;
    results.replaceChildren();
    resultsCount.textContent = `检索结果 · ${images.length} 张`;
    showGallery.disabled = images.length === 0;

    if (images.length === 0) {
      resultsSection.hidden = true;
      return;
    }

    for (const item of images) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "ai-result-card";
      card.title = `${item.fileName}\n${item.category}\n相似度 ${(item.score * 100).toFixed(1)}%`;

      const image = document.createElement("img");
      image.src = item.url;
      image.alt = item.fileName;
      image.addEventListener("error", () => {
        image.src = "./public/img/404.png";
      }, { once: true });

      const label = document.createElement("span");
      label.textContent = item.fileName;
      card.append(image, label);
      results.appendChild(card);
    }

    if (reveal) {
      resultsSection.hidden = false;
      resultsHideTimer = setTimeout(() => {
        resultsSection.hidden = true;
        resultsHideTimer = null;
      }, 5000);
    }
  }

  /** 在对应的 AI 回复下保留本次检索结果的回放入口。 */
  function addReplayButton(bubble: HTMLElement, images: ChatSearchHit[]): void {
    if (!images.length || !bubble.parentElement) {
      return;
    }
    const replay = document.createElement("button");
    replay.type = "button";
    replay.className = "ai-replay-search";
    replay.textContent = `回放本次搜索结果（${images.length}）`;
    replay.addEventListener("click", () => void showResultsInMainGallery(images.slice()));
    bubble.parentElement.appendChild(replay);
  }

  /** 将 AI 检索结果同步到左侧主图片区域。 */
  async function showResultsInMainGallery(images = currentImages): Promise<void> {
    const paths = images.map((item) => item.filePath);
    if (!paths.length) {
      return;
    }
    await Promise.all([
      window.electron.setData("localTargetList", paths),
      window.electron.setData("localImgList", paths),
      window.electron.setData("localPage", 1),
      window.electron.setData("mode", "local"),
    ]);
    getAiElement<HTMLElement>("page-num").textContent = "1";
    getAiElement<HTMLElement>("all-page-num").textContent = String(Math.max(1, Math.ceil(paths.length / 8)));
    window.electron.refresh();
  }

  /** 接收主进程推送的检索进度、图片和文本分块。 */
  const removeEventListener = window.electron.ai.onEvent((event) => {
    if (event.requestId !== activeRequestId) {
      return;
    }
    if (event.type === "status" && event.message) {
      status.textContent = event.message;
    } else if (event.type === "images") {
      renderResults((event.images || []) as ChatSearchHit[]);
    } else if (event.type === "chunk" && event.chunk) {
      if (!assistantBubble) {
        assistantBubble = appendMessage("assistant", "");
      }
      assistantBubble.textContent += event.chunk;
      messages.scrollTop = messages.scrollHeight;
    } else if (event.type === "error") {
      status.textContent = event.message || "AI 请求失败";
    } else if (event.type === "done") {
      status.textContent = "检索与回答完成";
    }
  });

  /** 提交一次对话，并保留最近十轮上下文。 */
  async function submitMessage(): Promise<void> {
    const message = input.value.trim();
    if (!message || sendButton.disabled) {
      return;
    }
    const requestHistory = history.slice(-20);
    history.push({ role: "user", content: message });
    appendMessage("user", message);
    input.value = "";
    activeRequestId = crypto.randomUUID();
    assistantBubble = null;
    setBusy(true);

    try {
      const response = await window.electron.ai.ask({
        requestId: activeRequestId,
        threadId,
        message,
        history: requestHistory,
      });
      if (!assistantBubble) {
        assistantBubble = appendMessage("assistant", response.answer || "已完成检索。");
      }
      history.push({ role: "assistant", content: response.answer || assistantBubble.textContent || "" });
      const responseImages = Array.isArray(response.images) ? response.images as ChatSearchHit[] : [];
      renderResults(responseImages);
      addReplayButton(assistantBubble, responseImages);
      status.textContent = "检索与回答完成";
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (!assistantBubble) {
        assistantBubble = appendMessage("assistant", `请求失败：${detail}`);
      }
      status.textContent = "请求失败，请检查 DeepSeek 与 SQLite 配置";
    } finally {
      setBusy(false);
      input.focus();
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitMessage();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  });

  document.querySelectorAll<HTMLButtonElement>(".ai-suggestion").forEach((button) => {
    button.addEventListener("click", () => {
      input.value = button.dataset.prompt || "";
      void submitMessage();
    });
  });

  showGallery.addEventListener("click", () => void showResultsInMainGallery());
  resultsClose.addEventListener("click", () => {
    if (resultsHideTimer) {
      clearTimeout(resultsHideTimer);
      resultsHideTimer = null;
    }
    resultsSection.hidden = true;
  });
  window.addEventListener("beforeunload", removeEventListener, { once: true });
});

/** 获取 AI 面板必需元素，不存在时立即报告页面结构错误。 */
function getAiElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`AI element not found: ${id}`);
  }
  return element as T;
}
