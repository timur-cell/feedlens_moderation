import { useAuthActions } from "@convex-dev/auth/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { formatRelativeTime } from "@/lib/utils";
import {
  AlertTriangle,
  Bell,
  BellRing,
  Bot,
  Brain,
  Check,
  ChevronRight,
  Copy,
  Eye,
  Globe,
  KeyRound,
  Loader2,
  Mail,
  Moon,
  MoreHorizontal,
  Palette,
  Plus,
  RotateCcw,
  Ban,
  Shield,
  ShieldCheck,
  Sliders,
  Sun,
  Trash2,
  User,
  UserPlus,
  Users,
  X,
  Activity,
  Clock,
  Sparkles,
  Cpu,
  ImageIcon,
  Gauge,
  Thermometer,
  ScanEye,
  Settings2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTheme } from "@/contexts/ThemeContext";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────

const AI_MODELS = [
  { value: "claude-haiku-4-5-20251001", label: "Claude 4.5 Haiku", description: "Fast & cost-effective", tier: "fast" },
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", description: "Balanced performance", tier: "balanced" },
  { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", description: "Previous generation", tier: "balanced" },
  { value: "gpt-4o", label: "GPT-4o", description: "OpenAI multimodal", tier: "balanced" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini", description: "OpenAI fast", tier: "fast" },
];

const ALL_COUNTRIES = [
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "PT", name: "Portugal" },
  { code: "FR", name: "France" },
  { code: "GR", name: "Greece" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "NL", name: "Netherlands" },
  { code: "CH", name: "Switzerland" },
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgium" },
  { code: "HR", name: "Croatia" },
  { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czech Republic" },
  { code: "DK", name: "Denmark" },
  { code: "IE", name: "Ireland" },
  { code: "MT", name: "Malta" },
  { code: "MC", name: "Monaco" },
  { code: "ME", name: "Montenegro" },
  { code: "NO", name: "Norway" },
  { code: "PL", name: "Poland" },
  { code: "SE", name: "Sweden" },
  { code: "TR", name: "Turkey" },
  { code: "AE", name: "UAE" },
  { code: "TH", name: "Thailand" },
  { code: "MX", name: "Mexico" },
  { code: "BR", name: "Brazil" },
  { code: "AU", name: "Australia" },
];

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

// ═══════════════════════════════════════════════════════════════════
//  Section 1: Profile & Account
// ═══════════════════════════════════════════════════════════════════

function ProfileSection() {
  const user = useQuery(api.auth.currentUser);
  const { signIn, signOut } = useAuthActions();
  const deleteAccount = useMutation(api.users.deleteAccount);
  const navigate = useNavigate();

  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [passwordStep, setPasswordStep] = useState<"request" | "verify">("request");

  const handleRequestPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const formData = new FormData();
    formData.append("email", user?.email || "");
    formData.append("flow", "reset");
    try {
      await signIn("password", formData);
      setPasswordStep("verify");
    } catch {
      setError("Could not send reset code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    formData.append("email", user?.email || "");
    formData.append("flow", "reset-verification");
    try {
      await signIn("password", formData);
      setSuccess("Password changed successfully!");
      setTimeout(() => {
        setChangePasswordOpen(false);
        setPasswordStep("request");
        setSuccess("");
      }, 1500);
    } catch {
      setError("Invalid code or password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setLoading(true);
    setError("");
    try {
      await deleteAccount();
      await signOut();
      navigate("/");
    } catch {
      setError("Could not delete account. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Profile card */}
      <Card className="overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />
        <CardContent className="-mt-10 pb-6">
          <div className="flex items-end gap-4">
            <Avatar className="size-16 border-4 border-background shadow-lg">
              <AvatarFallback className="text-xl bg-primary text-primary-foreground">
                {user?.name?.charAt(0).toUpperCase() || <User className="size-6" />}
              </AvatarFallback>
            </Avatar>
            <div className="pb-1">
              <p className="font-semibold">{user?.name || "User"}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account actions */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="size-4 text-muted-foreground" />
            Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <button
            onClick={() => setChangePasswordOpen(true)}
            className="w-full flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50 text-left"
          >
            <div>
              <p className="font-medium text-sm">Change password</p>
              <p className="text-sm text-muted-foreground">Update your password via email verification</p>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => setDeleteAccountOpen(true)}
            className="w-full flex items-center justify-between rounded-lg border border-destructive/20 p-4 transition-colors hover:bg-destructive/5 text-left"
          >
            <div>
              <p className="font-medium text-sm text-destructive">Delete account</p>
              <p className="text-sm text-muted-foreground">Permanently delete your account</p>
            </div>
            <ChevronRight className="size-4 text-destructive" />
          </button>
        </CardContent>
      </Card>

      {/* Change Password Dialog */}
      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              {passwordStep === "request"
                ? "We'll send a verification code to your email."
                : "Enter the code from your email and your new password."}
            </DialogDescription>
          </DialogHeader>
          {passwordStep === "request" ? (
            <form onSubmit={handleRequestPasswordReset}>
              <div className="py-4">
                <p className="text-sm text-muted-foreground">
                  A reset code will be sent to:{" "}
                  <span className="font-medium text-foreground">{user?.email}</span>
                </p>
              </div>
              {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2 mb-4">{error}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setChangePasswordOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="size-4 animate-spin" />} Send Code
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Verification Code</Label>
                <Input id="code" name="code" type="text" placeholder="Enter code from email" autoComplete="one-time-code" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input id="newPassword" name="newPassword" type="password" placeholder="••••••••" minLength={6} autoComplete="new-password" required />
              </div>
              {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
              {success && <p className="text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-950 rounded-lg px-3 py-2">{success}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setPasswordStep("request"); setError(""); }}>Back</Button>
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="size-4 animate-spin" />} Change Password
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Account Dialog */}
      <Dialog open={deleteAccountOpen} onOpenChange={setDeleteAccountOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>This action cannot be undone. This will permanently delete your account and remove all your data.</DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAccountOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteAccount} disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />} Delete Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Section 2: Team Members (embedded from UsersPage)
// ═══════════════════════════════════════════════════════════════════

function AddUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createUserWithLogin = useAction(api.adminUsers.createUserWithLogin);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("moderator");
  const [password, setPassword] = useState(generatePassword);
  const [created, setCreated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !email.trim()) { toast.error("Name and email are required"); return; }
    if (!password || password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setLoading(true);
    try {
      const result = await createUserWithLogin({ name: name.trim(), email: email.trim().toLowerCase(), role, password: password.trim() });
      if (result.success) { setCreated(true); toast.success(`User ${name} created`); }
      else toast.error(result.message || "Failed to create user");
    } catch (e: any) { toast.error(e.message || "Failed to create user"); }
    finally { setLoading(false); }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(`Email: ${email}\nPassword: ${password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => { setName(""); setEmail(""); setRole("moderator"); setPassword(generatePassword()); setCreated(false); setCopied(false); onClose(); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5" />
            {created ? "User Created" : "Add New User"}
          </DialogTitle>
          <DialogDescription>
            {created ? "Share these login credentials with the new user." : "Add a moderator who can review listings."}
          </DialogDescription>
        </DialogHeader>
        {!created ? (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@company.com" type="email" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Role</label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin"><div className="flex items-center gap-2"><ShieldCheck className="size-3.5 text-violet-600" />Admin — Full access</div></SelectItem>
                  <SelectItem value="moderator"><div className="flex items-center gap-2"><Shield className="size-3.5 text-blue-600" />Moderator — Review & decide</div></SelectItem>
                  <SelectItem value="viewer"><div className="flex items-center gap-2"><Eye className="size-3.5 text-zinc-500" />Viewer — Read-only</div></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Password</label>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" type="text" className="mt-1 font-mono" />
              <p className="text-xs text-muted-foreground mt-1">Randomly generated — edit to choose your own.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-sm"><Mail className="size-4 text-muted-foreground" /><span className="font-medium">Email:</span><span>{email}</span></div>
              <div className="flex items-center gap-2 text-sm"><KeyRound className="size-4 text-muted-foreground" /><span className="font-medium">Password:</span><code className="bg-background px-2 py-0.5 rounded border text-sm">{password}</code></div>
            </div>
            <Button variant="outline" className="w-full" onClick={handleCopy}>
              {copied ? <><Check className="size-4 mr-2 text-emerald-600" />Copied!</> : <><Copy className="size-4 mr-2" />Copy credentials</>}
            </Button>
          </div>
        )}
        <DialogFooter>
          {!created ? (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleCreate} disabled={loading || !name || !email || !password}>
                {loading ? <Loader2 className="size-4 mr-2 animate-spin" /> : <UserPlus className="size-4 mr-2" />} Create User
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

function SetPasswordDialog({ open, onClose, user }: { open: boolean; onClose: () => void; user: { name: string; email: string } | null }) {
  const setUserPassword = useAction(api.adminUsers.setUserPassword);
  const [password, setPassword] = useState(generatePassword);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async () => {
    if (!user || !password || password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setLoading(true);
    try {
      const result = await setUserPassword({ email: user.email, newPassword: password.trim() });
      if (result.success) { setDone(true); toast.success(`Password set for ${user.name}`); }
      else toast.error(result.message || "Failed to set password");
    } catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setLoading(false); }
  };

  const handleCopy = () => {
    if (!user) return;
    navigator.clipboard.writeText(`Email: ${user.email}\nPassword: ${password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => { setPassword(generatePassword()); setDone(false); setCopied(false); onClose(); };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="size-5" />{done ? "Password Updated" : "Set Password"}</DialogTitle>
          <DialogDescription>{done ? `New credentials for ${user.name}` : `Set a new password for ${user.name} (${user.email})`}</DialogDescription>
        </DialogHeader>
        {!done ? (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">New Password</label>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter new password" type="text" className="mt-1 font-mono" />
              <p className="text-xs text-muted-foreground mt-1">Randomly generated — edit to choose your own.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-sm"><Mail className="size-4 text-muted-foreground" /><span className="font-medium">Email:</span><span>{user.email}</span></div>
              <div className="flex items-center gap-2 text-sm"><KeyRound className="size-4 text-muted-foreground" /><span className="font-medium">Password:</span><code className="bg-background px-2 py-0.5 rounded border text-sm">{password}</code></div>
            </div>
            <Button variant="outline" className="w-full" onClick={handleCopy}>
              {copied ? <><Check className="size-4 mr-2 text-emerald-600" />Copied!</> : <><Copy className="size-4 mr-2" />Copy credentials</>}
            </Button>
          </div>
        )}
        <DialogFooter>
          {!done ? (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={loading || !password || password.length < 6}>
                {loading ? <Loader2 className="size-4 mr-2 animate-spin" /> : <KeyRound className="size-4 mr-2" />} Set Password
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

function UserRow({ user, onSetPassword }: { user: any; onSetPassword: (u: any) => void }) {
  const updateUser = useMutation(api.users.updateUser);
  const deleteUser = useMutation(api.users.deleteUser);
  const reactivateUser = useMutation(api.users.reactivateUser);

  const role = roleConfig[user.role] || roleConfig.viewer;
  const status = statusConfig[user.status] || statusConfig.invited;
  const RoleIcon = role.icon;

  const handleRoleChange = async (newRole: string) => {
    try { await updateUser({ id: user._id, role: newRole }); toast.success(`Role changed to ${newRole}`); }
    catch { toast.error("Failed to update role"); }
  };

  const handleToggleStatus = async () => {
    try {
      if (user.status === "disabled") { await reactivateUser({ id: user._id }); toast.success("User reactivated"); }
      else { await deleteUser({ id: user._id }); toast.success("User disabled"); }
    } catch { toast.error("Failed to update status"); }
  };

  return (
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
        <Select value={user.role} onValueChange={handleRoleChange}>
          <SelectTrigger className="w-[130px] h-7 text-xs border-0 bg-transparent hover:bg-muted px-1.5">
            <div className="flex items-center gap-1.5">
              <RoleIcon className={`size-3 ${role.color}`} />
              <span>{role.label}</span>
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin"><div className="flex items-center gap-2"><ShieldCheck className="size-3.5 text-violet-600" />Admin</div></SelectItem>
            <SelectItem value="moderator"><div className="flex items-center gap-2"><Shield className="size-3.5 text-blue-600" />Moderator</div></SelectItem>
            <SelectItem value="viewer"><div className="flex items-center gap-2"><Eye className="size-3.5 text-zinc-500" />Viewer</div></SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Badge className={`text-xs border-0 ${status.color}`}>{status.label}</Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {user.lastLoginAt ? formatRelativeTime(user.lastLoginAt) : "Never"}
      </TableCell>
      <TableCell className="text-sm font-medium tabular-nums">{user.actionCount || 0}</TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7"><MoreHorizontal className="size-3.5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onSetPassword(user)}>
              <KeyRound className="size-4 mr-2" /> Set Password
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleToggleStatus} className={user.status === "disabled" ? "text-emerald-600" : "text-destructive"}>
              {user.status === "disabled" ? <><RotateCcw className="size-4 mr-2" />Reactivate</> : <><Ban className="size-4 mr-2" />Disable</>}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function TeamSection() {
  const users = useQuery(api.users.listUsers);
  const stats = useQuery(api.users.getStats);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [passwordUser, setPasswordUser] = useState<any>(null);

  if (!users) {
    return <div className="flex justify-center py-12"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>;
  }

  const sorted = [...users].sort((a: any, b: any) => {
    const order = { active: 0, invited: 1, disabled: 2 };
    const aOrder = order[a.status as keyof typeof order] ?? 3;
    const bOrder = order[b.status as keyof typeof order] ?? 3;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.createdAt - a.createdAt;
  });

  return (
    <div className="space-y-6">
      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><div className="text-2xl font-bold">{stats.total}</div><div className="text-xs text-muted-foreground">Total Users</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-2xl font-bold text-emerald-600">{stats.active}</div><div className="text-xs text-muted-foreground">Active</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-2xl font-bold text-amber-600">{stats.invited}</div><div className="text-xs text-muted-foreground">Invited</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-2xl font-bold text-violet-600">{stats.admins}</div><div className="text-xs text-muted-foreground">Admins</div></CardContent></Card>
        </div>
      )}

      {/* Users table */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="size-4 text-muted-foreground" />
                Team Members
              </CardTitle>
              <CardDescription>Manage moderators who can review and act on listings</CardDescription>
            </div>
            <Button size="sm" onClick={() => setAddDialogOpen(true)}>
              <UserPlus className="size-4 mr-2" />
              Add User
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Users className="size-12 text-muted-foreground/30 mb-3" />
              <p className="text-lg font-medium">No users yet</p>
              <p className="text-sm text-muted-foreground mt-1">Add your first moderator to get started</p>
              <Button className="mt-4" onClick={() => setAddDialogOpen(true)}><UserPlus className="size-4 mr-2" />Add User</Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Actions</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((user: any) => (
                  <UserRow key={user._id} user={user} onSetPassword={setPasswordUser} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AddUserDialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} />
      <SetPasswordDialog open={passwordUser !== null} onClose={() => setPasswordUser(null)} user={passwordUser} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Section 3: Alerts & Monitoring
// ═══════════════════════════════════════════════════════════════════

function AlertsSection() {
  const settings = useQuery(api.settings.getSettings);
  const updateSettings = useMutation(api.settings.updateSettings);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Local state
  const [volumePerHour, setVolumePerHour] = useState(500);
  const [volumePerDay, setVolumePerDay] = useState(5000);
  const [scanFailures, setScanFailures] = useState(true);
  const [apiErrors, setApiErrors] = useState(true);
  const [rejectionSpikes, setRejectionSpikes] = useState(true);
  const [spikeThreshold, setSpikeThreshold] = useState(50);
  const [notifEmail, setNotifEmail] = useState("");
  const [slackWebhook, setSlackWebhook] = useState("");

  // Sync from server — but never while the admin has unsaved edits, or any
  // reactive settings update would silently discard them.
  useEffect(() => {
    if (settings && !dirty) {
      setVolumePerHour(settings.alertVolumePerHour);
      setVolumePerDay(settings.alertVolumePerDay);
      setScanFailures(settings.alertOnScanFailures);
      setApiErrors(settings.alertOnApiErrors);
      setRejectionSpikes(settings.alertOnRejectionSpikes);
      setSpikeThreshold(settings.rejectionSpikeThreshold);
      setNotifEmail(settings.notificationEmail);
      setSlackWebhook(settings.notificationSlackWebhook);
      setDirty(false);
    }
  }, [settings, dirty]);

  const markDirty = () => setDirty(true);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings({
        alertVolumePerHour: volumePerHour,
        alertVolumePerDay: volumePerDay,
        alertOnScanFailures: scanFailures,
        alertOnApiErrors: apiErrors,
        alertOnRejectionSpikes: rejectionSpikes,
        rejectionSpikeThreshold: spikeThreshold,
        notificationEmail: notifEmail,
        notificationSlackWebhook: slackWebhook,
      });
      toast.success("Alert settings saved");
      setDirty(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <div className="flex justify-center py-12"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* Volume Thresholds */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="size-4 text-muted-foreground" />
            Volume Thresholds
          </CardTitle>
          <CardDescription>Get alerted when listing volume exceeds these limits</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="vol-hour">Max listings per hour</Label>
              <Input
                id="vol-hour"
                type="number"
                min={0}
                value={volumePerHour}
                onChange={(e) => { setVolumePerHour(Number(e.target.value)); markDirty(); }}
              />
              <p className="text-xs text-muted-foreground">Alert when hourly ingestion exceeds this threshold</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vol-day">Max listings per day</Label>
              <Input
                id="vol-day"
                type="number"
                min={0}
                value={volumePerDay}
                onChange={(e) => { setVolumePerDay(Number(e.target.value)); markDirty(); }}
              />
              <p className="text-xs text-muted-foreground">Alert when daily ingestion exceeds this threshold</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alert Types */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <BellRing className="size-4 text-muted-foreground" />
            Alert Types
          </CardTitle>
          <CardDescription>Choose which events trigger alerts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50">
            <div className="flex items-center gap-4">
              <div className="size-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle className="size-5 text-red-600" />
              </div>
              <div>
                <Label className="font-medium">Scan Failures</Label>
                <p className="text-sm text-muted-foreground">Alert when AI scans fail or time out</p>
              </div>
            </div>
            <Switch checked={scanFailures} onCheckedChange={(v) => { setScanFailures(v); markDirty(); }} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50">
            <div className="flex items-center gap-4">
              <div className="size-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <Globe className="size-5 text-orange-600" />
              </div>
              <div>
                <Label className="font-medium">API Errors</Label>
                <p className="text-sm text-muted-foreground">Alert on external API failures (Implio, JE API)</p>
              </div>
            </div>
            <Switch checked={apiErrors} onCheckedChange={(v) => { setApiErrors(v); markDirty(); }} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50">
            <div className="flex items-center gap-4">
              <div className="size-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Activity className="size-5 text-amber-600" />
              </div>
              <div>
                <Label className="font-medium">Rejection Rate Spikes</Label>
                <p className="text-sm text-muted-foreground">Alert when rejection rate exceeds threshold</p>
              </div>
            </div>
            <Switch checked={rejectionSpikes} onCheckedChange={(v) => { setRejectionSpikes(v); markDirty(); }} />
          </div>

          {rejectionSpikes && (
            <div className="ml-14 pl-4 border-l-2 border-muted py-3 space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Spike Threshold</Label>
                  <span className="text-sm font-mono font-medium">{spikeThreshold}%</span>
                </div>
                <Slider
                  value={[spikeThreshold]}
                  onValueChange={([v]) => { setSpikeThreshold(v); markDirty(); }}
                  min={10}
                  max={90}
                  step={5}
                />
                <p className="text-xs text-muted-foreground">Alert when rejection rate exceeds {spikeThreshold}% of processed listings</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notification Channels */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="size-4 text-muted-foreground" />
            Notification Channels
          </CardTitle>
          <CardDescription>Where to send alert notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="notif-email">Email</Label>
            <Input
              id="notif-email"
              type="email"
              placeholder="alerts@jamesedition.com"
              value={notifEmail}
              onChange={(e) => { setNotifEmail(e.target.value); markDirty(); }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notif-slack">Slack Webhook URL</Label>
            <Input
              id="notif-slack"
              type="url"
              placeholder="https://hooks.slack.com/services/..."
              value={slackWebhook}
              onChange={(e) => { setSlackWebhook(e.target.value); markDirty(); }}
            />
            <p className="text-xs text-muted-foreground">Optional: send alerts to a Slack channel</p>
          </div>
        </CardContent>
      </Card>

      {/* Save button */}
      {dirty && (
        <div className="flex justify-end sticky bottom-4">
          <Button onClick={handleSave} disabled={saving} className="shadow-lg">
            {saving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Check className="size-4 mr-2" />}
            Save Alert Settings
          </Button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Section 4: AI Configuration
// ═══════════════════════════════════════════════════════════════════

function AIConfigSection() {
  const settings = useQuery(api.settings.getSettings);
  const updateSettings = useMutation(api.settings.updateSettings);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Local state
  const [paramModel, setParamModel] = useState("claude-haiku-4-5-20251001");
  const [visionModel, setVisionModel] = useState("claude-haiku-4-5-20251001");
  const [countries, setCountries] = useState<string[]>(["ES", "IT", "PT", "FR", "GR"]);
  const [approveThreshold, setApproveThreshold] = useState(0.9);
  const [rejectThreshold, setRejectThreshold] = useState(0.85);
  const [temperature, setTemperature] = useState(0.1);
  const [maxImages, setMaxImages] = useState(10);
  const [autoMod, setAutoMod] = useState(true);
  const [newCountry, setNewCountry] = useState("");

  // Sync from server — but never while the admin has unsaved edits, or any
  // reactive settings update would silently discard them.
  useEffect(() => {
    if (settings && !dirty) {
      setParamModel(settings.paramScanModel);
      setVisionModel(settings.visionModel);
      setCountries(settings.visionCountries || []);
      setApproveThreshold(settings.autoApproveThreshold);
      setRejectThreshold(settings.autoRejectThreshold);
      setTemperature(settings.aiTemperature);
      setMaxImages(settings.maxImagesPerVisionScan);
      setAutoMod(settings.enableAutoModeration);
      setDirty(false);
    }
  }, [settings, dirty]);

  const markDirty = () => setDirty(true);

  const addCountry = (code: string) => {
    if (code && !countries.includes(code)) {
      setCountries([...countries, code]);
      markDirty();
    }
    setNewCountry("");
  };

  const removeCountry = (code: string) => {
    setCountries(countries.filter((c) => c !== code));
    markDirty();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings({
        paramScanModel: paramModel,
        visionModel: visionModel,
        visionCountries: countries,
        autoApproveThreshold: approveThreshold,
        autoRejectThreshold: rejectThreshold,
        aiTemperature: temperature,
        maxImagesPerVisionScan: maxImages,
        enableAutoModeration: autoMod,
      });
      toast.success("AI settings saved");
      setDirty(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <div className="flex justify-center py-12"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>;

  const availableCountries = ALL_COUNTRIES.filter((c) => !countries.includes(c.code));

  return (
    <div className="space-y-6">
      {/* Auto Moderation Master Switch */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="size-4 text-muted-foreground" />
            General
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50">
            <div className="flex items-center gap-4">
              <div className="size-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Sparkles className="size-5 text-blue-600" />
              </div>
              <div>
                <Label className="font-medium">Enable Auto-Moderation</Label>
                <p className="text-sm text-muted-foreground">Allow AI to automatically approve/reject listings based on confidence thresholds</p>
              </div>
            </div>
            <Switch checked={autoMod} onCheckedChange={(v) => { setAutoMod(v); markDirty(); }} />
          </div>
        </CardContent>
      </Card>

      {/* Model Selection */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="size-4 text-muted-foreground" />
            Model Selection
          </CardTitle>
          <CardDescription>Choose AI models for different moderation flows</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Parameter Scan Model */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Cpu className="size-3.5 text-muted-foreground" />
              Parameter Scan Model
            </Label>
            <Select value={paramModel} onValueChange={(v) => { setParamModel(v); markDirty(); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AI_MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    <div className="flex items-center gap-2">
                      <span>{m.label}</span>
                      <span className="text-xs text-muted-foreground">— {m.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Used for rule-based parameter analysis (price, area, category checks). Haiku recommended for speed.</p>
          </div>

          <Separator />

          {/* Vision Model */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <ImageIcon className="size-3.5 text-muted-foreground" />
              Vision / Image Recognition Model
            </Label>
            <Select value={visionModel} onValueChange={(v) => { setVisionModel(v); markDirty(); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AI_MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    <div className="flex items-center gap-2">
                      <span>{m.label}</span>
                      <span className="text-xs text-muted-foreground">— {m.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Used for image quality, watermark detection, and property condition scoring. More capable models give better results.</p>
          </div>

          <Separator />

          {/* Max images */}
          <div className="space-y-2">
            <Label htmlFor="max-images">Max Images Per Vision Scan</Label>
            <Input
              id="max-images"
              type="number"
              min={1}
              max={30}
              value={maxImages}
              onChange={(e) => { setMaxImages(Number(e.target.value)); markDirty(); }}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">Number of images sent to vision model per listing (more = better accuracy, higher cost)</p>
          </div>
        </CardContent>
      </Card>

      {/* Vision Countries */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <ScanEye className="size-4 text-muted-foreground" />
            Vision Countries
          </CardTitle>
          <CardDescription>Listings from these countries automatically get AI image analysis during ingestion</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current countries */}
          <div className="flex flex-wrap gap-2">
            {countries.map((code) => {
              const country = ALL_COUNTRIES.find((c) => c.code === code);
              return (
                <Badge key={code} variant="secondary" className="flex items-center gap-1.5 px-3 py-1.5 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{code}</span>
                  <span>{country?.name || code}</span>
                  <button
                    onClick={() => removeCountry(code)}
                    className="ml-1 rounded-full hover:bg-destructive/20 p-0.5 transition-colors"
                  >
                    <X className="size-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </Badge>
              );
            })}
            {countries.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No countries selected — vision analysis disabled for auto-ingestion</p>
            )}
          </div>

          {/* Add country */}
          <div className="flex gap-2">
            <Select value={newCountry} onValueChange={addCountry}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Add a country..." />
              </SelectTrigger>
              <SelectContent>
                {availableCountries.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    <span className="font-mono text-xs mr-2">{c.code}</span> {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Confidence Thresholds */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sliders className="size-4 text-muted-foreground" />
            Confidence Thresholds
          </CardTitle>
          <CardDescription>Control when AI auto-approves or auto-rejects listings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Auto-approve */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <div className="size-2.5 rounded-full bg-emerald-500" />
                Auto-Approve Threshold
              </Label>
              <span className="text-sm font-mono font-medium text-emerald-600">{(approveThreshold * 100).toFixed(0)}%</span>
            </div>
            <Slider
              value={[approveThreshold * 100]}
              onValueChange={([v]) => { setApproveThreshold(v / 100); markDirty(); }}
              min={50}
              max={100}
              step={1}
            />
            <p className="text-xs text-muted-foreground">
              Listings with AI confidence ≥ {(approveThreshold * 100).toFixed(0)}% are auto-approved
            </p>
          </div>

          <Separator />

          {/* Auto-reject */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <div className="size-2.5 rounded-full bg-red-500" />
                Auto-Reject Threshold
              </Label>
              <span className="text-sm font-mono font-medium text-red-600">{(rejectThreshold * 100).toFixed(0)}%</span>
            </div>
            <Slider
              value={[rejectThreshold * 100]}
              onValueChange={([v]) => { setRejectThreshold(v / 100); markDirty(); }}
              min={50}
              max={100}
              step={1}
            />
            <p className="text-xs text-muted-foreground">
              Listings with AI rejection confidence ≥ {(rejectThreshold * 100).toFixed(0)}% are auto-rejected
            </p>
          </div>

          <Separator />

          {/* Temperature */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Thermometer className="size-3.5 text-muted-foreground" />
                AI Temperature
              </Label>
              <span className="text-sm font-mono font-medium">{temperature.toFixed(2)}</span>
            </div>
            <Slider
              value={[temperature * 100]}
              onValueChange={([v]) => { setTemperature(v / 100); markDirty(); }}
              min={0}
              max={100}
              step={1}
            />
            <p className="text-xs text-muted-foreground">
              Lower = more deterministic decisions. Higher = more creative/variable. Recommended: 0.05–0.15 for moderation.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save button */}
      {dirty && (
        <div className="flex justify-end sticky bottom-4">
          <Button onClick={handleSave} disabled={saving} className="shadow-lg">
            {saving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Check className="size-4 mr-2" />}
            Save AI Settings
          </Button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Section 5: Appearance
// ═══════════════════════════════════════════════════════════════════

function AppearanceSection() {
  const { theme, toggleTheme, switchable } = useTheme();

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Palette className="size-4 text-muted-foreground" />
          Appearance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {switchable ? (
          <div className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50">
            <div className="flex items-center gap-4">
              <div className="size-10 rounded-full bg-secondary flex items-center justify-center">
                {theme === "light" ? <Moon className="size-5 text-foreground" /> : <Sun className="size-5 text-foreground" />}
              </div>
              <div>
                <Label htmlFor="dark-mode" className="font-medium">Dark mode</Label>
                <p className="text-sm text-muted-foreground">Switch between light and dark themes</p>
              </div>
            </div>
            <Switch id="dark-mode" checked={theme === "dark"} onCheckedChange={toggleTheme} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground px-4 py-2">Theme follows your system preference</p>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Main Settings Page
// ═══════════════════════════════════════════════════════════════════

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") || "profile";

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account, team, alerts, and AI configuration</p>
      </div>

      <Tabs value={defaultTab} onValueChange={handleTabChange}>
        <TabsList className="w-full sm:w-auto flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="profile" className="gap-1.5">
            <User className="size-3.5" />
            <span className="hidden sm:inline">Profile</span>
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-1.5">
            <Users className="size-3.5" />
            <span className="hidden sm:inline">Team</span>
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1.5">
            <Bell className="size-3.5" />
            <span className="hidden sm:inline">Alerts</span>
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5">
            <Brain className="size-3.5" />
            <span className="hidden sm:inline">AI Config</span>
          </TabsTrigger>
          <TabsTrigger value="appearance" className="gap-1.5">
            <Palette className="size-3.5" />
            <span className="hidden sm:inline">Appearance</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileSection />
        </TabsContent>

        <TabsContent value="team">
          <TeamSection />
        </TabsContent>

        <TabsContent value="alerts">
          <AlertsSection />
        </TabsContent>

        <TabsContent value="ai">
          <AIConfigSection />
        </TabsContent>

        <TabsContent value="appearance">
          <AppearanceSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
