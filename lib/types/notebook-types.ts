export interface PublicNotebookResponse {
  id: string;
  title: string;
  userId: string | null;
  teamId: string | null;
  ownerName: string;
  description: string | null;
  updatedAt: string;
}

export interface PublicNotebookDoc {
  id: string;
  title: string;
  ownerName: string | null;
  updatedAt: string;
  publicSlug: string | null;
  documentData: number[] | null;
}

export interface RankedSearchItem {
  kind: "notebook" | "block";
  notebookId: string;
  blockId: string | null;
  notebookTitle: string;
  teamId: string | null;
  teamName: string | null;
  snippet: string;
  rank: number;
}
