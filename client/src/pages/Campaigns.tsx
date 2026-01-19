import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useCampaigns, usePools, useSessions, useCreateCampaign, useStartCampaign, usePauseCampaign } from "@/lib/api";
import { 
  Plus, 
  Play, 
  Pause, 
  StopCircle, 
  Calendar, 
  Clock, 
  Users, 
  Settings,
  Zap,
  RefreshCw,
  Search,
  Filter,
  BarChart,
  Loader2
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useState } from "react";

export default function Campaigns() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [activeTab, setActiveTab] = useState("campaigns");

  const { data: campaigns, isLoading: campaignsLoading } = useCampaigns();
  const { data: pools, isLoading: poolsLoading } = usePools();
  const { data: sessions } = useSessions();
  const createCampaign = useCreateCampaign();
  const startCampaign = useStartCampaign();
  const pauseCampaign = usePauseCampaign();

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold text-foreground">Campaign Orchestration</h1>
            <p className="text-muted-foreground mt-1">Manage bulk messaging campaigns and routing pools.</p>
          </div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-[400px]">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="campaigns">Active Campaigns</TabsTrigger>
              <TabsTrigger value="pools">Routing Pools</TabsTrigger>
            </TabsList>
          </Tabs>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20">
                <Plus className="h-4 w-4" />
                New Campaign
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Create New Campaign</DialogTitle>
                <DialogDescription>
                  Configure target audience, message, and routing strategy.
                </DialogDescription>
              </DialogHeader>
              
              <div className="py-4">
                {step === 1 && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="space-y-2">
                      <Label>Campaign Name</Label>
                      <Input placeholder="e.g. February Collections - Batch A" />
                    </div>
                    <div className="space-y-2">
                      <Label>Target Audience</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a debtor list" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Available Debtors (12,450)</SelectItem>
                          <SelectItem value="overdue">Overdue &gt; 30 Days (4,200)</SelectItem>
                          <SelectItem value="vip">High Priority / VIP (850)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                       <Label>Routing Strategy (Pool)</Label>
                       <Select defaultValue="pool-1">
                        <SelectTrigger>
                          <SelectValue placeholder="Select routing pool" />
                        </SelectTrigger>
                        <SelectContent>
                          {pools?.map(pool => (
                            <SelectItem key={pool.id} value={pool.id}>{pool.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="space-y-2">
                      <Label>Message Template</Label>
                      <Textarea 
                        placeholder="Hola {name}, te recordamos que tu deuda de {debt_amount} vence el {due_date}..." 
                        className="h-32 resize-none font-mono text-sm"
                      />
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">{`{name}`}</Badge>
                        <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">{`{debt_amount}`}</Badge>
                        <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">{`{due_date}`}</Badge>
                        <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">{`{rut}`}</Badge>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="text-xs">Attach Image</Button>
                      <Button variant="outline" size="sm" className="text-xs">Attach PDF</Button>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="flex justify-between sm:justify-between">
                {step > 1 ? (
                  <Button variant="ghost" onClick={() => setStep(step - 1)}>Back</Button>
                ) : (
                  <div></div>
                )}
                {step < 2 ? (
                  <Button onClick={() => setStep(step + 1)}>Next: Message</Button>
                ) : (
                  <Button onClick={() => setIsCreateOpen(false)} className="bg-primary text-white">Launch Campaign</Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {activeTab === "campaigns" ? (
          <div className="space-y-4 animate-in fade-in duration-300">
             {/* Filters */}
            <div className="flex gap-4 items-center bg-card p-4 rounded-lg border shadow-sm">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search campaigns..." className="pl-9 bg-background" />
              </div>
              <div className="h-8 w-[1px] bg-border mx-2" />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-9 border-dashed">
                  <Filter className="mr-2 h-4 w-4" />
                  Status
                </Button>
                <Button variant="outline" size="sm" className="h-9 border-dashed">
                  <Calendar className="mr-2 h-4 w-4" />
                  Date Range
                </Button>
              </div>
            </div>

            {campaignsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : !campaigns?.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mb-4 opacity-50" />
                <p>No campaigns found</p>
              </div>
            ) : campaigns?.map((campaign) => (
              <Card key={campaign.id} className="group overflow-hidden transition-all hover:shadow-md hover:border-primary/50">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row gap-6 md:items-center justify-between">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-lg">{campaign.name}</h3>
                        <Badge variant={
                          campaign.status === 'active' ? 'default' : 
                          campaign.status === 'completed' ? 'secondary' : 'outline'
                        } className={
                          campaign.status === 'active' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''
                        }>
                          {campaign.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          Started {campaign.startedAt ? new Date(campaign.startedAt).toLocaleDateString() : 'Not started'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {campaign.totalDebtors.toLocaleString()} recipients
                        </span>
                         <span className="flex items-center gap-1">
                          <Zap className="h-3.5 w-3.5" />
                          Pool: {pools?.find(p => p.id === campaign.poolId)?.name || 'Default'}
                        </span>
                      </div>
                    </div>

                    <div className="flex-1 max-w-md space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">{campaign.progress}%</span>
                      </div>
                      <Progress value={campaign.progress} className="h-2" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span className="text-green-600">{campaign.sent.toLocaleString()} Sent</span>
                        <span className="text-red-500">{campaign.failed} Failed</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {campaign.status === 'active' ? (
                        <Button variant="outline" size="icon" title="Pause">
                          <Pause className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button variant="outline" size="icon" title="Resume">
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="outline" size="icon" title="Stop">
                        <StopCircle className="h-4 w-4 text-destructive" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Details">
                        <BarChart className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 animate-in fade-in duration-300">
             <div className="md:col-span-2 flex justify-end">
                <Button variant="outline" className="gap-2">
                  <RefreshCw className="h-4 w-4" /> Auto-Create Pools
                </Button>
             </div>
             
             {poolsLoading ? (
                <div className="md:col-span-2 flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
             ) : pools?.map((pool) => (
                <Card key={pool.id} className="border-l-4 border-l-primary">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle>{pool.name}</CardTitle>
                        <CardDescription className="mt-1 flex items-center gap-2">
                          <Badge variant="secondary">{pool.strategy}</Badge>
                          <span className="text-xs">{pool.sessionIds?.length || 0} sessions assigned</span>
                        </CardDescription>
                      </div>
                      <Switch checked={pool.active} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                     <div className="space-y-2">
                       <div className="flex justify-between text-sm">
                         <Label>Base Delay (ms)</Label>
                         <span className="text-muted-foreground">{pool.delayBase}ms</span>
                       </div>
                       <Slider defaultValue={[pool.delayBase]} max={30000} step={100} />
                     </div>
                     
                     <div className="space-y-2">
                       <div className="flex justify-between text-sm">
                         <Label>Variation (ms)</Label>
                         <span className="text-muted-foreground">±{pool.delayVariation}ms</span>
                       </div>
                       <Slider defaultValue={[pool.delayVariation]} max={5000} step={100} />
                     </div>

                     <div className="pt-2">
                       <Label className="text-sm mb-2 block">Assigned Sessions</Label>
                       <div className="flex flex-wrap gap-2">
                         {pool.sessionIds?.map(sid => {
                           const session = sessions?.find(s => s.id === sid);
                           return (
                             <Badge key={sid} variant="outline" className="bg-background">
                               {session?.phoneNumber || sid}
                             </Badge>
                           );
                         })}
                         <Button variant="ghost" size="sm" className="h-5 text-xs">+ Add</Button>
                       </div>
                     </div>
                  </CardContent>
                </Card>
             ))}
             
             <Card className="border-dashed flex items-center justify-center p-8 cursor-pointer hover:bg-muted/50 transition-colors">
               <div className="text-center">
                 <Plus className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                 <h3 className="font-semibold text-muted-foreground">Create Custom Pool</h3>
               </div>
             </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}
