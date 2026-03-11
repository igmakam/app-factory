import { useState, useEffect } from 'react';
import { api, CredentialStatus } from '../lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ArrowRight, Check, Loader2, ExternalLink, Shield, KeyRound, Smartphone, Globe, Github, ChevronRight, ChevronDown, Info, SkipForward, Camera, MessageSquare, X, ImageIcon, Lightbulb, Link2 } from 'lucide-react';

interface Props { onBack: () => void; }

type CredType = 'github' | 'apple' | 'google' | 'ios_signing' | 'android_signing';

interface AISuggestion {
  diagnosis: string;
  solution: string[];
  alternative: string;
  helpful_link: string;
  helpful_link_label: string;
}

interface ActionLink {
  url: string;
  label: string;
  description: string;
}

interface StepConfig {
  type: CredType;
  label: string;
  icon: React.ReactNode;
  shortLabel: string;
  oneClickLabel: string;
  oneClickUrl: string;
  oneClickDescription: string;
  extraLinks?: ActionLink[];
  howToSteps: string[];
  fields: Array<{ key: string; label: string; type: string; placeholder: string; help?: string }>;
  optional?: boolean;
  tip?: string;
}

const WIZARD_STEPS: StepConfig[] = [
  {
    type: 'github',
    label: 'Connect GitHub',
    icon: <Github className="w-5 h-5" />,
    shortLabel: 'GitHub',
    oneClickLabel: 'Generate GitHub Token',
    oneClickUrl: 'https://github.com/settings/tokens/new?scopes=repo,workflow&description=AutoLaunch',
    oneClickDescription: 'Opens GitHub token page with permissions already selected. Click the green "Generate token" button at the bottom, then copy the token.',
    extraLinks: [
      { url: 'https://github.com/new', label: 'Create New Repo', description: 'Create a dedicated repo for your app' },
    ],
    howToSteps: [
      'Click the blue button above - GitHub opens with "repo" and "workflow" permissions already checked',
      'Scroll down and click the green "Generate token" button',
      'Copy the token that starts with "ghp_" (shown only once!)',
      'Paste it in the Token field below and add your repo URL',
    ],
    tip: 'Use a separate repo per app project.',
    fields: [
      { key: 'token', label: 'Token', type: 'password', placeholder: 'ghp_xxxxxxxxxxxxxxxxxxxx' },
      { key: 'default_repo', label: 'Repo URL', type: 'text', placeholder: 'https://github.com/username/my-app' },
    ],
  },
  {
    type: 'apple',
    label: 'App Store Connect API',
    icon: <Smartphone className="w-5 h-5" />,
    shortLabel: 'Apple',
    oneClickLabel: 'Open App Store Connect API Keys',
    oneClickUrl: 'https://appstoreconnect.apple.com/access/integrations/api',
    oneClickDescription: 'Opens App Store Connect > Users and Access > Integrations > API Keys. This is where you create API keys for automated publishing.',
    extraLinks: [
      { url: 'https://developer.apple.com/programs/', label: 'Join Developer Program ($99/yr)', description: 'Required to publish apps' },
    ],
    howToSteps: [
      'Click the blue button - it opens App Store Connect (NOT developer.apple.com)',
      'You should see "App Store Connect API" with a list of keys or empty page',
      'Click the "+" button (or "Generate API Key") to create a new key',
      'Name it "AutoLaunch", select "Admin" role, click "Generate"',
      'Copy the Key ID (shown in the table) and Issuer ID (shown above the table)',
      'Click "Download API Key" to get the .p8 file (can only download ONCE!)',
      'Open the .p8 file in a text editor, copy everything, paste below',
    ],
    fields: [
      { key: 'key_id', label: 'Key ID (10-character code, NOT the key name)', type: 'text', placeholder: 'e.g. UG854P48J6', help: 'Short 10-char code shown in the KEY ID column of the table (not the name you gave the key!)' },
      { key: 'issuer_id', label: 'Issuer ID (long UUID shown above the table)', type: 'text', placeholder: 'e.g. 57246542-96fe-1a63-e053-0824d011072a', help: 'UUID format shown at the top of the page, above the list of keys' },
      { key: 'private_key', label: 'Private Key (.p8 file content)', type: 'textarea', placeholder: '-----BEGIN PRIVATE KEY-----\nMIGTAg...\n-----END PRIVATE KEY-----', help: 'Open the downloaded .p8 file in a text editor, copy ALL content including BEGIN/END lines' },
    ],
  },
  {
    type: 'google',
    label: 'Google Play Console',
    icon: <Globe className="w-5 h-5" />,
    shortLabel: 'Google',
    oneClickLabel: 'Create Service Account in Google Cloud',
    oneClickUrl: 'https://console.cloud.google.com/iam-admin/serviceaccounts/create',
    oneClickDescription: 'Opens Google Cloud Console to create a service account. After creating it, generate a JSON key and link it in Play Console.',
    extraLinks: [
      { url: 'https://play.google.com/console/developers', label: 'Open Play Console', description: 'Go to Settings > API Access to link the service account' },
      { url: 'https://play.google.com/console/signup', label: 'Register as Developer ($25)', description: 'One-time registration if you have no account yet' },
    ],
    howToSteps: [
      'Click the blue button - Google Cloud Console opens on "Create service account"',
      'Enter name "autolauncher", click "Create and Continue", then "Done"',
      'Click on the new service account email in the list',
      'Go to the "Keys" tab, click "Add Key" > "Create new key" > select JSON > "Create"',
      'A .json file downloads automatically - open it in a text editor',
      'Go to Play Console > Settings > API Access, click "Link" next to your service account',
      'Paste the entire JSON file content below',
    ],
    fields: [
      { key: 'service_account_json', label: 'Service Account JSON', type: 'textarea', placeholder: '{"type": "service_account", ...}', help: 'Paste the full content of the downloaded JSON key file' },
    ],
  },
  {
    type: 'ios_signing',
    label: 'iOS Signing',
    icon: <KeyRound className="w-5 h-5" />,
    shortLabel: 'iOS Sign',
    oneClickLabel: 'Open Certificates, Identifiers & Profiles',
    oneClickUrl: 'https://developer.apple.com/account/resources/certificates/list',
    oneClickDescription: 'Opens Apple Developer > Certificates page. Download your iOS Distribution certificate, convert to Base64, and paste below.',
    extraLinks: [
      { url: 'https://developer.apple.com/account/resources/profiles/list', label: 'Provisioning Profiles', description: 'Create an App Store distribution profile' },
    ],
    howToSteps: [
      'Click the blue button - Apple Developer Certificates page opens',
      'Find your "Apple Distribution" certificate (or create one via the "+" button)',
      'Download the certificate, export it from Keychain as .p12 with a password',
      'In Terminal, run: base64 -i certificate.p12 | pbcopy (copies Base64 to clipboard)',
      'Paste below. Repeat the same Base64 process for your provisioning profile (.mobileprovision)',
    ],
    optional: true,
    fields: [
      { key: 'certificate_p12_base64', label: 'Certificate (.p12) Base64', type: 'textarea', placeholder: 'Base64 encoded .p12' },
      { key: 'certificate_password', label: 'Certificate Password', type: 'password', placeholder: 'Password you set when exporting from Keychain' },
      { key: 'provisioning_profile_base64', label: 'Provisioning Profile Base64', type: 'textarea', placeholder: 'Base64 encoded .mobileprovision' },
    ],
  },
  {
    type: 'android_signing',
    label: 'Android Signing',
    icon: <KeyRound className="w-5 h-5" />,
    shortLabel: 'Android Sign',
    oneClickLabel: 'View Android Signing Guide',
    oneClickUrl: 'https://developer.android.com/studio/publish/app-signing',
    oneClickDescription: 'Opens the official Android app signing documentation. If you already have a keystore, paste it below. If not, follow the guide to create one.',
    howToSteps: [
      'If you have no keystore yet, open Terminal and run:',
      'keytool -genkey -v -keystore release.jks -keyalg RSA -keysize 2048 -validity 10000',
      'Follow the prompts (remember the passwords you set!)',
      'Convert to Base64: base64 -i release.jks | pbcopy',
      'Paste the Base64 keystore and passwords below',
    ],
    optional: true,
    fields: [
      { key: 'keystore_base64', label: 'Keystore Base64', type: 'textarea', placeholder: 'Base64 encoded .jks or .keystore file' },
      { key: 'keystore_password', label: 'Keystore Password', type: 'password', placeholder: 'Password you set when creating the keystore' },
      { key: 'key_alias', label: 'Key Alias', type: 'text', placeholder: 'my-key-alias (set during keystore creation)' },
      { key: 'key_password', label: 'Key Password', type: 'password', placeholder: 'Key password (often same as keystore password)' },
    ],
  },
];

export default function SetupWizard({ onBack }: Props) {
  const [credStatuses, setCredStatuses] = useState<CredentialStatus[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showHelp, setShowHelp] = useState(true);

  // Feedback state
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackScreenshot, setFeedbackScreenshot] = useState('');
  const [feedbackScreenshotName, setFeedbackScreenshotName] = useState('');
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null);
  const [autoGenerating, setAutoGenerating] = useState(false);

  useEffect(() => {
    api.credentials.status().then(setCredStatuses).catch(console.error);
  }, []);

  // Auto-jump to first unconfigured step on load
  useEffect(() => {
    if (credStatuses.length > 0) {
      const firstEmpty = WIZARD_STEPS.findIndex(ws => {
        const s = credStatuses.find(c => c.credential_type === ws.type);
        return !s?.is_configured;
      });
      if (firstEmpty >= 0) {
        setCurrentStep(firstEmpty);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credStatuses.length > 0 ? 'loaded' : 'loading']);

  const stepConfig = WIZARD_STEPS[currentStep];
  const totalSteps = WIZARD_STEPS.length;
  const configuredCount = credStatuses.filter(c => c.is_configured).length;

  const getStepStatus = (type: CredType): 'configured' | 'validated' | 'empty' => {
    const s = credStatuses.find(c => c.credential_type === type);
    if (s?.is_valid) return 'validated';
    if (s?.is_configured) return 'configured';
    return 'empty';
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      let data = { ...formData };
      if (stepConfig.type === 'google' && formData.service_account_json) {
        try { data = JSON.parse(formData.service_account_json); } catch { data = { service_account_json: formData.service_account_json }; }
      }
      await api.credentials.save(stepConfig.type, data);
      try {
        const valResult = await api.credentials.validate(stepConfig.type);
        setMessage(valResult.valid ? 'Connected!' : `Saved. ${valResult.message}`);
      } catch { setMessage('Saved!'); }
      const updated = await api.credentials.status();
      setCredStatuses(updated);
      // Auto-advance after 1.5s if validated
      const justSaved = updated.find(c => c.credential_type === stepConfig.type);
      if (justSaved?.is_valid && currentStep < totalSteps - 1) {
        setTimeout(() => {
          setCurrentStep(prev => Math.min(prev + 1, totalSteps - 1));
          setFormData({});
          setMessage('');
          setShowHelp(false);
          setShowFeedback(false);
          setAiSuggestion(null);
        }, 1500);
      }
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : 'Save failed'}`);
    } finally {
      setSaving(false);
    }
  };

  const goToStep = (idx: number) => {
    setCurrentStep(idx);
    setFormData({});
    setMessage('');
    setShowHelp(false);
    setShowFeedback(false);
    setAiSuggestion(null);
  };

  const goNext = () => { if (currentStep < totalSteps - 1) goToStep(currentStep + 1); };
  const goPrev = () => { if (currentStep > 0) goToStep(currentStep - 1); };

  const handleScreenshotUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFeedbackScreenshotName(file.name);
    const reader = new FileReader();
    reader.onload = () => setFeedbackScreenshot(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSendFeedback = async () => {
    if (!feedbackText && !feedbackScreenshot) return;
    setFeedbackSending(true);
    setAiSuggestion(null);
    try {
      const result = await api.feedback.submit(stepConfig.type, feedbackText, feedbackScreenshot);
      if (result.ai_suggestion) {
        setAiSuggestion(result.ai_suggestion);
      }
      setFeedbackText('');
      setFeedbackScreenshot('');
      setFeedbackScreenshotName('');
    } catch (err) {
      setMessage(`Feedback error: ${err instanceof Error ? err.message : 'Failed'}`);
    } finally {
      setFeedbackSending(false);
    }
  };

  const handleAutoGenerate = async () => {
    setAutoGenerating(true);
    setMessage('');
    try {
      const result = await api.credentials.autoGenerate(stepConfig.type);
      setMessage(result.message);
      const updated = await api.credentials.status();
      setCredStatuses(updated);
      // Auto-advance after 1.5s
      if (currentStep < totalSteps - 1) {
        setTimeout(() => {
          setCurrentStep(prev => Math.min(prev + 1, totalSteps - 1));
          setFormData({});
          setMessage('');
          setShowHelp(false);
          setShowFeedback(false);
          setAiSuggestion(null);
        }, 1500);
      }
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : 'Generation failed'}`);
    } finally {
      setAutoGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-400 hover:text-white">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Shield className="w-5 h-5 text-blue-400" />
            <h1 className="text-lg font-bold text-white">Setup Wizard</h1>
          </div>
          <Badge variant="outline" className="border-slate-600 text-slate-300">
            {configuredCount}/5 Connected
          </Badge>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Step Progress */}
        <div className="flex items-center gap-1 mb-8">
          {WIZARD_STEPS.map((ws, idx) => {
            const status = getStepStatus(ws.type);
            const isActive = idx === currentStep;
            return (
              <button key={ws.type} onClick={() => goToStep(idx)} className="flex-1 group">
                <div className={`h-1.5 rounded-full mb-2 transition-colors ${
                  status === 'validated' ? 'bg-green-500' :
                  status === 'configured' ? 'bg-yellow-500' :
                  isActive ? 'bg-blue-500' : 'bg-slate-700'
                }`} />
                <div className="flex items-center gap-1.5 justify-center">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                    status === 'validated' ? 'bg-green-500 text-white' :
                    status === 'configured' ? 'bg-yellow-500 text-white' :
                    isActive ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400'
                  }`}>
                    {status !== 'empty' ? <Check className="w-3 h-3" /> : idx + 1}
                  </div>
                  <span className={`text-xs hidden md:inline ${isActive ? 'text-white font-medium' : 'text-slate-500'}`}>
                    {ws.shortLabel}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Step Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">{stepConfig.icon}</div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white">
              {stepConfig.label}
              {stepConfig.optional && <Badge variant="outline" className="ml-2 text-xs border-slate-600 text-slate-400">Optional</Badge>}
            </h2>
          </div>
        </div>

        {/* Connected Badge */}
        {getStepStatus(stepConfig.type) === 'validated' && (
          <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-2">
            <Check className="w-4 h-4 text-green-400" />
            <span className="text-sm text-green-300 font-medium">Connected and validated</span>
          </div>
        )}

        {/* ONE-CLICK ACTION BUTTON */}
        <a
          href={stepConfig.oneClickUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 p-4 mb-4 bg-blue-600/20 border border-blue-500/30 rounded-xl hover:bg-blue-600/30 hover:border-blue-500/50 transition-all group cursor-pointer"
        >
          <div className="p-3 bg-blue-500/30 rounded-lg group-hover:bg-blue-500/40">
            <ExternalLink className="w-5 h-5 text-blue-300" />
          </div>
          <div className="flex-1">
            <p className="text-base font-semibold text-blue-200">{stepConfig.oneClickLabel}</p>
            <p className="text-sm text-slate-400">{stepConfig.oneClickDescription}</p>
          </div>
          <ArrowRight className="w-5 h-5 text-blue-400 group-hover:translate-x-1 transition-transform" />
        </a>

        {/* AUTO-GENERATE BUTTON for signing steps */}
        {stepConfig.optional && getStepStatus(stepConfig.type) !== 'validated' && (
          <Button
            onClick={handleAutoGenerate}
            disabled={autoGenerating}
            className="w-full mb-4 bg-emerald-600 hover:bg-emerald-700 text-white py-3 text-base"
          >
            {autoGenerating ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating...</>
            ) : (
              <><Shield className="w-4 h-4 mr-2" /> Generate Automatically (one click)</>
            )}
          </Button>
        )}

        {stepConfig.optional && getStepStatus(stepConfig.type) !== 'validated' && (
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-slate-700" />
            <span className="text-xs text-slate-500">or configure manually</span>
            <div className="flex-1 h-px bg-slate-700" />
          </div>
        )}

        {/* Extra links */}
        {stepConfig.extraLinks && stepConfig.extraLinks.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {stepConfig.extraLinks.map((link, i) => (
              <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg hover:border-blue-500/30 text-xs text-slate-400 hover:text-blue-300 transition-colors">
                <Link2 className="w-3 h-3" /> {link.label}
              </a>
            ))}
          </div>
        )}

        {/* Expandable Help */}
        <button onClick={() => setShowHelp(!showHelp)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-400 transition-colors mb-4">
          {showHelp ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <Info className="w-3 h-3" />
          {showHelp ? 'Hide instructions' : 'Need help? Show step-by-step'}
        </button>

        {showHelp && (
          <Card className="bg-slate-800/50 border-slate-700 mb-4">
            <CardContent className="p-3">
              {stepConfig.tip && (
                <p className="text-xs text-amber-300 mb-2"><span className="font-semibold">Tip:</span> {stepConfig.tip}</p>
              )}
              <div className="space-y-1">
                {stepConfig.howToSteps.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-slate-400">
                    <span className="text-blue-400 font-mono">{i + 1}.</span>
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Paste Fields */}
        <Card className="bg-slate-900/50 border-slate-800 mb-4">
          <CardContent className="p-4 space-y-3">
            {stepConfig.fields.map(field => (
              <div key={field.key}>
                <Label className="text-slate-300 text-sm">{field.label}</Label>
                {field.help && <p className="text-xs text-slate-500 mt-0.5">{field.help}</p>}
                {field.type === 'textarea' ? (
                  <textarea
                    className="w-full mt-1 p-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm min-h-20 font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    placeholder={field.placeholder}
                    value={formData[field.key] || ''}
                    onChange={e => setFormData({ ...formData, [field.key]: e.target.value })}
                  />
                ) : (
                  <Input
                    type={field.type}
                    className="mt-1 bg-slate-800 border-slate-700 text-white focus:border-blue-500"
                    placeholder={field.placeholder}
                    value={formData[field.key] || ''}
                    onChange={e => setFormData({ ...formData, [field.key]: e.target.value })}
                  />
                )}
              </div>
            ))}

            {message && (
              <div className={`p-2.5 rounded-lg text-sm ${message.startsWith('Error') || message.startsWith('Invalid') ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
                {message}
              </div>
            )}

            <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 w-full">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
              Save & Connect
            </Button>
          </CardContent>
        </Card>

        {/* Feedback Section */}
        <div className="mb-6">
          {!showFeedback && !aiSuggestion && (
            <button onClick={() => setShowFeedback(true)}
              className="flex items-center gap-2 text-xs text-slate-500 hover:text-amber-400 transition-colors">
              <Camera className="w-3.5 h-3.5" />
              <span>Having trouble? Send a screenshot and get AI help</span>
            </button>
          )}

          {/* AI Suggestion Response */}
          {aiSuggestion && (
            <Card className="bg-emerald-500/5 border-emerald-500/20 mb-3">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-300">AI Suggestion</span>
                  <button onClick={() => { setAiSuggestion(null); setShowFeedback(false); }} className="ml-auto text-slate-500 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="mb-3 p-2.5 bg-slate-800/50 rounded-lg">
                  <p className="text-xs font-semibold text-slate-400 mb-1">{"What's likely wrong:"}</p>
                  <p className="text-sm text-white">{aiSuggestion.diagnosis}</p>
                </div>

                <div className="mb-3">
                  <p className="text-xs font-semibold text-slate-400 mb-1.5">How to fix it:</p>
                  <div className="space-y-1.5">
                    {aiSuggestion.solution.map((step, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-emerald-400 font-mono text-xs mt-0.5">{i + 1}.</span>
                        <span className="text-slate-300">{step}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {aiSuggestion.alternative && (
                  <div className="mb-3 p-2.5 bg-amber-500/5 border border-amber-500/10 rounded-lg">
                    <p className="text-xs font-semibold text-amber-400 mb-1">Alternative approach:</p>
                    <p className="text-sm text-slate-300">{aiSuggestion.alternative}</p>
                  </div>
                )}

                {aiSuggestion.helpful_link && (
                  <a href={aiSuggestion.helpful_link} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 transition-colors">
                    <ExternalLink className="w-4 h-4 text-blue-400" />
                    <span className="text-sm text-blue-300">{aiSuggestion.helpful_link_label || 'Helpful resource'}</span>
                  </a>
                )}

                <button onClick={() => { setAiSuggestion(null); setShowFeedback(true); }}
                  className="mt-3 text-xs text-slate-500 hover:text-amber-400 transition-colors flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" /> Still stuck? Send another message
                </button>
              </CardContent>
            </Card>
          )}

          {/* Feedback Input */}
          {showFeedback && !aiSuggestion && (
            <Card className="bg-amber-500/5 border-amber-500/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-medium text-amber-300">Describe your issue - AI will help</span>
                  </div>
                  <button onClick={() => setShowFeedback(false)} className="text-slate-500 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <textarea
                  className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm min-h-16 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-colors mb-3"
                  placeholder="Describe what happened or what error you see..."
                  value={feedbackText}
                  onChange={e => setFeedbackText(e.target.value)}
                />

                <div className="flex items-center gap-3 mb-3">
                  <label className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg cursor-pointer hover:border-amber-500/50 transition-colors">
                    <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-xs text-slate-300">{feedbackScreenshotName || 'Attach Screenshot'}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleScreenshotUpload} />
                  </label>
                  {feedbackScreenshot && (
                    <button onClick={() => { setFeedbackScreenshot(''); setFeedbackScreenshotName(''); }} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                  )}
                </div>

                {feedbackScreenshot && (
                  <div className="mb-3 p-2 bg-slate-800 rounded-lg border border-slate-700">
                    <img src={feedbackScreenshot} alt="Screenshot" className="max-h-40 rounded object-contain" />
                  </div>
                )}

                <Button onClick={handleSendFeedback}
                  disabled={feedbackSending || (!feedbackText && !feedbackScreenshot)}
                  className="bg-amber-600 hover:bg-amber-700 w-full">
                  {feedbackSending ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" /> AI is analyzing...</>
                  ) : (
                    <><Lightbulb className="w-4 h-4 mr-2" /> Get AI Help</>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button onClick={goPrev} disabled={currentStep === 0} variant="outline" className="border-slate-700 text-slate-300">
            <ArrowLeft className="w-4 h-4 mr-1" /> Previous
          </Button>
          <div className="flex gap-2">
            {stepConfig.optional && getStepStatus(stepConfig.type) === 'empty' && (
              <Button onClick={goNext} variant="ghost" className="text-slate-400 hover:text-white">
                <SkipForward className="w-4 h-4 mr-1" /> Skip
              </Button>
            )}
            {currentStep < totalSteps - 1 ? (
              <Button onClick={goNext} className="bg-blue-600 hover:bg-blue-700">
                Next <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={onBack} className="bg-green-600 hover:bg-green-700">
                <Check className="w-4 h-4 mr-1" /> Finish
              </Button>
            )}
          </div>
        </div>

        {/* Quick Overview */}
        <div className="mt-8 p-4 bg-slate-900/50 border border-slate-800 rounded-lg">
          <p className="text-xs font-semibold text-slate-400 mb-3">Quick Overview:</p>
          <div className="space-y-1.5">
            {WIZARD_STEPS.map((ws, idx) => {
              const status = getStepStatus(ws.type);
              return (
                <button key={ws.type} onClick={() => goToStep(idx)}
                  className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors ${
                    idx === currentStep ? 'bg-blue-500/10 border border-blue-500/20' : 'hover:bg-slate-800'
                  }`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                    status === 'validated' ? 'bg-green-500 text-white' :
                    status === 'configured' ? 'bg-yellow-500 text-white' : 'bg-slate-700 text-slate-400'
                  }`}>
                    {status !== 'empty' ? <Check className="w-3 h-3" /> : idx + 1}
                  </div>
                  <span className="flex-1 text-sm text-white">{ws.label} {ws.optional && <span className="text-xs text-slate-500">(optional)</span>}</span>
                  <Badge variant="outline" className={`text-xs ${
                    status === 'validated' ? 'border-green-500/30 text-green-400' :
                    status === 'configured' ? 'border-yellow-500/30 text-yellow-400' : 'border-slate-600 text-slate-500'
                  }`}>
                    {status === 'validated' ? 'Connected' : status === 'configured' ? 'Saved' : 'Not set'}
                  </Badge>
                  <ChevronRight className="w-4 h-4 text-slate-600" />
                </button>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
