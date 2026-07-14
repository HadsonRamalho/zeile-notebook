"use client";

import { Check, Compass, Play, Plus, Rocket, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLocalStorage } from "@/hooks/use-local-storate";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "zeile-onboarding-dismissed";

interface OnboardingChecklistProps {
  hasNotebooks: boolean;
  onCreateNotebook: () => void;
}

export function OnboardingChecklist({
  hasNotebooks,
  onCreateNotebook,
}: OnboardingChecklistProps) {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const [dismissed, setDismissed] = useLocalStorage(STORAGE_KEY, false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || dismissed) return null;

  const steps = [
    {
      key: "create",
      done: hasNotebooks,
      title: t("step_create_title"),
      description: t("step_create_desc"),
      icon: <Plus className="size-4" />,
      action: (
        <Button size="sm" onClick={onCreateNotebook} className="gap-2">
          <Plus className="size-4" />
          {t("action_create")}
        </Button>
      ),
    },
    {
      key: "run",
      done: false,
      title: t("step_run_title"),
      description: t("step_run_desc"),
      icon: <Play className="size-4" />,
      action: null,
    },
    {
      key: "explore",
      done: false,
      title: t("step_explore_title"),
      description: t("step_explore_desc"),
      icon: <Compass className="size-4" />,
      action: (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => router.push("/explore")}
          className="gap-2"
        >
          <Compass className="size-4" />
          {t("action_explore")}
        </Button>
      ),
    },
  ];

  return (
    <section className="relative flex flex-col gap-4 rounded-xl border border-border bg-card/60 p-5">
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label={t("dismiss")}
        className="absolute right-3 top-3 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="size-4" />
      </button>

      <div className="flex items-center gap-2.5">
        <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted/40 text-primary">
          <Rocket className="size-4" />
        </div>
        <div className="flex flex-col">
          <h2 className="text-base font-semibold text-foreground">
            {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

      <ol className="flex flex-col gap-2.5">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-3"
          >
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] transition-colors",
                step.done
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground",
              )}
            >
              {step.done ? <Check className="size-3.5" /> : index + 1}
            </span>
            <div className="flex flex-1 flex-col">
              <span
                className={cn(
                  "flex items-center gap-1.5 text-sm font-medium",
                  step.done
                    ? "text-muted-foreground line-through"
                    : "text-foreground",
                )}
              >
                {step.icon}
                {step.title}
              </span>
              <span className="text-xs text-muted-foreground">
                {step.description}
              </span>
            </div>
            {!step.done && step.action}
          </li>
        ))}
      </ol>
    </section>
  );
}
