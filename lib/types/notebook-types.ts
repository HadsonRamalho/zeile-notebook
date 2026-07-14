export interface PublicNotebookResponse {
  id: string;
  title: string;
  user_id: string | null;
  team_id: string | null;
  owner_name: string;
  description: string | null;
  updated_at: string;
}

export interface RankedSearchItem {
  kind: "notebook" | "block";
  notebook_id: string;
  block_id: string | null;
  notebook_title: string;
  team_id: string | null;
  team_name: string | null;
  snippet: string;
  rank: number;
}
