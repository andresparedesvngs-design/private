import { useMemo, useState } from "react";
import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  useAuthMe,
  useUsers,
  useCreateUser,
  useUpdateUser,
  useResetUserPassword,
  useUpdateUserPermissions,
  useDeleteUser,
  type AdminUser,
} from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";

export default function Users() {
  const { data: me } = useAuthMe();
  const isAdmin = me?.role === "admin";
  const { data: users, isLoading } = useUsers(isAdmin);
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const resetPassword = useResetUserPassword();
  const updatePermissions = useUpdateUserPermissions();
  const deleteUser = useDeleteUser();

  const roleOptions = [
    { label: "Admin", value: "admin" },
    { label: "Supervisor", value: "supervisor" },
    { label: "Ejecutivo", value: "executive" },
  ] as const;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createUsername, setCreateUsername] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<"admin" | "supervisor" | "executive">("executive");

  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editExecutivePhone, setEditExecutivePhone] = useState("");
  const [editRole, setEditRole] = useState<"admin" | "supervisor" | "executive">("executive");
  const [editActive, setEditActive] = useState(true);
  const [editPermissions, setEditPermissions] = useState("");

  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");

  const visibleUsers = useMemo(() => users ?? [], [users]);

  const openEdit = (user: AdminUser) => {
    setEditingUser(user);
    setEditDisplayName(user.displayName ?? "");
    setEditExecutivePhone(user.executivePhone ?? "");
    setEditRole((user.role as any) ?? "executive");
    setEditActive(Boolean(user.active));
    setEditPermissions((user.permissions ?? []).join(", "));
  };

  const handleCreate = async () => {
    const username = createUsername.trim().toLowerCase();
    const password = createPassword.trim();
    if (!username || !password) {
      alert("Username y password son requeridos");
      return;
    }
    if (username.length < 3) {
      alert("Username debe tener al menos 3 caracteres");
      return;
    }
    if (password.length < 6) {
      alert("Password debe tener al menos 6 caracteres");
      return;
    }
    try {
      await createUser.mutateAsync({
        username,
        password,
        role: createRole,
      });
      setCreateUsername("");
      setCreatePassword("");
      setCreateRole("executive");
      setIsCreateOpen(false);
    } catch (error: any) {
      alert(getErrorMessage(error, "Error al crear usuario"));
    }
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    try {
      await updateUser.mutateAsync({
        id: editingUser.id,
        data: {
          displayName: editDisplayName || null,
          executivePhone: editExecutivePhone || null,
          role: editRole,
          active: editActive,
        },
      });

      const permissions = editPermissions
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      await updatePermissions.mutateAsync({
        id: editingUser.id,
        permissions,
      });

      setEditingUser(null);
    } catch (error: any) {
      alert(getErrorMessage(error, "Error al actualizar usuario"));
    }
  };

  const handleResetPassword = async () => {
    if (!resetUserId) return;
    if (!resetPasswordValue.trim()) {
      alert("Ingresa la nueva contraseña");
      return;
    }
    try {
      await resetPassword.mutateAsync({
        id: resetUserId,
        password: resetPasswordValue.trim(),
      });
      setResetUserId(null);
      setResetPasswordValue("");
    } catch (error: any) {
      alert(getErrorMessage(error, "Error al resetear contraseña"));
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    if (!me) return;
    if (user.id === me.id) {
      alert("No puedes eliminar tu propio usuario");
      return;
    }

    const confirmed = confirm(`¿Eliminar usuario ${user.username}? Esta acción no se puede deshacer.`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteUser.mutateAsync(user.id);
    } catch (error: any) {
      alert(getErrorMessage(error, "Error al eliminar usuario"));
    }
  };

  if (!isAdmin) {
    return (
      <Layout>
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No autorizado.
          </CardContent>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold text-foreground">Usuarios y permisos</h1>
            <p className="text-muted-foreground mt-1">Administra roles, accesos y datos de ejecutivos.</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Nuevo usuario
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear usuario</DialogTitle>
                <DialogDescription>Genera cuentas de supervisor o ejecutivo.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input value={createUsername} onChange={(e) => setCreateUsername(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Rol</Label>
                  <Select value={createRole} onValueChange={(value) => setCreateRole(value as any)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Rol" />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreate} disabled={createUser.isPending}>
                  {createUser.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Crear
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Usuarios</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Usuario</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Display</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead className="text-right">Notificar</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.username}</TableCell>
                      <TableCell>{user.role}</TableCell>
                      <TableCell>
                        <Badge variant={user.active ? "default" : "outline"}>
                          {user.active ? "Activo" : "Inactivo"}
                        </Badge>
                      </TableCell>
                      <TableCell>{user.displayName ?? "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{user.executivePhone ?? "-"}</TableCell>
                      <TableCell className="text-right">
                        {user.notifyEnabled ? "Si" : "No"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(user)}>
                            Editar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setResetUserId(user.id)}
                          >
                            Reset password
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={() => handleDeleteUser(user)}
                            disabled={deleteUser.isPending || user.id === me?.id}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Eliminar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(editingUser)} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
            <DialogDescription>Actualiza rol, estado o permisos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Display name</Label>
              <Input value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>WhatsApp ejecutivo</Label>
              <Input
                value={editExecutivePhone}
                onChange={(e) => setEditExecutivePhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={editRole} onValueChange={(value) => setEditRole(value as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Rol" />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={editActive} onCheckedChange={setEditActive} />
              <Label>Activo</Label>
            </div>
            <div className="space-y-2">
              <Label>Permisos (separados por coma)</Label>
              <Input
                value={editPermissions}
                onChange={(e) => setEditPermissions(e.target.value)}
                placeholder="campaigns:read, debtors:assign"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingUser(null)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={updateUser.isPending || updatePermissions.isPending}>
              {(updateUser.isPending || updatePermissions.isPending) ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(resetUserId)} onOpenChange={(open) => !open && setResetUserId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resetear contraseña</DialogTitle>
            <DialogDescription>Define una nueva contraseña para el usuario.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Nueva contraseña</Label>
            <Input
              type="password"
              value={resetPasswordValue}
              onChange={(e) => setResetPasswordValue(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResetUserId(null)}>Cancelar</Button>
            <Button onClick={handleResetPassword} disabled={resetPassword.isPending}>
              {resetPassword.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
