'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Eye,
  EyeOff,
  Copy,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Zap,
  AlertTriangle,
  RotateCcw,
  RefreshCw,
  Sliders,
  User,
  Globe,
  UploadCloud,
  FileImage,
  ExternalLinkIcon,
  UserCheck,
  Plus,
  X
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SettingsPanelHead } from './settings-panel-head';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type { WhatsAppConfig as WhatsAppConfigType } from '@/types';

const MASKED_TOKEN = '••••••••••••••••';

type ConnectionStatus = 'connected' | 'disconnected' | 'unknown';
type ResetReason = 'token_corrupted' | 'meta_api_error' | null;

const VERTICALS = [
  { value: 'OTHER', label: 'Other / Direct' },
  { value: 'RESTAURANT', label: 'Restaurant' },
  { value: 'RETAIL', label: 'Shopping & Retail' },
  { value: 'PROF_SERVICES', label: 'Professional Services' },
  { value: 'AUTO', label: 'Automotive' },
  { value: 'BEAUTY', label: 'Beauty, Spa & Salon' },
  { value: 'APPAREL', label: 'Clothing & Apparel' },
  { value: 'EDU', label: 'Education' },
  { value: 'ENTERTAIN', label: 'Entertainment' },
  { value: 'EVENT_PLAN', label: 'Event Planning' },
  { value: 'FINANCE', label: 'Finance & Banking' },
  { value: 'GROCERY', label: 'Grocery' },
  { value: 'GOVT', label: 'Government' },
  { value: 'HOTEL', label: 'Hotel & Lodging' },
  { value: 'HEALTH', label: 'Medical & Health' },
  { value: 'NONPROFIT', label: 'Non-profit' },
  { value: 'TRAVEL', label: 'Travel & Transportation' },
];

const FacebookIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={props.className}
    style={props.style}
  >
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const WhatsAppIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={props.className}
    style={props.style}
  >
    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.42 9.864-9.864.002-2.637-1.023-5.115-2.887-6.98C16.584 1.895 14.11 0.87 11.47 0.869c-5.44 0-9.865 4.42-9.869 9.865-.001 1.77.472 3.498 1.372 5.061L1.92 21.65l6.02-1.579zM17.5 14.73c-.27-.135-1.602-.79-1.85-.88-.25-.09-.43-.135-.61.135-.18.27-.7 1.85-.88 2.05-.18.2-.36.225-.63.09-2.693-1.347-4.32-3.155-5.267-4.783-.244-.42.062-.39.387-.714.29-.29.36-.43.54-.72.18-.29.09-.54-.045-.81-.135-.27-.61-1.47-.835-2.012-.22-.53-.44-.46-.61-.47-.16-.01-.35-.01-.54-.01-.19 0-.5.07-.76.36-.26.29-1 .98-1 2.39 0 1.41 1.03 2.78 1.17 2.97.14.19 2.03 3.1 4.92 4.35.688.297 1.226.474 1.644.607.69.22 1.32.19 1.82.115.55-.08 1.6-.655 1.825-1.285.22-.63.22-1.17.15-1.285-.07-.11-.27-.18-.54-.315z" />
  </svg>
);

export function WhatsAppConfig() {
  const supabase = createClient();
  const { user, accountId, loading: authLoading, profileLoading: authProfileLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [config, setConfig] = useState<WhatsAppConfigType | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('unknown');
  const [resetReason, setResetReason] = useState<ResetReason>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [pin, setPin] = useState('');
  const [tokenEdited, setTokenEdited] = useState(false);
  const [isConfigureOpen, setIsConfigureOpen] = useState(false);

  // Phone information fetched from Meta
  const [phoneInfo, setPhoneInfo] = useState<any>(null);

  // Profile specific states
  const [activeTab, setActiveTab] = useState('profile');
  const [optInPromptText, setOptInPromptText] = useState('');
  const [optInKeywords, setOptInKeywords] = useState<string[]>([]);
  const [optOutKeywords, setOptOutKeywords] = useState<string[]>([]);
  const [newOptInKeyword, setNewOptInKeyword] = useState('');
  const [newOptOutKeyword, setNewOptOutKeyword] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [backfillStats, setBackfillStats] = useState<{ optedIn: number; optedOut: number; noResponse: number; totalSent: number; eligible: number } | null>(null);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [optInTemplateName, setOptInTemplateName] = useState('wacrm_opt_in_v1');

  const fetchOptInConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/opt-in/config');
      if (res.ok) {
        const data = await res.json();
        setOptInPromptText(data.opt_in_prompt_text);
        setOptInKeywords(data.opt_in_keywords || []);
        setOptOutKeywords(data.opt_out_keywords || []);
      }
    } catch (err) {
      console.error('Failed to load opt-in config:', err);
    }
  }, []);

  const fetchBackfillStats = useCallback(async () => {
    try {
      setBackfillLoading(true);
      const res = await fetch('/api/whatsapp/opt-in/backfill');
      if (res.ok) {
        const data = await res.json();
        setBackfillStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to load backfill stats:', err);
    } finally {
      setBackfillLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'opt-in') {
      fetchOptInConfig();
      fetchBackfillStats();
    }
  }, [activeTab, fetchOptInConfig, fetchBackfillStats]);

  const addOptInKeyword = () => {
    if (!newOptInKeyword.trim()) return;
    const clean = newOptInKeyword.trim().toUpperCase();
    if (!optInKeywords.includes(clean)) {
      setOptInKeywords([...optInKeywords, clean]);
    }
    setNewOptInKeyword('');
  };

  const removeOptInKeyword = (kw: string) => {
    setOptInKeywords(optInKeywords.filter(k => k !== kw));
  };

  const addOptOutKeyword = () => {
    if (!newOptOutKeyword.trim()) return;
    const clean = newOptOutKeyword.trim().toUpperCase();
    if (!optOutKeywords.includes(clean)) {
      setOptOutKeywords([...optOutKeywords, clean]);
    }
    setNewOptOutKeyword('');
  };

  const removeOptOutKeyword = (kw: string) => {
    setOptOutKeywords(optOutKeywords.filter(k => k !== kw));
  };

  const handleSaveOptInSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsSaving(true);
    try {
      const res = await fetch('/api/whatsapp/opt-in/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opt_in_prompt_text: optInPromptText,
          opt_in_keywords: optInKeywords,
          opt_out_keywords: optOutKeywords,
        }),
      });
      if (res.ok) {
        toast.success('Opt-in settings updated successfully');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to save settings');
      }
    } catch (err) {
      toast.error('Network error saving settings');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleRunBackfill = async () => {
    if (backfillRunning) return;
    setBackfillRunning(true);
    toast.info('Initiating backfill opt-in campaign...');
    try {
      const res = await fetch('/api/whatsapp/opt-in/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_name: optInTemplateName }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Successfully queued opt-in campaigns for ${data.count} contacts!`);
        fetchBackfillStats();
      } else {
        toast.error(data.error || 'Failed to initiate campaign');
      }
    } catch (err) {
      toast.error('Network error starting backfill campaign');
    } finally {
      setBackfillRunning(false);
    }
  };
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileAddress, setProfileAddress] = useState('');
  const [profileDescription, setProfileDescription] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileVertical, setProfileVertical] = useState('OTHER');
  const [profilePictureUrl, setProfilePictureUrl] = useState('');
  const [profileAbout, setProfileAbout] = useState('');
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [profileFilePreview, setProfileFilePreview] = useState<string | null>(null);

  const isRegistered = Boolean(config?.registered_at);
  const lastRegistrationError = config?.last_registration_error ?? null;
  const [verifyingRegistration, setVerifyingRegistration] = useState(false);
  const [registrationProbe, setRegistrationProbe] = useState<any>(null);

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/whatsapp/webhook`
      : '';

  const fetchProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const res = await fetch('/api/whatsapp/profile');
      if (res.ok) {
        const data = await res.json();
        const prof = data.profile || {};
        setProfileAddress(prof.address || '');
        setProfileDescription(prof.description || '');
        setProfileEmail(prof.email || '');
        setProfileVertical(prof.vertical || 'OTHER');
        setProfilePictureUrl(prof.profile_picture_url || '');
        setProfileAbout(prof.about || '');
      }
    } catch (err) {
      console.error('Failed to fetch WhatsApp Business profile:', err);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const fetchConfig = useCallback(async (acctId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_config')
        .select('*')
        .eq('account_id', acctId)
        .maybeSingle();

      if (error) {
        console.error('Failed to load config row:', error);
      }

      if (data) {
        setConfig(data);
        setPhoneNumberId(data.phone_number_id || '');
        setWabaId(data.waba_id || '');
        setAccessToken(MASKED_TOKEN);
        setVerifyToken('');
        setPin('');
        setTokenEdited(false);
      } else {
        setConfig(null);
        setPhoneNumberId('');
        setWabaId('');
        setAccessToken('');
        setVerifyToken('');
        setPin('');
        setTokenEdited(false);
      }
      setRegistrationProbe(null);

      if (data) {
        try {
          const res = await fetch('/api/whatsapp/config', { method: 'GET' });
          const payload = await res.json();

          if (payload.connected) {
            setConnectionStatus('connected');
            setResetReason(null);
            setStatusMessage('');
            setPhoneInfo(payload.phone_info || null);
          } else {
            setConnectionStatus('disconnected');
            setResetReason(payload.needs_reset ? 'token_corrupted' : payload.reason === 'meta_api_error' ? 'meta_api_error' : null);
            setStatusMessage(payload.message || '');
            setPhoneInfo(null);
          }
        } catch (err) {
          console.error('Health check failed:', err);
          setConnectionStatus('disconnected');
          setPhoneInfo(null);
        }
      } else {
        setConnectionStatus('disconnected');
        setResetReason(null);
        setStatusMessage('');
        setPhoneInfo(null);
      }
    } catch (err) {
      console.error('fetchConfig error:', err);
      toast.error('Failed to load WhatsApp configuration');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (authLoading || authProfileLoading) return;
    if (!user || !accountId) {
      setLoading(false);
      return;
    }
    fetchConfig(accountId);
  }, [authLoading, authProfileLoading, user, accountId, fetchConfig]);

  useEffect(() => {
    if (connectionStatus === 'connected') {
      fetchProfile();
    }
  }, [connectionStatus, fetchProfile]);

  async function handleSave() {
    if (!phoneNumberId.trim()) {
      toast.error('Phone Number ID is required');
      return;
    }
    if (!config && (!accessToken.trim() || !tokenEdited)) {
      toast.error('Access Token is required for initial setup');
      return;
    }

    try {
      setSaving(true);
      const payload: Record<string, unknown> = {
        phone_number_id: phoneNumberId.trim(),
        waba_id: wabaId.trim() || null,
        verify_token: verifyToken.trim() || null,
        pin: pin.trim() || null,
      };

      if (tokenEdited && accessToken !== MASKED_TOKEN && accessToken.trim()) {
        payload.access_token = accessToken.trim();
      } else if (config) {
        toast.error('Please re-enter the Access Token to save changes');
        setSaving(false);
        return;
      }

      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to save configuration');
        setSaving(false);
        return;
      }

      if (data.registered === false && data.registration_error) {
        toast.error(
          `Saved, but Meta couldn't register the number: ${data.registration_error}`,
          { duration: 12000 },
        );
      } else if (data.registration_skipped) {
        toast.success(
          'Credentials saved and verified. Inbound registration was skipped (no PIN) — see Registration status below.',
          { duration: 10000 },
        );
        setPin('');
      } else {
        toast.success(
          data.phone_info?.verified_name
            ? `Live — ${data.phone_info.verified_name} can now receive events.`
            : 'WhatsApp connected. Events will start flowing within a minute.',
        );
        setPin('');
      }

      setIsConfigureOpen(false);
      if (accountId) await fetchConfig(accountId);
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    try {
      setTesting(true);
      const res = await fetch('/api/whatsapp/config', { method: 'GET' });
      const payload = await res.json();

      if (payload.connected) {
        setConnectionStatus('connected');
        setResetReason(null);
        setStatusMessage('');
        setPhoneInfo(payload.phone_info || null);
        toast.success(
          payload.phone_info?.verified_name
            ? `Connected to ${payload.phone_info.verified_name}`
            : 'API connection successful'
        );
      } else {
        setConnectionStatus('disconnected');
        setResetReason(payload.needs_reset ? 'token_corrupted' : payload.reason === 'meta_api_error' ? 'meta_api_error' : null);
        setStatusMessage(payload.message || '');
        setPhoneInfo(null);
        toast.error(payload.message || 'API connection failed');
      }
    } catch (err) {
      console.error('Test connection error:', err);
      setConnectionStatus('disconnected');
      toast.error('Connection test failed. Check network and try again.');
    } finally {
      setTesting(false);
    }
  }

  async function handleVerifyRegistration() {
    setVerifyingRegistration(true);
    setRegistrationProbe(null);
    try {
      const res = await fetch('/api/whatsapp/config/verify-registration', {
        method: 'GET',
      });
      const data = await res.json();
      setRegistrationProbe(data);
      if (data.live) {
        toast.success('Number is fully wired — Meta is delivering events.');
      } else {
        toast.error(
          'Number is not registered to receive webhooks. See the checks below.',
          { duration: 8500 },
        );
      }
      if (accountId) await fetchConfig(accountId);
    } catch (err) {
      console.error('verify-registration failed:', err);
      toast.error('Could not reach the verification endpoint.');
    } finally {
      setVerifyingRegistration(false);
    }
  }

  async function handleReset() {
    if (!confirm('This will delete the current WhatsApp config so you can re-enter it. Continue?')) {
      return;
    }

    try {
      setResetting(true);
      const res = await fetch('/api/whatsapp/config', { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to reset configuration');
        return;
      }

      toast.success('Configuration cleared. You can now re-enter your credentials.');
      setConfig(null);
      setPhoneNumberId('');
      setWabaId('');
      setAccessToken('');
      setVerifyToken('');
      setTokenEdited(false);
      setConnectionStatus('disconnected');
      setResetReason(null);
      setStatusMessage('');
      setPhoneInfo(null);
      setIsConfigureOpen(false);
    } catch (err) {
      console.error('Reset error:', err);
      toast.error('Failed to reset configuration');
    } finally {
      setResetting(false);
    }
  }

  function handleCopyWebhookUrl() {
    navigator.clipboard.writeText(webhookUrl);
    toast.success('Webhook URL copied to clipboard');
  }

  const handleSyncData = async () => {
    if (accountId) {
      await fetchConfig(accountId);
      if (connectionStatus === 'connected') {
        await fetchProfile();
      }
      toast.success('Data synced with Meta');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProfileFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileFilePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    try {
      const formData = new FormData();
      formData.append('address', profileAddress);
      formData.append('description', profileDescription);
      formData.append('email', profileEmail);
      formData.append('vertical', profileVertical);
      formData.append('about', profileAbout);
      if (profileFile) {
        formData.append('file', profileFile);
      }

      const res = await fetch('/api/whatsapp/profile', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to update WhatsApp profile');
      } else {
        toast.success('WhatsApp profile updated successfully!');
        setProfileFile(null);
        setProfileFilePreview(null);
        await fetchProfile();
      }
    } catch (err) {
      console.error('Save profile error:', err);
      toast.error('Failed to update WhatsApp profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const formatMessageLimit = (limit: string | undefined, tier: string | undefined) => {
    if (limit) {
      if (limit === '1000') return '1K';
      if (limit === '10000') return '10K';
      if (limit === '100000') return '100K';
      return limit;
    }
    if (tier) {
      if (tier.includes('250')) return '250';
      if (tier.includes('1K')) return '1K';
      if (tier.includes('10K')) return '10K';
      if (tier.includes('100K')) return '100K';
      if (tier.includes('UNLIMITED')) return 'Unlimited';
      return tier;
    }
    return '250';
  };

  if (loading) {
    return (
      <section className="animate-in fade-in-50 duration-200">
        <SettingsPanelHead
          title="WhatsApp connection"
          description="Connect your Meta WhatsApp Business API. Credentials, webhook, and setup profile details live here."
        />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  const showResetBanner = resetReason === 'token_corrupted';
  const hasConnection = connectionStatus === 'connected' && config;

  return (
    <section className="animate-in fade-in-50 duration-200 space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-foreground">WhatsApp</h1>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleSyncData}
            title="Sync data with Meta"
            className="text-muted-foreground hover:text-foreground h-8 w-8"
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>

      {showResetBanner && (
        <Alert className="bg-amber-950/40 border-amber-600/40">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-5 text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <AlertTitle className="text-amber-200 mb-1">
                Stored token can&apos;t be decrypted
              </AlertTitle>
              <AlertDescription className="text-amber-100/80 text-sm">
                {statusMessage}
              </AlertDescription>
              <Button
                onClick={handleReset}
                disabled={resetting}
                size="sm"
                className="mt-3 bg-amber-600 hover:bg-amber-700 text-white"
              >
                {resetting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  <>
                    <RotateCcw className="size-4" />
                    Reset Configuration
                  </>
                )}
              </Button>
            </div>
          </div>
        </Alert>
      )}

      {hasConnection ? (
        <div className="space-y-6">
          {/* Top overview row with 3 cards */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* Phone Info Card */}
            <Card className="bg-card/40 border-border">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <WhatsAppIcon className="size-4 text-emerald-500" />
                    <span className="font-bold text-foreground text-sm">
                      {phoneInfo?.verified_name || config.phone_number_id}
                    </span>
                  </div>
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-none text-[10px] py-0 px-2 font-semibold">
                    AVAILABLE
                  </Badge>
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground font-medium">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px]">📞</span>
                    <span>{phoneInfo?.display_phone_number || 'No number retrieved'}</span>
                  </div>
                  <div className="flex items-center justify-between bg-muted/30 px-2 py-1 rounded">
                    <span>ID: <code className="font-mono text-[10px]">{config.phone_number_id}</code></span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(config.phone_number_id);
                        toast.success('Phone ID copied');
                      }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </div>
                  {config.waba_id && (
                    <div className="px-2 py-1 bg-muted/30 rounded">
                      <span>WABA: <code className="font-mono text-[10px]">{config.waba_id}</code></span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Facebook Details Card */}
            <Card className="bg-card/40 border-border">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Facebook details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 text-xs text-foreground font-medium">
                <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
                  <span className="text-muted-foreground">Quality Rating</span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`size-2 rounded-full ${
                        phoneInfo?.quality_rating === 'YELLOW'
                          ? 'bg-amber-500'
                          : phoneInfo?.quality_rating === 'RED'
                          ? 'bg-red-500'
                          : 'bg-emerald-500'
                      }`}
                    />
                    <span>
                      {phoneInfo?.quality_rating === 'YELLOW'
                        ? 'Medium'
                        : phoneInfo?.quality_rating === 'RED'
                        ? 'Low'
                        : 'Green'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
                  <span className="text-muted-foreground">FB Business Verification</span>
                  <Badge
                    variant="outline"
                    className={
                      phoneInfo?.business_verification_status === 'APPROVED'
                        ? 'bg-emerald-500/10 text-emerald-600 border-none'
                        : 'bg-muted text-muted-foreground border-none'
                    }
                  >
                    {phoneInfo?.business_verification_status === 'APPROVED' ? 'Verified' : 'Unverified'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Message Limit</span>
                  <div className="flex items-center gap-1">
                    <FacebookIcon className="size-3 text-blue-500" />
                    <span>{formatMessageLimit(phoneInfo?.whatsapp_business_manager_messaging_limit, phoneInfo?.messaging_limit_tier)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Channel Settings Card */}
            <Card className="bg-card/40 border-border">
              <CardHeader className="pb-1 pt-4">
                <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Channel settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Enable read receipts, catalogue and add to cart options for this number.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsConfigureOpen(true)}
                  className="w-full border-border bg-card text-foreground hover:bg-muted text-xs h-8 shadow-xs font-semibold"
                >
                  Configure
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Profile & Automation Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList variant="line" className="border-b border-border w-full justify-start rounded-none p-0 bg-transparent h-9">
              <TabsTrigger
                value="profile"
                className="group-data-[variant=line]/tabs-list:data-active:border-primary text-xs pb-2 rounded-none px-4"
              >
                Profile
              </TabsTrigger>
              <TabsTrigger
                value="opt-in"
                className="group-data-[variant=line]/tabs-list:data-active:border-primary text-xs pb-2 rounded-none px-4"
              >
                Opt-in & Campaigns
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="pt-4 animate-in fade-in duration-200">
              <Card className="max-w-2xl bg-card/25 border-border">
                <form onSubmit={handleSaveProfile} className="space-y-4 p-4">
                  {/* Display Picture Upload */}
                  <div className="space-y-2">
                    <Label className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">
                      WhatsApp Display Picture
                    </Label>
                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center bg-muted/20 border border-border p-4 rounded-lg">
                      <div className="relative size-16 rounded-full overflow-hidden bg-muted border border-border flex items-center justify-center shrink-0">
                        {profileFilePreview ? (
                          <img src={profileFilePreview} alt="Preview" className="size-full object-cover" />
                        ) : profilePictureUrl ? (
                          <img src={profilePictureUrl} alt="WhatsApp Profile" className="size-full object-cover" />
                        ) : (
                          <User className="size-8 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Images with a height or width of less than 192px might cause issues.<br />
                          An image size of 640x640 is recommended.
                        </p>
                        <div className="flex gap-2">
                          <label className="cursor-pointer">
                            <span className="inline-flex items-center gap-1 bg-primary text-primary-foreground hover:bg-primary/95 px-3 py-1.5 rounded text-xs font-semibold shadow-sm transition">
                              <UploadCloud className="size-3.5" />
                              Choose a file
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleFileChange}
                              className="hidden"
                            />
                          </label>
                          {profileFile && (
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => {
                                setProfileFile(null);
                                setProfileFilePreview(null);
                              }}
                              className="text-xs text-muted-foreground hover:text-foreground h-8 px-2"
                            >
                              Clear selection
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Address */}
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">Address</Label>
                    <Input
                      value={profileAddress}
                      onChange={(e) => setProfileAddress(e.target.value)}
                      placeholder="e.g. 123 Business St, Mumbai, India"
                      maxLength={256}
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-9 text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground">Maximum of 256 characters.</p>
                  </div>

                  {/* Business Description */}
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">Business Description</Label>
                    <Textarea
                      value={profileDescription}
                      onChange={(e) => setProfileDescription(e.target.value)}
                      placeholder="Describe your brand services or products..."
                      maxLength={256}
                      rows={3}
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground">Maximum of 256 characters.</p>
                  </div>

                  {/* About status */}
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">About Status</Label>
                    <Input
                      value={profileAbout}
                      onChange={(e) => setProfileAbout(e.target.value)}
                      placeholder="e.g. Hello! We are using wacrm"
                      maxLength={139}
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-9 text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground">Visible on user contact info. Maximum of 139 characters.</p>
                  </div>

                  {/* Email */}
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">Email</Label>
                    <Input
                      type="email"
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                      placeholder="e.g. hello@brand.com"
                      maxLength={128}
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-9 text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground">Email address to contact the business. Maximum of 128 characters.</p>
                  </div>

                  {/* Vertical / Category */}
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">Vertical (Category)</Label>
                    <select
                      value={profileVertical}
                      onChange={(e) => setProfileVertical(e.target.value)}
                      className="w-full h-9 rounded-md border border-border bg-muted/40 text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {VERTICALS.map((v) => (
                        <option key={v.value} value={v.value} className="bg-popover text-foreground">
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="pt-2">
                    <Button
                      type="submit"
                      disabled={profileSaving}
                      className="bg-primary hover:bg-primary/95 text-primary-foreground text-xs h-8 px-4 font-semibold"
                    >
                      {profileSaving ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin mr-1" />
                          Saving...
                        </>
                      ) : (
                        'Save Profile'
                      )}
                    </Button>
                  </div>
                </form>
              </Card>
            </TabsContent>

            <TabsContent value="opt-in" className="pt-4 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 max-w-5xl">
                {/* 1. Opt-in Configuration Form */}
                <Card className="bg-card/25 border-border p-4 h-fit">
                  <h3 className="font-semibold text-foreground text-sm">Opt-in & Opt-out Settings</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Meta requires explicit subscriber consent for marketing templates. Customize your welcome prompt and keywords.
                  </p>

                  <form onSubmit={handleSaveOptInSettings} className="mt-4 space-y-4">
                    {/* Welcome Opt-in prompt */}
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">
                        First Contact Opt-in Prompt Text
                      </Label>
                      <textarea
                        value={optInPromptText}
                        onChange={(e) => setOptInPromptText(e.target.value)}
                        rows={3}
                        className="w-full rounded-md border border-border bg-muted/40 text-foreground px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
                        placeholder="Want order updates & offers on WhatsApp? Reply YES to opt in, or STOP anytime to opt out."
                      />
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        Sent automatically when a contact initiates their very first chat session.
                      </p>
                    </div>

                    {/* Opt-in Keywords */}
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">
                        Opt-in Trigger Keywords
                      </Label>
                      <div className="flex flex-wrap gap-1.5 p-2 rounded-md border border-border bg-muted/20 min-h-[44px]">
                        {optInKeywords.map((kw) => (
                          <span
                            key={kw}
                            className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20"
                          >
                            {kw}
                            <button
                              type="button"
                              onClick={() => removeOptInKeyword(kw)}
                              className="text-emerald-400 hover:text-emerald-300 focus:outline-none"
                            >
                              <X className="size-3" />
                            </button>
                          </span>
                        ))}
                        {optInKeywords.length === 0 && (
                          <span className="text-xs text-muted-foreground italic">No keywords added</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="e.g. YES, OPTIN"
                          value={newOptInKeyword}
                          onChange={(e) => setNewOptInKeyword(e.target.value)}
                          className="flex-1 h-8 rounded-md border border-border bg-muted/40 text-foreground px-3 py-1 text-xs focus:outline-none"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addOptInKeyword();
                            }
                          }}
                        />
                        <Button
                          type="button"
                          onClick={addOptInKeyword}
                          className="bg-muted hover:bg-muted/80 text-foreground border border-border text-xs h-8 px-3 font-semibold"
                        >
                          Add
                        </Button>
                      </div>
                    </div>

                    {/* Opt-out Keywords */}
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">
                        Opt-out Trigger Keywords
                      </Label>
                      <div className="flex flex-wrap gap-1.5 p-2 rounded-md border border-border bg-muted/20 min-h-[44px]">
                        {optOutKeywords.map((kw) => (
                          <span
                            key={kw}
                            className="inline-flex items-center gap-1 rounded bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-400 border border-red-500/20"
                          >
                            {kw}
                            <button
                              type="button"
                              onClick={() => removeOptOutKeyword(kw)}
                              className="text-red-400 hover:text-red-300 focus:outline-none"
                            >
                              <X className="size-3" />
                            </button>
                          </span>
                        ))}
                        {optOutKeywords.length === 0 && (
                          <span className="text-xs text-muted-foreground italic">No keywords added</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="e.g. STOP, UNSUBSCRIBE"
                          value={newOptOutKeyword}
                          onChange={(e) => setNewOptOutKeyword(e.target.value)}
                          className="flex-1 h-8 rounded-md border border-border bg-muted/40 text-foreground px-3 py-1 text-xs focus:outline-none"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addOptOutKeyword();
                            }
                          }}
                        />
                        <Button
                          type="button"
                          onClick={addOptOutKeyword}
                          className="bg-muted hover:bg-muted/80 text-foreground border border-border text-xs h-8 px-3 font-semibold"
                        >
                          Add
                        </Button>
                      </div>
                    </div>

                    <div className="pt-2">
                      <Button
                        type="submit"
                        disabled={settingsSaving}
                        className="bg-primary hover:bg-primary/95 text-primary-foreground text-xs h-8 px-4 font-semibold"
                      >
                        {settingsSaving ? (
                          <>
                            <Loader2 className="size-3.5 animate-spin mr-1" />
                            Saving Settings...
                          </>
                        ) : (
                          'Save Settings'
                        )}
                      </Button>
                    </div>
                  </form>
                </Card>

                {/* 2. Campaign & Backfill Dashboard */}
                <Card className="bg-card/25 border-border p-4 h-fit space-y-4">
                  <div>
                    <h3 className="font-semibold text-foreground text-sm">Backfill Campaign Stats</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Invite existing clients to confirm WhatsApp updates. Active users who click confirm will be marked opted-in.
                    </p>
                  </div>

                  {backfillLoading ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-2">
                      <Loader2 className="size-5 animate-spin text-primary" />
                      <span className="text-xs text-muted-foreground">Calculating campaign stats...</span>
                    </div>
                  ) : (
                    backfillStats && (
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="bg-muted/10 border border-border/60 p-3 rounded-lg text-center">
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Total Prompted</div>
                          <div className="text-xl font-bold text-foreground mt-1">{backfillStats.totalSent}</div>
                        </div>
                        <div className="bg-emerald-500/5 border border-emerald-500/10 p-3 rounded-lg text-center">
                          <div className="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold">Total Opted In</div>
                          <div className="text-xl font-bold text-emerald-400 mt-1">{backfillStats.optedIn}</div>
                        </div>
                        <div className="bg-slate-500/5 border border-slate-500/10 p-3 rounded-lg text-center">
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">No Response</div>
                          <div className="text-xl font-bold text-muted-foreground mt-1">{backfillStats.noResponse}</div>
                        </div>
                        <div className="bg-red-500/5 border border-red-500/10 p-3 rounded-lg text-center">
                          <div className="text-[10px] text-red-400 uppercase tracking-wider font-semibold">Total Opted Out</div>
                          <div className="text-xl font-bold text-red-400 mt-1">{backfillStats.optedOut}</div>
                        </div>
                      </div>
                    )
                  )}

                  <div className="border-t border-border/40 pt-4 space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">
                        Opt-in Template Name
                      </Label>
                      <input
                        type="text"
                        value={optInTemplateName}
                        onChange={(e) => setOptInTemplateName(e.target.value)}
                        className="w-full h-9 rounded-md border border-border bg-muted/40 text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="wacrm_opt_in_v1"
                      />
                      <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                        * Submit this template on Meta Business Suite with button payload 'wacrm_opt_in_confirm' before launching.
                      </p>
                    </div>

                    <div className="bg-amber-500/5 border border-amber-500/10 p-3.5 rounded-lg text-xs text-amber-500 leading-relaxed">
                      <strong>Target Eligible Contacts:</strong> {backfillStats?.eligible ?? 0} contacts are currently targetable (opt-in is false, not yet prompted).
                    </div>

                    <Button
                      type="button"
                      onClick={handleRunBackfill}
                      disabled={backfillRunning || (backfillStats?.eligible ?? 0) === 0}
                      className="w-full bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs h-9"
                    >
                      {backfillRunning ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin mr-1.5" />
                          Sending Campaign...
                        </>
                      ) : (
                        'Send Opt-in Campaign to Existing Contacts'
                      )}
                    </Button>
                  </div>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <Card className="bg-card border-border p-6 text-center max-w-xl mx-auto space-y-4">
          <Globe className="size-12 text-muted-foreground mx-auto opacity-30 animate-pulse" />
          <div>
            <h3 className="font-bold text-foreground text-base">Connect WhatsApp Business Account</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto leading-relaxed">
              Retrieve quality ratings, message limits, and edit your business profile details directly by linking your Meta API.
            </p>
          </div>
          <Button
            onClick={() => setIsConfigureOpen(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs px-4 py-2"
          >
            Configure Connection
          </Button>
        </Card>
      )}

      {/* Configure Dialog Containing API credentials forms */}
      <Dialog open={isConfigureOpen} onOpenChange={setIsConfigureOpen}>
        <DialogContent className="sm:max-w-md bg-popover border-border max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground text-base font-bold">API Credentials</DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Enter your Meta WhatsApp Business API credentials below to connect your number.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs font-semibold">Phone Number ID</Label>
              <Input
                placeholder="e.g. 100234567890123"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs font-semibold">WhatsApp Business Account ID</Label>
              <Input
                placeholder="e.g. 100234567890456"
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs font-semibold">Permanent Access Token</Label>
              <div className="relative">
                <Input
                  type={showToken ? 'text' : 'password'}
                  placeholder="Enter your access token"
                  value={accessToken}
                  onChange={(e) => {
                    setAccessToken(e.target.value);
                    setTokenEdited(true);
                  }}
                  onFocus={() => {
                    if (accessToken === MASKED_TOKEN) {
                      setAccessToken('');
                      setTokenEdited(true);
                    }
                  }}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground pr-10 h-9 text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {config && !tokenEdited && (
                <p className="text-[10px] text-muted-foreground">
                  Token is hidden for security. Re-enter it to update.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs font-semibold">Webhook Verify Token</Label>
              <Input
                placeholder="Create a custom verify token"
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs font-semibold">
                Two-step verification PIN <span className="text-[10px] text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="6-digit PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-9 text-xs font-mono tracking-widest text-center"
              />
            </div>

            {/* Webhook Callback Display */}
            <div className="space-y-1 bg-muted/40 border border-border p-2.5 rounded-md text-[11px]">
              <span className="font-semibold text-muted-foreground block">Webhook Callback URL:</span>
              <div className="flex gap-2 items-center mt-1">
                <code className="text-muted-foreground font-mono bg-card px-1.5 py-0.5 rounded truncate select-all flex-1">
                  {webhookUrl}
                </code>
                <button
                  onClick={handleCopyWebhookUrl}
                  className="text-muted-foreground hover:text-foreground text-xs"
                >
                  <Copy className="size-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 justify-end border-t border-border pt-3">
            {config && (
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={resetting}
                className="border-red-900/50 text-red-400 hover:bg-red-950/20 text-xs h-8 px-3"
              >
                {resetting ? 'Resetting...' : 'Reset config'}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testing || !config}
              className="border-border text-muted-foreground hover:bg-muted text-xs h-8 px-3"
            >
              {testing ? 'Testing...' : 'Test connection'}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-8 px-4 font-semibold"
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
