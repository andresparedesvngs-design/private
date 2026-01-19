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
import { useCampaigns, usePools, useSessions, useDebtors, useCreateCampaign, useStartCampaign, usePauseCampaign, useCreatePool, useDeleteCampaign } from "@/lib/api";
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
  Loader2,
  Trash2
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useState } from "react";

export default function Campaigns() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreatePoolOpen, setIsCreatePoolOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [activeTab, setActiveTab] = useState("campaigns");

  const [campaignName, setCampaignName] = useState("");
  const [selectedPoolId, setSelectedPoolId] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");

  const [poolName, setPoolName] = useState("");
  const [poolStrategy, setPoolStrategy] = useState<"competitive" | "fixed_turns" | "random_turns">("competitive");
  const [poolDelayBase, setPoolDelayBase] = useState([5000]);
  const [poolDelayVariation, setPoolDelayVariation] = useState([1000]);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);

  const { data: campaigns, isLoading: campaignsLoading } = useCampaigns();
  const { data: pools, isLoading: poolsLoading } = usePools();
  const { data: sessions } = useSessions();
  const { data: debtors } = useDebtors();
  const createCampaign = useCreateCampaign();
  const startCampaign = useStartCampaign();
  const pauseCampaign = usePauseCampaign();
  const createPool = useCreatePool();
  const deleteCampaign = useDeleteCampaign();

  const availableDebtors = debtors?.filter(d => d.status === 'disponible') || [];

  const handleCreateCampaign = async () => {
    if (!campaignName || !selectedPoolId || !messageTemplate) {
      alert('Por favor complete todos los campos');
      return;
    }
    
    try {
      await createCampaign.mutateAsync({
        name: campaignName,
        poolId: selectedPoolId,
        message: messageTemplate,
        status: 'draft',
        totalDebtors: availableDebtors.length,
        sent: 0,
        failed: 0,
        progress: 0
      });
      
      setIsCreateOpen(false);
      setCampaignName("");
      setSelectedPoolId("");
      setMessageTemplate("");
      setStep(1);
    } catch (error) {
      console.error('Failed to create campaign:', error);
    }
  };

  const handleStartCampaign = async (id: string) => {
    try {
      await startCampaign.mutateAsync(id);
    } catch (error) {
      console.error('Failed to start campaign:', error);
    }
  };

  const handlePauseCampaign = async (id: string) => {
    try {
      await pauseCampaign.mutateAsync(id);
    } catch (error) {
      console.error('Failed to pause campaign:', error);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (confirm('¿Estás seguro de eliminar esta campaña?')) {
      try {
        await deleteCampaign.mutateAsync(id);
      } catch (error) {
        console.error('Failed to delete campaign:', error);
      }
    }
  };

  const handleCreatePool = async () => {
    if (!poolName) {
      alert('Por favor ingrese un nombre para el pool');
      return;
    }
    
    try {
      await createPool.mutateAsync({
        name: poolName,
        strategy: poolStrategy,
        sessionIds: selectedSessionIds,
        delayBase: poolDelayBase[0],
        delayVariation: poolDelayVariation[0],
        active: true
      });
      
      setIsCreatePoolOpen(false);
      setPoolName("");
      setPoolStrategy("competitive");
      setPoolDelayBase([5000]);
      setPoolDelayVariation([1000]);
      setSelectedSessionIds([]);
    } catch (error) {
      console.error('Failed to create pool:', error);
    }
  };

  const toggleSessionInPool = (sessionId: string) => {
    setSelectedSessionIds(prev => 
      prev.includes(sessionId) 
        ? prev.filter(id => id !== sessionId)
        : [...prev, sessionId]
    );
  };

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

          <Dialog open={isCreateOpen} onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) setStep(1);
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20" data-testid="button-new-campaign">
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
                      <Input 
                        placeholder="e.g. February Collections - Batch A" 
                        value={campaignName}
                        onChange={(e) => setCampaignName(e.target.value)}
                        data-testid="input-campaign-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Target Audience</Label>
                      <div className="p-3 bg-muted rounded-lg text-sm">
                        <span className="font-medium">{availableDebtors.length}</span> debtors disponibles para envío
                      </div>
                    </div>
                    <div className="space-y-2">
                       <Label>Routing Strategy (Pool)</Label>
                       <Select value={selectedPoolId} onValueChange={setSelectedPoolId}>
                        <SelectTrigger data-testid="select-pool">
                          <SelectValue placeholder="Select routing pool" />
                        </SelectTrigger>
                        <SelectContent>
                          {pools?.map(pool => (
                            <SelectItem key={pool.id} value={pool.id}>{pool.name} ({pool.strategy})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!pools?.length && (
                        <p className="text-xs text-muted-foreground">No hay pools disponibles. Crea uno primero.</p>
                      )}
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="space-y-2">
                      <Label>Message Template</Label>
                      <Textarea 
                        placeholder="Hola {name}, te recordamos que tu deuda de ${debt} está pendiente..." 
                        className="h-32 resize-none font-mono text-sm"
                        value={messageTemplate}
                        onChange={(e) => setMessageTemplate(e.target.value)}
                        data-testid="textarea-message-template"
                      />
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Badge 
                          variant="secondary" 
                          className="cursor-pointer hover:bg-secondary/80"
                          onClick={() => setMessageTemplate(prev => prev + '{name}')}
                        >
                          {`{name}`}
                        </Badge>
                        <Badge 
                          variant="secondary" 
                          className="cursor-pointer hover:bg-secondary/80"
                          onClick={() => setMessageTemplate(prev => prev + '{debt}')}
                        >
                          {`{debt}`}
                        </Badge>
                        <Badge 
                          variant="secondary" 
                          className="cursor-pointer hover:bg-secondary/80"
                          onClick={() => setMessageTemplate(prev => prev + '{phone}')}
                        >
                          {`{phone}`}
                        </Badge>
                      </div>
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
                  <Button onClick={() => setStep(step + 1)} disabled={!campaignName || !selectedPoolId}>
                    Next: Message
                  </Button>
                ) : (
                  <Button 
                    onClick={handleCreateCampaign} 
                    className="bg-primary text-white"
                    disabled={createCampaign.isPending || !messageTemplate}
                    data-testid="button-launch-campaign"
                  >
                    {createCampaign.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    Launch Campaign
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {activeTab === "campaigns" ? (
          <div className="space-y-4 animate-in fade-in duration-300">
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
                <p className="text-sm">Create a new campaign to get started</p>
              </div>
            ) : campaigns?.map((campaign) => (
              <Card key={campaign.id} className="group overflow-hidden transition-all hover:shadow-md hover:border-primary/50" data-testid={`card-campaign-${campaign.id}`}>
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
                        <Button 
                          variant="outline" 
                          size="icon" 
                          title="Pause"
                          onClick={() => handlePauseCampaign(campaign.id)}
                          disabled={pauseCampaign.isPending}
                          data-testid={`button-pause-${campaign.id}`}
                        >
                          <Pause className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button 
                          variant="outline" 
                          size="icon" 
                          title="Start"
                          onClick={() => handleStartCampaign(campaign.id)}
                          disabled={startCampaign.isPending || campaign.status === 'completed'}
                          data-testid={`button-start-${campaign.id}`}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        size="icon" 
                        title="Delete"
                        onClick={() => handleDeleteCampaign(campaign.id)}
                        data-testid={`button-delete-${campaign.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
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
                <Dialog open={isCreatePoolOpen} onOpenChange={setIsCreatePoolOpen}>
                  <DialogTrigger asChild>
                    <Button className="gap-2" data-testid="button-create-pool">
                      <Plus className="h-4 w-4" />
                      Create Pool
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                      <DialogTitle>Create Routing Pool</DialogTitle>
                      <DialogDescription>
                        Configure how messages are distributed across sessions.
                      </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Pool Name</Label>
                        <Input 
                          placeholder="e.g. High Priority Pool"
                          value={poolName}
                          onChange={(e) => setPoolName(e.target.value)}
                          data-testid="input-pool-name"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Distribution Strategy</Label>
                        <Select value={poolStrategy} onValueChange={(v: any) => setPoolStrategy(v)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="competitive">Competitive (fastest wins)</SelectItem>
                            <SelectItem value="fixed_turns">Fixed Turns (round-robin)</SelectItem>
                            <SelectItem value="random_turns">Random Turns</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <Label>Base Delay</Label>
                          <span className="text-muted-foreground">{poolDelayBase[0]}ms</span>
                        </div>
                        <Slider 
                          value={poolDelayBase} 
                          onValueChange={setPoolDelayBase}
                          max={30000} 
                          step={500} 
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <Label>Variation</Label>
                          <span className="text-muted-foreground">±{poolDelayVariation[0]}ms</span>
                        </div>
                        <Slider 
                          value={poolDelayVariation} 
                          onValueChange={setPoolDelayVariation}
                          max={10000} 
                          step={100} 
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Assign Sessions</Label>
                        <div className="flex flex-wrap gap-2 p-3 bg-muted rounded-lg">
                          {sessions?.filter(s => s.status === 'connected').map(session => (
                            <Badge 
                              key={session.id}
                              variant={selectedSessionIds.includes(session.id) ? "default" : "outline"}
                              className="cursor-pointer"
                              onClick={() => toggleSessionInPool(session.id)}
                            >
                              {session.phoneNumber || session.id.slice(0, 8)}
                            </Badge>
                          ))}
                          {!sessions?.filter(s => s.status === 'connected').length && (
                            <p className="text-xs text-muted-foreground">No hay sesiones conectadas</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <DialogFooter>
                      <Button variant="ghost" onClick={() => setIsCreatePoolOpen(false)}>Cancel</Button>
                      <Button 
                        onClick={handleCreatePool}
                        disabled={createPool.isPending || !poolName}
                        data-testid="button-save-pool"
                      >
                        {createPool.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Create Pool
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
             </div>
             
             {poolsLoading ? (
                <div className="md:col-span-2 flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
             ) : !pools?.length ? (
                <div className="md:col-span-2 flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Settings className="h-12 w-12 mb-4 opacity-50" />
                  <p>No pools configured</p>
                  <p className="text-sm">Create a pool to start routing messages</p>
                </div>
             ) : pools?.map((pool) => (
                <Card key={pool.id} className="border-l-4 border-l-primary" data-testid={`card-pool-${pool.id}`}>
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
                         <Label>Base Delay</Label>
                         <span className="text-muted-foreground">{pool.delayBase}ms</span>
                       </div>
                       <Slider value={[pool.delayBase]} max={30000} step={100} disabled />
                     </div>
                     
                     <div className="space-y-2">
                       <div className="flex justify-between text-sm">
                         <Label>Variation</Label>
                         <span className="text-muted-foreground">±{pool.delayVariation}ms</span>
                       </div>
                       <Slider value={[pool.delayVariation]} max={5000} step={100} disabled />
                     </div>

                     <div className="pt-2">
                       <Label className="text-sm mb-2 block">Assigned Sessions</Label>
                       <div className="flex flex-wrap gap-2">
                         {pool.sessionIds?.map(sid => {
                           const session = sessions?.find(s => s.id === sid);
                           return (
                             <Badge key={sid} variant="outline" className="bg-background">
                               {session?.phoneNumber || sid.slice(0,8)}
                             </Badge>
                           );
                         })}
                         {!pool.sessionIds?.length && (
                           <span className="text-xs text-muted-foreground">No sessions assigned</span>
                         )}
                       </div>
                     </div>
                  </CardContent>
                </Card>
             ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
