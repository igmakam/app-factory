import { useState, useEffect } from 'react';
import { api, Project, QuestionnaireQuestion, StoreListing, PipelineRun, GenerateResult, CredentialStatus, RFactor, HelixaIdeaSummary, HelixaIdea } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, ArrowRight, Loader2, Sparkles, Rocket, Check, X, TrendingUp, Target, Zap, DollarSign, BarChart3, AlertTriangle, Star, Copy, Mail, Megaphone, FileText, Globe, Share2, Brain, ChevronRight } from 'lucide-react';

interface Props {
  projectId: number | null;
  onBack: () => void;
}

type Step = 'create' | 'questionnaire' | 'generating' | 'review' | 'pipeline';

export default function ProjectFlow({ projectId, onBack }: Props) {
  const [step, setStep] = useState<Step>(projectId ? 'questionnaire' : 'create');
  const [project, setProject] = useState<Project | null>(null);
  const [questions, setQuestions] = useState<QuestionnaireQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [listings, setListings] = useState<StoreListing[]>([]);
  const [pipeline, setPipeline] = useState<PipelineRun | null>(null);
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentQ, setCurrentQ] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [strategy, setStrategy] = useState<Record<string, any> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [campaignContent, setCampaignContent] = useState<Record<string, any>>({});
  const [generatingContent, setGeneratingContent] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState('');
  const [credStatuses, setCredStatuses] = useState<CredentialStatus[]>([]);
  const [rFactor, setRFactor] = useState<RFactor | null>(null);

  // Create form
  const [name, setName] = useState('');
  const [bundleId, setBundleId] = useState('');
  const [githubRepo, setGithubRepo] = useState('');
  const [platform, setPlatform] = useState('both');

  // HELIXA ideas for auto-pull
  const [helixaIdeas, setHelixaIdeas] = useState<HelixaIdeaSummary[]>([]);
  const [helixaLoading, setHelixaLoading] = useState(false);
  const [selectedHelixaId, setSelectedHelixaId] = useState<number | null>(null);

  useEffect(() => {
    api.questionnaire.questions().then(setQuestions).catch(console.error);
    api.credentials.status().then(setCredStatuses).catch(console.error);
    if (projectId) {
      loadProject(projectId);
    }
    // Load HELIXA ideas for create step
    if (!projectId) {
      setHelixaLoading(true);
      api.helixa.ideas.list().then(ideas => {
        setHelixaIdeas(ideas);
        setHelixaLoading(false);
      }).catch(() => setHelixaLoading(false));
    }
  }, [projectId]);

  // Auto-refresh pipeline every 15s when pipeline is running or has system-retryable steps
  useEffect(() => {
    if (step !== 'pipeline' || !project?.id) return;
    const shouldAutoRefresh = pipeline?.status === 'running' || pipeline?.status === 'submitted' ||
      (rFactor && (rFactor.system_retry_count || 0) > 0);
    if (!shouldAutoRefresh) return;
    const interval = setInterval(() => {
      refreshPipeline();
    }, 15000);
    return () => clearInterval(interval);
  }, [step, project?.id, pipeline?.status, rFactor?.system_retry_count]);

  const loadProject = async (id: number) => {
    try {
      const p = await api.projects.get(id);
      setProject(p);
      setName(p.name);
      setBundleId(p.bundle_id);
      setGithubRepo(p.github_repo);
      setPlatform(p.platform);

      // Load existing answers
      const existingAnswers = await api.questionnaire.get(id);
      if (Object.keys(existingAnswers).length > 0) {
        setAnswers(existingAnswers);
      }

      // Load listings
      try {
        const l = await api.listings.get(id);
        setListings(l);
      } catch { /* no listings yet */ }

      // Load pipeline
      try {
        const pipeResult = await api.pipeline.get(id);
        if (pipeResult.run) setPipeline(pipeResult.run);
        if (pipeResult.r_factor) setRFactor(pipeResult.r_factor);
      } catch { /* no pipeline yet */ }

      // Load strategy
      try {
        const strat = await api.strategy.get(id);
        if (strat.exists) setStrategy(strat);
      } catch { /* no strategy yet */ }

      // Load campaign content
      try {
        const camp = await api.campaign.getAll(id);
        if (camp.content) {
          const mapped: Record<string, unknown> = {};
          for (const [key, val] of Object.entries(camp.content)) {
            mapped[key] = val.data;
          }
          setCampaignContent(mapped);
        }
      } catch { /* no campaign content yet */ }

      // Determine step
      if (p.status === 'pipeline_running' || p.status === 'pipeline_done' || p.status === 'submitted' || p.status === 'live') {
        setStep('pipeline');
      } else if (p.listing_generated) {
        setStep('review');
      } else if (p.questionnaire_complete) {
        setStep('review');
      } else {
        setStep('questionnaire');
      }
    } catch {
      setError('Failed to load project');
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) { setError('App name is required'); return; }
    setLoading(true);
    setError('');
    try {
      const p = await api.projects.create({ name, bundle_id: bundleId, github_repo: githubRepo, platform });
      setProject(p);
      setStep('questionnaire');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitQuestionnaire = async () => {
    if (!project) return;
    setLoading(true);
    setError('');
    try {
      const answersList = Object.entries(answers).map(([key, val]) => ({ question_key: key, answer_text: val }));
      await api.questionnaire.submit(project.id, answersList);
      setStep('generating');
      // Auto-generate
      const result = await api.generate.listing(project.id);
      setGenerateResult(result);
      const l = await api.listings.get(project.id);
      setListings(l);
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
      setStep('questionnaire');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (!project) return;
    setLoading(true);
    setError('');
    try {
      setStep('generating');
      const result = await api.generate.listing(project.id);
      setGenerateResult(result);
      const l = await api.listings.get(project.id);
      setListings(l);
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Regeneration failed');
      setStep('review');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateStrategy = async () => {
    if (!project) return;
    setStrategyLoading(true);
    setError('');
    try {
      const result = await api.strategy.generate(project.id);
      setStrategy(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Strategy generation failed');
    } finally {
      setStrategyLoading(false);
    }
  };

  const handleGenerateCampaign = async (contentType: string) => {
    if (!project) return;
    setGeneratingContent(contentType);
    setError('');
    try {
      const result = await api.campaign.generate(project.id, contentType);
      setCampaignContent(prev => ({ ...prev, [contentType]: result.content }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Content generation failed');
    } finally {
      setGeneratingContent(null);
    }
  };

  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(''), 2000);
  };

  const handleStartPipeline = async () => {
    if (!project) return;
    setLoading(true);
    setError('');
    try {
      await api.pipeline.start(project.id);
      const pipeResult = await api.pipeline.get(project.id);
      if (pipeResult.run) setPipeline(pipeResult.run);
      setStep('pipeline');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pipeline start failed');
    } finally {
      setLoading(false);
    }
  };

  const refreshPipeline = async () => {
    if (!project) return;
    try {
      const pipeResult = await api.pipeline.get(project.id);
      if (pipeResult.run) setPipeline(pipeResult.run);
      if (pipeResult.r_factor) setRFactor(pipeResult.r_factor);
    } catch { /* ignore */ }
  };

  // ==================== RENDER STEPS ====================

  const selectHelixaIdea = async (ideaId: number) => {
    setSelectedHelixaId(ideaId);
    try {
      const idea: HelixaIdea = await api.helixa.ideas.get(ideaId);
      setName(idea.idea_name || '');
      const slug = (idea.idea_name || '').toLowerCase().replace(/[^a-z0-9]+/g, '.');
      setBundleId(`com.${slug}.app`);
    } catch { /* ignore */ }
  };

  const renderCreate = () => {
    const scoreColor = (s: number) => s >= 8 ? 'text-green-400' : s >= 6 ? 'text-yellow-400' : 'text-red-400';

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        {/* HELIXA Ideas Pull */}
        {helixaIdeas.length > 0 && (
          <Card className="bg-indigo-900/20 border-indigo-800/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-indigo-400 text-base flex items-center gap-2">
                <Brain className="w-5 h-5" /> Import from HELIXA
              </CardTitle>
              <p className="text-xs text-slate-400">Select an idea from HELIXA to auto-populate your project</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {helixaIdeas.map(idea => (
                  <div
                    key={idea.id}
                    onClick={() => selectHelixaIdea(idea.id)}
                    className={`p-3 rounded-lg cursor-pointer transition-all border flex items-center justify-between ${
                      selectedHelixaId === idea.id
                        ? 'bg-indigo-900/40 border-indigo-500'
                        : 'bg-slate-800/30 border-slate-700 hover:border-indigo-600/50'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="text-white font-medium text-sm truncate">{idea.idea_name}</h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge className="bg-indigo-500/20 text-indigo-400 text-xs px-1.5 py-0">{idea.product_type}</Badge>
                        <span className="text-xs text-slate-500">{new Date(idea.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-bold ${scoreColor(idea.overall_score)}`}>{idea.overall_score}</span>
                      {selectedHelixaId === idea.id ? <Check className="w-4 h-4 text-indigo-400" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        {helixaLoading && (
          <div className="flex items-center gap-2 text-indigo-400 text-sm justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading HELIXA ideas...
          </div>
        )}

        {/* Create form */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Rocket className="w-5 h-5 text-blue-400" /> New App Launch
            </CardTitle>
            <p className="text-sm text-slate-400">{selectedHelixaId ? 'Imported from HELIXA - review and continue' : 'Create a new project to start the automated launch process'}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-slate-300">App Name *</Label>
              <Input className="mt-1 bg-slate-800 border-slate-700 text-white" placeholder="My Amazing App"
                value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <Label className="text-slate-300">Bundle ID</Label>
              <Input className="mt-1 bg-slate-800 border-slate-700 text-white" placeholder="com.company.appname"
                value={bundleId} onChange={e => setBundleId(e.target.value)} />
            </div>
            <div>
              <Label className="text-slate-300">GitHub Repository URL</Label>
              <Input className="mt-1 bg-slate-800 border-slate-700 text-white" placeholder="https://github.com/user/repo"
                value={githubRepo} onChange={e => setGithubRepo(e.target.value)} />
            </div>
            <div>
              <Label className="text-slate-300">Target Platform</Label>
              <div className="flex gap-3 mt-2">
                {['both', 'ios', 'android'].map(p => (
                  <button key={p} onClick={() => setPlatform(p)}
                    className={`px-4 py-2 rounded-lg border text-sm ${platform === p ? 'border-blue-500 bg-blue-500/20 text-white' : 'border-slate-700 text-slate-400'}`}>
                    {p === 'both' ? 'iOS + Android' : p === 'ios' ? 'iOS Only' : 'Android Only'}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <Button onClick={handleCreate} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ArrowRight className="w-4 h-4 mr-2" />}
              Continue to Questionnaire
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderQuestionnaire = () => {
    const q = questions[currentQ];
    if (!q) return null;
    const progress = ((currentQ + 1) / questions.length) * 100;
    const requiredMissing = questions.filter(qq => qq.required && !answers[qq.key]?.trim()).length;

    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-400">Question {currentQ + 1} of {questions.length}</span>
            <span className="text-sm text-slate-400">{q.category}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="mb-1 flex items-center gap-2">
              <h3 className="text-lg font-semibold text-white">{q.question}</h3>
              {q.required && <span className="text-red-400 text-xs">*</span>}
            </div>
            <p className="text-sm text-slate-400 mb-4">{q.description}</p>

            {q.input_type === 'select' && q.options ? (
              <div className="grid grid-cols-2 gap-2">
                {q.options.map(opt => (
                  <button key={opt} onClick={() => setAnswers({ ...answers, [q.key]: opt })}
                    className={`p-2 rounded-lg border text-sm text-left ${answers[q.key] === opt ? 'border-blue-500 bg-blue-500/20 text-white' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}>
                    {opt}
                  </button>
                ))}
              </div>
            ) : q.input_type === 'textarea' ? (
              <textarea
                className="w-full p-3 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm min-h-32"
                placeholder={`Type your answer...`}
                value={answers[q.key] || ''}
                onChange={e => setAnswers({ ...answers, [q.key]: e.target.value })}
              />
            ) : (
              <Input className="bg-slate-800 border-slate-700 text-white"
                placeholder="Type your answer..."
                value={answers[q.key] || ''}
                onChange={e => setAnswers({ ...answers, [q.key]: e.target.value })}
              />
            )}

            <div className="flex items-center justify-between mt-6">
              <Button variant="ghost" onClick={() => setCurrentQ(Math.max(0, currentQ - 1))} disabled={currentQ === 0}
                className="text-slate-400">
                <ArrowLeft className="w-4 h-4 mr-1" /> Previous
              </Button>

              {currentQ < questions.length - 1 ? (
                <Button onClick={() => setCurrentQ(currentQ + 1)} className="bg-blue-600 hover:bg-blue-700">
                  Next <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button onClick={handleSubmitQuestionnaire} disabled={loading || requiredMissing > 0}
                  className="bg-green-600 hover:bg-green-700">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  Generate AI Listing ({requiredMissing > 0 ? `${requiredMissing} required left` : 'Ready'})
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Question nav dots */}
        <div className="flex flex-wrap gap-1 mt-4 justify-center">
          {questions.map((qq, i) => (
            <button key={i} onClick={() => setCurrentQ(i)}
              className={`w-6 h-6 rounded-full text-xs ${i === currentQ ? 'bg-blue-500 text-white' : answers[qq.key] ? 'bg-green-500/30 text-green-400' : 'bg-slate-700 text-slate-500'}`}>
              {i + 1}
            </button>
          ))}
        </div>

        {error && <p className="text-red-400 text-sm text-center mt-4">{error}</p>}
      </div>
    );
  };

  const renderGenerating = () => {
    const agents = [
      { name: 'ASO Keyword Research Agent', time: '~30s' },
      { name: 'Copywriting Agent', time: '~45s' },
      { name: 'Viral Growth Hacker Agent', time: '~30s' },
      { name: 'Competitor Analysis Agent', time: '~40s' },
      { name: 'Launch Strategy Agent', time: '~35s' },
      { name: 'Monetization & Metrics Agent', time: '~25s' },
    ];
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="w-20 h-20 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
        <h2 className="text-2xl font-bold text-white mb-2">AI Agents Working...</h2>
        <p className="text-slate-400 mb-4">6 specialized AI agents are generating your optimized store listing & strategy</p>
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">Estimated time: ~3 minutes</span>
            <span className="text-xs text-blue-400">Processing...</span>
          </div>
          <Progress value={35} className="h-2" />
        </div>
        <div className="space-y-3 text-left">
          {agents.map((agent, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50">
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
              <span className="text-sm text-slate-300 flex-1">{agent.name}</span>
              <span className="text-xs text-slate-500">{agent.time}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderReview = () => {
    const iosListing = listings.find(l => l.platform === 'ios' && l.locale === 'en-US');
    const androidListing = listings.find(l => l.platform === 'android' && l.locale === 'en-US');
    const activeListing = iosListing || androidListing;

    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Store Listing Review</h2>
          <div className="flex gap-2">
            <Button onClick={handleRegenerate} disabled={loading} variant="outline" className="border-slate-700 text-slate-300">
              <Sparkles className="w-4 h-4 mr-1" /> Regenerate
            </Button>
            <Button onClick={handleStartPipeline} disabled={loading} className="bg-green-600 hover:bg-green-700">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Rocket className="w-4 h-4 mr-1" />}
              Start Pipeline
            </Button>
          </div>
        </div>

        {/* Credential warnings */}
        {(() => {
          const plat = project?.platform || 'both';
          const missing: string[] = [];
          const hasType = (t: string) => credStatuses.some(c => c.credential_type === t && c.is_configured);
          if (!hasType('github')) missing.push('GitHub');
          if ((plat === 'ios' || plat === 'both') && !hasType('apple')) missing.push('Apple Developer');
          if ((plat === 'ios' || plat === 'both') && !hasType('ios_signing')) missing.push('iOS Signing');
          if ((plat === 'android' || plat === 'both') && !hasType('google')) missing.push('Google Play');
          if ((plat === 'android' || plat === 'both') && !hasType('android_signing')) missing.push('Android Signing');
          return missing.length > 0 ? (
            <div className="p-3 bg-yellow-900/20 border border-yellow-700/30 rounded-lg mb-4 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
              <p className="text-sm text-yellow-300">Missing required credentials: {missing.join(', ')}. Go to Setup Credentials to configure them first.</p>
            </div>
          ) : null;
        })()}

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        {generateResult && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {generateResult.platforms.map(p => (
              <Card key={p.platform} className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-blue-400">{p.aso_score}</p>
                  <p className="text-xs text-slate-400">ASO Score ({p.platform})</p>
                </CardContent>
              </Card>
            ))}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-purple-400">{generateResult.total_tokens_used?.toLocaleString()}</p>
                <p className="text-xs text-slate-400">Tokens Used</p>
              </CardContent>
            </Card>
          </div>
        )}

        {activeListing && (
          <Tabs defaultValue="listing" className="w-full">
            <TabsList className="bg-slate-800 border-slate-700 flex-wrap h-auto gap-1 p-1">
              <TabsTrigger value="listing" className="data-[state=active]:bg-slate-700 text-xs">Listing</TabsTrigger>
              <TabsTrigger value="aso" className="data-[state=active]:bg-slate-700 text-xs">ASO</TabsTrigger>
              <TabsTrigger value="growth" className="data-[state=active]:bg-slate-700 text-xs">Growth</TabsTrigger>
              <TabsTrigger value="competitor" className="data-[state=active]:bg-slate-700 text-xs">Competitor</TabsTrigger>
              <TabsTrigger value="strategy" className="data-[state=active]:bg-slate-700 text-xs">Campaign Hub</TabsTrigger>
              <TabsTrigger value="monetization" className="data-[state=active]:bg-slate-700 text-xs">Monetization</TabsTrigger>
              <TabsTrigger value="metrics" className="data-[state=active]:bg-slate-700 text-xs">Metrics</TabsTrigger>
              <TabsTrigger value="mistakes" className="data-[state=active]:bg-slate-700 text-xs">Mistakes</TabsTrigger>
            </TabsList>

            <TabsContent value="listing">
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-6 space-y-4">
                  <div>
                    <Label className="text-slate-400 text-xs">Title</Label>
                    <p className="text-xl font-bold text-white">{activeListing.title}</p>
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs">Subtitle</Label>
                    <p className="text-lg text-blue-300">{activeListing.subtitle}</p>
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs">Promotional Text</Label>
                    <p className="text-sm text-slate-300">{activeListing.promotional_text}</p>
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs">Full Description</Label>
                    <div className="p-4 bg-slate-800 rounded-lg mt-1 max-h-64 overflow-y-auto">
                      <p className="text-sm text-slate-300 whitespace-pre-wrap">{activeListing.description}</p>
                    </div>
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs">What's New</Label>
                    <p className="text-sm text-slate-300">{activeListing.whats_new}</p>
                  </div>
                  <div className="flex gap-4 text-sm text-slate-400">
                    <span>Category: {activeListing.category}</span>
                    <span>Pricing: {activeListing.pricing_model}</span>
                    <span>Price: {activeListing.price}</span>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="aso">
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-6 space-y-4">
                  <div>
                    <Label className="text-slate-400 text-xs flex items-center gap-1"><Target className="w-3 h-3" /> ASO Score</Label>
                    <div className="flex items-center gap-3 mt-1">
                      <div className="text-4xl font-bold text-blue-400">{activeListing.aso_score}</div>
                      <span className="text-slate-400">/100</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs">Keyword Field (100 chars)</Label>
                    <p className="text-sm text-green-300 bg-slate-800 p-3 rounded-lg mt-1 font-mono">{activeListing.keywords}</p>
                  </div>
                  {activeListing.aso_tips && (
                    <div>
                      <Label className="text-slate-400 text-xs">ASO Tips</Label>
                      <ul className="mt-1 space-y-1">
                        {JSON.parse(activeListing.aso_tips).map((tip: string, i: number) => (
                          <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                            <span className="text-blue-400 mt-0.5">&#8226;</span> {tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {generateResult?.platforms?.[0]?.all_keywords && (
                    <div className="grid grid-cols-2 gap-4">
                      {Object.entries(generateResult.platforms[0].all_keywords).map(([type, keywords]) => (
                        <div key={type}>
                          <Label className="text-slate-400 text-xs capitalize">{type} Keywords</Label>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(keywords as string[]).slice(0, 10).map((kw, i) => (
                              <Badge key={i} variant="outline" className="text-xs border-slate-600 text-slate-300">{kw}</Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="growth">
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-6 space-y-4">
                  {activeListing.viral_hooks && (
                    <div>
                      <Label className="text-slate-400 text-xs flex items-center gap-1"><Zap className="w-3 h-3" /> Viral Hooks</Label>
                      <div className="space-y-2 mt-2">
                        {JSON.parse(activeListing.viral_hooks).map((hook: { name: string; description: string; implementation: string; expected_k_factor: string; priority: string }, i: number) => (
                          <div key={i} className="p-3 bg-slate-800 rounded-lg">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-white text-sm">{hook.name}</span>
                              <Badge className={hook.priority === 'high' ? 'bg-red-500/20 text-red-300' : 'bg-slate-600 text-slate-300'}>
                                K={hook.expected_k_factor}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">{hook.description}</p>
                            <p className="text-xs text-blue-300 mt-1">How: {hook.implementation}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {activeListing.growth_strategies && (
                    <div>
                      <Label className="text-slate-400 text-xs flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Growth Strategies</Label>
                      <div className="space-y-2 mt-2">
                        {JSON.parse(activeListing.growth_strategies).map((s: { strategy: string; description: string; timeline: string; estimated_impact: string; cost: string; priority: string }, i: number) => (
                          <div key={i} className="p-3 bg-slate-800 rounded-lg">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-white text-sm">{s.strategy}</span>
                              <div className="flex gap-2">
                                <Badge variant="outline" className="text-xs border-slate-600">{s.timeline}</Badge>
                                <Badge variant="outline" className="text-xs border-slate-600">{s.cost}</Badge>
                              </div>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">{s.description}</p>
                            <p className="text-xs text-green-300 mt-1">Impact: {s.estimated_impact}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {generateResult?.platforms?.[0]?.launch_day_plan && (
                    <div>
                      <Label className="text-slate-400 text-xs">Launch Day Plan</Label>
                      {Object.entries(generateResult.platforms[0].launch_day_plan).map(([phase, items]) => (
                        <div key={phase} className="mt-2">
                          <span className="text-xs font-medium text-blue-300 capitalize">{phase.replace(/_/g, ' ')}</span>
                          <ul className="mt-1">
                            {(items as string[]).map((item, i) => (
                              <li key={i} className="text-xs text-slate-400 ml-3">- {item}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                  {generateResult?.platforms?.[0]?.additional_recommendations && (
                    <div>
                      <Label className="text-slate-400 text-xs">AI Recommended Products/Services</Label>
                      <ul className="mt-1 space-y-1">
                        {generateResult.platforms[0].additional_recommendations.map((rec, i) => (
                          <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                            <Sparkles className="w-3 h-3 text-yellow-400 mt-0.5 flex-shrink-0" /> {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="competitor">
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-6 space-y-4">
                  {activeListing.competitor_analysis && (
                    <div>
                      <Label className="text-slate-400 text-xs">Competitor Analysis</Label>
                      <div className="p-4 bg-slate-800 rounded-lg mt-1 max-h-64 overflow-y-auto">
                        <p className="text-sm text-slate-300 whitespace-pre-wrap">{activeListing.competitor_analysis}</p>
                      </div>
                    </div>
                  )}
                  {generateResult?.platforms?.[0]?.positioning_statement && (
                    <div>
                      <Label className="text-slate-400 text-xs">Positioning Statement</Label>
                      <p className="text-sm text-blue-300 bg-slate-800 p-3 rounded-lg mt-1">{generateResult.platforms[0].positioning_statement}</p>
                    </div>
                  )}
                  {generateResult?.platforms?.[0]?.blue_ocean_opportunities && (
                    <div>
                      <Label className="text-slate-400 text-xs">Blue Ocean Opportunities</Label>
                      <ul className="mt-1 space-y-1">
                        {generateResult.platforms[0].blue_ocean_opportunities.map((opp, i) => (
                          <li key={i} className="text-sm text-green-300 flex items-start gap-2">
                            <Target className="w-3 h-3 mt-0.5 flex-shrink-0" /> {opp}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* CAMPAIGN ACTION HUB TAB */}
            <TabsContent value="strategy">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2"><Megaphone className="w-5 h-5 text-blue-400" /> Campaign Action Hub</h3>
                  <p className="text-xs text-slate-400">Generate ready-to-publish content for your launch</p>
                </div>

                {error && <p className="text-red-400 text-sm">{error}</p>}

                {/* Content Type Cards */}
                {[
                  { type: 'social_posts', title: 'Social Media Posts', desc: 'Twitter, Instagram, TikTok, LinkedIn, Reddit - ready to post', icon: <Share2 className="w-6 h-6" />, color: 'blue' },
                  { type: 'email_sequences', title: 'Email Sequences', desc: 'Welcome, pre-launch, launch day, follow-up emails - ready to send', icon: <Mail className="w-6 h-6" />, color: 'green' },
                  { type: 'press_release', title: 'Press Release & PR Kit', desc: 'Press release, media pitch, journalist targets - ready to distribute', icon: <FileText className="w-6 h-6" />, color: 'purple' },
                  { type: 'landing_page', title: 'Landing Page Content', desc: 'Hero, features, testimonials, FAQ, SEO meta - ready to build', icon: <Globe className="w-6 h-6" />, color: 'cyan' },
                  { type: 'product_hunt', title: 'Product Hunt Launch', desc: 'Listing, maker comment, launch checklist - ready to submit', icon: <Rocket className="w-6 h-6" />, color: 'orange' },
                ].map(ct => {
                  const content = campaignContent[ct.type];
                  const isGenerating = generatingContent === ct.type;
                  const colorMap: Record<string, string> = {
                    blue: 'border-blue-500/30 bg-blue-500/5',
                    green: 'border-green-500/30 bg-green-500/5',
                    purple: 'border-purple-500/30 bg-purple-500/5',
                    cyan: 'border-cyan-500/30 bg-cyan-500/5',
                    orange: 'border-orange-500/30 bg-orange-500/5',
                  };
                  const iconColorMap: Record<string, string> = {
                    blue: 'text-blue-400', green: 'text-green-400', purple: 'text-purple-400',
                    cyan: 'text-cyan-400', orange: 'text-orange-400',
                  };

                  return (
                    <Card key={ct.type} className={`border ${content ? colorMap[ct.color] : 'bg-slate-900/50 border-slate-800'}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={iconColorMap[ct.color]}>{ct.icon}</div>
                            <div>
                              <h4 className="font-semibold text-white text-sm">{ct.title}</h4>
                              <p className="text-xs text-slate-400">{ct.desc}</p>
                            </div>
                          </div>
                          <Button
                            onClick={() => handleGenerateCampaign(ct.type)}
                            disabled={isGenerating || generatingContent !== null}
                            size="sm"
                            className={content ? 'bg-slate-700 hover:bg-slate-600' : 'bg-blue-600 hover:bg-blue-700'}
                          >
                            {isGenerating ? <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Generating...</> :
                             content ? <><Sparkles className="w-3 h-3 mr-1" /> Regenerate</> :
                             <><Sparkles className="w-3 h-3 mr-1" /> Generate</>}
                          </Button>
                        </div>

                        {/* SOCIAL POSTS CONTENT */}
                        {ct.type === 'social_posts' && content && (
                          <div className="space-y-4 mt-4">
                            {['twitter_posts', 'instagram_captions', 'tiktok_scripts', 'linkedin_posts', 'reddit_posts'].map(platform => {
                              const items = content[platform] as Array<Record<string, string>> | undefined;
                              if (!items || !Array.isArray(items)) return null;
                              const platformLabel: Record<string, string> = {
                                twitter_posts: 'Twitter/X', instagram_captions: 'Instagram',
                                tiktok_scripts: 'TikTok', linkedin_posts: 'LinkedIn', reddit_posts: 'Reddit'
                              };
                              return (
                                <div key={platform}>
                                  <h5 className="text-xs font-semibold text-blue-300 mb-2">{platformLabel[platform] || platform}</h5>
                                  <div className="space-y-2">
                                    {items.map((item, idx) => {
                                      const mainText = item.text || item.caption || item.script || item.body || '';
                                      const fieldId = `${platform}-${idx}`;
                                      return (
                                        <div key={idx} className="p-3 bg-slate-800 rounded-lg">
                                          <div className="flex justify-between items-start gap-2">
                                            <p className="text-sm text-slate-200 whitespace-pre-wrap flex-1">{mainText}</p>
                                            <Button
                                              variant="ghost" size="sm"
                                              className="flex-shrink-0 text-slate-400 hover:text-white"
                                              onClick={() => copyToClipboard(mainText, fieldId)}
                                            >
                                              {copiedField === fieldId ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                            </Button>
                                          </div>
                                          <div className="flex flex-wrap gap-2 mt-2 text-xs text-slate-500">
                                            {item.best_time && <span>Post: {item.best_time}</span>}
                                            {item.goal && <span>Goal: {item.goal}</span>}
                                            {item.image_idea && <span>Image: {item.image_idea}</span>}
                                            {item.hook && <span>Hook: {item.hook}</span>}
                                            {item.sound_suggestion && <span>Sound: {item.sound_suggestion}</span>}
                                            {item.subreddit && <span>{item.subreddit}</span>}
                                            {item.title && <span>Title: {item.title}</span>}
                                            {item.flair && <span>Flair: {item.flair}</span>}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* EMAIL SEQUENCES CONTENT */}
                        {ct.type === 'email_sequences' && content && (
                          <div className="space-y-4 mt-4">
                            {/* Welcome Email */}
                            {content.waitlist_welcome && (
                              <div>
                                <h5 className="text-xs font-semibold text-green-300 mb-2">Waitlist Welcome Email</h5>
                                <div className="p-3 bg-slate-800 rounded-lg">
                                  <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                      <p className="text-xs text-slate-400 mb-1">Subject: <span className="text-green-300">{(content.waitlist_welcome as Record<string, string>).subject}</span></p>
                                      <p className="text-sm text-slate-200 whitespace-pre-wrap">{(content.waitlist_welcome as Record<string, string>).body}</p>
                                    </div>
                                    <Button variant="ghost" size="sm" className="flex-shrink-0 text-slate-400 hover:text-white"
                                      onClick={() => copyToClipboard(`Subject: ${(content.waitlist_welcome as Record<string, string>).subject}\n\n${(content.waitlist_welcome as Record<string, string>).body}`, 'welcome')}>
                                      {copiedField === 'welcome' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}
                            {/* Pre-Launch Sequence */}
                            {content.pre_launch_sequence && Array.isArray(content.pre_launch_sequence) && (
                              <div>
                                <h5 className="text-xs font-semibold text-green-300 mb-2">Pre-Launch Email Sequence</h5>
                                <div className="space-y-2">
                                  {(content.pre_launch_sequence as Array<Record<string, string>>).map((email, idx) => (
                                    <div key={idx} className="p-3 bg-slate-800 rounded-lg">
                                      <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2 mb-1">
                                            <Badge variant="outline" className="text-xs border-green-500/30 text-green-300">Day {email.day}</Badge>
                                            {email.goal && <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">{email.goal}</Badge>}
                                          </div>
                                          <p className="text-xs text-slate-400 mb-1">Subject: <span className="text-green-300">{email.subject}</span></p>
                                          <p className="text-sm text-slate-200 whitespace-pre-wrap">{email.body}</p>
                                        </div>
                                        <Button variant="ghost" size="sm" className="flex-shrink-0 text-slate-400 hover:text-white"
                                          onClick={() => copyToClipboard(`Subject: ${email.subject}\n\n${email.body}`, `prelaunch-${idx}`)}>
                                          {copiedField === `prelaunch-${idx}` ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* Launch Day Email */}
                            {content.launch_day_email && (
                              <div>
                                <h5 className="text-xs font-semibold text-green-300 mb-2">Launch Day Email</h5>
                                <div className="p-3 bg-slate-800 rounded-lg">
                                  <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                      <p className="text-xs text-slate-400 mb-1">Subject: <span className="text-green-300">{(content.launch_day_email as Record<string, string>).subject}</span></p>
                                      <p className="text-sm text-slate-200 whitespace-pre-wrap">{(content.launch_day_email as Record<string, string>).body}</p>
                                    </div>
                                    <Button variant="ghost" size="sm" className="flex-shrink-0 text-slate-400 hover:text-white"
                                      onClick={() => copyToClipboard(`Subject: ${(content.launch_day_email as Record<string, string>).subject}\n\n${(content.launch_day_email as Record<string, string>).body}`, 'launch-email')}>
                                      {copiedField === 'launch-email' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}
                            {/* Post-Launch Followup */}
                            {content.post_launch_followup && Array.isArray(content.post_launch_followup) && (
                              <div>
                                <h5 className="text-xs font-semibold text-green-300 mb-2">Post-Launch Follow-ups</h5>
                                <div className="space-y-2">
                                  {(content.post_launch_followup as Array<Record<string, string>>).map((email, idx) => (
                                    <div key={idx} className="p-3 bg-slate-800 rounded-lg">
                                      <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                          <Badge variant="outline" className="text-xs border-green-500/30 text-green-300 mb-1">Day {email.day}</Badge>
                                          <p className="text-xs text-slate-400 mb-1">Subject: <span className="text-green-300">{email.subject}</span></p>
                                          <p className="text-sm text-slate-200 whitespace-pre-wrap">{email.body}</p>
                                        </div>
                                        <Button variant="ghost" size="sm" className="flex-shrink-0 text-slate-400 hover:text-white"
                                          onClick={() => copyToClipboard(`Subject: ${email.subject}\n\n${email.body}`, `followup-${idx}`)}>
                                          {copiedField === `followup-${idx}` ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* PRESS RELEASE CONTENT */}
                        {ct.type === 'press_release' && content && (
                          <div className="space-y-4 mt-4">
                            {content.press_release && (
                              <div>
                                <div className="flex justify-between items-center mb-2">
                                  <h5 className="text-xs font-semibold text-purple-300">Press Release</h5>
                                  <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white"
                                    onClick={() => copyToClipboard(typeof content.press_release === 'string' ? content.press_release : JSON.stringify(content.press_release, null, 2), 'press-release')}>
                                    {copiedField === 'press-release' ? <Check className="w-3 h-3 text-green-400" /> : <><Copy className="w-3 h-3 mr-1" /> Copy</>}
                                  </Button>
                                </div>
                                <div className="p-3 bg-slate-800 rounded-lg max-h-64 overflow-y-auto">
                                  <p className="text-sm text-slate-200 whitespace-pre-wrap">{typeof content.press_release === 'string' ? content.press_release : (content.press_release as Record<string, string>).text || JSON.stringify(content.press_release, null, 2)}</p>
                                </div>
                              </div>
                            )}
                            {content.media_pitch && (
                              <div>
                                <div className="flex justify-between items-center mb-2">
                                  <h5 className="text-xs font-semibold text-purple-300">Media Pitch Email</h5>
                                  <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white"
                                    onClick={() => copyToClipboard(typeof content.media_pitch === 'string' ? content.media_pitch : (content.media_pitch as Record<string, string>).subject ? `Subject: ${(content.media_pitch as Record<string, string>).subject}\n\n${(content.media_pitch as Record<string, string>).body}` : JSON.stringify(content.media_pitch, null, 2), 'media-pitch')}>
                                    {copiedField === 'media-pitch' ? <Check className="w-3 h-3 text-green-400" /> : <><Copy className="w-3 h-3 mr-1" /> Copy</>}
                                  </Button>
                                </div>
                                <div className="p-3 bg-slate-800 rounded-lg">
                                  {typeof content.media_pitch === 'object' && (content.media_pitch as Record<string, string>).subject && (
                                    <p className="text-xs text-slate-400 mb-1">Subject: <span className="text-purple-300">{(content.media_pitch as Record<string, string>).subject}</span></p>
                                  )}
                                  <p className="text-sm text-slate-200 whitespace-pre-wrap">{typeof content.media_pitch === 'string' ? content.media_pitch : (content.media_pitch as Record<string, string>).body || JSON.stringify(content.media_pitch, null, 2)}</p>
                                </div>
                              </div>
                            )}
                            {content.target_journalists && Array.isArray(content.target_journalists) && (
                              <div>
                                <h5 className="text-xs font-semibold text-purple-300 mb-2">Target Journalists / Publications</h5>
                                <div className="grid grid-cols-2 gap-2">
                                  {(content.target_journalists as Array<Record<string, string>>).map((j, idx) => (
                                    <div key={idx} className="p-2 bg-slate-800 rounded-lg text-xs">
                                      <p className="text-white font-medium">{j.name || j.publication}</p>
                                      {j.publication && j.name && <p className="text-slate-400">{j.publication}</p>}
                                      {j.beat && <p className="text-purple-300">Beat: {j.beat}</p>}
                                      {j.reason && <p className="text-slate-400">{j.reason}</p>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {content.talking_points && Array.isArray(content.talking_points) && (
                              <div>
                                <h5 className="text-xs font-semibold text-purple-300 mb-2">Talking Points</h5>
                                <ul className="space-y-1">
                                  {(content.talking_points as string[]).map((point, idx) => (
                                    <li key={idx} className="text-sm text-slate-300 flex items-start gap-2">
                                      <span className="text-purple-400 mt-0.5">&#8226;</span> {point}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        {/* LANDING PAGE CONTENT */}
                        {ct.type === 'landing_page' && content && (
                          <div className="space-y-4 mt-4">
                            {content.hero && (
                              <div className="p-4 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-lg">
                                <h5 className="text-xs font-semibold text-cyan-300 mb-2">Hero Section</h5>
                                <p className="text-xl font-bold text-white">{(content.hero as Record<string, string>).headline}</p>
                                <p className="text-sm text-slate-300 mt-1">{(content.hero as Record<string, string>).subheadline}</p>
                                <p className="text-sm text-cyan-300 mt-2">{(content.hero as Record<string, string>).cta_text || (content.hero as Record<string, string>).cta}</p>
                                <Button variant="ghost" size="sm" className="mt-2 text-slate-400 hover:text-white"
                                  onClick={() => copyToClipboard(`${(content.hero as Record<string, string>).headline}\n${(content.hero as Record<string, string>).subheadline}\nCTA: ${(content.hero as Record<string, string>).cta_text || (content.hero as Record<string, string>).cta}`, 'hero')}>
                                  {copiedField === 'hero' ? <Check className="w-3 h-3 text-green-400" /> : <><Copy className="w-3 h-3 mr-1" /> Copy</>}
                                </Button>
                              </div>
                            )}
                            {content.features && Array.isArray(content.features) && (
                              <div>
                                <h5 className="text-xs font-semibold text-cyan-300 mb-2">Features</h5>
                                <div className="grid grid-cols-2 gap-2">
                                  {(content.features as Array<Record<string, string>>).map((f, idx) => (
                                    <div key={idx} className="p-3 bg-slate-800 rounded-lg">
                                      <p className="text-sm font-medium text-white">{f.title || f.name}</p>
                                      <p className="text-xs text-slate-400 mt-1">{f.description}</p>
                                      {f.icon && <p className="text-xs text-cyan-300 mt-1">{f.icon}</p>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {content.testimonials && Array.isArray(content.testimonials) && (
                              <div>
                                <h5 className="text-xs font-semibold text-cyan-300 mb-2">Testimonials</h5>
                                <div className="space-y-2">
                                  {(content.testimonials as Array<Record<string, string>>).map((t, idx) => (
                                    <div key={idx} className="p-3 bg-slate-800 rounded-lg">
                                      <p className="text-sm text-slate-200 italic">"{t.quote}"</p>
                                      <p className="text-xs text-cyan-300 mt-1">- {t.name}, {t.title || t.role}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {content.faq && Array.isArray(content.faq) && (
                              <div>
                                <h5 className="text-xs font-semibold text-cyan-300 mb-2">FAQ</h5>
                                <div className="space-y-2">
                                  {(content.faq as Array<Record<string, string>>).map((item, idx) => (
                                    <div key={idx} className="p-3 bg-slate-800 rounded-lg">
                                      <p className="text-sm font-medium text-white">{item.question || item.q}</p>
                                      <p className="text-xs text-slate-300 mt-1">{item.answer || item.a}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {content.meta_tags && (
                              <div>
                                <div className="flex justify-between items-center mb-2">
                                  <h5 className="text-xs font-semibold text-cyan-300">SEO Meta Tags</h5>
                                  <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white"
                                    onClick={() => copyToClipboard(JSON.stringify(content.meta_tags, null, 2), 'meta')}>
                                    {copiedField === 'meta' ? <Check className="w-3 h-3 text-green-400" /> : <><Copy className="w-3 h-3 mr-1" /> Copy</>}
                                  </Button>
                                </div>
                                <div className="p-3 bg-slate-800 rounded-lg text-xs font-mono text-slate-300">
                                  <pre className="whitespace-pre-wrap">{JSON.stringify(content.meta_tags, null, 2)}</pre>
                                </div>
                              </div>
                            )}
                            {content.final_cta && (
                              <div className="p-3 bg-slate-800 rounded-lg">
                                <h5 className="text-xs font-semibold text-cyan-300 mb-1">Final CTA</h5>
                                <p className="text-sm text-white">{typeof content.final_cta === 'string' ? content.final_cta : (content.final_cta as Record<string, string>).text || JSON.stringify(content.final_cta)}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* PRODUCT HUNT CONTENT */}
                        {ct.type === 'product_hunt' && content && (
                          <div className="space-y-4 mt-4">
                            {content.tagline && (
                              <div className="p-3 bg-slate-800 rounded-lg">
                                <div className="flex justify-between items-center">
                                  <div>
                                    <h5 className="text-xs font-semibold text-orange-300 mb-1">Tagline</h5>
                                    <p className="text-sm text-white">{content.tagline as string}</p>
                                  </div>
                                  <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white"
                                    onClick={() => copyToClipboard(content.tagline as string, 'ph-tagline')}>
                                    {copiedField === 'ph-tagline' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                  </Button>
                                </div>
                              </div>
                            )}
                            {content.description && (
                              <div>
                                <div className="flex justify-between items-center mb-2">
                                  <h5 className="text-xs font-semibold text-orange-300">Full Description</h5>
                                  <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white"
                                    onClick={() => copyToClipboard(content.description as string, 'ph-desc')}>
                                    {copiedField === 'ph-desc' ? <Check className="w-3 h-3 text-green-400" /> : <><Copy className="w-3 h-3 mr-1" /> Copy</>}
                                  </Button>
                                </div>
                                <div className="p-3 bg-slate-800 rounded-lg max-h-48 overflow-y-auto">
                                  <p className="text-sm text-slate-200 whitespace-pre-wrap">{content.description as string}</p>
                                </div>
                              </div>
                            )}
                            {content.topics && Array.isArray(content.topics) && (
                              <div>
                                <h5 className="text-xs font-semibold text-orange-300 mb-2">Topics</h5>
                                <div className="flex flex-wrap gap-1">
                                  {(content.topics as string[]).map((topic, idx) => (
                                    <Badge key={idx} variant="outline" className="text-xs border-orange-500/30 text-orange-300">{topic}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            {content.maker_comment && (
                              <div>
                                <div className="flex justify-between items-center mb-2">
                                  <h5 className="text-xs font-semibold text-orange-300">Maker Comment</h5>
                                  <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white"
                                    onClick={() => copyToClipboard(content.maker_comment as string, 'ph-maker')}>
                                    {copiedField === 'ph-maker' ? <Check className="w-3 h-3 text-green-400" /> : <><Copy className="w-3 h-3 mr-1" /> Copy</>}
                                  </Button>
                                </div>
                                <div className="p-3 bg-slate-800 rounded-lg">
                                  <p className="text-sm text-slate-200 whitespace-pre-wrap">{content.maker_comment as string}</p>
                                </div>
                              </div>
                            )}
                            {content.thumbnail_idea && (
                              <div className="p-3 bg-slate-800 rounded-lg">
                                <h5 className="text-xs font-semibold text-orange-300 mb-1">Thumbnail Idea</h5>
                                <p className="text-sm text-slate-300">{typeof content.thumbnail_idea === 'string' ? content.thumbnail_idea : JSON.stringify(content.thumbnail_idea)}</p>
                              </div>
                            )}
                            {content.gallery_slides && Array.isArray(content.gallery_slides) && (
                              <div>
                                <h5 className="text-xs font-semibold text-orange-300 mb-2">Gallery Slides</h5>
                                <div className="space-y-1">
                                  {(content.gallery_slides as Array<Record<string, string>>).map((slide, idx) => (
                                    <div key={idx} className="p-2 bg-slate-800 rounded text-xs text-slate-300">
                                      <span className="text-orange-300 font-medium">Slide {idx + 1}:</span> {slide.title || slide.text || JSON.stringify(slide)}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {content.launch_checklist && Array.isArray(content.launch_checklist) && (
                              <div>
                                <h5 className="text-xs font-semibold text-orange-300 mb-2">Launch Checklist</h5>
                                <div className="space-y-1">
                                  {(content.launch_checklist as string[]).map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-2 text-sm text-slate-300">
                                      <div className="w-4 h-4 rounded border border-slate-600 flex-shrink-0" />
                                      {typeof item === 'string' ? item : (item as unknown as Record<string, string>).task || JSON.stringify(item)}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {content.community_outreach && (
                              <div>
                                <div className="flex justify-between items-center mb-2">
                                  <h5 className="text-xs font-semibold text-orange-300">Community Outreach</h5>
                                  <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white"
                                    onClick={() => copyToClipboard(typeof content.community_outreach === 'string' ? content.community_outreach : JSON.stringify(content.community_outreach, null, 2), 'ph-outreach')}>
                                    {copiedField === 'ph-outreach' ? <Check className="w-3 h-3 text-green-400" /> : <><Copy className="w-3 h-3 mr-1" /> Copy</>}
                                  </Button>
                                </div>
                                <div className="p-3 bg-slate-800 rounded-lg">
                                  <p className="text-sm text-slate-200 whitespace-pre-wrap">{typeof content.community_outreach === 'string' ? content.community_outreach : JSON.stringify(content.community_outreach, null, 2)}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>

            {/* MONETIZATION TAB */}
            <TabsContent value="monetization">
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-6 space-y-6">
                  {!strategy ? (
                    <div className="text-center py-8">
                      <DollarSign className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                      <p className="text-slate-400 mb-4">Generate monetization strategy with AI</p>
                      <Button onClick={handleGenerateStrategy} disabled={strategyLoading} className="bg-blue-600 hover:bg-blue-700">
                        {strategyLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                        Generate Strategy
                      </Button>
                    </div>
                  ) : (
                    <>
                      {/* AI Recommendation */}
                      {strategy.monetization?.recommendation && (
                        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                          <h4 className="text-sm font-semibold text-green-400 flex items-center gap-2 mb-3"><Star className="w-4 h-4" /> AI Recommended Model</h4>
                          <p className="text-xl font-bold text-white mb-1">{strategy.monetization.recommendation.best_model}</p>
                          <p className="text-sm text-slate-300 mb-3">{strategy.monetization.recommendation.reasoning}</p>
                          
                          {strategy.monetization.recommendation.pricing_tiers && (
                            <div className="grid grid-cols-3 gap-3 mb-3">
                              {strategy.monetization.recommendation.pricing_tiers.map((tier: {name: string; price: string; features: string[]}, i: number) => (
                                <div key={i} className="p-3 bg-slate-800 rounded-lg text-center">
                                  <p className="text-sm font-bold text-white">{tier.name}</p>
                                  <p className="text-lg font-bold text-green-400">{tier.price}</p>
                                  <ul className="mt-2 text-xs text-slate-400 space-y-1">
                                    {tier.features?.map((f: string, j: number) => <li key={j}>- {f}</li>)}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          )}

                          {strategy.monetization.recommendation.revenue_projection && (
                            <div className="grid grid-cols-3 gap-3">
                              {Object.entries(strategy.monetization.recommendation.revenue_projection).map(([period, amount]) => (
                                <div key={period} className="text-center">
                                  <p className="text-xs text-slate-400 capitalize">{period.replace('_', ' ')}</p>
                                  <p className="text-lg font-bold text-green-400">{amount as string}</p>
                                </div>
                              ))}
                            </div>
                          )}

                          {strategy.monetization.recommendation.upsell_triggers && (
                            <div className="mt-3">
                              <span className="text-xs text-slate-400">Upsell Triggers:</span>
                              <ul className="mt-1 space-y-1">
                                {strategy.monetization.recommendation.upsell_triggers.map((t: string, i: number) => (
                                  <li key={i} className="text-xs text-green-200">- {t}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Model Comparison */}
                      {strategy.monetization?.comparison && (
                        <div>
                          <h4 className="text-sm font-semibold text-white mb-3">Model Comparison</h4>
                          <div className="space-y-3">
                            {strategy.monetization.comparison.map((model: {model: string; pros: string[]; cons: string[]; best_for: string; conversion_rate: string}, i: number) => (
                              <div key={i} className="p-3 bg-slate-800 rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-medium text-white text-sm">{model.model}</span>
                                  <Badge variant="outline" className="text-xs border-slate-600">Conv: {model.conversion_rate}</Badge>
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                  <div>
                                    <span className="text-green-400">Pros:</span>
                                    <ul className="mt-1 space-y-0.5">
                                      {model.pros?.map((p: string, j: number) => <li key={j} className="text-slate-300">+ {p}</li>)}
                                    </ul>
                                  </div>
                                  <div>
                                    <span className="text-red-400">Cons:</span>
                                    <ul className="mt-1 space-y-0.5">
                                      {model.cons?.map((c: string, j: number) => <li key={j} className="text-slate-300">- {c}</li>)}
                                    </ul>
                                  </div>
                                </div>
                                <p className="text-xs text-blue-300 mt-2">Best for: {model.best_for}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* METRICS TAB */}
            <TabsContent value="metrics">
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-6 space-y-6">
                  {!strategy ? (
                    <div className="text-center py-8">
                      <BarChart3 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                      <p className="text-slate-400 mb-4">Generate metrics tracking plan with AI</p>
                      <Button onClick={handleGenerateStrategy} disabled={strategyLoading} className="bg-blue-600 hover:bg-blue-700">
                        {strategyLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                        Generate Strategy
                      </Button>
                    </div>
                  ) : (
                    <>
                      <h3 className="text-lg font-bold text-white flex items-center gap-2"><BarChart3 className="w-5 h-5 text-blue-400" /> Key Metrics to Track</h3>
                      
                      <div className="grid grid-cols-2 gap-4">
                        {strategy.metrics_plan && Object.entries(strategy.metrics_plan).map(([key, data]) => {
                          const metric = data as {target: string; how_to_improve?: string[]; how_to_achieve?: string[]; how_to_maintain?: string[]; how_to_increase?: string[]};
                          const tips = metric.how_to_improve || metric.how_to_achieve || metric.how_to_maintain || metric.how_to_increase || [];
                          return (
                            <div key={key} className="p-4 bg-slate-800 rounded-lg">
                              <p className="text-xs text-slate-400 capitalize">{key.replace(/_/g, ' ')}</p>
                              <p className="text-2xl font-bold text-blue-400">{metric.target}</p>
                              {tips.length > 0 && (
                                <ul className="mt-2 space-y-1">
                                  {tips.map((tip: string, i: number) => (
                                    <li key={i} className="text-xs text-slate-300">- {tip}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Screenshot Tips */}
                      {strategy.screenshot_tips && strategy.screenshot_tips.length > 0 && (
                        <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                          <h4 className="text-sm font-semibold text-purple-400 mb-2">Screenshot Optimization Tips</h4>
                          <ul className="space-y-1">
                            {strategy.screenshot_tips.map((tip: string, i: number) => (
                              <li key={i} className="text-sm text-purple-200 flex items-start gap-2">
                                <span className="text-purple-400 mt-0.5">&#8226;</span> {tip}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Onboarding Tips */}
                      {strategy.onboarding_tips && strategy.onboarding_tips.length > 0 && (
                        <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                          <h4 className="text-sm font-semibold text-cyan-400 mb-2">Onboarding Optimization</h4>
                          <ul className="space-y-1">
                            {strategy.onboarding_tips.map((tip: string, i: number) => (
                              <li key={i} className="text-sm text-cyan-200 flex items-start gap-2">
                                <span className="text-cyan-400 mt-0.5">&#8226;</span> {tip}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* COMMON MISTAKES TAB */}
            <TabsContent value="mistakes">
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-6 space-y-6">
                  {!strategy ? (
                    <div className="text-center py-8">
                      <AlertTriangle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                      <p className="text-slate-400 mb-4">Get an AI audit of common launch mistakes</p>
                      <Button onClick={handleGenerateStrategy} disabled={strategyLoading} className="bg-blue-600 hover:bg-blue-700">
                        {strategyLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                        Generate Strategy
                      </Button>
                    </div>
                  ) : (
                    <>
                      <h3 className="text-lg font-bold text-white flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-yellow-400" /> Common Mistakes Audit</h3>
                      
                      <div className="space-y-3">
                        {(strategy.common_mistakes || []).map((mistake: {mistake: string; description: string; impact: string; prevention: string; applies_to_you: boolean}, i: number) => (
                          <div key={i} className={`p-4 rounded-lg border ${mistake.applies_to_you ? 'bg-red-500/10 border-red-500/20' : 'bg-slate-800 border-slate-700'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-white text-sm flex items-center gap-2">
                                {mistake.applies_to_you && <AlertTriangle className="w-4 h-4 text-red-400" />}
                                {mistake.mistake}
                              </span>
                              <Badge className={mistake.impact === 'critical' ? 'bg-red-500/20 text-red-300' : mistake.impact === 'high' ? 'bg-orange-500/20 text-orange-300' : 'bg-slate-600 text-slate-300'}>
                                {mistake.impact}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-400">{mistake.description}</p>
                            <div className="mt-2 p-2 bg-slate-900/50 rounded">
                              <span className="text-xs text-green-400">Prevention:</span>
                              <p className="text-xs text-green-200">{mistake.prevention}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {!activeListing && !loading && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-12 text-center">
              <Sparkles className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">No listing generated yet. Complete the questionnaire first.</p>
              <Button onClick={() => setStep('questionnaire')} className="mt-4 bg-blue-600 hover:bg-blue-700">
                Go to Questionnaire
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderPipeline = () => {
    const steps = pipeline?.steps || [];
    const completedSteps = steps.filter(s => s.status === 'completed').length;
    const progress = steps.length ? (completedSteps / steps.length) * 100 : 0;

    // R-Factor step status helper
    const getRStepStatus = (stepName: string) => {
      if (!rFactor?.steps) return null;
      return rFactor.steps.find(rs => rs.step_name === stepName);
    };

    const rStatusIcon = (rStatus: string) => {
      switch (rStatus) {
        case 'real': return <Check className="w-3 h-3 text-green-400" />;
        case 'system_retry': return <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />;
        case 'needs_input': return <AlertTriangle className="w-3 h-3 text-amber-400" />;
        case 'active': return <Check className="w-3 h-3 text-blue-400" />;
        case 'in_progress': return <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />;
        default: return null;
      }
    };

    const rStatusBadge = (rStatus: string) => {
      switch (rStatus) {
        case 'real': return <span className="px-1.5 py-0.5 bg-green-500/20 text-green-300 rounded text-xs font-mono">DONE</span>;
        case 'system_retry': return <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs font-mono animate-pulse">SYSTEM HANDLING</span>;
        case 'needs_input': return <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded text-xs font-mono">YOUR ACTION</span>;
        case 'active': return <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs font-mono">ACTIVE</span>;
        case 'in_progress': return <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs font-mono animate-pulse">RUNNING</span>;
        default: return null;
      }
    };

    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Launch Pipeline</h2>
          <div className="flex gap-2">
            <Button onClick={refreshPipeline} variant="outline" className="border-slate-700 text-slate-300">
              Refresh
            </Button>
            <Badge className={pipeline?.status === 'completed' ? 'bg-green-500' : pipeline?.status === 'failed' ? 'bg-red-500' : 'bg-blue-500'}>
              {pipeline?.status || 'Not started'}
            </Badge>
          </div>
        </div>

        {/* R-FACTOR PANEL */}
        {rFactor && (pipeline?.status === 'completed' || rFactor.steps.length > 0) && (
          <Card className="bg-slate-900/80 border-amber-500/30 mb-6">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-amber-500/20 rounded-lg">
                    <Target className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">R-Factor (Reality Check)</h3>
                    <p className="text-xs text-amber-400">{rFactor.label}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-amber-400">{rFactor.percentage}%</p>
                  <p className="text-xs text-slate-400">automation score</p>
                </div>
              </div>

              {/* Score breakdown — 3 columns */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="p-2 bg-green-500/10 rounded text-center">
                  <p className="text-lg font-bold text-green-400">{rFactor.real_count}</p>
                  <p className="text-xs text-green-300">Done</p>
                </div>
                <div className="p-2 bg-blue-500/10 rounded text-center">
                  <p className="text-lg font-bold text-blue-400">{rFactor.system_retry_count || 0}</p>
                  <p className="text-xs text-blue-300">System Handling</p>
                </div>
                <div className="p-2 bg-amber-500/10 rounded text-center">
                  <p className="text-lg font-bold text-amber-400">{rFactor.needs_input_count || 0}</p>
                  <p className="text-xs text-amber-300">Your Action</p>
                </div>
              </div>

              {/* System handling info */}
              {(rFactor.system_retry_count || 0) > 0 && (
                <div className="mt-3 p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                  <p className="text-xs text-blue-300 flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    System is automatically retrying {rFactor.system_retry_count} step(s). No action needed from you.
                  </p>
                </div>
              )}

              {/* User action items — only things USER must do */}
              {rFactor.next_steps.length > 0 && (
                <div className="mt-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                  <p className="text-xs font-semibold text-amber-300 mb-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Steps that need your action:
                  </p>
                  <ol className="space-y-1">
                    {rFactor.next_steps.map((ns, i) => (
                      <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                        <span className="text-amber-400 font-mono mt-0.5">{i + 1}.</span>
                        <span>{ns}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* All done */}
              {(rFactor.needs_input_count || 0) === 0 && (rFactor.system_retry_count || 0) === 0 && rFactor.real_count === rFactor.total && (
                <div className="mt-3 p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
                  <p className="text-xs text-green-300 flex items-center gap-2">
                    <Check className="w-3 h-3" />
                    All steps completed successfully. Full automation achieved.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-slate-400">{completedSteps}/{steps.length} steps complete</span>
            <span className="text-sm font-semibold text-blue-400">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-3" />
          {steps.some(s => s.status === 'running') && (
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-blue-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Running: {steps.find(s => s.status === 'running')?.step_name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </span>
              <span className="text-xs text-slate-500">~2 min per step</span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {steps.map((s, i) => {
            const rStep = getRStepStatus(s.step_name);
            return (
            <div key={i} className={`flex items-center gap-3 p-3 rounded-lg ${
              s.status === 'completed' ? 'bg-green-500/10' : s.status === 'running' ? 'bg-blue-500/10' :
              s.status === 'failed' ? 'bg-red-500/10' : 'bg-slate-800/50'
            }`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                s.status === 'completed' ? 'bg-green-500' : s.status === 'running' ? 'bg-blue-500' :
                s.status === 'failed' ? 'bg-red-500' : 'bg-slate-700'
              }`}>
                {s.status === 'completed' ? <Check className="w-4 h-4 text-white" /> :
                 s.status === 'running' ? <Loader2 className="w-4 h-4 text-white animate-spin" /> :
                 s.status === 'failed' ? <X className="w-4 h-4 text-white" /> :
                 <span className="text-xs text-slate-400">{s.step_order}</span>}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-white">{s.step_name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</p>
                  {rStep && rStatusBadge(rStep.r_status)}
                </div>
                {rStep && rStep.r_detail && (
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    {rStatusIcon(rStep.r_status)} {rStep.r_detail}
                  </p>
                )}
                {s.log_output && (
                  <p className="text-xs text-slate-400">
                    {s.log_output.includes('[System') || s.log_output.includes('[A ') || s.log_output.includes('[B ') ? (
                      <>
                        {s.log_output.replace(/\[System [ABC]\]|\[A \(API\)\]|\[B \(Browser\)\]|\[C \(User.*?\)\]/g, '').trim()}
                        {s.log_output.includes('[A ') && <span className="ml-2 px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs font-mono">SYS-A</span>}
                        {s.log_output.includes('[B ') && <span className="ml-2 px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded text-xs font-mono">SYS-B</span>}
                        {s.log_output.includes('[System A]') && <span className="ml-2 px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs font-mono">SYS-A</span>}
                      </>
                    ) : s.log_output}
                  </p>
                )}
                {s.error_message && rStep && (
                  <div>
                    {rStep.r_status === 'needs_input' ? (
                      <div className="mt-1 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded">
                        <p className="text-xs text-yellow-300 font-medium">Your action needed</p>
                        <p className="text-xs text-yellow-200/80 mt-0.5">{s.error_message.replace('ACTION NEEDED: ', '').replace(/\[.*?\]/g, '').trim()}</p>
                      </div>
                    ) : rStep.r_status === 'system_retry' ? (
                      <div className="mt-1 p-2 bg-blue-500/10 border border-blue-500/30 rounded">
                        <p className="text-xs text-blue-300 font-medium flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> System auto-retrying...</p>
                        <p className="text-xs text-blue-200/60 mt-0.5">{s.error_message.substring(0, 200)}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-red-400">{s.error_message}</p>
                    )}
                  </div>
                )}
                {s.error_message && !rStep && (
                  <p className="text-xs text-red-400">{s.error_message}</p>
                )}
              </div>
              <Badge variant="outline" className="text-xs border-slate-600">{s.platform}</Badge>
            </div>
            );
          })}
        </div>

        {pipeline?.status === 'failed' && rFactor && (rFactor.needs_input_count || 0) > 0 && (
          <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg text-center">
            <p className="text-amber-300 mb-2">Some steps need your action. Check the items marked "YOUR ACTION" above.</p>
            <p className="text-xs text-slate-400">System-retryable steps will be automatically retried in the background.</p>
          </div>
        )}
        {pipeline?.status === 'failed' && rFactor && (rFactor.needs_input_count || 0) === 0 && (
          <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg text-center">
            <p className="text-blue-300 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> System is automatically retrying failed steps...</p>
            <p className="text-xs text-slate-400 mt-1">No action needed from you. Page will auto-refresh.</p>
          </div>
        )}

        {!pipeline && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-12 text-center">
              <Rocket className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">Pipeline not started yet.</p>
              <Button onClick={() => setStep('review')} className="mt-4 bg-blue-600 hover:bg-blue-700">
                Review Listing First
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  // ==================== MAIN RENDER ====================

  const stepLabels = [
    { key: 'create', label: 'Create' },
    { key: 'questionnaire', label: 'Questionnaire' },
    { key: 'review', label: 'AI Review' },
    { key: 'pipeline', label: 'Pipeline' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-400 hover:text-white">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-xl font-bold text-white">{project?.name || 'New App Launch'}</h1>
        </div>
      </header>

      {/* Step indicator */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="flex items-center gap-2 mb-8">
          {stepLabels.map((s, i) => {
            const isActive = s.key === step || (step === 'generating' && s.key === 'review');
            const isPast = stepLabels.findIndex(sl => sl.key === step) > i;
            return (
              <div key={s.key} className="flex items-center gap-2 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  isActive ? 'bg-blue-500 text-white' : isPast ? 'bg-green-500 text-white' : 'bg-slate-700 text-slate-400'
                }`}>
                  {isPast ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                <span className={`text-xs ${isActive ? 'text-white' : 'text-slate-500'}`}>{s.label}</span>
                {i < stepLabels.length - 1 && <div className={`flex-1 h-0.5 ${isPast ? 'bg-green-500' : 'bg-slate-700'}`} />}
              </div>
            );
          })}
        </div>

        {step === 'create' && renderCreate()}
        {step === 'questionnaire' && renderQuestionnaire()}
        {step === 'generating' && renderGenerating()}
        {step === 'review' && renderReview()}
        {step === 'pipeline' && renderPipeline()}
      </div>
    </div>
  );
}
