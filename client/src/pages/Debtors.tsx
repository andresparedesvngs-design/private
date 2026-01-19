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
  Plus
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useDebtors, useDeleteDebtor, useCreateDebtor, useBulkCreateDebtors } from "@/lib/api";
import type { Debtor } from "@shared/schema";
import { useState, useRef } from "react";

export default function Debtors() {
  const { data: debtors, isLoading } = useDebtors();
  const deleteDebtor = useDeleteDebtor();
  const createDebtor = useCreateDebtor();
  const bulkCreateDebtors = useBulkCreateDebtors();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newDebt, setNewDebt] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const filteredDebtors = debtors?.filter(d => 
    d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.phone.includes(searchQuery)
  ) || [];
  
  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'disponible': return <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Disponible</Badge>;
      case 'procesando': return <Badge variant="outline" className="text-yellow-600 border-yellow-200 bg-yellow-50 animate-pulse">Procesando</Badge>;
      case 'completado': return <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">Completado</Badge>;
      case 'fallado': return <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">Fallado</Badge>;
      default: return <Badge variant="outline">Unknown</Badge>;
    }
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

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        alert('El archivo debe tener al menos una fila de datos');
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const nameIdx = headers.findIndex(h => h.includes('nombre') || h.includes('name'));
      const phoneIdx = headers.findIndex(h => h.includes('telefono') || h.includes('phone') || h.includes('celular'));
      const debtIdx = headers.findIndex(h => h.includes('deuda') || h.includes('debt') || h.includes('monto'));

      if (nameIdx === -1 || phoneIdx === -1) {
        alert('El archivo debe tener columnas de nombre y teléfono');
        return;
      }

      const debtorsToCreate = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        if (cols[nameIdx] && cols[phoneIdx]) {
          debtorsToCreate.push({
            name: cols[nameIdx],
            phone: cols[phoneIdx].replace(/[^0-9+]/g, ''),
            debt: debtIdx !== -1 ? Math.round(parseFloat(cols[debtIdx]) || 0) : 0,
            status: 'disponible' as const
          });
        }
      }

      if (debtorsToCreate.length === 0) {
        alert('No se encontraron deudores válidos en el archivo');
        return;
      }

      try {
        await bulkCreateDebtors.mutateAsync(debtorsToCreate);
        alert(`Se importaron ${debtorsToCreate.length} deudores exitosamente`);
      } catch (error) {
        console.error('Failed to import debtors:', error);
        alert('Error al importar deudores');
      }
    };
    
    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExportCSV = () => {
    if (!debtors?.length) {
      alert('No hay deudores para exportar');
      return;
    }

    const headers = ['Nombre', 'Teléfono', 'Deuda', 'Estado', 'Último Contacto'];
    const rows = debtors.map(d => [
      d.name,
      d.phone,
      d.debt.toString(),
      d.status,
      d.lastContact ? new Date(d.lastContact).toLocaleDateString() : 'Nunca'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `deudores_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold text-foreground">Debtors Management</h1>
            <p className="text-muted-foreground mt-1">Upload and manage your contact lists.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={handleExportCSV} data-testid="button-export-csv">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <input 
              type="file" 
              accept=".csv,.txt"
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
              Import List
            </Button>
          </div>
        </div>

        <Card className="border-dashed border-2 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => fileInputRef.current?.click()}>
          <CardContent className="flex flex-col items-center justify-center py-10 gap-4">
             <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
               <FileSpreadsheet className="h-6 w-6 text-primary" />
             </div>
             <div className="text-center">
               <h3 className="font-semibold">Quick Import</h3>
               <p className="text-sm text-muted-foreground">Drag and drop your CSV file here, or click to select</p>
               <p className="text-xs text-muted-foreground mt-1">Format: nombre, telefono, deuda (optional)</p>
             </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 border-b">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search by name or phone..." 
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
                      Add Debtor
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New Debtor</DialogTitle>
                      <DialogDescription>
                        Enter the debtor's information manually.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input 
                          placeholder="Juan Pérez"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          data-testid="input-debtor-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Phone</Label>
                        <Input 
                          placeholder="+56912345678"
                          value={newPhone}
                          onChange={(e) => setNewPhone(e.target.value)}
                          data-testid="input-debtor-phone"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Debt Amount</Label>
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
                      <Button variant="ghost" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                      <Button 
                        onClick={handleAddDebtor}
                        disabled={createDebtor.isPending}
                        data-testid="button-save-debtor"
                      >
                        {createDebtor.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Add Debtor
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
                <p>{searchQuery ? 'No debtors match your search' : 'No debtors found'}</p>
                <p className="text-sm">Import a CSV or add debtors manually to get started</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Status</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="text-right">Debt Amount</TableHead>
                    <TableHead className="text-right">Last Contact</TableHead>
                    <TableHead className="w-[100px] text-center">Actions</TableHead>
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
                        {debtor.lastContact ? new Date(debtor.lastContact).toLocaleDateString() : 'Never'}
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
            <span>Showing {filteredDebtors.length} of {debtors?.length || 0} records</span>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
