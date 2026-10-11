import { useEffect, useId, useRef, useState } from "react";
import { requireOnline } from "@/lib/sync";
import { useSubmission } from "@/hooks/use-submission";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";
import Papa from "papaparse";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchPaged } from "@/lib/data";
import { NativeSelect } from "./fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ResponsiveDialog } from "./ResponsiveDialog";

type Field = "front" | "back" | "example" | "pronunciation" | "ignore";
const FIELDS: Field[] = ["front", "back", "example", "pronunciation", "ignore"];
const LABEL: Record<Field, string> = { front: "Front", back: "Back", example: "Example", pronunciation: "Pronunciation", ignore: "Ignore" };
const ALIASES: Record<Exclude<Field, "ignore">, string[]> = {
  front: ["front", "question", "term", "word", "prompt"],
  back: ["back", "answer", "definition", "meaning", "translation"],
  example: ["example", "sentence", "example sentence"],
  pronunciation: ["pronunciation", "reading", "ipa"],
};
const BATCH = 500;
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Header names (same as the Settings export: front,back,example,pronunciation,route) → mapping; positional fallback. */
function detect(header: string[] | null, width: number): Field[] {
  const out: Field[] = Array.from({ length: width }, () => "ignore");
  const used = new Set<Field>();
  if (header) {
    header.forEach((h, i) => {
      const key = norm(h ?? "");
      const f = (Object.keys(ALIASES) as Exclude<Field, "ignore">[]).find((k) => ALIASES[k].includes(key));
      if (f && !used.has(f)) { out[i] = f; used.add(f); }
    });
  }
  if (!used.has("front") && !used.has("back")) {
    (["front", "back", "example", "pronunciation"] as Field[]).forEach((f, i) => { if (i < width) out[i] = f; });
  }
  return out;
}

export function CsvImportDialog({ open, onOpenChange, routeId }: { open: boolean; onOpenChange: (o: boolean) => void; routeId: string }) {
  const formId = useId();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<string[][] | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [skipDupes, setSkipDupes] = useState(true);
  const [map, setMap] = useState<Field[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const { submitting, submit } = useSubmission();

  function reset() {
    setFileName(""); setRows(null); setMap([]); setProgress(null); setSummary(null); setHasHeader(true); setSkipDupes(true);
    if (fileRef.current) fileRef.current.value = "";
  }

  useEffect(() => {
    if (open) return;
    const timeout = setTimeout(reset, 200);
    return () => clearTimeout(timeout);
  }, [open]);

  function pick(file: File) {
    setSummary(null);
    Papa.parse<string[]>(file, {
      skipEmptyLines: "greedy",
      encoding: "UTF-8",
      delimitersToGuess: [",", "\t", ";", "|"],
      complete: (res) => {
        const data = res.data.map((r) => r.map((c) => (c ?? "").replace(/^\uFEFF/, "")));
        if (!data.length) { toast.error("That file has no rows."); return; }
        const width = Math.max(...data.map((r) => r.length));
        const first = data[0];
        if (!first) return;
        const looksHeader = first.some((h) => Object.values(ALIASES).flat().includes(norm(h)));
        setHasHeader(looksHeader);
        setMap(detect(looksHeader ? first : null, width));
        setRows(data);
        setFileName(file.name);
      },
      error: (e) => toast.error(`Couldn't read the file: ${e.message}`),
    });
  }

  const width = map.length;
  const body = rows ? (hasHeader ? rows.slice(1) : rows) : [];
  const col = (f: Field) => map.indexOf(f);
  const canImport = !!rows && col("front") >= 0 && col("back") >= 0 && progress == null && !submitting;

  function run() { return submit(runRequest); }
  async function runRequest() {
    if (!requireOnline("Importing cards")) return;
    if (!rows) return;
    const fi = col("front"), bi = col("back"), ei = col("example"), pi = col("pronunciation");
    let invalid = 0, dupes = 0;
    const seen = new Set<string>();
    if (skipDupes) {
      try {
        const existing = await fetchPaged<{ front: string }>((a, b) => supabase.from("cards").select("front").eq("route_id", routeId).order("id").range(a, b));
        existing.forEach((c) => seen.add(norm(c.front)));
      } catch (e) {
        toast.error(`Couldn't check for duplicates: ${(e as Error).message}`);
        return;
      }
    }
    const toInsert: { route_id: string; front: string; back: string; example: string | null; pronunciation: string | null }[] = [];
    for (const r of body) {
      const front = (r[fi] ?? "").trim();
      const back = (r[bi] ?? "").trim();
      if (!front || !back) { invalid++; continue; }
      if (skipDupes) {
        const k = norm(front);
        if (seen.has(k)) { dupes++; continue; }
        seen.add(k);
      }
      toInsert.push({
        route_id: routeId, front, back,
        example: ei >= 0 ? (r[ei] ?? "").trim() || null : null,
        pronunciation: pi >= 0 ? (r[pi] ?? "").trim() || null : null,
      });
    }
    let imported = 0;
    setProgress(0);
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const { error } = await supabase.from("cards").insert(toInsert.slice(i, i + BATCH));
      if (error) {
        toast.error(`Stopped after ${imported} cards: ${error.message}`);
        break;
      }
      imported += Math.min(BATCH, toInsert.length - i);
      setProgress(Math.round((imported / toInsert.length) * 100));
    }
    setProgress(null);
    const parts = [`Imported ${imported}`];
    if (skipDupes) parts.push(`skipped ${dupes} duplicate${dupes === 1 ? "" : "s"}`);
    parts.push(`${invalid} invalid row${invalid === 1 ? "" : "s"}`);
    setSummary(parts.join(", ") + ".");
    void qc.invalidateQueries({ queryKey: ["cards"] });
    void qc.invalidateQueries({ queryKey: ["route-stats"] });
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Import flashcards" description="CSV or TSV. Files exported from Settings re-import as they are." className="sm:max-w-2xl" dirty={!!rows && !summary} submitting={progress != null || submitting} footer={rows ? summary ? (
      <Button className="h-12 w-full" onClick={() => onOpenChange(false)}>Done</Button>
    ) : (
      <Button form={formId} type="submit" className="h-12 w-full" disabled={!canImport}>
        {progress != null ? `Importing… ${progress}%` : `Import ${body.length} row${body.length === 1 ? "" : "s"}`}
      </Button>
    ) : undefined}>
      <form id={formId} onSubmit={(e) => { e.preventDefault(); if (canImport) void run(); }}>
        <input aria-label="Flashcards file" ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" className="hidden" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
        <Button type="button" variant="outline" className="h-12" onClick={() => fileRef.current?.click()} disabled={progress != null || submitting}>
          {fileName ? `${fileName} · choose another` : "Choose file"}
        </Button>

        {rows && (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {map.map((f, i) => (
                      <th key={i} className="min-w-36 p-2 text-left font-normal">
                        <Label htmlFor={`csv-column-${i}`} className="sr-only">{hasHeader ? rows[0]?.[i] || `Column ${i + 1}` : `Column ${i + 1}`}</Label>
                        <NativeSelect id={`csv-column-${i}`} disabled={submitting} value={f} onChange={(e) => setMap((m) => m.map((x, j) => (j === i ? (e.target.value as Field) : x === e.target.value && e.target.value !== "ignore" ? "ignore" : x)))}>
                          {FIELDS.map((x) => <option key={x} value={x}>{LABEL[x]}</option>)}
                        </NativeSelect>
                        {hasHeader && <Label htmlFor={`csv-column-${i}`} className="mt-1 block truncate text-xs text-muted-foreground">{rows[0]?.[i]}</Label>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.slice(0, 10).map((r, ri) => (
                    <tr key={ri} className="border-t">
                      {Array.from({ length: width }, (_, i) => (
                        <td key={i} className={`max-w-48 truncate p-2 ${map[i] === "ignore" ? "text-muted-foreground" : ""}`}>{r[i]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">Showing {Math.min(10, body.length)} of {body.length} rows.</p>
            <div className="flex flex-col gap-1 sm:flex-row sm:gap-6">
              <label htmlFor="csv-header" className="flex min-h-12 items-center gap-3 text-sm">
                <Checkbox id="csv-header" disabled={submitting} checked={hasHeader} onCheckedChange={(v) => setHasHeader(!!v)} /> First row is a header
              </label>
              <label htmlFor="csv-duplicates" className="flex min-h-12 items-center gap-3 text-sm">
                <Checkbox id="csv-duplicates" disabled={submitting} checked={skipDupes} onCheckedChange={(v) => setSkipDupes(!!v)} /> Skip duplicates (same front on this route)
              </label>
            </div>
            {(col("front") < 0 || col("back") < 0) && <p className="text-sm text-destructive-strong">Pick a Front and a Back column.</p>}
            {progress != null && <Progress value={progress} aria-label="Import progress" />}
            {summary && <p className="rounded-md bg-muted p-3 text-sm" role="status">{summary}</p>}
          </div>
        )}
      </form>
    </ResponsiveDialog>
  );
}
