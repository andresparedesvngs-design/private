import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Upload, 
  Download, 
  Search, 
  Filter, 
  MoreHorizontal,
  FileSpreadsheet,
  MessageSquare,
  Loader2,
  Users,
  Trash2,
  Plus,
  RotateCcw
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useDebtors,
  useDeleteDebtor,
  useCreateDebtor,
  useBulkCreateDebtors,
  useResetDebtors,
  useCleanupDebtors,
  useReleaseDebtors,
} from "@/lib/api";
import type { Debtor } from "@shared/schema";
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

export default function Debtors() {
  const { data: debtors, isLoading } = useDebtors();
  const deleteDebtor = useDeleteDebtor();
  const createDebtor = useCreateDebtor();
  const bulkCreateDebtors = useBulkCreateDebtors();
  const resetDebtors = useResetDebtors();
  const cleanupDebtors = useCleanupDebtors();
  const releaseDebtors = useReleaseDebtors();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isCleanupOpen, setIsCleanupOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newDebt, setNewDebt] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const filteredDebtors = debtors?.filter(d => 
    d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.phone.includes(searchQuery)
  ) || [];

  const debtorStatusOptions = [
    { value: "disponible", label: "Disponibles" },
    { value: "procesando", label: "Procesando" },
    { value: "completado", label: "Completados" },
    { value: "fallado", label: "Fallados" },
  ] as const;

  const allStatusValues = debtorStatusOptions.map((s) => s.value);

  const [exportAllStatuses, setExportAllStatuses] = useState(true);
  const [exportStatuses, setExportStatuses] = useState<string[]>(allStatusValues);

  const [cleanupAllStatuses, setCleanupAllStatuses] = useState(false);
  const [cleanupStatuses, setCleanupStatuses] = useState<string[]>([]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const debtor of debtors ?? []) {
      counts[debtor.status] = (counts[debtor.status] ?? 0) + 1;
    }
    return counts;
  }, [debtors]);

  const toggleStatusInList = (current: string[], status: string) =>
    current.includes(status)
      ? current.filter((s) => s !== status)
      : [...current, status];

  const exportTargets = useMemo(() => {
    if (!debtors?.length) return [];
    if (exportAllStatuses) return debtors;
    const set = new Set(exportStatuses);
    return debtors.filter((d) => set.has(d.status));
  }, [debtors, exportAllStatuses, exportStatuses]);

  const cleanupTargets = useMemo(() => {
    if (!debtors?.length) return [];
    if (cleanupAllStatuses) return debtors;
    const set = new Set(cleanupStatuses);
    return debtors.filter((d) => set.has(d.status));
  }, [debtors, cleanupAllStatuses, cleanupStatuses]);
  
  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'disponible': return <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Disponible</Badge>;
      case 'procesando': return <Badge variant="outline" className="text-yellow-600 border-yellow-200 bg-yellow-50 animate-pulse">Procesando</Badge>;
      case 'completado': return <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">Completado</Badge>;
      case 'fallado': return <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">Fallado</Badge>;
      default: return <Badge variant="outline">Desconocido</Badge>;
    }
  };

  const handleToggleExportAll = (checked: boolean) => {
    setExportAllStatuses(checked);
    if (checked) {
      setExportStatuses(allStatusValues);
    }
  };

  const handleToggleExportStatus = (status: string, checked: boolean) => {
    setExportAllStatuses(false);
    setExportStatuses((prev) => {
      const next = checked
        ? prev.includes(status)
          ? prev
          : [...prev, status]
        : prev.filter((s) => s !== status);

      if (next.length === allStatusValues.length) {
        setExportAllStatuses(true);
        return allStatusValues;
      }

      return next;
    });
  };

  const handleToggleCleanupAll = (checked: boolean) => {
    setCleanupAllStatuses(checked);
    if (checked) {
      setCleanupStatuses(allStatusValues);
      return;
    }
    setCleanupStatuses([]);
  };

  const handleToggleCleanupStatus = (status: string, checked: boolean) => {
    setCleanupAllStatuses(false);
    setCleanupStatuses((prev) => {
      const next = checked
        ? prev.includes(status)
          ? prev
          : [...prev, status]
        : prev.filter((s) => s !== status);
      if (next.length === allStatusValues.length) {
        setCleanupAllStatuses(true);
        return allStatusValues;
      }
      return next;
    });
  };

  const openExportDialog = () => {
    if (!debtors?.length) {
      alert("No hay deudores para exportar");
      return;
    }
    setIsExportOpen(true);
  };

  const openCleanupDialog = () => {
    if (!debtors?.length) {
      alert("No hay deudores para limpiar");
      return;
    }
    setIsCleanupOpen(true);
  };

  const handleDownloadTemplate = () => {
    const rows = [
      {
        Nombre: "Juan Perez",
        Telefono: "+56912345678",
        Deuda: 150000,
        Estado: "disponible",
        "Nombre Ejecutivo": "Maria Gonzalez",
        "Fono Ejecutivo": "+56998765432",
        Rut: "12345678-9",
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Plantilla");
    XLSX.writeFile(workbook, "plantilla_deudores.xlsx");
  };

  const normalizeHeader = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");

  const normalizeMetadataKey = (header: string) => {
    const normalized = normalizeHeader(header);
    if (!normalized) return normalized;

    const aliasMap: Record<string, string> = {
      nombre: "name",
      nombres: "name",
      fullname: "name",
      nombresyapellidos: "name",
      razonsocial: "name",
      cliente: "name",
      nombreejecutivo: "nombre_ejecutivo",
      fonoejecutivo: "fono_ejecutivo",
      telefonoejecutivo: "fono_ejecutivo",
      ejecutivofono: "fono_ejecutivo",
      ejecutivonombre: "nombre_ejecutivo",
      telefono: "phone",
      telefon: "phone",
      celular: "phone",
      movil: "phone",
      movil1: "phone",
      telefono1: "phone",
      phone: "phone",
      deuda: "debt",
      monto: "debt",
      saldo: "debt",
      deuda_total: "debt",
      total: "debt",
    };

    return aliasMap[normalized] ?? normalized;
  };

  const detectDelimiter = (headerLine: string) => {
    const commaCount = (headerLine.match(/,/g) ?? []).length;
    const semicolonCount = (headerLine.match(/;/g) ?? []).length;
    return semicolonCount > commaCount ? ";" : ",";
  };

  const parseCsvLine = (line: string, delimiter: string): string[] => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const next = line[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === delimiter && !inQuotes) {
        cells.push(current.trim());
        current = "";
        continue;
      }

      current += char;
    }

    cells.push(current.trim());
    return cells;
  };

  const headerVariants: Record<
    "name" | "phone" | "debt" | "status" | "execName" | "execPhone",
    string[]
  > = {
    name: [
      "nombre",
      "nombres",
      "name",
      "fullname",
      "full name",
      "cliente",
      "contacto",
      "razon social",
      "razon_social",
    ],
    phone: [
      "telefono",
      "teléfono",
      "phone",
      "celular",
      "movil",
      "móvil",
      "mobile",
      "whatsapp",
      "numero",
      "número",
      "phone number",
      "phone_number",
    ],
    debt: [
      "deuda",
      "debt",
      "monto",
      "amount",
      "saldo",
      "balance",
      "importe",
      "valor",
      "total",
    ],
    status: [
      "estado",
      "status",
      "estatus",
      "situacion",
      "situación",
    ],
    execName: [
      "nombre ejecutivo",
      "nombre_ejecutivo",
      "ejecutivo",
      "ejecutivo nombre",
      "executive name",
      "agent name",
      "gestor",
      "gestor nombre",
    ],
    execPhone: [
      "fono ejecutivo",
      "fono_ejecutivo",
      "telefono ejecutivo",
      "telefono_ejecutivo",
      "ejecutivo fono",
      "executive phone",
      "agent phone",
      "gestor fono",
      "gestor telefono",
    ],
  };

  const findHeaderIndex = (headersNormalized: string[], variants: string[]) => {
    const normalizedVariants = variants.map(normalizeHeader);
    return headersNormalized.findIndex((header) =>
      normalizedVariants.some(
        (variant) =>
          header === variant ||
          header.includes(variant) ||
          variant.includes(header)
      )
    );
  };

  const normalizePhoneValue = (value: string | undefined) => {
    if (!value) return "";
    const hasPlus = value.trim().startsWith("+");
    const digits = value.replace(/\D/g, "");
    return hasPlus ? `+${digits}` : digits;
  };

  const parseDebtValue = (value: string | undefined) => {
    if (!value) return 0;
    const cleaned = value.replace(/[^\d,.\-]/g, "").trim();
    if (!cleaned) return 0;

    const hasComma = cleaned.includes(",");
    const hasDot = cleaned.includes(".");
    let normalized = cleaned;

    if (hasComma && hasDot) {
      // Assume dot as thousands separator and comma as decimal separator.
      normalized = cleaned.replace(/\./g, "").replace(/,/g, ".");
    } else if (hasComma && !hasDot) {
      normalized = cleaned.replace(/,/g, ".");
    }

    const parsed = Number.parseFloat(normalized);
    if (!Number.isFinite(parsed)) return 0;
    return Math.round(parsed);
  };

  const normalizeStatusValue = (value: string | undefined) => {
    const normalized = normalizeHeader(value ?? "");
    if (!normalized) return "disponible" as const;

    const statusMap: Record<string, "disponible" | "procesando" | "completado" | "fallado"> = {
      disponible: "disponible",
      available: "disponible",
      pending: "disponible",
      procesando: "procesando",
      processing: "procesando",
      enproceso: "procesando",
      completado: "completado",
      completed: "completado",
      finalizado: "completado",
      fallado: "fallado",
      failed: "fallado",
      error: "fallado",
    };

    return statusMap[normalized] ?? "disponible";
  };

  const handleAddDebtor = async () => {
    if (!newName || !newPhone || !newDebt) {
      alert('Por favor complete todos los campos');
      return;
    }
    
    try {
      await createDebtor.mutateAsync({
        name: newName,
        phone: newPhone,
        debt: parseFloat(newDebt),
        status: 'disponible'
      });
      
      setIsAddOpen(false);
      setNewName("");
      setNewPhone("");
      setNewDebt("");
    } catch (error) {
      console.error('Failed to create debtor:', error);
    }
  };

  const handleDeleteDebtor = async (id: string) => {
    if (confirm('¿Estás seguro de eliminar este deudor?')) {
      try {
        await deleteDebtor.mutateAsync(id);
      } catch (error) {
        console.error('Failed to delete debtor:', error);
      }
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isExcelFile = /\.(xlsx|xls)$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = async (e) => {
      let text = "";

      if (isExcelFile) {
        try {
          const buffer = e.target?.result as ArrayBuffer;
          const workbook = XLSX.read(buffer, { type: "array" });
          const firstSheetName = workbook.SheetNames[0];
          const firstSheet = workbook.Sheets[firstSheetName];
          text = XLSX.utils.sheet_to_csv(firstSheet);
        } catch (error) {
          console.error("Failed to read Excel file:", error);
          alert("No se pudo leer el archivo Excel");
          return;
        }
      } else {
        text = (e.target?.result as string) ?? "";
      }

      const lines = text.split(/\r?\n/).filter((line) => line.trim());
      
      if (lines.length < 2) {
        alert('El archivo debe tener al menos una fila de datos');
        return;
      }

      let headerLineIndex = 0;
      if (/^sep\s*=/i.test(lines[0])) {
        headerLineIndex = 1;
      }

      if (!lines[headerLineIndex]) {
        alert("No se encontró la fila de encabezados en el archivo");
        return;
      }

      const delimiter = detectDelimiter(lines[headerLineIndex]);
      const headersRaw = parseCsvLine(lines[headerLineIndex], delimiter);
      const headersNormalized = headersRaw.map(normalizeHeader);

      const nameIdx = findHeaderIndex(headersNormalized, headerVariants.name);
      const phoneIdx = findHeaderIndex(headersNormalized, headerVariants.phone);
      const debtIdx = findHeaderIndex(headersNormalized, headerVariants.debt);
      const statusIdx = findHeaderIndex(headersNormalized, headerVariants.status);
      const execNameIdx = findHeaderIndex(headersNormalized, headerVariants.execName);
      const execPhoneIdx = findHeaderIndex(headersNormalized, headerVariants.execPhone);

      if (nameIdx === -1 || phoneIdx === -1) {
        alert(`No pude encontrar columnas de nombre y telefono.\n\nEncabezados detectados: ${headersRaw.join(", ")}`);
        return;
      }

      const standardIndexes = new Set(
        [nameIdx, phoneIdx, debtIdx, statusIdx, execNameIdx, execPhoneIdx].filter(
          (idx) => idx >= 0
        )
      );

      const metadataFields = headersRaw
        .map((header, index) => {
          const key = normalizeMetadataKey(header) || `col${index + 1}`;
          return { index, label: header.trim(), key };
        })
        .filter(({ index, key }) => !standardIndexes.has(index) && key.length > 0);

      const debtorsToCreate: Array<{
        name: string;
        phone: string;
        debt: number;
        status: "disponible" | "procesando" | "completado" | "fallado";
        metadata?: Record<string, unknown>;
      }> = [];

      let skippedRows = 0;

      for (let i = headerLineIndex + 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i], delimiter);
        const name = cols[nameIdx]?.trim();
        const phone = normalizePhoneValue(cols[phoneIdx]);

        if (!name || !phone) {
          skippedRows++;
          continue;
        }

        const debtor: {
          name: string;
          phone: string;
          debt: number;
          status: "disponible" | "procesando" | "completado" | "fallado";
          metadata?: Record<string, unknown>;
        } = {
          name,
          phone,
          debt: debtIdx !== -1 ? parseDebtValue(cols[debtIdx]) : 0,
          status: statusIdx !== -1 ? normalizeStatusValue(cols[statusIdx]) : "disponible",
        };

        const execName = execNameIdx !== -1 ? cols[execNameIdx]?.trim() : "";
        const execPhone = execPhoneIdx !== -1 ? cols[execPhoneIdx]?.trim() : "";

        if (execName || execPhone) {
          debtor.metadata = debtor.metadata ?? {};
          if (execName) {
            debtor.metadata.nombre_ejecutivo = execName;
          }
          if (execPhone) {
            debtor.metadata.fono_ejecutivo = execPhone;
          }
        }

        if (metadataFields.length > 0) {
          const metadata: Record<string, unknown> = {};
          for (const field of metadataFields) {
            const rawValue = cols[field.index];
            if (!rawValue || !rawValue.trim()) continue;
            metadata[field.key] = rawValue.trim();
          }
          if (Object.keys(metadata).length > 0) {
            debtor.metadata = metadata;
          }
        }

        debtorsToCreate.push(debtor);
      }

      if (debtorsToCreate.length === 0) {
        alert("No se encontraron deudores validos en el archivo");
        return;
      }

      try {
        await bulkCreateDebtors.mutateAsync(debtorsToCreate);

        const metadataSummary =
          metadataFields.length > 0
            ? `\nColumnas extra guardadas como metadata: ${metadataFields
                .slice(0, 6)
                .map((m) => m.label || m.key)
                .join(", ")}${metadataFields.length > 6 ? "..." : ""}`
            : "";

        const skippedSummary =
          skippedRows > 0 ? `\nFilas omitidas por datos incompletos: ${skippedRows}` : "";

        alert(
          `Se importaron ${debtorsToCreate.length} deudores.${skippedSummary}${metadataSummary}`
        );
      } catch (error) {
        console.error('Failed to import debtors:', error);
        alert('Error al importar deudores');
      }
    };
    
    if (isExcelFile) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleResetDebtors = async () => {
    const unavailable = debtors?.filter(d => d.status === 'fallado' || d.status === 'completado').length || 0;
    if (unavailable === 0) {
      alert('Todos los deudores ya están disponibles');
      return;
    }
    
    if (confirm(`¿Resetear ${unavailable} deudores a estado "disponible"?`)) {
      try {
        const result = await resetDebtors.mutateAsync();
        alert(`Se resetearon ${result.count} deudores exitosamente`);
      } catch (error) {
        console.error('Failed to reset debtors:', error);
        alert('Error al resetear deudores');
      }
    }
  };

  const handleReleaseAvailable = async () => {
    const availableCount = statusCounts.disponible ?? 0;
    if (availableCount === 0) {
      alert("No hay deudores disponibles para liberar");
      return;
    }

    if (!confirm(`¿Liberar ${availableCount} deudores disponibles (desasignar de campañas)?`)) {
      return;
    }

    try {
      const result = await releaseDebtors.mutateAsync(["disponible"]);
      alert(`Se liberaron ${result.count} deudores disponibles`);
    } catch (error) {
      console.error("Failed to release available debtors:", error);
      alert("Error al liberar deudores disponibles");
    }
  };

  const performExportCSV = (list: Debtor[]) => {
    if (!list.length) {
      alert("No hay deudores que coincidan con ese filtro");
      return;
    }

    const headers = ["Nombre", "Teléfono", "Deuda", "Estado", "Último Contacto"];
    const rows = list.map((d) => [
      d.name,
      d.phone,
      d.debt.toString(),
      d.status,
      d.lastContact ? new Date(d.lastContact).toLocaleDateString() : "Nunca",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `deudores_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleConfirmExport = () => {
    if (!exportAllStatuses && exportStatuses.length === 0) {
      alert("Selecciona al menos un estado para exportar");
      return;
    }
    performExportCSV(exportTargets);
    setIsExportOpen(false);
  };

  const handleConfirmCleanup = async () => {
    if (!cleanupAllStatuses && cleanupStatuses.length === 0) {
      alert("Selecciona al menos un estado para limpiar");
      return;
    }

    if (cleanupTargets.length === 0) {
      alert("No hay deudores que coincidan con ese filtro");
      return;
    }

    const scopeText = cleanupAllStatuses
      ? "TODOS los deudores"
      : `los deudores en estado: ${cleanupStatuses.join(", ")}`;

    if (!confirm(`¿Seguro que deseas eliminar ${scopeText}? (${cleanupTargets.length})`)) {
      return;
    }

    try {
      const result = await cleanupDebtors.mutateAsync({
        deleteAll: cleanupAllStatuses,
        statuses: cleanupAllStatuses ? undefined : cleanupStatuses,
      });
      alert(`Se eliminaron ${result.count} deudores`);
      setIsCleanupOpen(false);
    } catch (error) {
      console.error("Failed to cleanup debtors:", error);
      alert("Error al limpiar deudores");
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold text-foreground">Gestión de deudores</h1>
            <p className="text-muted-foreground mt-1">Sube y administra tus listas de contactos.</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              className="gap-2" 
              onClick={handleResetDebtors}
              disabled={resetDebtors.isPending}
              data-testid="button-reset-debtors"
            >
              {resetDebtors.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Resetear estado
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={handleReleaseAvailable}
              disabled={releaseDebtors.isPending}
              data-testid="button-release-available"
            >
              {releaseDebtors.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Liberar disponibles
            </Button>
            <Dialog open={isExportOpen} onOpenChange={setIsExportOpen}>
              <Button
                variant="outline"
                className="gap-2"
                onClick={openExportDialog}
                data-testid="button-export-csv"
              >
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Exportar deudores</DialogTitle>
                  <DialogDescription>
                    Elige qué estados quieres incluir en la exportación.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-2 py-2">
                  <div className="flex items-center justify-between rounded-md border p-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="export-all-statuses"
                        checked={exportAllStatuses}
                        onCheckedChange={(checked) => handleToggleExportAll(checked === true)}
                      />
                      <Label htmlFor="export-all-statuses">Todos los estados</Label>
                    </div>
                    <span className="text-xs text-muted-foreground">{debtors?.length ?? 0}</span>
                  </div>

                  {debtorStatusOptions.map((option) => {
                    const checked = exportAllStatuses || exportStatuses.includes(option.value);
                    const count = statusCounts[option.value] ?? 0;
                    const id = `export-status-${option.value}`;

                    return (
                      <div key={option.value} className="flex items-center justify-between rounded-md border p-2">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={id}
                            checked={checked}
                            onCheckedChange={(nextChecked) =>
                              handleToggleExportStatus(option.value, nextChecked === true)
                            }
                          />
                          <Label htmlFor={id}>{option.label}</Label>
                        </div>
                        <span className="text-xs text-muted-foreground">{count}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="text-sm text-muted-foreground">
                  Se exportarán {exportTargets.length} de {debtors?.length ?? 0} deudores.
                </div>

                <DialogFooter>
                  <Button variant="ghost" onClick={() => setIsExportOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleConfirmExport}>Exportar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={isCleanupOpen} onOpenChange={setIsCleanupOpen}>
              <Button
                variant="outline"
                className="gap-2 border-destructive/40 text-destructive hover:text-destructive"
                onClick={openCleanupDialog}
                disabled={cleanupDebtors.isPending}
                data-testid="button-cleanup-debtors"
              >
                {cleanupDebtors.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Limpiar lista
              </Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Limpiar deudores</DialogTitle>
                  <DialogDescription>
                    Puedes eliminar por estado o limpiar toda la lista.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-2 py-2">
                  <div className="flex items-center justify-between rounded-md border p-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="cleanup-all-statuses"
                        checked={cleanupAllStatuses}
                        onCheckedChange={(checked) => handleToggleCleanupAll(checked === true)}
                      />
                      <Label htmlFor="cleanup-all-statuses">Todos los estados</Label>
                    </div>
                    <span className="text-xs text-muted-foreground">{debtors?.length ?? 0}</span>
                  </div>

                  {debtorStatusOptions.map((option) => {
                    const checked = cleanupAllStatuses || cleanupStatuses.includes(option.value);
                    const count = statusCounts[option.value] ?? 0;
                    const id = `cleanup-status-${option.value}`;

                    return (
                      <div key={option.value} className="flex items-center justify-between rounded-md border p-2">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={id}
                            checked={checked}
                            onCheckedChange={(nextChecked) =>
                              handleToggleCleanupStatus(option.value, nextChecked === true)
                            }
                          />
                          <Label htmlFor={id}>{option.label}</Label>
                        </div>
                        <span className="text-xs text-muted-foreground">{count}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="text-sm text-muted-foreground">
                  Se eliminarán {cleanupTargets.length} deudores.
                </div>

                <DialogFooter>
                  <Button variant="ghost" onClick={() => setIsCleanupOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleConfirmCleanup}
                    disabled={cleanupDebtors.isPending}
                  >
                    Eliminar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <input 
              type="file" 
              accept=".csv,.txt,.xlsx,.xls"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <Button 
              className="gap-2 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
              onClick={() => fileInputRef.current?.click()}
              disabled={bulkCreateDebtors.isPending}
              data-testid="button-import-csv"
            >
              {bulkCreateDebtors.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Importar lista
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={handleDownloadTemplate}
              data-testid="button-download-debtors-template"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Descargar plantilla
            </Button>
          </div>
        </div>

        <Card className="border-dashed border-2 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => fileInputRef.current?.click()}>
          <CardContent className="flex flex-col items-center justify-center py-10 gap-4">
             <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
               <FileSpreadsheet className="h-6 w-6 text-primary" />
             </div>
             <div className="text-center">
               <h3 className="font-semibold">Importación rápida</h3>
               <p className="text-sm text-muted-foreground">Arrastra y suelta tu archivo CSV o Excel aquí, o haz clic para seleccionar</p>
               <p className="text-xs text-muted-foreground mt-1">
                 Formato: nombre, teléfono, deuda (opcional), nombre ejecutivo, fono ejecutivo
               </p>
             </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 border-b">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar por nombre o teléfono..." 
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search-debtors"
                />
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                  <DialogTrigger asChild>
                    <Button className="gap-2" data-testid="button-add-debtor">
                      <Plus className="h-4 w-4" />
                      Agregar deudor
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Agregar nuevo deudor</DialogTitle>
                      <DialogDescription>
                        Ingresa la información del deudor manualmente.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Nombre</Label>
                        <Input 
                          placeholder="Juan Pérez"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          data-testid="input-debtor-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Teléfono</Label>
                        <Input 
                          placeholder="+56912345678"
                          value={newPhone}
                          onChange={(e) => setNewPhone(e.target.value)}
                          data-testid="input-debtor-phone"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Monto de deuda</Label>
                        <Input 
                          type="number"
                          placeholder="150000"
                          value={newDebt}
                          onChange={(e) => setNewDebt(e.target.value)}
                          data-testid="input-debtor-debt"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="ghost" onClick={() => setIsAddOpen(false)}>Cancelar</Button>
                      <Button 
                        onClick={handleAddDebtor}
                        disabled={createDebtor.isPending}
                        data-testid="button-save-debtor"
                      >
                        {createDebtor.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Agregar deudor
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : !filteredDebtors.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mb-4 opacity-50" />
                <p>{searchQuery ? 'Ningún deudor coincide con tu búsqueda' : 'No se encontraron deudores'}</p>
                <p className="text-sm">Importa un CSV o agrega deudores manualmente para comenzar</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Estado</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead className="text-right">Monto deuda</TableHead>
                    <TableHead className="text-right">Último contacto</TableHead>
                    <TableHead className="w-[100px] text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDebtors.map((debtor) => (
                    <TableRow key={debtor.id} data-testid={`row-debtor-${debtor.id}`}>
                      <TableCell>
                        {getStatusBadge(debtor.status)}
                      </TableCell>
                      <TableCell className="font-medium">{debtor.name}</TableCell>
                      <TableCell className="font-mono text-sm">{debtor.phone}</TableCell>
                      <TableCell className="text-right font-mono">${debtor.debt.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm">
                        {debtor.lastContact ? new Date(debtor.lastContact).toLocaleDateString() : 'Nunca'}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center gap-1">
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteDebtor(debtor.id)}
                            disabled={deleteDebtor.isPending}
                            data-testid={`button-delete-${debtor.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
          <div className="p-4 border-t text-xs text-muted-foreground flex justify-between items-center">
            <span>Mostrando {filteredDebtors.length} de {debtors?.length || 0} registros</span>
          </div>
        </Card>
      </div>
    </Layout>
  );
}



