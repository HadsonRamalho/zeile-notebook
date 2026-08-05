"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useSearchContext } from "@/lib/search-context";

interface SearchResult {
  id: string;
  type: "page" | "text";
  url: string;
  content: string;
}

export default function DefaultSearchDialog() {
  const { open, setOpenSearch } = useSearchContext();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }

    setLoading(true);
    const timeout = setTimeout(() => {
      fetch(`/api/search?query=${encodeURIComponent(query)}`)
        .then((res) => res.json())
        .then((data) => setResults(Array.isArray(data) ? data : []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 200);

    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <Dialog open={open} onOpenChange={setOpenSearch}>
      <DialogContent className="gap-0 p-0 top-[20%] translate-y-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Buscar</DialogTitle>
        <div className="flex items-center gap-2 border-b px-4">
          <Search className="size-4 shrink-0 text-fd-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar..."
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-fd-muted-foreground"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {loading && (
            <p className="p-4 text-center text-sm text-fd-muted-foreground">
              Buscando...
            </p>
          )}
          {!loading && query && results.length === 0 && (
            <p className="p-4 text-center text-sm text-fd-muted-foreground">
              Nenhum resultado encontrado.
            </p>
          )}
          {results.map((result) => (
            <Link
              key={result.id}
              href={result.url}
              onClick={() => setOpenSearch(false)}
              className="block rounded-md px-3 py-2 text-sm hover:bg-fd-accent hover:text-fd-accent-foreground"
            >
              {result.content}
            </Link>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
