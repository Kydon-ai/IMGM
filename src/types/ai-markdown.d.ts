interface Window {
  imgmMarkdownRenderer: {
    markdownToHtml: (markdown: string) => string;
    renderMarkdown: (element: HTMLElement, markdown: string) => void;
  };
}
