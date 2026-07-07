"use client";

import { Pencil, Plus, Save, Shield, X } from "lucide-react";
import { Loader } from "@/components/motion/loader";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { handleApiError } from "@/lib/api/handle-api-error";
import { updateRole } from "@/lib/api/teams-service";
import type { TeamRole, UpdateTeamRole } from "@/lib/types/team-types";

interface TeamRolesProps {
  teamId: string;
  roles: TeamRole[];
  onUpdate: () => void;
}

export function TeamRoles({ teamId, roles, onUpdate }: TeamRolesProps) {
  const t = useTranslations("api_errors");
  const a = useTranslations("team_settings.team_role");

  const [editingRole, setEditingRole] = useState<TeamRole | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleEditClick = (role: TeamRole) => {
    setEditingRole({ ...role });
  };

  const handlePermissionChange = (key: keyof TeamRole, value: boolean) => {
    if (editingRole) {
      setEditingRole({ ...editingRole, [key]: value });
    }
  };

  const handleSaveChanges = async () => {
    if (!editingRole) return;

    setIsSaving(true);
    try {
      const payload: UpdateTeamRole = {
        id: editingRole.id,
        name: editingRole.name,
        can_read: editingRole.can_read,
        can_write: editingRole.can_write,
        can_manage_privacy: editingRole.can_manage_privacy,
        can_manage_clones: editingRole.can_manage_clones,
        can_invite_users: editingRole.can_invite_users,
        can_remove_users: editingRole.can_remove_users,
        can_manage_permissions: editingRole.can_manage_permissions,
      };

      await updateRole(teamId, payload);

      toast.success("Cargo atualizado com sucesso!");
      onUpdate();
      setEditingRole(null);
    } catch (err) {
      handleApiError({ err, t });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Shield className="size-5" />
              {a("title")}
            </CardTitle>
            <CardDescription>{a("description")}</CardDescription>
          </div>
          <Button size="sm" className="gap-2">
            <Plus size={16} /> {a("new_role_button")}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map((role) => (
              <div
                key={role.id}
                className="border rounded-lg p-5 bg-muted/40 space-y-4 shadow-sm"
              >
                <div className="flex items-center justify-between border-b pb-3">
                  <h4 className="font-semibold">{role.name}</h4>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8"
                    onClick={() => handleEditClick(role)}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    {a("edit_role_button")}
                  </Button>
                </div>

                <div className="space-y-2.5 text-sm">
                  <PermissionItem label="Ler Notebook" active={role.can_read} />
                  <PermissionItem
                    label={a("roles.can_write")}
                    active={role.can_write}
                  />
                  <PermissionItem
                    label={a("roles.can_manage_privacy")}
                    active={role.can_manage_privacy}
                  />
                  <PermissionItem
                    label={a("roles.can_invite_users")}
                    active={role.can_invite_users}
                  />
                  <PermissionItem
                    label={a("roles.can_manage_permissions")}
                    active={role.can_manage_permissions}
                  />
                  <PermissionItem
                    label={a("roles.can_manage_clones")}
                    active={role.can_manage_clones}
                  />
                  <PermissionItem
                    label={a("roles.can_manage_team")}
                    active={role.can_manage_team}
                  />
                  <PermissionItem
                    label={a("roles.can_remove_users")}
                    active={role.can_remove_users}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={!!editingRole}
        onOpenChange={(open) => !open && setEditingRole(null)}
      >
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Cargo</DialogTitle>
            <DialogDescription>
              Ajuste o nome e as permissões atreladas a este cargo.
            </DialogDescription>
          </DialogHeader>

          {editingRole && (
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label htmlFor="role-name">Nome do Cargo</Label>
                <Input
                  id="role-name"
                  value={editingRole.name}
                  onChange={(e) =>
                    setEditingRole({ ...editingRole, name: e.target.value })
                  }
                />
              </div>

              <div className="space-y-4 border-t pt-4">
                <Label className="text-muted-foreground">Permissões</Label>

                <PermissionSwitch
                  label="Ler Notebooks"
                  checked={editingRole.can_read}
                  onChange={(v) => handlePermissionChange("can_read", v)}
                />
                <PermissionSwitch
                  label={a("roles.can_write")}
                  checked={editingRole.can_write}
                  onChange={(v) => handlePermissionChange("can_write", v)}
                />
                <PermissionSwitch
                  label={a("roles.can_manage_privacy")}
                  checked={editingRole.can_manage_privacy}
                  onChange={(v) =>
                    handlePermissionChange("can_manage_privacy", v)
                  }
                />
                <PermissionSwitch
                  label={a("roles.can_invite_users")}
                  checked={editingRole.can_invite_users}
                  onChange={(v) =>
                    handlePermissionChange("can_invite_users", v)
                  }
                />
                <PermissionSwitch
                  label={a("roles.can_manage_permissions")}
                  checked={editingRole.can_manage_permissions}
                  onChange={(v) =>
                    handlePermissionChange("can_manage_permissions", v)
                  }
                />
                <PermissionSwitch
                  label={a("roles.can_manage_clones")}
                  checked={editingRole.can_manage_clones}
                  onChange={(v) =>
                    handlePermissionChange("can_manage_clones", v)
                  }
                />
                <PermissionSwitch
                  label={a("roles.can_manage_team")}
                  checked={editingRole.can_manage_team}
                  onChange={(v) => handlePermissionChange("can_manage_team", v)}
                />
                <PermissionSwitch
                  label={a("roles.can_remove_users")}
                  checked={editingRole.can_remove_users}
                  onChange={(v) =>
                    handlePermissionChange("can_remove_users", v)
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingRole(null)}
              disabled={isSaving}
            >
              <X className="mr-2 h-4 w-4" />
              Cancelar
            </Button>
            <Button
              onClick={handleSaveChanges}
              disabled={isSaving || !editingRole?.name.trim()}
            >
              {isSaving ? (
                <Loader variant="spinner" size={16} className="mr-2" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PermissionItem({ label, active }: { label: string; active: boolean }) {
  const a = useTranslations("team_settings.team_role");

  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          active ? "text-primary font-medium" : "text-muted-foreground/40"
        }
      >
        {active ? a("active") : a("inactive")}
      </span>
    </div>
  );
}

function PermissionSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-sm font-normal cursor-pointer leading-snug">
        {label}
      </Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
