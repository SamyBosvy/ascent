/** Cloze syntax: {{c1::answer}} or {{c1::answer::hint}}. All cloze numbers on a card are hidden together. */
const CLOZE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

export const hasCloze = (s: string) => new RegExp(CLOZE.source).test(s);

const escLinkText = (s: string) => s.replace(/([[\]\\])/g, "\\$1");

/**
 * Turn cloze markers into markdown links with a private href that CardText renders as a highlight
 * ("#cloze") or a blank ("#cloze-hidden").
 */
export function clozeMarkdown(s: string, revealed: boolean) {
  return s.replace(CLOZE, (_m, _n, answer: string, hint?: string) =>
    revealed ? `[${escLinkText(answer)}](#cloze)` : `[${escLinkText(`[${hint?.trim() || "..."}]`)}](#cloze-hidden)`,
  );
}

/** Plain text for speech: answers filled in (or "blank" while hidden), markdown punctuation removed. */
export function speakable(s: string, revealed = true) {
  return s
    .replace(CLOZE, (_m, _n, a: string) => (revealed ? a : " blank "))
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>~]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export const speechAvailable = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

export function speak(text: string, lang?: string | null) {
  if (!speechAvailable() || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (lang) u.lang = lang;
  window.speechSynthesis.speak(u);
}

export const SPEECH_LANGS = ["es-ES", "fr-FR", "de-DE", "it-IT", "pt-PT", "pt-BR", "nl-NL", "en-US", "en-GB", "ja-JP", "zh-CN", "ko-KR", "ru-RU", "ar-SA", "sv-SE"];
export const SPEECH_LANG_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
