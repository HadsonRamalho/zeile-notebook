export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface AdminChartData {
  name: string;
  users: number;
  notebooks: number;
}

export interface AdminSystemStats {
  total_users: number;
  total_active_users: number;
  total_notebooks: number;
  total_public_notebooks: number;
  total_teams: number;
  total_team_members: number;
  chart_data: AdminChartData[];
}

export interface AdminUserView {
  id: string;
  name: string;
  email: string;
  primary_provider: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminTeamView {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  member_count: number;
}

export interface AdminNotebookView {
  id: string;
  userId: string | null;
  teamId: string | null;
  title: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}
