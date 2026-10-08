import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSubmission } from "@/hooks/use-submission";
import { batchPayloads, parseBackup, payloadRows, planImport, TABLES, zeroCounts, type Counts, type ParsedBackup, type Table } from "@/lib/backup";
import { useRoutes } from "@/lib/data";
import { requireOnline } from "@/lib/sync";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const NAMES: Record<Table, string> = { routes: "Routes", milestones: "Milestones", sessions: "Sessions", cards: "Cards", reviews: "Reviews", checkins: "Check-ins", notes: "Notes" };

type Result = { imported: Counts; skipped: Counts; invalid: Counts; error?: string };

export function ImportBackup() {
  const qc = useQueryClient();
  const { data: routes } = useRoutes();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<string>("");
  const [backup, setBackup] = useState<ParsedBackup | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mode, setMode] = useState<"skip" | "copy">("skip");
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const { submitting, submit } = useSubmission();

  const plan = backup && routes ? planImport(backup, routes, mode) : null;

  function reset(o: boolean) {
    setOpen(o);
    if (!o) { setBackup(null); setFile(""); setFileError(null); setResult(null); setProgress(null); setMode("skip"); }
  }

  async function pick(f: File | undefined) {
    setBackup(null); setResult(null); setFileError(null);
    if (!f) return;
    setFile(f.name);
    try {
      setBackup(parseBackup(await f.text()));
    } catch (e) {
      setFileError((e as Error).message);
    }
  }

  function run() { return submit(runRequest); }
  async function runRequest() {
    if (!plan || !requireOnline("Importing a backup")) return;
    const imported = zeroCounts();
    const total = plan.payloads.reduce((n, p) => n + payloadRows(p), 0) || 1;
    let done = 0;
    setProgress(0);
    let error: string | undefined;
    outer: for (const batch of batchPayloads(plan.payloads, 500)) {
      for (const p of batch) {
        // One call per route: the route and all its children land together or not at all.
        const { error: e } = await supabase.rpc("import_route", { _data: p as never });
        if (e) { error = `Stopped at “${p.route.name}”: ${e.message}`; break outer; }
        imported.routes++;
        for (const t of TABLES) if (t !== "routes") imported[t] += p[t].length;
        done += payloadRows(p);
      }
      setProgress(Math.round((done / total) * 100));
    }
    const skipped = { ...plan.skipped };
    setResult({ imported, skipped, invalid: plan.invalid, error });
    setProgress(null);
    await qc.invalidateQueries();
    if (error) toast.error("Import stopped. Everything listed as imported was saved.");
    else toast.success("Backup imported.");
  }

  return (
    <>
      <Button variant="outline" className="h-12 w-full justify-start" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" /> Import backup
      </Button>
      <Dialog open={open} onOpenChange={(o) => !submitting && reset(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import backup</DialogTitle>
            <DialogDescription>Adds the routes and everything in them from an Ascent export to this account, as new data.</DialogDescription>
          </DialogHeader>

          {!result && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="backup-file">Backup file (.json)</Label>
                <input id="backup-file" type="file" accept="application/json,.json" disabled={submitting} onChange={(e) => void pick(e.target.files?.[0])}
                  className="mt-2 block w-full text-sm file:mr-3 file:h-11 file:rounded-lg file:border-0 file:bg-secondary file:px-4 file:font-medium file:text-secondary-foreground" />
                {file && fileError && <p role="alert" className="mt-2 text-sm text-destructive-strong">{fileError}</p>}
              </div>

              {plan && backup && (
                <>
                  <div className="surface p-4 text-sm">
                    <p className="mb-2 font-medium">Exported {new Date(backup.exportedAt).toLocaleString()}. Will import:</p>
                    <ul className="grid grid-cols-2 gap-1">
                      {TABLES.map((t) => <li key={t}>{plan.toImport[t].toLocaleString()} {NAMES[t].toLowerCase()}</li>)}
                    </ul>
                    {TABLES.some((t) => plan.invalid[t] || plan.skipped[t]) && (
                      <p className="mt-2 text-muted-foreground">
                        Left out: {TABLES.filter((t) => plan.invalid[t] + plan.skipped[t]).map((t) => `${plan.invalid[t] + plan.skipped[t]} ${NAMES[t].toLowerCase()}`).join(", ")}.
                      </p>
                    )}
                  </div>

                  {plan.duplicates > 0 && (
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium">{plan.duplicates} route{plan.duplicates === 1 ? "" : "s"} already exist here with the same name and type.</legend>
                      <RadioGroup value={mode} onValueChange={(v) => setMode(v as "skip" | "copy")} disabled={submitting}>
                        <div className="flex min-h-12 items-center gap-3">
                          <RadioGroupItem id="dup-skip" value="skip" />
                          <Label htmlFor="dup-skip">Skip them (and everything in them)</Label>
                        </div>
                        <div className="flex min-h-12 items-center gap-3">
                          <RadioGroupItem id="dup-copy" value="copy" />
                          <Label htmlFor="dup-copy">Import as copies</Label>
                        </div>
                      </RadioGroup>
                    </fieldset>
                  )}

                  {progress != null && <Progress value={progress} aria-label="Import progress" aria-valuetext={`${progress}% imported`} />}
                </>
              )}
            </div>
          )}

          {result && (
            <div className="space-y-3 text-sm" role="status">
              {result.error && <p className="text-destructive-strong">{result.error}</p>}
              <table className="w-full text-left">
                <thead><tr className="text-muted-foreground"><th className="py-1 font-medium">Table</th><th className="font-medium">Imported</th><th className="font-medium">Skipped</th><th className="font-medium">Invalid</th></tr></thead>
                <tbody>
                  {TABLES.map((t) => (
                    <tr key={t} className="border-t"><td className="py-1">{NAMES[t]}</td><td>{result.imported[t]}</td><td>{result.skipped[t]}</td><td>{result.invalid[t]}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <DialogFooter>
            {result ? (
              <Button className="h-12" onClick={() => reset(false)}>Done</Button>
            ) : (
              <>
                <Button variant="ghost" className="h-12" disabled={submitting} onClick={() => reset(false)}>Cancel</Button>
                <Button className="h-12" disabled={!plan || plan.payloads.length === 0 || submitting} onClick={run}>
                  {submitting ? "Importing…" : plan ? `Import ${plan.toImport.routes} route${plan.toImport.routes === 1 ? "" : "s"}` : "Import"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
