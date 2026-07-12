"use client";

import { ArrowLeft, Check, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AmbientGlow } from "@/components/challenges/ambient-glow";
import { SolveEditor } from "@/components/challenges/solve-editor";
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
import { getProfile } from "@/lib/api/auth-service";
import {
  addTestCase,
  createChallenge,
  setReferenceSolution,
} from "@/lib/api/challenge-service";
import {
  CHALLENGE_LANGUAGES,
  JUDGE_MODES,
  languageLabel,
} from "@/lib/challenges/display";
import type { Language } from "@/lib/types";
import type { ChallengePublic, JudgeMode } from "@/lib/types/challenge-types";
import type { User } from "@/lib/types/user-types";
import { cn } from "@/lib/utils";

type Step = "details" | "tests" | "reference" | "done";

const STARTER_HINT: Record<Language, string> = {
  rust: 'fn main() {\n    println!("Hello");\n}\n',
  go: 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello")\n}\n',
  cpp: '#include <iostream>\n\nint main() {\n    std::cout << "Hello\\n";\n}\n',
  zig: 'const std = @import("std");\n\npub fn main() !void {\n    std.debug.print("Hello\\n", .{});\n}\n',
  typescript: "",
  python: "",
  generic: "",
};

function StepDots({ step }: { step: Step }) {
  const t = useTranslations("challenges.authoring");
  const steps: { key: Step; label: string }[] = [
    { key: "details", label: t("step_details") },
    { key: "tests", label: t("step_tests") },
    { key: "reference", label: t("step_reference") },
  ];
  const activeIndex = steps.findIndex(
    (s) => s.key === (step === "done" ? "reference" : step),
  );

  return (
    <ol className="flex items-center gap-2">
      {steps.map((s, i) => {
        const done = i < activeIndex || step === "done";
        const active = i === activeIndex && step !== "done";
        return (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full font-mono text-[11px] font-semibold transition-colors",
                done
                  ? "bg-primary text-primary-foreground"
                  : active
                    ? "border border-primary text-primary"
                    : "border border-border text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span
              className={cn(
                "text-sm font-medium",
                active || done ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span className="mx-1 h-px w-6 bg-border" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

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

export default function NewChallengePage() {
  const t = useTranslations("challenges.authoring");
  const [user, setUser] = useState<User | null | "loading">("loading");
  const [step, setStep] = useState<Step>("details");
  const [created, setCreated] = useState<ChallengePublic | null>(null);

  useEffect(() => {
    getProfile()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  if (user === "loading") {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (user === null) {
    return (
      <div className="relative mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-3 p-8 text-center">
        <AmbientGlow />
        <h1 className="text-2xl font-bold">{t("not_logged_title")}</h1>
        <p className="text-muted-foreground text-pretty">
          {t("not_logged_description")}
        </p>
        <Link
          href="/login"
          className="mt-2 inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t("back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="relative mx-auto w-full max-w-3xl space-y-8 p-4 pt-8 md:p-8">
      <AmbientGlow />

      <div className="space-y-4">
        <Link
          href="/challenges"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("back")}
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            {t("title")}
          </h1>
          <p className="mt-1 text-muted-foreground text-pretty">
            {t("description")}
          </p>
        </div>
        <StepDots step={step} />
      </div>

      {step === "details" && (
        <DetailsStep
          onCreated={(c) => {
            setCreated(c);
            setStep("tests");
            toast.success(t("created"));
          }}
        />
      )}

      {step === "tests" && created && (
        <TestsStep
          challengeId={created.id}
          onNext={() => setStep("reference")}
        />
      )}

      {step === "reference" && created && (
        <ReferenceStep
          challengeId={created.id}
          onFinish={() => setStep("done")}
        />
      )}

      {step === "done" && created && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card py-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Check className="size-6" />
          </span>
          <h2 className="text-xl font-semibold">{created.title}</h2>
          <Link
            href={`/challenges/${created.slug}`}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("finish")}
          </Link>
        </div>
      )}
    </div>
  );
}

function DetailsStep({
  onCreated,
}: {
  onCreated: (c: ChallengePublic) => void;
}) {
  const t = useTranslations("challenges.authoring");
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [statement, setStatement] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [judgeMode, setJudgeMode] = useState<JudgeMode>("io");
  const [languages, setLanguages] = useState<Language[]>(["rust"]);
  const [timeLimit, setTimeLimit] = useState(5000);
  const [memLimit, setMemLimit] = useState(256);
  const [saving, setSaving] = useState(false);

  const toggleLanguage = (lang: Language) => {
    setLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang],
    );
  };

  const valid =
    /^[a-z0-9-]{2,}$/.test(slug) &&
    title.trim().length >= 2 &&
    statement.trim().length >= 1 &&
    languages.length >= 1;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const created = await createChallenge({
        slug,
        title: title.trim(),
        statementMd: statement,
        difficulty,
        judgeMode,
        languages,
        timeLimitMs: timeLimit,
        memLimitKb: memLimit * 1024,
      });
      onCreated(created);
    } catch {
      toast.error(t("error_generic"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-5 md:p-6">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label={t("field_slug")} hint={t("field_slug_hint")}>
          <Input
            value={slug}
            onChange={(e) =>
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
            }
            placeholder="two-sum"
          />
        </Field>
        <Field label={t("field_title")}>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Two Sum"
          />
        </Field>
      </div>

      <Field label={t("field_statement")}>
        <Textarea
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          placeholder={t("field_statement_placeholder")}
          className="min-h-40 font-mono text-sm"
        />
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
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

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label={t("field_time_limit")}>
          <Input
            type="number"
            value={timeLimit}
            min={500}
            max={30000}
            onChange={(e) => setTimeLimit(Number(e.target.value))}
          />
        </Field>
        <Field label={t("field_mem_limit")}>
          <Input
            type="number"
            value={memLimit}
            min={4}
            max={2048}
            onChange={(e) => setMemLimit(Number(e.target.value))}
          />
        </Field>
      </div>

      <div className="flex justify-end border-t border-border pt-4">
        <Button onClick={submit} disabled={!valid || saving}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {saving ? t("creating") : t("create")}
        </Button>
      </div>
    </div>
  );
}

function TestsStep({
  challengeId,
  onNext,
}: {
  challengeId: string;
  onNext: () => void;
}) {
  const t = useTranslations("challenges.authoring");
  const [input, setInput] = useState("");
  const [expected, setExpected] = useState("");
  const [hidden, setHidden] = useState(false);
  const [weight, setWeight] = useState(1);
  const [count, setCount] = useState(0);
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await addTestCase(challengeId, {
        input,
        expected: expected.length > 0 ? expected : null,
        isHidden: hidden,
        weight,
        ord: count,
      });
      setCount((c) => c + 1);
      setInput("");
      setExpected("");
    } catch {
      toast.error(t("error_generic"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground text-pretty">
        {t("tests_intro")}
      </p>

      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("test_input")}>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="min-h-28 font-mono text-sm"
            />
          </Field>
          <Field label={t("test_expected")} hint={t("test_expected_hint")}>
            <Textarea
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              className="min-h-28 font-mono text-sm"
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
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
          <Button variant="outline" onClick={add} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Plus />}
            {saving ? t("adding") : t("add_test")}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          {t("tests_count", { count })}
        </span>
        <Button onClick={onNext} disabled={count === 0}>
          {t("next")}
        </Button>
      </div>
    </div>
  );
}

function ReferenceStep({
  challengeId,
  onFinish,
}: {
  challengeId: string;
  onFinish: () => void;
}) {
  const t = useTranslations("challenges.authoring");
  const [language, setLanguage] = useState<Language>("rust");
  const [code, setCode] = useState(STARTER_HINT.rust);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (code.trim().length > 0) {
        await setReferenceSolution(challengeId, code, language);
        toast.success(t("reference_saved"));
      }
      onFinish();
    } catch {
      toast.error(t("error_generic"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground text-pretty">
        {t("reference_intro")}
      </p>

      <div className="flex h-[420px] flex-col gap-3">
        <SolveEditor
          value={code}
          onChange={setCode}
          language={language}
          languages={CHALLENGE_LANGUAGES}
          onLanguageChange={(l) => {
            setLanguage(l);
            setCode((prev) => (prev.trim() ? prev : STARTER_HINT[l]));
          }}
        />
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onFinish} disabled={saving}>
          {t("finish")}
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {saving ? t("saving") : t("save_reference")}
        </Button>
      </div>
    </div>
  );
}
