import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mockCampaigns } from "@/lib/mockData";
import { 
  Plus, 
  Play, 
  Pause, 
  StopCircle, 
  Calendar, 
  Clock, 
  Users, 
  MessageSquare,
  BarChart3,
  Search,
  Filter
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useState } from "react";

export default function Campaigns() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [step, setStep] = useState(1);

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold text-foreground">Campaigns</h1>
            <p className="text-muted-foreground mt-1">Orchestrate your massive messaging campaigns.</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20">
                <Plus className="h-4 w-4" />
                Create Campaign
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Create New Campaign</DialogTitle>
                <DialogDescription>
                  Configure your audience and message strategy.
                </DialogDescription>
              </DialogHeader>
              
              <div className="py-4">
                {step === 1 && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="space-y-2">
                      <Label>Campaign Name</Label>
                      <Input placeholder="e.g. March Promotions" />
                    </div>
                    <div className="space-y-2">
                      <Label>Target Audience</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a debtor list" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Debtors (12,450)</SelectItem>
                          <SelectItem value="overdue">Overdue &gt; 30 Days (4,200)</SelectItem>
                          <SelectItem value="vip">VIP Clients (850)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                       <Label>Routing Strategy (Pools)</Label>
                       <Select defaultValue="random">
                        <SelectTrigger>
                          <SelectValue placeholder="Select strategy" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="random">Random Rotation</SelectItem>
                          <SelectItem value="sequential">Sequential (Round Robin)</SelectItem>
                          <SelectItem value="smart">Smart Load Balancing</SelectItem>
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
                        placeholder="Hello {name}, we have a special offer for you..." 
                        className="h-32 resize-none"
                      />
                      <p className="text-xs text-muted-foreground">
                        Available variables: <code className="bg-muted px-1 rounded">{`{name}`}</code>, <code className="bg-muted px-1 rounded">{`{debt_amount}`}</code>, <code className="bg-muted px-1 rounded">{`{due_date}`}</code>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="text-xs">Add Image</Button>
                      <Button variant="outline" size="sm" className="text-xs">Add PDF</Button>
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

        {/* Campaign List */}
        <div className="space-y-4">
          {mockCampaigns.map((campaign) => (
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
                        Started {new Date(campaign.startTime).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {campaign.total.toLocaleString()} recipients
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
                      <BarChart3 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </Layout>
  );
}
