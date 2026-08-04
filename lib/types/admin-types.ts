export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminChartData {
  name: string;
  users: number;
  notebooks: number;
}

export interface AdminSystemStats {
  totalUsers: number;
  totalActiveUsers: number;
  totalNotebooks: number;
  totalPublicNotebooks: number;
  totalTeams: number;
  totalTeamMembers: number;
  chartData: AdminChartData[];
}

export interface AdminUserView {
  id: string;
  name: string;
  email: string;
  primaryProvider: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminTeamView {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  memberCount: number;
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
