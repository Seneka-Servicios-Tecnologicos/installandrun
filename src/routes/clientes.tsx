import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Plus, Search, Building2, Trash2, ImagePlus, X } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { formatRelative } from "@/lib/format";
import { compressLogo } from "@/lib/compress";
import { uploadClientLogo, deleteClientLogo, getClientLogoUrl } from "@/lib/storage";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes — Install & Report" },
      { name: "description", content: "Gestiona los clientes de tu equipo." },
    ],
  }),
  component: ClientsPage,
});

interface ClientRow {
  id: string;
  name: string;
  contact: string | null;
  notes: string | null;
  logo_path: string | null;
  created_at: string;
  created_by: string;
  project_count: number;
}

function ClientsPage() {
  const { user, loading } = useAuth();
  const { isGuest } = useIsGuest();
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const load = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, contact, notes, logo_path, created_at, created_by")
      .order("name", { ascending: true });
    if (error) {
      toast.error("Error cargando clientes");
      return;
    }
    const enriched: ClientRow[] = await Promise.all(
      (data ?? []).map(async (c) => {
        const { count } = await supabase
          .from("projects")
          .select("id", { count: "exact", head: true })
          .eq("client_id", c.id);
        return { ...c, project_count: count ?? 0 };
      }),
    );
    setClients(enriched);
  };

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const filtered = useMemo(
    () =>
      clients.filter((c) =>
        search ? c.name.toLowerCase().includes(search.toLowerCase()) : true,
      ),
    [clients, search],
  );

  const resetForm = () => {
    setName(""); setContact(""); setNotes("");
    setLogoFile(null);
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoPreview(null);
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Selecciona una imagen");
      return;
    }
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoFile(f);
    setLogoPreview(URL.createObjectURL(f));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setCreating(true);
    const { data: created, error } = await supabase
      .from("clients")
      .insert({
        name,
        contact: contact || null,
        notes: notes || null,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error || !created) {
      setCreating(false);
      toast.error("Error al crear cliente");
      return;
    }
    if (logoFile) {
      try {
        const compressed = await compressLogo(logoFile);
        const path = await uploadClientLogo(created.id, compressed);
        await supabase.from("clients").update({ logo_path: path }).eq("id", created.id);
      } catch {
        toast.error("Cliente creado, pero falló el logo");
      }
    }
    setCreating(false);
    toast.success("Cliente creado");
    resetForm();
    setOpen(false);
    load();
  };

  const handleDelete = async (clientId: string, projectCount: number, logoPath: string | null) => {
    if (projectCount > 0) {
      const { error: upErr } = await supabase
        .from("projects")
        .update({ client_id: null })
        .eq("client_id", clientId);
      if (upErr) {
        toast.error("No se pudieron desvincular los proyectos");
        return;
      }
    }
    if (logoPath) {
      await deleteClientLogo(logoPath).catch(() => {});
    }
    const { error } = await supabase.from("clients").delete().eq("id", clientId);
    if (error) {
      toast.error("Error al eliminar cliente");
      return;
    }
    toast.success("Cliente eliminado");
    load();
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24">
        <div className="flex items-end justify-between mb-6 gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {clients.length} {clients.length === 1 ? "cliente" : "clientes"}
            </p>
          </div>
          {!isGuest && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="lg" className="gap-2">
                  <Plus className="h-4 w-4" /> Nuevo cliente
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nuevo cliente</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 rounded-full bg-muted overflow-hidden flex items-center justify-center shrink-0 border">
                      {logoPreview ? (
                        <img src={logoPreview} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Building2 className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoChange}
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                        <ImagePlus className="h-4 w-4 mr-1" /> {logoFile ? "Cambiar" : "Logo"}
                      </Button>
                      {logoFile && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => {
                          setLogoFile(null);
                          if (logoPreview) URL.revokeObjectURL(logoPreview);
                          setLogoPreview(null);
                        }}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="c-name">Nombre *</Label>
                    <Input
                      id="c-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="Empresa S.A."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="c-contact">Contacto</Label>
                    <Input
                      id="c-contact"
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      placeholder="Juan Pérez · juan@empresa.com · +52..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="c-notes">Notas</Label>
                    <Textarea
                      id="c-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      placeholder="Información relevante del cliente..."
                    />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="ghost" onClick={() => { resetForm(); setOpen(false); }}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={creating}>
                      {creating ? "Creando..." : "Crear"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente..."
            className="pl-9"
          />
        </div>

        {filtered.length === 0 ? (
          <Card className="p-12 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              {clients.length === 0
                ? "Aún no hay clientes. Crea el primero para empezar a organizar proyectos."
                : "Sin resultados para la búsqueda actual."}
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((c) => {
              const isCreator = c.created_by === user.id && !isGuest;
              return (
                <Card
                  key={c.id}
                  className="p-5 transition-all hover:shadow-md hover:-translate-y-0.5 h-full relative group"
                >
                  <Link
                    to="/cliente/$id"
                    params={{ id: c.id }}
                    className="absolute inset-0 z-0 rounded-lg"
                    aria-label={`Abrir ${c.name}`}
                  />
                  <div className="flex items-start gap-3 relative z-10 pointer-events-none">
                    <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0 overflow-hidden">
                      {c.logo_path ? (
                        <img src={getClientLogoUrl(c.logo_path) ?? ""} alt={c.name} className="h-full w-full object-cover" />
                      ) : (
                        <Building2 className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold truncate group-hover:text-primary transition-colors">
                        {c.name}
                      </h3>
                      {c.contact && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {c.contact}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                        <span>{c.project_count} {c.project_count === 1 ? "proyecto" : "proyectos"}</span>
                        <span>{formatRelative(c.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  {isCreator && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2 z-20 h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Eliminar cliente"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar este cliente?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Se eliminará <span className="font-medium">{c.name}</span>.
                            {c.project_count > 0
                              ? ` Sus ${c.project_count} ${c.project_count === 1 ? "proyecto quedará" : "proyectos quedarán"} sin cliente asignado (no se eliminarán).`
                              : " Esta acción no se puede deshacer."}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(c.id, c.project_count, c.logo_path)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
