"use client";

import { Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
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
  CHALLENGE_LANGUAGES,
  JUDGE_MODE_LABEL_KEYS,
  JUDGE_MODES,
  languageLabel,
} from "@/domain/challenges/display";
import { SolveEditor } from "@/features/notebook/components/blocks/challenge/solve-editor";
import { VerdictBadge } from "@/features/notebook/components/blocks/challenge/verdict-badge";
import {
  addTestCase,
  deleteReference,
  deleteTestCase,
  getReferenceSolutions,
  listTestCases,
  setReferenceSolution,
  updateChallenge,
} from "@/lib/api/challenge-service";
import { cn } from "@/lib/utils";
import type { Language } from "@/types/block-types";
import type {
  AuthoringTestCase,
  ChallengePublic,
  JudgeMode,
} from "@/types/challenge-types";

const PROPERTY_SPEC_EXAMPLE = JSON.stringify(
  { num_cases: 20, seed: 12345, lines: [{ count: 1, min: -1000, max: 1000 }] },
  null,
  2,
);

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
    // biome-ignore lint/a11y/noLabelWithoutControl: children é o controle real, injetado pelo caller
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
  const [propertySpec, setPropertySpec] = useState(() =>
    challenge.propertySpec
      ? JSON.stringify(challenge.propertySpec, null, 2)
      : PROPERTY_SPEC_EXAMPLE,
  );
  const [savingDetails, setSavingDetails] = useState(false);

  const [cases, setCases] = useState<AuthoringTestCase[] | null>(null);
  const [input, setInput] = useState("");
  const [expected, setExpected] = useState("");
  const [hidden, setHidden] = useState(true);
  const [weight, setWeight] = useState(1);
  const [addingCase, setAddingCase] = useState(false);

  const [refByLang, setRefByLang] = useState<Record<string, string>>({});
  const [refLanguage, setRefLanguage] = useState<Language>("rust");
  const [refCode, setRefCode] = useState("");
  const [savingRef, setSavingRef] = useState(false);

  const needsReference = judgeMode === "reference" || judgeMode === "property";
  const needsExpected = judgeMode === "io";

  const refreshCases = useCallback(() => {
    listTestCases(challenge.id)
      .then(setCases)
      .catch(() => setCases([]));
  }, [challenge.id]);

  useEffect(() => {
    refreshCases();
  }, [refreshCases]);

  useEffect(() => {
    getReferenceSolutions(challenge.id)
      .then((ref) => {
        setRefByLang(ref.solutions ?? {});
        const first = Object.keys(ref.solutions ?? {})[0] as
          | Language
          | undefined;
        if (first) {
          setRefLanguage(first);
          setRefCode(ref.solutions[first] ?? "");
        }
      })
      .catch(() => {});
  }, [challenge.id]);

  const toggleLanguage = (lang: Language) => {
    setLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang],
    );
  };

  const saveDetails = async () => {
    if (savingDetails) return;

    let parsedSpec: unknown;
    if (judgeMode === "property") {
      try {
        parsedSpec = JSON.parse(propertySpec);
      } catch {
        toast.error(t("invalid_json"));
        return;
      }
    }

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
        ...(judgeMode === "property" ? { propertySpec: parsedSpec } : {}),
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
        expected: needsExpected && expected.length > 0 ? expected : null,
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

  const selectRefLanguage = (lang: Language) => {
    setRefLanguage(lang);
    setRefCode(refByLang[lang] ?? "");
  };

  const saveReference = async () => {
    if (savingRef || refCode.trim().length === 0) return;
    setSavingRef(true);
    try {
      await setReferenceSolution(challenge.id, refCode, refLanguage);
      setRefByLang((prev) => ({ ...prev, [refLanguage]: refCode }));
      toast.success(t("reference_saved"));
    } catch {
      toast.error(t("error_generic"));
    } finally {
      setSavingRef(false);
    }
  };

  const removeReference = async (lang: string) => {
    try {
      const res = await deleteReference(challenge.id, lang);
      setRefByLang(res.solutions ?? {});
      if (lang === refLanguage) setRefCode("");
    } catch {
      toast.error(t("error_generic"));
    }
  };

  const savedRefLangs = Object.keys(refByLang).filter((l) =>
    (refByLang[l] ?? "").trim(),
  );

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
                    {tc(JUDGE_MODE_LABEL_KEYS[m])}
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

        {judgeMode === "property" && (
          <Field label={t("property_spec")} hint={t("property_intro")}>
            <Textarea
              value={propertySpec}
              onChange={(e) => setPropertySpec(e.target.value)}
              className="min-h-40 font-mono text-sm"
              spellCheck={false}
            />
          </Field>
        )}

        <div className="flex">
          <Button
            onClick={saveDetails}
            disabled={savingDetails}
            className="w-full sm:w-auto sm:ml-auto"
          >
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

        <div
          className={cn(
            "grid grid-cols-1 gap-3",
            needsExpected && "sm:grid-cols-2",
          )}
        >
          <Field label={t("test_input")}>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="min-h-24 font-mono text-sm"
            />
          </Field>
          {needsExpected && (
            <Field label={t("test_expected")} hint={t("test_expected_hint")}>
              <Textarea
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                className="min-h-24 font-mono text-sm"
              />
            </Field>
          )}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-5">
            {/* biome-ignore lint/a11y/noLabelWithoutControl: Switch renderiza um input nativo internamente, biome não enxerga através do componente */}
            <label className="flex items-center gap-2 text-sm font-medium">
              <Switch checked={hidden} onCheckedChange={setHidden} />
              {t("test_hidden")}
            </label>
            {/* biome-ignore lint/a11y/noLabelWithoutControl: Input renderiza um input nativo internamente, biome não enxerga através do componente */}
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
          <Button
            variant="outline"
            onClick={addCase}
            disabled={addingCase}
            className="w-full sm:w-auto"
          >
            {addingCase ? <Loader2 className="animate-spin" /> : <Plus />}
            {t("add_test")}
          </Button>
        </div>
      </Section>

      {needsReference && (
        <Section title={t("step_reference")}>
          <p className="text-xs text-muted-foreground">
            {t("reference_intro")}
          </p>

          {savedRefLangs.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t("reference_saved_langs")}
              </span>
              <div className="flex flex-wrap gap-2">
                {savedRefLangs.map((lang) => (
                  <span
                    key={lang}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border py-1 pl-3 pr-1.5 text-sm font-medium transition-colors",
                      lang === refLanguage
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => selectRefLanguage(lang as Language)}
                    >
                      {languageLabel(lang)}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeReference(lang)}
                      className="rounded-full p-0.5 hover:bg-destructive/10 hover:text-destructive"
                      aria-label={t("remove_reference_aria")}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex h-80 flex-col">
            <SolveEditor
              value={refCode}
              onChange={setRefCode}
              language={refLanguage}
              languages={CHALLENGE_LANGUAGES}
              onLanguageChange={selectRefLanguage}
            />
          </div>
          <div className="flex">
            <Button
              onClick={saveReference}
              disabled={savingRef}
              className="w-full sm:w-auto sm:ml-auto"
            >
              {savingRef ? <Loader2 className="animate-spin" /> : <Check />}
              {t("save_reference")}
            </Button>
          </div>
        </Section>
      )}
    </div>
  );
}
