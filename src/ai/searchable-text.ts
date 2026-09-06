import path from "node:path";

export type SearchableTextParts = {
  fileName: string;
  category?: string;
  subject?: string;
  action?: string;
  emotion?: string;
  description?: string;
  source?: string;
};

type FilenameSemantics = {
  source: string;
  subject: string;
  action: string;
  emotion: string;
  description: string;
};

function parseFilenameSemantics(fileName: string): FilenameSemantics {
  const basename = path.parse(fileName).name;
  const parts = basename.split("_").map((part) => part.trim()).filter(Boolean);

  // Semantic filenames use: id_source_subject_action_emotion_description.
  // Keep the complete tail as description because descriptions may contain underscores.
  if (parts.length >= 6 && /^[a-f0-9]{8,}$/i.test(parts[0])) {
    return {
      source: parts[1],
      subject: parts[2],
      action: parts[3],
      emotion: parts[4],
      description: parts.slice(5).join(" "),
    };
  }

  return {
    source: "",
    subject: "",
    action: "",
    emotion: "",
    description: basename,
  };
}

function nonEmpty(value: string | undefined): string {
  return value?.trim() || "";
}

/** Build the text used by keyword matching and the CLIP text embedding. */
export function buildSearchableText(parts: SearchableTextParts): string {
  const parsed = parseFilenameSemantics(parts.fileName);
  const source = nonEmpty(parts.source) || parsed.source;
  const subject = nonEmpty(parts.subject) || parsed.subject;
  const action = nonEmpty(parts.action) || parsed.action;
  const emotion = nonEmpty(parts.emotion) || parsed.emotion;
  const description = nonEmpty(parts.description) || parsed.description;

  return [
    `文件名:${parts.fileName}`,
    source && `来源:${source}`,
    nonEmpty(parts.category) && `类别:${parts.category}`,
    subject && `主体:${subject}`,
    action && `动作:${action}`,
    emotion && `情绪:${emotion}`,
    description && `描述:${description}`,
  ].filter(Boolean).join(" ");
}

export function deriveDisplayName(fileName: string): string {
  const basename = path.parse(fileName).name;
  return basename.split("_").at(-1)?.trim() || basename;
}
