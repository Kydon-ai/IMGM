const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPE_MAP[character]);
}

function renderInline(value: string): string {
  const tokenPattern = /(`+[^`\n]+`+|\[([^\]\n]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)(?:\s+["']([^"']*)["'])?\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|\*([^*\n]+)\*|_([^_\n]+)_)/g;
  let html = "";
  let lastIndex = 0;

  for (const match of value.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    html += escapeHtml(value.slice(lastIndex, index)).replace(/ {2}\n/g, "<br>\n").replace(/\n/g, "<br>\n");

    if (token.startsWith("`")) {
      html += `<code>${escapeHtml(token.replace(/^`+|`+$/g, ""))}</code>`;
    } else if (match[2] && match[3]) {
      const title = match[4] ? ` title="${escapeHtml(match[4])}"` : "";
      html += `<a href="${escapeHtml(match[3])}" target="_blank" rel="noopener noreferrer"${title}>${renderInline(match[2])}</a>`;
    } else if (match[5] || match[6]) {
      html += `<strong>${renderInline(match[5] || match[6])}</strong>`;
    } else if (match[7]) {
      html += `<del>${renderInline(match[7])}</del>`;
    } else if (match[8] || match[9]) {
      html += `<em>${renderInline(match[8] || match[9])}</em>`;
    }

    lastIndex = index + token.length;
  }

  return html + escapeHtml(value.slice(lastIndex)).replace(/ {2}\n/g, "<br>\n").replace(/\n/g, "<br>\n");
}

function isHorizontalRule(line: string): boolean {
  return /^ {0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/.test(line);
}

/** 将常用 Markdown 转为安全 HTML；原始 HTML 和不安全链接会按普通文本处理。 */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let listItems: string[] = [];
  let quoteLines: string[] = [];
  let codeLines: string[] | null = null;
  let codeLanguage = "";

  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      blocks.push(`<p>${renderInline(paragraph.join("\n"))}</p>`);
      paragraph = [];
    }
  };

  const flushList = (): void => {
    if (listType && listItems.length > 0) {
      blocks.push(`<${listType}>${listItems.map((item) => `<li>${renderInline(item)}</li>`).join("")}</${listType}>`);
    }
    listType = null;
    listItems = [];
  };

  const flushQuote = (): void => {
    if (quoteLines.length > 0) {
      blocks.push(`<blockquote>${markdownToHtml(quoteLines.join("\n"))}</blockquote>`);
      quoteLines = [];
    }
  };

  const flushOpenBlocks = (): void => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const line of lines) {
    const fence = line.match(/^ {0,3}```\s*([A-Za-z0-9_-]+)?\s*$/);
    if (codeLines) {
      if (fence) {
        const languageClass = codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : "";
        blocks.push(`<pre><code${languageClass}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = null;
        codeLanguage = "";
      } else {
        codeLines.push(line);
      }
      continue;
    }

    if (fence) {
      flushOpenBlocks();
      codeLines = [];
      codeLanguage = fence[1] || "";
      continue;
    }

    if (!line.trim()) {
      flushOpenBlocks();
      continue;
    }

    const heading = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushOpenBlocks();
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    if (isHorizontalRule(line)) {
      flushOpenBlocks();
      blocks.push("<hr>");
      continue;
    }

    const quote = line.match(/^ {0,3}>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      flushList();
      quoteLines.push(quote[1]);
      continue;
    }
    flushQuote();

    const unorderedItem = line.match(/^ {0,3}[-+*]\s+(.+)$/);
    const orderedItem = line.match(/^ {0,3}\d+[.)]\s+(.+)$/);
    if (unorderedItem || orderedItem) {
      flushParagraph();
      const nextListType: "ul" | "ol" = unorderedItem ? "ul" : "ol";
      if (listType !== nextListType) {
        flushList();
        listType = nextListType;
      }
      listItems.push((unorderedItem || orderedItem)?.[1] || "");
      continue;
    }
    flushList();

    paragraph.push(line);
  }

  if (codeLines) {
    const languageClass = codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : "";
    blocks.push(`<pre><code${languageClass}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }
  flushOpenBlocks();
  return blocks.join("");
}

/** 渲染 AI 回复；HTML 只来自上面的安全 Markdown 转换结果。 */
export function renderMarkdown(element: HTMLElement, markdown: string): void {
  element.innerHTML = markdownToHtml(markdown);
}
