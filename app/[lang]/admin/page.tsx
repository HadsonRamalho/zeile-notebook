"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Book, Shield, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { AdminNotify } from "@/components/interface/admin/admin-notify";
import { BackButton } from "@/components/interface/back-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NumberTicker } from "@/components/ui/number-ticker";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { useAuth } from "@/context/auth-context";
import {
  fetchAdminNotebooks,
  fetchAdminStats,
  fetchAdminTeams,
  fetchAdminUsers,
} from "@/lib/api/admin-service";
import type {
  AdminNotebookView,
  AdminSystemStats,
  AdminTeamView,
  AdminUserView,
} from "@/lib/types/admin-types";

export default function AdminDashboardPage() {
  const { user } = useAuth();

  const [stats, setStats] = useState<AdminSystemStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotalPages, setUsersTotalPages] = useState(1);

  const [teams, setTeams] = useState<AdminTeamView[]>([]);
  const [teamsPage, setTeamsPage] = useState(1);
  const [teamsTotalPages, setTeamsTotalPages] = useState(1);

  const [notebooks, setNotebooks] = useState<AdminNotebookView[]>([]);
  const [notebooksPage, setNotebooksPage] = useState(1);
  const [notebooksTotalPages, setNotebooksTotalPages] = useState(1);

  async function loadStats() {
    try {
      const data = await fetchAdminStats();
      setStats(data);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoadingStats(false);
    }
  }

  async function loadUsers() {
    try {
      const data = await fetchAdminUsers(usersPage, 10);
      setUsers(data.data);
      setUsersTotalPages(data.total_pages);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadTeams() {
    try {
      const data = await fetchAdminTeams(teamsPage, 10);
      setTeams(data.data);
      setTeamsTotalPages(data.total_pages);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadNotebooks() {
    try {
      const data = await fetchAdminNotebooks(notebooksPage, 10);
      setNotebooks(data.data);
      setNotebooksTotalPages(data.total_pages);
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    Promise.all([loadStats(), loadUsers(), loadNotebooks(), loadTeams()]);
  }, []);

  if (user?.role !== "Admin") {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        Você não tem permissão para acessar essa página.
        <BackButton />
      </div>
    );
  }

  if (isLoadingStats) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        Carregando dados...
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 p-8 pt-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Painel Administrativo
          </h1>
          <p className="text-muted-foreground">
            Gestão centralizada de usuários, times e cadernos.
          </p>
          <BackButton />
        </div>

        <Tabs defaultValue="overview" className="w-full relative flex flex-col">
          <div className="flex w-full justify-start mb-6">
            <TabsList className="grid w-full grid-cols-5 lg:w-125">
              <TabsTrigger value="overview">Visão Geral</TabsTrigger>
              <TabsTrigger value="users">Usuários</TabsTrigger>
              <TabsTrigger value="teams">Times</TabsTrigger>
              <TabsTrigger value="notebooks">Cadernos</TabsTrigger>
              <TabsTrigger value="notify">Notificar</TabsTrigger>
            </TabsList>
          </div>

          <div className="relative w-full shadow-none">
            <TabsContent value="overview" className="space-y-4 pt-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      Usuários Ativos
                    </CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      <NumberTicker value={stats?.total_active_users || 0} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      de {stats?.total_users || 0} contas registradas
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      Cadernos Criados
                    </CardTitle>
                    <Book className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      <NumberTicker value={stats?.total_notebooks || 0} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {stats?.total_public_notebooks || 0} definidos como
                      públicos
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      Times Registrados
                    </CardTitle>
                    <Shield className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      <NumberTicker value={stats?.total_teams || 0} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {stats?.total_team_members || 0} membros vinculados
                    </p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="users" className="pt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Gestão de Usuários</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Provedor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">
                          Data de Cadastro
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">
                            {user.name}
                          </TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {user.primary_provider}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {user.is_active ? (
                              <Badge className="bg-emerald-500 hover:bg-emerald-600">
                                Ativo
                              </Badge>
                            ) : (
                              <Badge variant="destructive">Inativo</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {format(new Date(user.created_at), "dd MMM yyyy", {
                              locale: ptBR,
                            })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <div className="mt-4 flex items-center justify-end">
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            onClick={() =>
                              setUsersPage((p) => Math.max(1, p - 1))
                            }
                            className={
                              usersPage === 1
                                ? "pointer-events-none opacity-50"
                                : "cursor-pointer"
                            }
                          />
                        </PaginationItem>
                        <PaginationItem>
                          <span className="px-4 text-sm text-muted-foreground">
                            Página {usersPage} de {usersTotalPages}
                          </span>
                        </PaginationItem>
                        <PaginationItem>
                          <PaginationNext
                            onClick={() =>
                              setUsersPage((p) =>
                                Math.min(usersTotalPages, p + 1),
                              )
                            }
                            className={
                              usersPage === usersTotalPages
                                ? "pointer-events-none opacity-50"
                                : "cursor-pointer"
                            }
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="teams" className="pt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Gestão de Times</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome do Time</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Membros</TableHead>
                        <TableHead className="text-right">
                          Data de Criação
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teams.map((team) => (
                        <TableRow key={team.id}>
                          <TableCell className="font-medium">
                            {team.name}
                          </TableCell>
                          <TableCell className="max-w-75 truncate text-muted-foreground">
                            {team.description || "Sem descrição"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {team.member_count} associados
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {format(
                              new Date(`${team.created_at}Z`),
                              "dd MMM yyyy",
                              {
                                locale: ptBR,
                              },
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <div className="mt-4 flex items-center justify-end">
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            onClick={() =>
                              setTeamsPage((p) => Math.max(1, p - 1))
                            }
                            className={
                              teamsPage === 1
                                ? "pointer-events-none opacity-50"
                                : "cursor-pointer"
                            }
                          />
                        </PaginationItem>
                        <PaginationItem>
                          <span className="px-4 text-sm text-muted-foreground">
                            Página {teamsPage} de {teamsTotalPages}
                          </span>
                        </PaginationItem>
                        <PaginationItem>
                          <PaginationNext
                            onClick={() =>
                              setTeamsPage((p) =>
                                Math.min(teamsTotalPages, p + 1),
                              )
                            }
                            className={
                              teamsPage === teamsTotalPages
                                ? "pointer-events-none opacity-50"
                                : "cursor-pointer"
                            }
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notebooks" className="pt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Registro de Cadernos</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Título</TableHead>
                        <TableHead>Privacidade</TableHead>
                        <TableHead className="text-right">
                          Última Atualização
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {notebooks.map((notebook) => (
                        <TableRow key={notebook.id}>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {notebook.id}
                          </TableCell>
                          <TableCell className="font-medium">
                            {notebook.title}
                          </TableCell>
                          <TableCell>
                            {notebook.isPublic ? (
                              <Badge
                                variant="default"
                                className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-0"
                              >
                                Público
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Privado</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {format(
                              new Date(notebook.updatedAt),
                              "dd MMM yyyy",
                              {
                                locale: ptBR,
                              },
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <div className="mt-4 flex items-center justify-end">
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            onClick={() =>
                              setNotebooksPage((p) => Math.max(1, p - 1))
                            }
                            className={
                              notebooksPage === 1
                                ? "pointer-events-none opacity-50"
                                : "cursor-pointer"
                            }
                          />
                        </PaginationItem>
                        <PaginationItem>
                          <span className="px-4 text-sm text-muted-foreground">
                            Página {notebooksPage} de {notebooksTotalPages}
                          </span>
                        </PaginationItem>
                        <PaginationItem>
                          <PaginationNext
                            onClick={() =>
                              setNotebooksPage((p) =>
                                Math.min(notebooksTotalPages, p + 1),
                              )
                            }
                            className={
                              notebooksPage === notebooksTotalPages
                                ? "pointer-events-none opacity-50"
                                : "cursor-pointer"
                            }
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notify">
              <AdminNotify />
            </TabsContent>
          </div>
        </Tabs>
      </div>
  );
}
