"use client";

import { GithubInfo } from "./github-info";

interface GithubRepoMDXProps {
  owner: string;
  repo: string;
}

export function GithubRepoMDX({ owner, repo }: GithubRepoMDXProps) {
  const dummyUpdateMetadata = () => {
    console.warn(
      "Edição de blocos desabilitada no modo de visualização (MDX).",
    );
  };

  return (
    <div className="relative group my-4 max-w-sm">
      <GithubInfo
        owner={owner}
        repo={repo}
        blockId="mdx-static-id"
        updateBlockMetadata={dummyUpdateMetadata}
      />
      <div className="absolute top-0 right-0 w-8 h-8 z-10" />
    </div>
  );
}
