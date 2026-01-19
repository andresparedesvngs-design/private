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
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Play,
  Loader2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useDebtors, useDeleteDebtor } from "@/lib/api";
import type { Debtor } from "@shared/schema";

export default function Debtors() {
  const { data: debtors, isLoading } = useDebtors();
  const deleteDebtor = useDeleteDebtor();
  
  const getStatusBadge = (status: 'disponible' | 'procesando' | 'completado' | 'fallado') => {
      switch(status) {
          case 'disponible': return <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">🟢 Disponible</Badge>;
          case 'procesando': return <Badge variant="outline" className="text-yellow-600 border-yellow-200 bg-yellow-50 animate-pulse">🟡 Procesando</Badge>;
          case 'completado': return <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">✅ Completado</Badge>;
          case 'fallado': return <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">❌ Fallado</Badge>;
          default: return <Badge variant="outline">Unknown</Badge>;
      }
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
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button className="gap-2 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20">
              <Upload className="h-4 w-4" />
              Import List
            </Button>
          </div>
        </div>

        <Card className="border-dashed border-2 bg-muted/30">
          <CardContent className="flex flex-col items-center justify-center py-10 gap-4">
             <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
               <FileSpreadsheet className="h-6 w-6 text-primary" />
             </div>
             <div className="text-center">
               <h3 className="font-semibold">Quick Import</h3>
               <p className="text-sm text-muted-foreground">Drag and drop your Excel or CSV file here</p>
             </div>
             <Button variant="secondary" size="sm">Select File</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 border-b">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by name, phone or RUT..." className="pl-9" />
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button variant="outline" size="sm" className="h-9 border-dashed flex-1 sm:flex-none">
                  <Filter className="mr-2 h-4 w-4" />
                  Filter Status
                </Button>
                <Button variant="outline" size="sm" className="h-9 border-dashed flex-1 sm:flex-none">
                  <Filter className="mr-2 h-4 w-4" />
                  Debt Range
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !debtors?.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileSpreadsheet className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold text-lg">No debtors found</h3>
                <p className="text-sm text-muted-foreground">Import a list to get started</p>
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
                    <TableHead className="w-[120px] text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {debtors?.map((debtor) => (
                    <TableRow key={debtor.id}>
                      <TableCell>
                        {getStatusBadge(debtor.status as 'disponible' | 'procesando' | 'completado' | 'fallado')}
                      </TableCell>
                      <TableCell className="font-medium">{debtor.name}</TableCell>
                      <TableCell>
                          <span className="font-mono text-xs">{debtor.phone}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono">${debtor.debt.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-muted-foreground text-xs">
                          {debtor.lastContact ? new Date(debtor.lastContact).toLocaleDateString() : 'Never'}
                      </TableCell>
                      <TableCell>
                          <div className="flex justify-center gap-1">
                               <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600" title="Test Message">
                                  <MessageSquare className="h-4 w-4" />
                               </Button>
                               <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" className="h-8 w-8 p-0">
                                      <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                  <DropdownMenuItem>View Details</DropdownMenuItem>
                                  <DropdownMenuItem>Edit Info</DropdownMenuItem>
                                  <DropdownMenuItem 
                                    className="text-red-600"
                                    onClick={() => deleteDebtor.mutate(debtor.id)}
                                  >
                                    Delete
                                  </DropdownMenuItem>
                                  </DropdownMenuContent>
                              </DropdownMenu>
                          </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
          <div className="p-4 border-t text-xs text-muted-foreground flex justify-between items-center">
            <span>Showing {debtors?.length ?? 0} records</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled>Previous</Button>
              <Button variant="outline" size="sm">Next</Button>
            </div>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
