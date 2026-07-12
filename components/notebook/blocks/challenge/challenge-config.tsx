"use client";

import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { SolveEditor } from "@/components/challenges/solve-editor";
import { VerdictBadge } from "@/components/challenges/verdict-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  addTestCase,
  deleteTestCase,
  listTestCases,
  setReferenceSolution,
  updateChallenge,
} from "@/lib/api/challenge-service";
import {
  CHALLENGE_LANGUAGES,
  JUDGE_MODES,
  languageLabel,
} from "@/lib/challenges/display";
import type { Language } from "@/lib/types";
import type {
  AuthoringTestCase,
  ChallengePublic,
  JudgeMode,
} from "@/lib/types/challenge-types";
import { cn } from "@/lib/utils";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <h4 className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  );
}

export function ChallengeConfig({
  challenge,
  onUpdated,
}: {
  challenge: ChallengePublic;
  onUpdated: (c: ChallengePublic) => void;
}) {
  const t = useTranslations("challenges.authoring");
  const tc = useTranslations("challenges");

  const [title, setTitle] = useState(challenge.title);
  const [statement, setStatement] = useState(challenge.statementMd);
  const [difficulty, setDifficulty] = useState(challenge.difficulty);
  const [judgeMode, setJudgeMode] = useState<JudgeMode>(challenge.judgeMode);
  const [languages, setLanguages] = useState<Language[]>(challenge.languages);
  const [timeLimit, setTimeLimit] = useState(challenge.timeLimitMs);
  const [memLimit, setMemLimit] = useState(
    Math.round(challenge.memLimitKb / 1024),
  );
  const [savingDetails, setSavingDetails] = useState(false);

  const [cases, setCases] = useState<AuthoringTestCase[] | null>(null);
  const [input, setInput] = useState("");
  const [expected, setExpected] = useState("");
  const [hidden, setHidden] = useState(true);
  const [weight, setWeight] = useState(1);
  const [addingCase, setAddingCase] = useState(false);

  const [refLanguage, setRefLanguage] = useState<Language>("rust");
  const [refCode, setRefCode] = useState("");
  const [savingRef, setSavingRef] = useState(false);

  const refreshCases = useCallback(() => {
    listTestCases(challenge.id)
      .then(setCases)
      .catch(() => setCases([]));
  }, [challenge.id]);

  useEffect(() => {
    refreshCases();
  }, [refreshCases]);

  const toggleLanguage = (lang: Language) => {
    setLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang],
    );
  };

  const saveDetails = async () => {
    if (savingDetails) return;
    setSavingDetails(true);
    try {
      const updated = await updateChallenge(challenge.id, {
        title: title.trim(),
        statementMd: statement,
        difficulty,
        judgeMode,
        languages,
        timeLimitMs: timeLimit,
        memLimitKb: memLimit * 1024,
      });
      onUpdated(updated);
      toast.success(t("reference_saved"));
    } catch {
      toast.error(t("error_generic"));
    } finally {
      setSavingDetails(false);
    }
  };

  const addCase = async () => {
    if (addingCase) return;
    setAddingCase(true);
    try {
      await addTestCase(challenge.id, {
        input,
        expected: expected.length > 0 ? expected : null,
        isHidden: hidden,
        weight,
        ord: cases?.length ?? 0,
      });
      setInput("");
      setExpected("");
      refreshCases();
    } catch {
      toast.error(t("error_generic"));
    } finally {
      setAddingCase(false);
    }
  };

  const removeCase = async (caseId: string) => {
    try {
      await deleteTestCase(challenge.id, caseId);
      setCases((prev) => prev?.filter((c) => c.id !== caseId) ?? null);
    } catch {
      toast.error(t("error_generic"));
    }
  };

  const saveReference = async () => {
    if (savingRef || refCode.trim().length === 0) return;
    setSavingRef(true);
    try {
      await setReferenceSolution(challenge.id, refCode, refLanguage);
      toast.success(t("reference_saved"));
    } catch {
      toast.error(t("error_generic"));
    } finally {
      setSavingRef(false);
    }
  };

  return (
    <div className="space-y-4">
      <Section title={t("step_details")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("field_title")}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label={t("field_difficulty")}>
            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field label={t("field_statement")}>
          <Textarea
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            className="min-h-32 font-mono text-sm"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("field_judge_mode")}>
            <Select
              value={judgeMode}
              onValueChange={(v) => setJudgeMode(v as JudgeMode)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JUDGE_MODES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {tc(`judge_mode.${m}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("field_time_limit")}>
              <Input
                type="number"
                value={timeLimit}
                onChange={(e) => setTimeLimit(Number(e.target.value))}
              />
            </Field>
            <Field label={t("field_mem_limit")}>
              <Input
                type="number"
                value={memLimit}
                onChange={(e) => setMemLimit(Number(e.target.value))}
              />
            </Field>
          </div>
        </div>

        <Field label={t("field_languages")}>
          <div className="flex flex-wrap gap-2">
            {CHALLENGE_LANGUAGES.map((lang) => {
              const active = languages.includes(lang);
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => toggleLanguage(lang)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  {languageLabel(lang)}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="flex justify-end">
          <Button onClick={saveDetails} disabled={savingDetails}>
            {savingDetails ? <Loader2 className="animate-spin" /> : <Check />}
            {t("create")}
          </Button>
        </div>
      </Section>

      <Section title={t("step_tests")}>
        <p className="text-xs text-muted-foreground">{t("tests_intro")}</p>

        {cases === null ? (
          <div className="h-16 animate-pulse rounded-lg bg-muted" />
        ) : cases.length > 0 ? (
          <ul className="space-y-2">
            {cases.map((c, i) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
              >
                <span className="flex items-center gap-2 truncate text-sm">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    #{i + 1}
                  </span>
                  {c.isHidden ? (
                    <VerdictBadge verdict="SKIP" className="border-border" />
                  ) : null}
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {c.input.slice(0, 40) || "—"}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    ×{c.weight}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeCase(c.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Excluir caso"
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("test_input")}>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="min-h-24 font-mono text-sm"
            />
          </Field>
          <Field label={t("test_expected")} hint={t("test_expected_hint")}>
            <Textarea
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              className="min-h-24 font-mono text-sm"
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Switch checked={hidden} onCheckedChange={setHidden} />
              {t("test_hidden")}
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              {t("test_weight")}
              <Input
                type="number"
                min={0}
                value={weight}
                onChange={(e) => setWeight(Number(e.target.value))}
                className="h-8 w-20"
              />
            </label>
          </div>
          <Button variant="outline" onClick={addCase} disabled={addingCase}>
            {addingCase ? <Loader2 className="animate-spin" /> : <Plus />}
            {t("add_test")}
          </Button>
        </div>
      </Section>

      <Section title={t("step_reference")}>
        <p className="text-xs text-muted-foreground">{t("reference_intro")}</p>
        <div className="flex h-80 flex-col">
          <SolveEditor
            value={refCode}
            onChange={setRefCode}
            language={refLanguage}
            languages={CHALLENGE_LANGUAGES}
            onLanguageChange={setRefLanguage}
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={saveReference} disabled={savingRef}>
            {savingRef ? <Loader2 className="animate-spin" /> : <Check />}
            {t("save_reference")}
          </Button>
        </div>
      </Section>
    </div>
  );
}
