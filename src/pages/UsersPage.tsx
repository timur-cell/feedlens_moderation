import { formatRelativeTime } from "@/lib/utils";
import {
  Users,
  UserPlus,
  Loader2,
  Shield,
  ShieldCheck,
  Eye,
  MoreHorizontal,
  ChevronUp,
  Activity,
  Clock,
  Mail,
  Copy,
  Check,
  Ban,
  RotateCcw,
  KeyRound,
} from "lucide-react";
import { useState } from "react";
import { useApiMutation, useApiQuery } from "@/hooks/useApiQuery";
import { apiClient } from "@/lib/apiClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

// Generate a fresh random password per dialog rather than shipping a fixed
// default credential in the client bundle.
const generatePassword = () => `fl-${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}`;

const roleConfig: Record<string, { label: string; icon: any; color: string; badgeClass: string }> = {
  admin: {
    label: "Admin",
    icon: ShieldCheck,
    color: "text-violet-600",
    badgeClass: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",
  },
  moderator: {
    label: "Moderator",
    icon: Shield,
    color: "text-blue-600",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  viewer: {
    label: "Viewer",
    icon: Eye,
    color: "text-zinc-500",
    badgeClass: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" },
  invited: { label: "Invited", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
  disabled: { label: "Disabled", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
};

/* ─── Add User Dialog ─────────────────────────────────────────── */
function AddUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [createUserWithLogin] = useApiMutation(apiClient.users.create);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("moderator");
  const [password, setPassword] = useState(generatePassword);
  const [created, setCreated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    if (!password || password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      const result = await createUserWithLogin({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        password: password.trim(),
      });
      if (result.success) {
        setCreated(true);
        toast.success(`User ${name} created with login credentials`);
      } else {
        toast.error(result.message || "Failed to create user");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to create user");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(`Email: ${email}\nPassword: ${password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setName("");
    setEmail("");
    setRole("moderator");
    setPassword(generatePassword());
    setCreated(false);
    setCopied(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5" />
            {created ? "User Created" : "Add New User"}
          </DialogTitle>
          <DialogDescription>
            {created
              ? "Share these login credentials with the new user."
              : "Add a moderator who can review listings."}
          </DialogDescription>
        </DialogHeader>

        {!created ? (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@company.com"
                type="email"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Role</label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="size-3.5 text-violet-600" />
                      Admin — Full access
                    </div>
                  </SelectItem>
                  <SelectItem value="moderator">
                    <div className="flex items-center gap-2">
                      <Shield className="size-3.5 text-blue-600" />
                      Moderator — Review &amp; decide
                    </div>
                  </SelectItem>
                  <SelectItem value="viewer">
                    <div className="flex items-center gap-2">
                      <Eye className="size-3.5 text-zinc-500" />
                      Viewer — Read-only access
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Password</label>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                type="text"
                className="mt-1 font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Randomly generated — edit to choose your own.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="size-4 text-muted-foreground" />
                <span className="font-medium">Email:</span>
                <span>{email}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <KeyRound className="size-4 text-muted-foreground" />
                <span className="font-medium">Password:</span>
                <code className="bg-background px-2 py-0.5 rounded border text-sm">
                  {password}
                </code>
              </div>
            </div>
            <Button variant="outline" className="w-full" onClick={handleCopy}>
              {copied ? (
                <>
                  <Check className="size-4 mr-2 text-emerald-600" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="size-4 mr-2" />
                  Copy credentials
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              The user can log in immediately at the FeedLens URL.
            </p>
          </div>
        )}

        <DialogFooter>
          {!created ? (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleCreate} disabled={loading || !name || !email || !password}>
                {loading ? <Loader2 className="size-4 mr-2 animate-spin" /> : <UserPlus className="size-4 mr-2" />}
                Create User
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Set Password Dialog ─────────────────────────────────────── */
function SetPasswordDialog({
  open,
  onClose,
  user,
}: {
  open: boolean;
  onClose: () => void;
  user: { name: string; email: string } | null;
}) {
  const [setUserPassword] = useApiMutation(apiClient.users.setPassword);
  const [password, setPassword] = useState(generatePassword);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async () => {
    if (!user || !password || password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      const result = await setUserPassword({
        email: user.email,
        newPassword: password.trim(),
      });
      if (result.success) {
        setDone(true);
        toast.success(`Password set for ${user.name}`);
      } else {
        toast.error(result.message || "Failed to set password");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to set password");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!user) return;
    navigator.clipboard.writeText(`Email: ${user.email}\nPassword: ${password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setPassword(generatePassword());
    setDone(false);
    setCopied(false);
    onClose();
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5" />
            {done ? "Password Updated" : "Set Password"}
          </DialogTitle>
          <DialogDescription>
            {done
              ? `New credentials for ${user.name}`
              : `Set a new password for ${user.name} (${user.email})`}
          </DialogDescription>
        </DialogHeader>

        {!done ? (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">New Password</label>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password"
                type="text"
                className="mt-1 font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Randomly generated — edit to choose your own.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="size-4 text-muted-foreground" />
                <span className="font-medium">Email:</span>
                <span>{user.email}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <KeyRound className="size-4 text-muted-foreground" />
                <span className="font-medium">Password:</span>
                <code className="bg-background px-2 py-0.5 rounded border text-sm">
                  {password}
                </code>
              </div>
            </div>
            <Button variant="outline" className="w-full" onClick={handleCopy}>
              {copied ? (
                <>
                  <Check className="size-4 mr-2 text-emerald-600" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="size-4 mr-2" />
                  Copy credentials
                </>
              )}
            </Button>
          </div>
        )}

        <DialogFooter>
          {!done ? (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={loading || !password || password.length < 6}>
                {loading ? <Loader2 className="size-4 mr-2 animate-spin" /> : <KeyRound className="size-4 mr-2" />}
                Set Password
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Activity Log ────────────────────────────────────────────── */
function ActivityLog({ moderatorId }: { moderatorId: any }) {
  const { data: activity } = useApiQuery(apiClient.users.activity, {
    moderatorId,
    limit: 10,
  });

  if (!activity) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (activity.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-3 text-center">
        No activity yet
      </p>
    );
  }

  const actionIcons: Record<string, string> = {
    approve: "✅",
    reject: "❌",
    notice: "📋",
    override: "🔄",
    login: "🔑",
    rule_edit: "⚙️",
    invited: "📧",
    disabled: "🚫",
    reactivated: "♻️",
    profile_updated: "✏️",
  };

  return (
    <div className="space-y-1.5">
      {activity.map((a: any) => (
        <div
          key={a._id}
          className="flex items-start gap-2 text-xs py-1.5 px-2 rounded hover:bg-muted/50"
        >
          <span className="shrink-0 mt-0.5">{actionIcons[a.action] || "📌"}</span>
          <div className="flex-1 min-w-0">
            <span className="font-medium capitalize">{a.action.replace("_", " ")}</span>
            {a.details && (
              <span className="text-muted-foreground ml-1">{a.details}</span>
            )}
          </div>
          <span className="text-muted-foreground shrink-0">
            {formatRelativeTime(a.timestamp)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─── User Row ────────────────────────────────────────────────── */
function UserRow({ user, onSetPassword }: { user: any; onSetPassword: (user: any) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [updateUser] = useApiMutation(apiClient.users.update);
  const [deleteUser] = useApiMutation(apiClient.users.remove);
  const [reactivateUser] = useApiMutation(apiClient.users.reactivate);

  const role = roleConfig[user.role] || roleConfig.viewer;
  const status = statusConfig[user.status] || statusConfig.invited;
  const RoleIcon = role.icon;

  const handleRoleChange = async (newRole: string) => {
    try {
      await updateUser({ id: user._id, role: newRole });
      toast.success(`Role changed to ${newRole}`);
    } catch {
      toast.error("Failed to update role");
    }
  };

  const handleToggleStatus = async () => {
    try {
      if (user.status === "disabled") {
        await reactivateUser({ id: user._id });
        toast.success("User reactivated");
      } else {
        await deleteUser({ id: user._id });
        toast.success("User disabled");
      }
    } catch {
      toast.error("Failed to update status");
    }
  };

  return (
    <>
      <TableRow className={user.status === "disabled" ? "opacity-50" : ""}>
        <TableCell>
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-medium text-sm">{user.name}</div>
              <div className="text-xs text-muted-foreground">{user.email}</div>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <Select
            value={user.role}
            onValueChange={handleRoleChange}
          >
            <SelectTrigger className="w-[130px] h-7 text-xs border-0 bg-transparent hover:bg-muted px-1.5">
              <div className="flex items-center gap-1.5">
                <RoleIcon className={`size-3 ${role.color}`} />
                <span>{role.label}</span>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-3.5 text-violet-600" />
                  Admin
                </div>
              </SelectItem>
              <SelectItem value="moderator">
                <div className="flex items-center gap-2">
                  <Shield className="size-3.5 text-blue-600" />
                  Moderator
                </div>
              </SelectItem>
              <SelectItem value="viewer">
                <div className="flex items-center gap-2">
                  <Eye className="size-3.5 text-zinc-500" />
                  Viewer
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </TableCell>
        <TableCell>
          <Badge className={`text-xs border-0 ${status.color}`}>
            {status.label}
          </Badge>
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {user.lastLoginAt ? formatRelativeTime(user.lastLoginAt) : "Never"}
        </TableCell>
        <TableCell className="text-sm font-medium tabular-nums">
          {user.actionCount || 0}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setExpanded(!expanded)}
              title="Activity log"
            >
              {expanded ? <ChevronUp className="size-3.5" /> : <Activity className="size-3.5" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7">
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setExpanded(!expanded)}>
                  <Activity className="size-4 mr-2" />
                  {expanded ? "Hide" : "View"} Activity
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSetPassword(user)}>
                  <KeyRound className="size-4 mr-2" />
                  Set Password
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleToggleStatus}
                  className={user.status === "disabled" ? "text-emerald-600" : "text-destructive"}
                >
                  {user.status === "disabled" ? (
                    <>
                      <RotateCcw className="size-4 mr-2" />
                      Reactivate
                    </>
                  ) : (
                    <>
                      <Ban className="size-4 mr-2" />
                      Disable
                    </>
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/30 py-2 px-6">
            <div className="max-h-60 overflow-y-auto">
              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Clock className="size-3" />
                Recent Activity
              </div>
              <ActivityLog moderatorId={user._id} />
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/* ─── Main Page ───────────────────────────────────────────────── */
export default function UsersPage() {
  const { data: users } = useApiQuery(apiClient.users.list);
  const { data: stats } = useApiQuery(apiClient.users.stats);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [passwordUser, setPasswordUser] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  if (!users) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filtered = statusFilter === "all"
    ? users
    : users.filter((u: any) => u.status === statusFilter);

  const sorted = [...filtered].sort((a: any, b: any) => {
    // Active first, then invited, then disabled
    const order = { active: 0, invited: 1, disabled: 2 };
    const aOrder = order[a.status as keyof typeof order] ?? 3;
    const bOrder = order[b.status as keyof typeof order] ?? 3;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.createdAt - a.createdAt;
  });

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header — Team is a first-class page now (was a Settings tab). */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Team</h1>
          <p className="text-je-ink-2 text-[13px] mt-0.5">
            {stats
              ? `${stats.total} people · ${stats.active} active · ${stats.invited} invited · ${stats.admins} admins`
              : "Moderators who review and act on listings"}
          </p>
        </div>
        <Button className="rounded-none" onClick={() => setAddDialogOpen(true)}>
          <UserPlus className="size-4 mr-2" />
          Add user
        </Button>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {["all", "active", "invited", "disabled"].map((f) => (
          <Button
            key={f}
            variant={statusFilter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(f)}
          >
            {f === "all" ? `All (${users.length})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${users.filter((u: any) => u.status === f).length})`}
          </Button>
        ))}
      </div>

      {/* Users table */}
      {sorted.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="size-12 text-muted-foreground/30 mb-3" />
            <p className="text-lg font-medium">No users yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add your first moderator to get started
            </p>
            <Button className="mt-4" onClick={() => setAddDialogOpen(true)}>
              <UserPlus className="size-4 mr-2" />
              Add User
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead>Actions</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((user: any) => (
                <UserRow key={user._id} user={user} onSetPassword={setPasswordUser} />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Add User Dialog */}
      <AddUserDialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} />

      {/* Set Password Dialog */}
      <SetPasswordDialog
        open={passwordUser !== null}
        onClose={() => setPasswordUser(null)}
        user={passwordUser}
      />
    </div>
  );
}
