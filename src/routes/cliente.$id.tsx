import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { ArrowLeft, Building2, FolderOpen, LayoutGrid, Camera, Video, FileText, Lock, Globe, Trash2, Pencil, ImagePlus, X, Mail, Phone } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useIsGuest } from "@/hooks/use-is-guest";
import { toast } from "sonner";
import { formatDateGroup, formatRelative, formatTime } from "@/lib/format";
import { getSignedUrl, uploadClientLogo, deleteClientLogo, getClientLogoUrl } from "@/lib/storage";
import { compressLogo } from "@/lib/compress";
import { format, startOfDay } from "date-fns";

export const Route = createFileRoute("/cliente/$id")({
  head: () => ({
    meta: [{ title: "Cliente — Install & Report" }],
  }),
  component: ClientView,
});

interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  logo_path: string | null;
  created_by: string;
}
interface ProjectWithEntries {
  id: string;
  name: string;
  location: string | null;
  status: string;
  visibility: string;
  created_at: string;
  user_id: string;
  entries: EntryPreview[];
}
interface EntryPreview {
  id: string;
  type: "photo" | "video" | "note";
  title: string | null;
  description: string | null;
  thumbnail_path: string | null;
  captured_at: string;
  user_id: string;
}

function ClientView() {
  const { id } = Route.useParams();
  const { user, loading } = useAuth();
  const { isGuest } = useIsGuest();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [projects, setProjects] = useState<ProjectWithEntries[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [view, setView] = useState<"galeria">("galeria");
  const [logoVersion, setLogoVersion] = useState(0);

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [eName, setEName] = useState("");
  const [eEmail, setEEmail] = useState("");
  const [ePhone, setEPhone] = useState("");
  const [eNotes, setENotes] = useState("");
  const [eLogoFile, setELogoFile] = useState<File | null>(null);
  const [eLogoPreview, setELogoPreview] = useState<string | null>(null);
  const [eRemoveLogo, setERemoveLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: c } = await supabase
        .from("clients")
        .select("id, name, email, phone, notes, logo_path, created_by")
        .eq("id", id)
        .maybeSingle();
      if (!c) {
        toast.error("Cliente no encontrado");
        navigate({ to: "/clientes" });
        return;
      }
      setClient(c as Client);

      const { data: p } = await supabase
        .from("projects")
        .select("id, name, location, status, visibility, created_at, user_id")
        .eq("client_id", id)
        .order("created_at", { ascending: false });

      const projs = (p ?? []) as Omit<ProjectWithEntries, "entries">[];

      // For each project, fetch its entries (limit a few for inline preview)
      const enriched: ProjectWithEntries[] = await Promise.all(
        projs.map(async (proj) => {
          const { data: e } = await supabase
            .from("entries")
            .select("id, type, title, description, thumbnail_path, captured_at, user_id")
            .eq("project_id", proj.id)
            .order("captured_at", { ascending: false });
          return { ...proj, entries: ((e ?? []) as EntryPreview[]) };
        }),
      );
      setProjects(enriched);

      const tmap: Record<string, string> = {};
      await Promise.all(
        enriched.flatMap((proj) =>
          proj.entries.map(async (en) => {
            if (en.thumbnail_path) {
              const url = await getSignedUrl(en.thumbnail_path);
              if (url) tmap[en.id] = url;
            }
          }),
        ),
      );
      setThumbs(tmap);
    })();
  }, [user, id, navigate]);

  const grouped = useMemo(() => {
    const map = new Map<string, { date: Date; items: ProjectWithEntries[] }>();
    for (const p of projects) {
      const d = startOfDay(new Date(p.created_at));
      const key = format(d, "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, { date: d, items: [] });
      map.get(key)!.items.push(p);
    }
    return Array.from(map.entries())
      .map(([key, val]) => ({ key, date: val.date, items: val.items }))
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [projects]);

  const handleDeleteClient = async () => {
    if (!client) return;
    if (projects.length > 0) {
      const { error: upErr } = await supabase
        .from("projects")
        .update({ client_id: null })
        .eq("client_id", client.id);
      if (upErr) {
        toast.error("No se pudieron desvincular los proyectos");
        return;
      }
    }
    if (client.logo_path) {
      await deleteClientLogo(client.logo_path).catch(() => {});
    }
    const { error } = await supabase.from("clients").delete().eq("id", client.id);
    if (error) {
      toast.error("Error al eliminar cliente");
      return;
    }
    toast.success("Cliente eliminado");
    navigate({ to: "/clientes" });
  };

  const openEdit = () => {
    if (!client) return;
    setEName(client.name);
    setEEmail(client.email ?? "");
    setEPhone(client.phone ?? "");
    setENotes(client.notes ?? "");
    setELogoFile(null);
    if (eLogoPreview) URL.revokeObjectURL(eLogoPreview);
    setELogoPreview(null);
    setERemoveLogo(false);
    setEditOpen(true);
  };

  const handleELogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Selecciona una imagen");
      return;
    }
    if (eLogoPreview) URL.revokeObjectURL(eLogoPreview);
    setELogoFile(f);
    setELogoPreview(URL.createObjectURL(f));
    setERemoveLogo(false);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;
    setSaving(true);
    let logoPath: string | null | undefined = undefined; // undefined = no change
    try {
      if (eLogoFile) {
        const compressed = await compressLogo(eLogoFile);
        logoPath = await uploadClientLogo(client.id, compressed);
      } else if (eRemoveLogo && client.logo_path) {
        await deleteClientLogo(client.logo_path).catch(() => {});
        logoPath = null;
      }
    } catch {
      setSaving(false);
      toast.error("Error subiendo el logo");
      return;
    }
    const emailVal = eEmail.trim() || null;
    const phoneVal = ePhone.trim() || null;
    const updates: { name: string; email: string | null; phone: string | null; notes: string | null; logo_path?: string | null } = {
      name: eName,
      email: emailVal,
      phone: phoneVal,
      notes: eNotes || null,
    };
    if (logoPath !== undefined) updates.logo_path = logoPath;
    const { error } = await supabase.from("clients").update(updates).eq("id", client.id);
    setSaving(false);
    if (error) {
      toast.error("Error al guardar cambios");
      return;
    }
    toast.success("Cliente actualizado");
    setClient({
      ...client,
      name: eName,
      email: emailVal,
      phone: phoneVal,
      notes: eNotes || null,
      logo_path: logoPath !== undefined ? logoPath : client.logo_path,
    });
    setLogoVersion((v) => v + 1);
    setEditOpen(false);
  };

  if (loading || !user || !client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Cargando...</div>
      </div>
    );
  }

  const isCreator = client.created_by === user.id && !isGuest;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24">
        <Link to="/clientes" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="h-4 w-4 mr-1" /> Clientes
        </Link>

        <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-12 w-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 overflow-hidden">
              {client.logo_path ? (
                <img
                  src={getClientLogoUrl(client.logo_path, String(logoVersion)) ?? ""}
                  alt={client.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Building2 className="h-6 w-6" />
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
              {(client.email || client.phone) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                  {client.email && (
                    <a
                      href={`mailto:${client.email}`}
                      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      <span className="truncate">{client.email}</span>
                    </a>
                  )}
                  {client.phone && (
                    <a
                      href={`tel:${client.phone.replace(/[^+\d]/g, "")}`}
                      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      <span>{client.phone}</span>
                    </a>
                  )}
                </div>
              )}
              {client.notes && (
                <p className="text-sm text-muted-foreground mt-2 max-w-2xl whitespace-pre-wrap">{client.notes}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
              <TabsList>
                <TabsTrigger value="galeria" className="gap-1.5">
                  <LayoutGrid className="h-4 w-4" /> Galería
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {isCreator && (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={openEdit}
                  aria-label="Editar cliente"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="icon" className="text-muted-foreground hover:text-destructive" aria-label="Eliminar cliente">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Eliminar este cliente?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Se eliminará <span className="font-medium">{client.name}</span>.
                        {projects.length > 0
                          ? ` Sus ${projects.length} ${projects.length === 1 ? "proyecto quedará" : "proyectos quedarán"} sin cliente asignado (no se eliminarán).`
                          : " Esta acción no se puede deshacer."}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDeleteClient}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Eliminar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </div>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar cliente</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-muted overflow-hidden flex items-center justify-center shrink-0 border">
                  {eLogoPreview ? (
                    <img src={eLogoPreview} alt="" className="h-full w-full object-cover" />
                  ) : !eRemoveLogo && client.logo_path ? (
                    <img
                      src={getClientLogoUrl(client.logo_path, String(logoVersion)) ?? ""}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Building2 className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleELogoChange}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <ImagePlus className="h-4 w-4 mr-1" /> {eLogoFile || client.logo_path ? "Cambiar" : "Subir logo"}
                  </Button>
                  {(eLogoFile || (client.logo_path && !eRemoveLogo)) && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => {
                      setELogoFile(null);
                      if (eLogoPreview) URL.revokeObjectURL(eLogoPreview);
                      setELogoPreview(null);
                      if (client.logo_path) setERemoveLogo(true);
                    }}>
                      <X className="h-4 w-4 mr-1" /> Quitar
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="e-name">Nombre *</Label>
                <Input id="e-name" value={eName} onChange={(e) => setEName(e.target.value)} required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="e-email">Correo</Label>
                  <Input
                    id="e-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={eEmail}
                    onChange={(e) => setEEmail(e.target.value)}
                    placeholder="contacto@empresa.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="e-phone">Teléfono</Label>
                  <Input
                    id="e-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={ePhone}
                    onChange={(e) => setEPhone(e.target.value)}
                    placeholder="+52 55 1234 5678"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="e-notes">Notas</Label>
                <Textarea id="e-notes" value={eNotes} onChange={(e) => setENotes(e.target.value)} rows={3} />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setEditOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {projects.length === 0 ? (
          <Card className="p-12 text-center">
            <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              Este cliente aún no tiene proyectos. Crea uno y asígnalo a este cliente desde la página de proyectos.
            </p>
          </Card>
        ) : (
          <div className="space-y-8">
            {grouped.map((g) => (
              <section key={g.key}>
                <div className="sticky top-14 z-20 -mx-4 px-4 py-2 bg-background/90 backdrop-blur border-b mb-4">
                  <h2 className="text-sm font-medium text-muted-foreground">
                    {formatDateGroup(g.date)}
                  </h2>
                </div>
                <div className="space-y-3">
                  {g.items.map((p) => (
                    <ProjectExpandableCard key={p.id} project={p} thumbs={thumbs} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function ProjectExpandableCard({
  project,
  thumbs,
}: {
  project: ProjectWithEntries;
  thumbs: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold truncate">{project.name}</span>
            {project.visibility === "public" ? (
              <Badge variant="outline" className="gap-1 text-xs"><Globe className="h-3 w-3" /> Público</Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-xs"><Lock className="h-3 w-3" /> Privado</Badge>
            )}
            <Badge variant={project.status === "activo" ? "default" : "secondary"} className="text-xs">
              {project.status === "activo" ? "Activo" : "Finalizado"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {project.entries.length} entradas · {formatRelative(project.created_at)}
            {project.location && ` · ${project.location}`}
          </p>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {expanded ? "Ocultar" : "Desglosar"}
        </span>
      </button>

      {expanded && (
        <div className="border-t px-4 py-3 bg-muted/20">
          {project.entries.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3">Sin entradas todavía.</p>
          ) : (
            <ul className="space-y-2 max-h-80 overflow-y-auto">
              {project.entries.map((en) => (
                <li
                  key={en.id}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-background cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate({
                      to: "/proyecto/$id/entrada/$entradaId",
                      params: { id: project.id, entradaId: en.id },
                    });
                  }}
                >
                  <div className="h-10 w-10 rounded bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                    {thumbs[en.id] ? (
                      <img src={thumbs[en.id]} alt="" className="h-full w-full object-cover" />
                    ) : en.type === "note" ? (
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    ) : en.type === "video" ? (
                      <Video className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Camera className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {en.title || (en.type === "note" ? "Nota" : en.type === "photo" ? "Foto" : "Video")}
                    </p>
                    {en.description && (
                      <p className="text-xs text-muted-foreground truncate">{en.description}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatTime(en.captured_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="pt-3 mt-2 border-t flex justify-end">
            <Link
              to="/proyecto/$id"
              params={{ id: project.id }}
              className="text-xs font-medium text-primary hover:underline"
            >
              Abrir proyecto →
            </Link>
          </div>
        </div>
      )}
    </Card>
  );
}
