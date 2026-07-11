'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Plug,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Copy,
  ExternalLink,
  Trash2,
  Plus,
  ArrowRight,
  ShoppingBag,
  Sparkles
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface WebhookEndpoint {
  id: string;
  endpoint_url: string;
  target_url: string | null;
  trigger_event: string;
  is_active: boolean;
  created_at: string;
}

interface Integration {
  key: string;
  name: string;
  description: string;
  category: string;
  is_active_by_default: boolean;
  status: 'connected' | 'disconnected' | 'error';
  connection_label: string | null;
  config: Record<string, any>;
  connectionCount?: number;
  endpoints?: WebhookEndpoint[];
}

const CATEGORIES = {
  ecommerce: 'E-commerce',
  payments: 'Payments & Subscriptions',
  logistics: 'Logistics & Shipping',
  developer: 'Developer Tools',
};

// Clean brand accurate custom inline SVG components
const ShopifyIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 30 30" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
    <path d="M26.28 8.085l-8.544-2.85a1.27 1.27 0 00-.776 0L8.416 8.085A1.272 1.272 0 007.6 9.255v12.28c0 .524.321.996.816 1.161l8.544 2.85c.128.043.262.064.396.064s.268-.021.396-.064l8.544-2.85a1.269 1.269 0 00.816-1.161V9.255a1.27 1.27 0 00-.816-1.17z" fill="#96BF48" />
    <path d="M15.408 24.364V6.26l-6.992 2.33v13.444l6.992 2.33z" fill="#5E8E28" opacity=".75" />
    <path d="M15 11a2 2 0 100-4 2 2 0 000 4z" fill="#FFF" />
  </svg>
);

const RazorpayIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 32 32" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
    <path d="M26.84 5.333L16 16.173 5.16 5.333H0L16 21.333 32 5.333h-5.16z" fill="#0A2540" />
    <path d="M16 21.333L6.84 30.5h18.32L16 21.333z" fill="#00b9f5" />
  </svg>
);

const ShiprocketIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" rx="6" fill="#7132F5" />
    <path d="M7 7h10v2H7V7zm0 4h10v2H7v-2zm0 4h7v2H7v-2z" fill="#FFF" />
  </svg>
);

const WebhookIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 01-3.46 0" />
  </svg>
);

const CashfreeIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 32 32" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" rx="6" fill="#1C3879" />
    <path d="M7 9h18v3H7V9zm0 5h14v3H7v-3zm0 5h18v3H7v-3z" fill="#FFF" />
    <circle cx="23" cy="15.5" r="2.5" fill="#00D2C4" />
  </svg>
);

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Form input states
  const [razorpayKeyId, setRazorpayKeyId] = useState('');
  const [razorpayKeySecret, setRazorpayKeySecret] = useState('');

  const [shiprocketEmail, setShiprocketEmail] = useState('');
  const [shiprocketPassword, setShiprocketPassword] = useState('');

  const [webhookTrigger, setWebhookTrigger] = useState('payment.captured');
  const [webhookTarget, setWebhookTarget] = useState('');

  const [cashfreeClientId, setCashfreeClientId] = useState('');
  const [cashfreeClientSecret, setCashfreeClientSecret] = useState('');
  const [cashfreeEnvironment, setCashfreeEnvironment] = useState('SANDBOX');

  const [submitting, setSubmitting] = useState(false);

  const fetchIntegrations = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/integrations');
      if (res.ok) {
        const data = await res.json();
        setIntegrations(data.integrations || []);

        // Sync currently open drawer if any details refreshed
        if (selectedIntegration) {
          const updated = data.integrations.find((i: Integration) => i.key === selectedIntegration.key);
          if (updated) setSelectedIntegration(updated);
        }
      }
    } catch (err) {
      console.error('Failed to fetch integrations:', err);
      toast.error('Error fetching integrations marketplace.');
    } finally {
      setLoading(false);
    }
  }, [selectedIntegration]);

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const handleCardClick = (integration: Integration) => {
    setSelectedIntegration(integration);
    setIsDrawerOpen(true);

    // Populate inputs if already connected
    if (integration.key === 'razorpay') {
      setRazorpayKeyId(integration.config.keyId || '');
      setRazorpayKeySecret('');
    } else if (integration.key === 'shiprocket') {
      setShiprocketEmail(integration.config.email || '');
      setShiprocketPassword('');
    } else if (integration.key === 'generic_webhook') {
      setWebhookTrigger('payment.captured');
      setWebhookTarget('');
    } else if (integration.key === 'cashfree') {
      setCashfreeClientId(integration.config.clientId || '');
      setCashfreeClientSecret('');
      setCashfreeEnvironment(integration.config.environment || 'SANDBOX');
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIntegration) return;

    setSubmitting(true);
    try {
      let body: Record<string, any> = {};
      if (selectedIntegration.key === 'razorpay') {
        body = { keyId: razorpayKeyId, keySecret: razorpayKeySecret };
      } else if (selectedIntegration.key === 'shiprocket') {
        body = { email: shiprocketEmail, password: shiprocketPassword };
      } else if (selectedIntegration.key === 'generic_webhook') {
        body = { trigger_event: webhookTrigger, target_url: webhookTarget };
      } else if (selectedIntegration.key === 'cashfree') {
        body = { clientId: cashfreeClientId, clientSecret: cashfreeClientSecret, environment: cashfreeEnvironment };
      }

      const res = await fetch(`/api/integrations/${selectedIntegration.key}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to connect integration');
      } else {
        toast.success(`Successfully connected ${selectedIntegration.name}!`);
        if (selectedIntegration.key !== 'generic_webhook') {
          setIsDrawerOpen(false);
        } else {
          // Clear inputs on successful generic webhook add
          setWebhookTarget('');
        }
        fetchIntegrations(true);
      }
    } catch (err) {
      console.error('Connection error:', err);
      toast.error('Connection request encountered an error.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!selectedIntegration) return;

    if (!confirm(`Are you sure you want to disconnect ${selectedIntegration.name}? All stored credentials will be removed.`)) {
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/integrations/${selectedIntegration.key}/disconnect`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toast.success(`Disconnected ${selectedIntegration.name}`);
        setIsDrawerOpen(false);
        fetchIntegrations(true);
      } else {
        const errData = await res.json();
        toast.error(errData.error || 'Failed to disconnect integration');
      }
    } catch (err) {
      console.error('Disconnection error:', err);
      toast.error('Disconnection failed. Please check network.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Webhook URL copied to clipboard');
  };

  const renderIcon = (key: string, sizeClass = 'size-8') => {
    switch (key) {
      case 'shopify':
        return <ShopifyIcon className={sizeClass} />;
      case 'razorpay':
        return <RazorpayIcon className={sizeClass} />;
      case 'shiprocket':
        return <ShiprocketIcon className={sizeClass} />;
      case 'generic_webhook':
        return <WebhookIcon className={`${sizeClass} text-indigo-500`} />;
      case 'cashfree':
        return <CashfreeIcon className={sizeClass} />;
      default:
        return <Plug className={`${sizeClass} text-muted-foreground`} />;
    }
  };

  const myIntegrations = integrations.filter((i) => i.status === 'connected');
  const availableIntegrations = integrations.filter((i) => i.status === 'disconnected');

  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in-50 duration-200">
        <div className="border-b border-border pb-3">
          <h1 className="text-xl font-bold text-foreground">Integrations</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Manage connected apps and browse available integrations.</p>
        </div>
        
        <div className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Loading marketplace...</h2>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="bg-card/40 animate-pulse border-border">
                <CardHeader className="flex flex-row items-center gap-3 pb-3">
                  <div className="size-10 rounded bg-muted shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3 w-2/3 bg-muted rounded" />
                    <div className="h-2 w-1/2 bg-muted rounded" />
                  </div>
                </CardHeader>
                <CardContent className="h-16 bg-muted/10 rounded-b-xl" />
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Shopify featured start here guide empty-state
  const showShopifyFeatured = myIntegrations.length === 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      <div className="border-b border-border pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Integrations</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Connect and coordinate storefront checkout events with messaging triggers.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchIntegrations()}
          className="border-border hover:bg-muted"
        >
          <RefreshCwIcon className="size-3.5 mr-1" /> Refresh
        </Button>
      </div>

      {/* Featured Empty State */}
      {showShopifyFeatured && (
        <Card className="border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card overflow-hidden">
          <div className="p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-3 max-w-xl">
              <div className="flex items-center gap-1.5 text-xs text-primary font-semibold uppercase tracking-wide">
                <Sparkles className="size-4 animate-pulse" />
                Featured Onboarding
              </div>
              <h2 className="text-lg font-extrabold text-foreground">Start by connecting your Shopify Store</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Unlock automated recovery sequences and live customer notifications by syncing your Shopify webhook data. wacrm will parse inbound storefront carts and route recovery options automatically.
              </p>
            </div>
            {integrations.find((i) => i.key === 'shopify') && (
              <Button
                onClick={() => handleCardClick(integrations.find((i) => i.key === 'shopify')!)}
                className="bg-primary hover:bg-primary/95 text-primary-foreground font-semibold px-4 shrink-0 shadow-md group"
              >
                Start Shopify Setup
                <ArrowRight className="size-4 ml-1.5 transition-transform group-hover:translate-x-0.5" />
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* My Integrations Grid */}
      <div className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">My Integrations</h2>
        {myIntegrations.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-8 text-center text-xs text-muted-foreground bg-muted/5 max-w-lg">
            No active connections. Browse available integrations below to get started.
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {myIntegrations.map((integration) => (
              <Card
                key={integration.key}
                onClick={() => handleCardClick(integration)}
                className="bg-card/45 border-border hover:border-border/80 hover:bg-card transition duration-200 cursor-pointer shadow-xs group flex flex-col"
              >
                <CardHeader className="flex flex-row items-start gap-3 pb-3 shrink-0">
                  <div className="size-11 rounded-lg bg-muted/40 border border-border/80 flex items-center justify-center shrink-0 shadow-xs">
                    {renderIcon(integration.key, 'size-7')}
                  </div>
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-foreground text-sm truncate">{integration.name}</span>
                      <span className="size-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    </div>
                    <span className="text-[10px] text-muted-foreground block capitalize">{CATEGORIES[integration.category as keyof typeof CATEGORIES]}</span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 text-[11px] text-muted-foreground flex-1 flex flex-col justify-between">
                  <p className="line-clamp-2 leading-relaxed mb-4">{integration.description}</p>
                  
                  <div className="flex items-center justify-between border-t border-border/40 pt-3">
                    <span className="text-[10px] font-medium text-emerald-600 bg-emerald-500/5 px-2 py-0.5 rounded-full">
                      Active
                    </span>
                    {integration.key === 'generic_webhook' ? (
                      <span className="text-[10px] text-muted-foreground font-semibold">
                        {integration.connectionCount || 0} Connection{(integration.connectionCount || 0) !== 1 && 's'}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground font-semibold truncate max-w-[140px]" title={integration.connection_label || ''}>
                        {integration.connection_label || 'Connected'}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Available Integrations Grid */}
      <div className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Available Integrations</h2>
        {availableIntegrations.length === 0 ? (
          <p className="text-xs text-muted-foreground">All integrations connected successfully!</p>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {availableIntegrations.map((integration) => (
              <Card
                key={integration.key}
                onClick={() => handleCardClick(integration)}
                className="bg-card/30 border-border hover:border-border/60 hover:bg-card/45 transition duration-200 cursor-pointer shadow-xs group flex flex-col"
              >
                <CardHeader className="flex flex-row items-start gap-3 pb-3 shrink-0">
                  <div className="size-11 rounded-lg bg-muted/20 border border-border/50 flex items-center justify-center shrink-0">
                    {renderIcon(integration.key, 'size-7')}
                  </div>
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-foreground text-sm truncate">{integration.name}</span>
                      {integration.key === 'shopify' && (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-none font-semibold text-[9px] py-0 px-1">
                          Free
                        </Badge>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground block capitalize">{CATEGORIES[integration.category as keyof typeof CATEGORIES]}</span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 text-[11px] text-muted-foreground flex-1 flex flex-col justify-between">
                  <p className="line-clamp-2 leading-relaxed mb-4">{integration.description}</p>
                  
                  <div className="flex items-center justify-between border-t border-border/40 pt-3">
                    <span className="text-[10px] text-muted-foreground font-semibold group-hover:text-primary transition-colors flex items-center gap-0.5">
                      Connect <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Integration Connection / Management Drawer */}
      <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <SheetContent className="sm:max-w-md bg-popover border-border max-h-screen overflow-y-auto flex flex-col">
          {selectedIntegration && (
            <>
              <SheetHeader className="pb-3 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="size-11 rounded-lg bg-muted/40 border border-border/80 flex items-center justify-center shadow-xs">
                    {renderIcon(selectedIntegration.key, 'size-7')}
                  </div>
                  <div>
                    <SheetTitle className="text-foreground font-bold">{selectedIntegration.name}</SheetTitle>
                    <SheetDescription className="text-xs text-muted-foreground mt-0.5">
                      {CATEGORIES[selectedIntegration.category as keyof typeof CATEGORIES]}
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="flex-1 space-y-6 pt-4 text-xs text-foreground">
                <p className="leading-relaxed text-muted-foreground">
                  {selectedIntegration.description}
                </p>

                {selectedIntegration.status === 'connected' && (
                  <Alert className="bg-emerald-500/5 border-emerald-500/20 text-emerald-700">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-emerald-500" />
                      <span className="font-semibold">Connected & Active</span>
                    </div>
                  </Alert>
                )}

                {/* Integration Specific Content / Setup Forms */}
                {selectedIntegration.key === 'shopify' && (
                  <div className="space-y-4">
                    <div className="space-y-1.5 p-3 rounded-lg bg-muted/30 border border-border">
                      <h4 className="font-bold text-foreground">Shopify Integration Status</h4>
                      <p className="text-muted-foreground leading-relaxed mt-1">
                        Your Shopify connection is automatically managed via the env parameters configured on your hosting instance.
                      </p>
                      {selectedIntegration.status === 'connected' && (
                        <div className="mt-3 text-xs">
                          <span className="font-semibold text-muted-foreground">Store Connected:</span>
                          <code className="block mt-1 font-mono p-1 bg-card rounded text-foreground font-semibold text-[10px] border border-border">
                            {selectedIntegration.connection_label}
                          </code>
                        </div>
                      )}
                    </div>
                    {selectedIntegration.status === 'disconnected' && (
                      <Button
                        onClick={handleConnect}
                        disabled={submitting}
                        className="w-full bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs py-2 shadow-xs"
                      >
                        {submitting ? 'Verifying...' : 'Initialize Shopify Link'}
                      </Button>
                    )}
                  </div>
                )}

                {selectedIntegration.key === 'razorpay' && (
                  <form onSubmit={handleConnect} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground font-semibold">Key ID</Label>
                      <Input
                        value={razorpayKeyId}
                        onChange={(e) => setRazorpayKeyId(e.target.value)}
                        placeholder="rzp_live_..."
                        required
                        className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground font-semibold">Key Secret</Label>
                      <Input
                        type="password"
                        value={razorpayKeySecret}
                        onChange={(e) => setRazorpayKeySecret(e.target.value)}
                        placeholder={selectedIntegration.status === 'connected' ? '••••••••••••••••' : 'Enter Key Secret'}
                        required={selectedIntegration.status !== 'connected'}
                        className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-9 text-xs"
                      />
                      {selectedIntegration.status === 'connected' && (
                        <p className="text-[10px] text-muted-foreground">Leave blank to keep existing key secret unchanged.</p>
                      )}
                    </div>

                    <Button
                      type="submit"
                      disabled={submitting}
                      className="w-full bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs py-2 shadow-xs"
                    >
                      {submitting ? 'Verifying key...' : selectedIntegration.status === 'connected' ? 'Update Credentials' : 'Connect Razorpay'}
                    </Button>
                  </form>
                )}

                {selectedIntegration.key === 'shiprocket' && (
                  <form onSubmit={handleConnect} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground font-semibold">Account Email</Label>
                      <Input
                        type="email"
                        value={shiprocketEmail}
                        onChange={(e) => setShiprocketEmail(e.target.value)}
                        placeholder="email@shiprocket.com"
                        required
                        className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground font-semibold">Password</Label>
                      <Input
                        type="password"
                        value={shiprocketPassword}
                        onChange={(e) => setShiprocketPassword(e.target.value)}
                        placeholder={selectedIntegration.status === 'connected' ? '••••••••••••••••' : 'Enter Password'}
                        required={selectedIntegration.status !== 'connected'}
                        className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-9 text-xs"
                      />
                      {selectedIntegration.status === 'connected' && (
                        <p className="text-[10px] text-muted-foreground">Leave blank to keep existing password.</p>
                      )}
                    </div>

                    <Button
                      type="submit"
                      disabled={submitting}
                      className="w-full bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs py-2 shadow-xs"
                    >
                      {submitting ? 'Authenticating...' : selectedIntegration.status === 'connected' ? 'Update Credentials' : 'Connect Shiprocket'}
                    </Button>
                  </form>
                )}

                {selectedIntegration.key === 'cashfree' && (
                  <form onSubmit={handleConnect} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground font-semibold">Client ID</Label>
                      <Input
                        value={cashfreeClientId}
                        onChange={(e) => setCashfreeClientId(e.target.value)}
                        placeholder="Enter Client ID"
                        required
                        className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground font-semibold">Client Secret</Label>
                      <Input
                        type="password"
                        value={cashfreeClientSecret}
                        onChange={(e) => setCashfreeClientSecret(e.target.value)}
                        placeholder={selectedIntegration.status === 'connected' ? '••••••••••••••••' : 'Enter Client Secret'}
                        required={selectedIntegration.status !== 'connected'}
                        className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-9 text-xs"
                      />
                      {selectedIntegration.status === 'connected' && (
                        <p className="text-[10px] text-muted-foreground">Leave blank to keep existing client secret unchanged.</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground font-semibold">Environment</Label>
                      <select
                        value={cashfreeEnvironment}
                        onChange={(e) => setCashfreeEnvironment(e.target.value)}
                        className="w-full h-9 rounded-md border border-border bg-muted/40 text-foreground px-3 py-1 text-xs focus:outline-none"
                      >
                        <option value="SANDBOX">Sandbox</option>
                        <option value="PRODUCTION">Production</option>
                      </select>
                    </div>

                    <Button
                      type="submit"
                      disabled={submitting}
                      className="w-full bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs py-2 shadow-xs"
                    >
                      {submitting ? 'Verifying keys...' : selectedIntegration.status === 'connected' ? 'Update Credentials' : 'Connect Cashfree'}
                    </Button>
                  </form>
                )}

                {selectedIntegration.key === 'generic_webhook' && (
                  <div className="space-y-5">
                    {/* Add webhook connection form */}
                    <form onSubmit={handleConnect} className="space-y-3 bg-muted/20 border border-border p-3.5 rounded-lg">
                      <h4 className="font-bold text-foreground text-xs">Create Webhook Connection</h4>
                      
                      <div className="space-y-1.5">
                        <Label className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">Trigger Event</Label>
                        <select
                          value={webhookTrigger}
                          onChange={(e) => setWebhookTrigger(e.target.value)}
                          className="w-full h-8 rounded-md border border-border bg-muted/40 text-foreground px-2 py-1 text-xs focus:outline-none"
                        >
                          <option value="payment.captured">payment.captured</option>
                          <option value="order.created">order.created</option>
                          <option value="order.fulfilled">order.fulfilled</option>
                          <option value="shipment.updated">shipment.updated</option>
                          <option value="custom">custom_event</option>
                        </select>
                      </div>

                      {webhookTrigger === 'custom' && (
                        <div className="space-y-1.5 animate-in fade-in duration-150">
                          <Label className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">Custom Event Name</Label>
                          <Input
                            placeholder="e.g. lead.signed"
                            required
                            onChange={(e) => setWebhookTrigger(e.target.value)}
                            className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-8 text-xs"
                          />
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <Label className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">Target URL (Outbound) <span className="text-[10px] font-normal text-muted-foreground">(optional)</span></Label>
                        <Input
                          value={webhookTarget}
                          onChange={(e) => setWebhookTarget(e.target.value)}
                          placeholder="e.g. https://my-backend.com/webhook"
                          className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-8 text-xs"
                        />
                      </div>

                      <Button
                        type="submit"
                        disabled={submitting}
                        size="sm"
                        className="bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-[11px] h-8 px-3"
                      >
                        {submitting ? 'Generating...' : 'Create Connection'}
                      </Button>
                    </form>

                    {/* Show created webhooks */}
                    <div className="space-y-3">
                      <h4 className="font-bold text-foreground">Active Webhook URLs ({selectedIntegration.endpoints?.length || 0})</h4>
                      <div className="space-y-2">
                        {(selectedIntegration.endpoints || []).map((endpoint) => (
                          <div key={endpoint.id} className="p-3 border border-border bg-card/60 rounded-lg space-y-2">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className="bg-primary/5 text-primary border-none text-[9px] py-0 px-2">
                                {endpoint.trigger_event}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(endpoint.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 bg-muted/30 px-2 py-1 rounded">
                              <code className="font-mono text-[9px] text-muted-foreground truncate select-all flex-1">
                                {endpoint.endpoint_url}
                              </code>
                              <button
                                onClick={() => copyToClipboard(endpoint.endpoint_url)}
                                className="text-muted-foreground hover:text-foreground shrink-0"
                                title="Copy endpoint URL"
                              >
                                <Copy className="size-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                        {(selectedIntegration.endpoints || []).length === 0 && (
                          <p className="text-xs text-muted-foreground/80 italic">No webhook connections created yet. Generate one above!</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {selectedIntegration.status === 'connected' && (
                <div className="border-t border-border pt-4 mt-auto">
                  <Button
                    variant="outline"
                    onClick={handleDisconnect}
                    disabled={submitting}
                    className="w-full border-red-900/60 text-red-500 hover:bg-red-950/20 font-semibold text-xs py-2 flex items-center justify-center gap-1.5 h-9"
                  >
                    <Trash2 className="size-4" />
                    Disconnect Integration
                  </Button>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// Inline fallback icon components
function RefreshCwIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M16 3h5v5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 21H3v-5" />
    </svg>
  );
}
