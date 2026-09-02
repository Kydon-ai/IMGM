export type SearchHistorySource = "directory" | "ai";

export type SearchHistoryEntry = {
  source: SearchHistorySource;
  label: string;
  images: string[];
  createdAt: number;
};

export type SearchHistoryState = {
  entries: SearchHistoryEntry[];
  pointer: number;
};
