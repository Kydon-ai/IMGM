export type LlmProviderSettings = {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  enabled: boolean;
};

export const SHORTCUT_ACTIONS = [
  "startSearch",
  "refreshGallery",
  "openImageIndex",
  "previousCache",
  "nextCache",
  "switchMenu",
] as const;

export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];

export type ShortcutSettings = Record<ShortcutAction, string>;

export type AppSettings = {
  llmProviders: LlmProviderSettings[];
  activeLlmProviderId: string;
  searchHistoryLimit: number;
  shortcuts: ShortcutSettings;
  defaultRirUrl: string;
};

export const DEFAULT_SHORTCUTS: ShortcutSettings = {
  startSearch: "Ctrl+Enter",
  refreshGallery: "Ctrl+R",
  openImageIndex: "Ctrl+I",
  previousCache: "Alt+ArrowLeft",
  nextCache: "Alt+ArrowRight",
  switchMenu: "Ctrl+Shift+M",
};
