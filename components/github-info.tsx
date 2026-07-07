"use client";

import {
  AlertCircle,
  Check,
  SettingsIcon,
  Star,
  X,
} from "lucide-react";
import { Loader } from "@/components/motion/loader";
import { type AnchorHTMLAttributes, useEffect, useState } from "react";
import type { BlockMetadata } from "@/lib/types";
import { cn } from "../lib/cn";
import { GithubIcon } from "./icons/github-icon";

export function GithubInfo({
  repo,
  owner,
  className,
  updateBlockMetadata,
  blockId,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  owner: string;
  repo: string;
  blockId: string;
  updateBlockMetadata: (id: string, newMetadata: BlockMetadata) => void;
}) {
  const [stats, setStats] = useState<{ stars: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [tempOwner, setTempOwner] = useState(owner);
  const [tempRepo, setTempRepo] = useState(repo);

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(`/api/github?owner=${owner}&repo=${repo}`)
      .then((res) => {
        if (!res.ok) throw new Error("Rate limit ou erro na API");
        return res.json();
      })
      .then((data) => setStats({ stars: data.stars }))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [owner, repo]);

  const handleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    updateBlockMetadata(blockId, {
      type: "github_repo",
      props: { owner: tempOwner, repo: tempRepo },
    });
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex flex-col gap-2 p-3 rounded-xl border border-indigo-500/50 bg-indigo-500/5 shadow-lg">
        <div className="md:flex gap-2 items-center justify-center">
          <span className="text-sm">Usuário:</span>
          <input
            className="bg-muted border rounded px-2 py-1 text-sm w-full outline-none border-indigo-500"
            placeholder="Owner (ex: facebook)"
            value={tempOwner}
            onChange={(e) => setTempOwner(e.target.value)}
          />
          <span className="text-sm">Repositório:</span>
          <input
            className="bg-muted border rounded px-2 py-1 text-sm w-full outline-none border-indigo-500"
            placeholder="Repo (ex: react)"
            value={tempRepo}
            onChange={(e) => setTempRepo(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-1">
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="p-1 hover:bg-white/10 rounded text-gray-400 hover:cursor-pointer"
          >
            <X size={14} />
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="p-1 bg-indigo-600 hover:bg-indigo-500 rounded text-white hover:cursor-pointer"
          >
            <Check size={14} />
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl border border-red-500/50 bg-red-500/10 text-xs text-red-400">
        <AlertCircle size={14} />
        <span>
          Repositório não encontrado ou limite da API atingido ({owner}/{repo}).
        </span>
      </div>
    );
  }

  return (
    <a
      href={`https://github.com/${owner}/${repo}`}
      rel="noreferrer noopener"
      target="_blank"
      {...props}
      className={cn(
        "flex flex-col gap-1.5 p-3 rounded-xl border border-white/10 bg-secondary text-sm transition-all lg:flex-row lg:items-center hover:bg-gray-500/40",
        className,
      )}
    >
      <div className="flex items-center gap-2 truncate flex-1">
        <GithubIcon />
        <span className="font-medium">
          {owner}/<span className="text-foreground">{repo}</span>
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-gray-400 bg-black/5 px-2 py-0.5 rounded-full">
        {loading ? (
          <Loader variant="spinner" size={12} />
        ) : (
          <>
            <Star className="size-3 text-yellow-500 fill-yellow-500" />
            {humanizeNumber(stats?.stars || 0)}
          </>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          setIsEditing(true);
        }}
        className="absolute hover:cursor-pointer -top-2 -right-2 p-2 bg-muted border border-gray-500/20 dark:border-white/10 rounded-full group-hover:opacity-100 transition-opacity hover:text-indigo-400"
      >
        <SettingsIcon size={12} />
      </button>
    </a>
  );
}

/**
 * Converts a number to a human-readable string with K suffix for thousands
 * @example 1500 -> "1.5K", 1000000 -> "1000000"
 */
function humanizeNumber(num: number): string {
  if (num < 1000) {
    return num.toString();
  }

  if (num < 100000) {
    // For numbers between 1,000 and 99,999, show with one decimal (e.g., 1.5K)
    const value = (num / 1000).toFixed(1);
    // Remove trailing .0 if present
    const formattedValue = value.endsWith(".0") ? value.slice(0, -2) : value;

    return `${formattedValue}K`;
  }

  if (num < 1000000) {
    // For numbers between 10,000 and 999,999, show as whole K (e.g., 10K, 999K)
    return `${Math.floor(num / 1000)}K`;
  }

  // For 1,000,000 and above, just return the number
  return num.toString();
}
