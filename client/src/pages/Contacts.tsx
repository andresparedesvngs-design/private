import { useMemo, useState } from "react";
import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useContacts, useUpdateContact } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { Loader2, Save, Search } from "lucide-react";
import type { Contact } from "@shared/schema";

type ContactDraft = Partial<Pick<Contact, "name" | "rut" | "executiveName" | "executivePhone" | "executiveRut">>;

export default function Contacts() {
  const { data: contacts, isLoading } = useContacts();
  const updateContact = useUpdateContact();
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, ContactDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const filteredContacts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return contacts ?? [];
    return (contacts ?? []).filter((contact) => {
      const haystack = [
        contact.name,
        contact.phone,
        contact.rut,
        contact.executiveName,
        contact.executivePhone,
        contact.executiveRut,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [contacts, search]);

  const getDraftValue = (contact: Contact, field: keyof ContactDraft) =>
    drafts[contact.id]?.[field] ?? (contact[field] ?? "");

  const handleDraftChange = (contactId: string, field: keyof ContactDraft, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [contactId]: {
        ...prev[contactId],
        [field]: value,
      },
    }));
  };

  const hasChanges = (contact: Contact) => {
    const draft = drafts[contact.id];
    if (!draft) return false;
    return (Object.keys(draft) as Array<keyof ContactDraft>).some((field) => {
      const draftValue = (draft[field] ?? "").toString().trim();
      const originalValue = (contact[field] ?? "").toString().trim();
      return draftValue !== originalValue;
    });
  };

  const buildUpdatePayload = (contact: Contact) => {
    const draft = drafts[contact.id];
    if (!draft) return null;
    const payload: Record<string, string | null> = {};
    (Object.keys(draft) as Array<keyof ContactDraft>).forEach((field) => {
      const value = (draft[field] ?? "").toString().trim();
      payload[field] = value ? value : null;
    });
    return payload;
  };

  const handleSave = async (contact: Contact) => {
    const payload = buildUpdatePayload(contact);
    if (!payload || Object.keys(payload).length === 0) return;
    try {
      setSavingId(contact.id);
      await updateContact.mutateAsync({ id: contact.id, data: payload });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[contact.id];
        return next;
      });
    } catch (error: any) {
      alert("No se pudo guardar el contacto: " + getErrorMessage(error));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold text-foreground">Contactos</h1>
            <p className="text-muted-foreground mt-1">
              Administra RUT y ejecutivos asociados a cada contacto.
            </p>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, rut o ejecutivo..."
              className="pl-9 bg-secondary/50"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Lista de contactos</CardTitle>
            <CardDescription>
              {filteredContacts.length} contactos disponibles.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <p className="text-sm">No hay contactos para mostrar</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead>RUT</TableHead>
                      <TableHead>Ejecutivo</TableHead>
                      <TableHead>Fono ejecutivo</TableHead>
                      <TableHead>RUT ejecutivo</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredContacts.map((contact) => {
                      const isSaving = savingId === contact.id;
                      return (
                        <TableRow key={contact.id}>
                          <TableCell className="min-w-[180px]">
                            <Input
                              value={getDraftValue(contact, "name")}
                              onChange={(event) =>
                                handleDraftChange(contact.id, "name", event.target.value)
                              }
                              className="h-8"
                            />
                          </TableCell>
                          <TableCell className="min-w-[140px] font-mono text-sm">
                            {contact.phone}
                          </TableCell>
                          <TableCell className="min-w-[140px]">
                            <Input
                              value={getDraftValue(contact, "rut")}
                              onChange={(event) =>
                                handleDraftChange(contact.id, "rut", event.target.value)
                              }
                              className="h-8"
                            />
                          </TableCell>
                          <TableCell className="min-w-[160px]">
                            <Input
                              value={getDraftValue(contact, "executiveName")}
                              onChange={(event) =>
                                handleDraftChange(contact.id, "executiveName", event.target.value)
                              }
                              className="h-8"
                            />
                          </TableCell>
                          <TableCell className="min-w-[140px]">
                            <Input
                              value={getDraftValue(contact, "executivePhone")}
                              onChange={(event) =>
                                handleDraftChange(contact.id, "executivePhone", event.target.value)
                              }
                              className="h-8"
                            />
                          </TableCell>
                          <TableCell className="min-w-[140px]">
                            <Input
                              value={getDraftValue(contact, "executiveRut")}
                              onChange={(event) =>
                                handleDraftChange(contact.id, "executiveRut", event.target.value)
                              }
                              className="h-8"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              onClick={() => handleSave(contact)}
                              disabled={!hasChanges(contact) || isSaving}
                            >
                              {isSaving ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                              <span className="ml-2">Guardar</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
