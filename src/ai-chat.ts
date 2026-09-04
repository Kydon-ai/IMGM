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
  const newConversationButton = getAiElement<HTMLButtonElement>("ai-new-conversation");
  const status = getAiElement<HTMLElement>("ai-status");
  const messages = getAiElement<HTMLElement>("ai-messages");
  const resultsSection = getAiElement<HTMLElement>("ai-results-section");
  const results = getAiElement<HTMLElement>("ai-results");
  const resultsCount = getAiElement<HTMLElement>("ai-results-count");
  const showGallery = getAiElement<HTMLButtonElement>("ai-show-gallery");
  const resultsClose = getAiElement<HTMLButtonElement>("ai-results-close");
  const history: ChatMessage[] = [];
  let threadId = crypto.randomUUID();
  let activeRequestId = "";
  let assistantBubble: HTMLElement | null = null;
  let assistantContent = "";
  let currentImages: ChatSearchHit[] = [];
  let resultsHideTimer: ReturnType<typeof setTimeout> | null = null;

  resultsSection.hidden = true;

  /** 让输入框随多行内容增长，达到上限后改为内部滚动。 */
  function resizeInput(): void {
    const maxHeight = 120;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, maxHeight)}px`;
    input.style.overflowY = input.scrollHeight > maxHeight ? "auto" : "hidden";
  }

  resizeInput();

  /** 添加一条聊天气泡并滚动到底部。 */
  function appendMessage(role: ChatRole, content: string): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = `ai-message-wrap ${role}`;
    const element = document.createElement("div");
    element.className = `ai-message ${role}`;
    if (role === "assistant") {
      window.imgmMarkdownRenderer.renderMarkdown(element, content);
    } else {
      element.textContent = content;
    }
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

  /** 清空当前会话并创建新的上下文。旧请求返回时会因 requestId 失效而被忽略。 */
  function startNewConversation(): void {
    activeRequestId = "";
    threadId = crypto.randomUUID();
    history.length = 0;
    assistantBubble = null;
    assistantContent = "";
    currentImages = [];
    if (resultsHideTimer) {
      clearTimeout(resultsHideTimer);
      resultsHideTimer = null;
    }
    resultsSection.hidden = true;
    results.replaceChildren();
    resultsCount.textContent = "检索结果";
    showGallery.disabled = true;
    messages.replaceChildren();
    appendMessage("assistant", "告诉我你想找什么图片。例如：“找 8 张透明背景的咖波表情包”。");
    input.value = "";
    resizeInput();
    status.textContent = "AI 已就绪";
    setBusy(false);
    input.focus();
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
      assistantContent += event.chunk;
      window.imgmMarkdownRenderer.renderMarkdown(assistantBubble, assistantContent);
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
    console.log('查看发送消息：',history)
    appendMessage("user", message);
    input.value = "";
    resizeInput();
    const requestId = crypto.randomUUID();
    activeRequestId = requestId;
    assistantBubble = null;
    assistantContent = "";
    setBusy(true);

    try {
      const response = await window.electron.ai.ask({
        requestId,
        threadId,
        message,
        history: requestHistory,
      });
      if (activeRequestId !== requestId) {
        return;
      }
      const assistantAnswer = response.answer || assistantContent || "已完成检索。";
      if (!assistantBubble) {
        assistantContent = assistantAnswer;
        assistantBubble = appendMessage("assistant", assistantAnswer);
      } else if (response.answer && response.answer !== assistantContent) {
        assistantContent = response.answer;
        window.imgmMarkdownRenderer.renderMarkdown(assistantBubble, assistantContent);
      }
      history.push({ role: "assistant", content: assistantContent });
      const responseImages = Array.isArray(response.images) ? response.images as ChatSearchHit[] : [];
      renderResults(responseImages);
      addReplayButton(assistantBubble, responseImages);
      if (responseImages.length > 0) {
        try {
          const historyState = await window.electron.appendSearchHistory({
            source: "ai",
            label: `AI：${message}`,
            images: responseImages.map((item) => item.filePath),
            createdAt: Date.now(),
          });
          window.dispatchEvent(new CustomEvent("search-history-changed", { detail: historyState }));
        } catch (historyError) {
          console.error("保存 AI 搜索历史失败:", historyError);
        }
      }
      status.textContent = "检索与回答完成";
    } catch (error) {
      if (activeRequestId !== requestId) {
        return;
      }
      const detail = error instanceof Error ? error.message : String(error);
      if (!assistantBubble) {
        assistantContent = `请求失败：${detail}`;
        assistantBubble = appendMessage("assistant", assistantContent);
      }
      status.textContent = "请求失败，请检查 DeepSeek 与 SQLite 配置";
    } finally {
      if (activeRequestId === requestId) {
        setBusy(false);
        input.focus();
      }
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitMessage();
  });

  input.addEventListener("input", resizeInput);

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  });

  newConversationButton.addEventListener("click", startNewConversation);

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
