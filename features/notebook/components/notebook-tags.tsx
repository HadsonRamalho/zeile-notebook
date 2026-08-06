"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { setNotebookTags } from "@/lib/api/folders-service";
import { handleApiError } from "@/lib/api/handle-api-error";
import { getCurrentNotebook } from "@/lib/api/notebook-service";
import { useCan } from "./permissions/capabilities";
import { TagEditor, TagList } from "./tags/tag-editor";

export function NotebookTags({ pageId }: { pageId: string }) {
  const t = useTranslations("api_errors");
  const canEdit = useCan()("notebook.tags.edit");
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    getCurrentNotebook(pageId).then((result) =>
      setTags(result.isOk() ? (result.data.tags ?? []) : []),
    );
  }, [pageId]);

  const save = async (next: string[]) => {
    const previous = tags;
    setTags(next);
    const result = await setNotebookTags(pageId, next);
    if (result.isErr()) {
      setTags(previous);
      handleApiError({ err: result.error, t });
    }
  };

  if (!canEdit && tags.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-1">
      <TagList tags={tags} />
      {canEdit && (
        <TagEditor tags={tags} onSave={save} label="Tags do caderno" />
      )}
    </div>
  );
}
