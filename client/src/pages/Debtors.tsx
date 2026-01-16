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
  AlertCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// Mock data for debtors based on debtors.js
const mockDebtors = [
  { id: 1, name: "Juan Pérez", phone: "56949351842", debt: 150000, status: "pendiente", lastContact: "2026-01-10" },
  { id: 2, name: "Maria Gonzalez", phone: "56991247408", debt: 45000, status: "contactado", lastContact: "2026-01-15" },
  { id: 3, name: "Carlos Ruiz", phone: "56927615358", debt: 890000, status: "vencido", lastContact: "2025-12-20" },
  { id: 4, name: "Ana Silva", phone: "56927455353", debt: 12500, status: "pagado", lastContact: "2026-01-14" },
  { id: 5, name: "Pedro Soto", phone: "56927621892", debt: 320000, status: "pendiente", lastContact: "2026-01-12" },
  { id: 6, name: "Laura Diaz", phone: "56987654321", debt: 55000, status: "judicial", lastContact: "2025-11-30" },
  { id: 7, name: "Diego Torres", phone: "56912345678", debt: 210000, status: "pendiente", lastContact: "2026-01-16" },
];

export default function Debtors() {
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
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Debt Amount</TableHead>
                  <TableHead className="text-right">Last Contact</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockDebtors.map((debtor) => (
                  <TableRow key={debtor.id}>
                    <TableCell className="font-medium">{debtor.name}</TableCell>
                    <TableCell className="font-mono text-xs">{debtor.phone}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`
                        capitalize
                        ${debtor.status === 'pagado' ? 'text-green-600 border-green-200 bg-green-50' : ''}
                        ${debtor.status === 'vencido' ? 'text-red-600 border-red-200 bg-red-50' : ''}
                        ${debtor.status === 'pendiente' ? 'text-orange-600 border-orange-200 bg-orange-50' : ''}
                        ${debtor.status === 'contactado' ? 'text-blue-600 border-blue-200 bg-blue-50' : ''}
                      `}>
                        {debtor.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">${debtor.debt.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{new Date(debtor.lastContact).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem>View Details</DropdownMenuItem>
                          <DropdownMenuItem>Send Individual Message</DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <div className="p-4 border-t text-xs text-muted-foreground flex justify-between items-center">
            <span>Showing 7 of 12,450 records</span>
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
