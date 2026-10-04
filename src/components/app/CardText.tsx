import ReactMarkdown, { type Components } from "react-markdown";
import { Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { clozeMarkdown, speak, speakable, speechAvailable } from "@/lib/cardText";
import { cn } from "@/lib/utils";

/** Single newlines become line breaks (markdown would otherwise join them). */
const breaks = (s: string) => s.replace(/([^\n])\n(?!\n)/g, "$1  \n");

const components: Components = {
  a: ({ href, children }) => {
    if (href === "#cloze") return <mark className="cloze-answer">{children}</mark>;
    if (href === "#cloze-hidden") return <span className="cloze-blank">{children}</span>;
    return <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary-strong underline">{children}</a>;
  },
};

/** Markdown for card text. Raw HTML is never rendered (react-markdown escapes it); images are dropped. */
export function CardText({ text, revealed = true, className }: { text: string; revealed?: boolean; className?: string }) {
  return (
    <div className={cn("card-md", className)}>
      <ReactMarkdown components={components} disallowedElements={["img"]} unwrapDisallowed skipHtml>
        {breaks(clozeMarkdown(text, revealed))}
      </ReactMarkdown>
    </div>
  );
}

export function SpeakButton({ text, lang, revealed = true }: { text: string; lang?: string | null; revealed?: boolean }) {
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(speechAvailable()), []);
  if (!ok) return null;
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="Read aloud"
      className="tap inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
      onClick={(e) => { e.stopPropagation(); speak(speakable(text, revealed), lang); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); speak(speakable(text, revealed), lang); } }}
    >
      <Volume2 className="h-5 w-5" />
    </span>
  );
}
