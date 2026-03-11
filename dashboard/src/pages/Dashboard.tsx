import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth-context';
import { api, DashboardData, Project, CredentialStatus } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { getFriendlyError } from '@/lib/error-messages';
import {
  Rocket, Settings, Plus, LogOut, BarChart3, Zap, Globe, Shield, Brain, Code2, Trash2, X, Loader2,
  LayoutDashboard, Search, ArrowUpDown, Filter, ChevronDown
} from 'lucide-react';
import SetupWizard from './SetupWizard';
import ProjectFlow from './ProjectFlow';
import HelixaModule from './HelixaModule';
import Planter from './Planter';
import OnboardingTour, { shouldShowOnboarding } from '@/components/OnboardingTour';
import Tooltip from '@/components/Tooltip';

type View = 'dashboard' | 'setup' | 'project' | 'helixa' | 'planter';
type SortOption = 'name_asc' | 'name_desc' | 'date_newest' | 'date_oldest' | 'status';
type StatusFilter = 'all' | 'setup' | 'questionnaire_done' | 'listing_generated' | 'pipeline_running' | 'submitted' | 'live' | 'pipeline_failed';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [view, setView] = useState<View>('dashboard');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [credStatus, setCredStatus] = useState<CredentialStatus[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [planterIdeaId, setPlanterIdeaId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteProjectId, setDeleteProjectId] = useState<number | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date_newest');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const loadData = async () => {
    try {
      const [d, p, c] = await Promise.all([
        api.dashboard.get(),
        api.projects.list(),
        api.credentials.status(),
      ]);
      setDashboard(d);
      setProjects(p);
      setCredStatus(c);
    } catch (err) {
      console.error(err);
      const friendly = getFriendlyError(err);
      toast({ title: friendly.title, description: friendly.description + (friendly.action ? ' ' + friendly.action : ''), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (shouldShowOnboarding()) setShowOnboarding(true);
  }, []);

  const configuredCreds = credStatus.filter(c => c.is_configured).length;
  const validCreds = credStatus.filter(c => c.is_valid).length;

  const openProject = (id: number) => {
    setSelectedProjectId(id);
    setView('project');
  };

  const handleDeleteProject = async () => {
    if (!deleteProjectId || !deletePassword) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api.projects.delete(deleteProjectId, deletePassword);
      setDeleteProjectId(null);
      setDeletePassword('');
      toast({ title: 'Project deleted' });
      await loadData();
    } catch (err) {
      const friendly = getFriendlyError(err);
      setDeleteError(friendly.description + (friendly.action ? ' ' + friendly.action : ''));
    } finally {
      setDeleting(false);
    }
  };

  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      setup: 'bg-slate-500', questionnaire_done: 'bg-yellow-500', listing_generated: 'bg-blue-500',
      pipeline_running: 'bg-blue-500', submitted: 'bg-green-500', pipeline_failed: 'bg-blue-500', live: 'bg-green-500',
    };
    return map[status] || 'bg-slate-500';
  };

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      setup: 'Setup', questionnaire_done: 'Questionnaire Done', listing_generated: 'Listing Ready',
      pipeline_running: 'Pipeline Executing...', submitted: 'Pipeline Complete', pipeline_failed: 'System Handling...', live: 'Live',
    };
    return map[status] || status;
  };

  const filteredProjects = projects
    .filter(p => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !(p.bundle_id && p.bundle_id.toLowerCase().includes(q))) return false;
      }
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name_asc': return a.name.localeCompare(b.name);
        case 'name_desc': return b.name.localeCompare(a.name);
        case 'date_newest': return (b.id || 0) - (a.id || 0);
        case 'date_oldest': return (a.id || 0) - (b.id || 0);
        case 'status': return a.status.localeCompare(b.status);
        default: return 0;
      }
    });

  const sortLabels: Record<SortOption, string> = {
    name_asc: 'Name (A-Z)', name_desc: 'Name (Z-A)', date_newest: 'Newest First', date_oldest: 'Oldest First', status: 'By Status',
  };
  const filterLabels: Record<StatusFilter, string> = {
    all: 'All', setup: 'Setup', questionnaire_done: 'Questionnaire Done', listing_generated: 'Listing Ready',
    pipeline_running: 'Pipeline Running', submitted: 'Complete', live: 'Live', pipeline_failed: 'Failed',
  };

  if (view === 'setup') {
    return <SetupWizard onBack={() => { setView('dashboard'); loadData(); }} />;
  }

  if (view === 'project') {
    return <ProjectFlow projectId={selectedProjectId} onBack={() => { setView('dashboard'); loadData(); }} />;
  }

  if (view === 'helixa') {
    return <HelixaModule onBack={() => { setView('dashboard'); loadData(); }} onBuildApp={(ideaId) => { setPlanterIdeaId(ideaId); setView('planter'); }} />;
  }

  if (view === 'planter') {
    return <Planter onBack={() => { setPlanterIdeaId(null); setView('dashboard'); loadData(); }} initialIdeaId={planterIdeaId} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950">
        <div className="w-full max-w-7xl mx-auto px-4 py-8 space-y-6 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3"><div className="w-8 h-8 bg-slate-800 rounded-lg" /><div className="h-6 w-32 bg-slate-800 rounded" /></div>
            <div className="h-8 w-20 bg-slate-800 rounded" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-20 bg-slate-800/50 rounded-xl" />)}
          </div>
          <div className="grid md:grid-cols-2 gap-4"><div className="h-20 bg-slate-800/30 rounded-xl" /><div className="h-20 bg-slate-800/30 rounded-xl" /></div>
          <div className="h-32 bg-slate-800/30 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 pb-20 md:pb-0">
      {showOnboarding && <OnboardingTour onComplete={() => setShowOnboarding(false)} />}
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Auto Launch" className="h-8 w-8" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <h1 className="text-xl font-bold text-white">Auto Launch</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400 hidden sm:inline truncate max-w-48">{user?.email}</span>
            <Tooltip content="Sign out of your account">
              <Button variant="ghost" size="sm" onClick={logout} className="text-slate-400 hover:text-white">
                <LogOut className="w-4 h-4" />
              </Button>
            </Tooltip>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 md:py-8">
        {/* Quick Launch CTA */}
        <Card className="bg-gradient-to-r from-blue-600/20 to-indigo-600/20 border-blue-500/30 mb-6 md:mb-8">
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-500/20 rounded-xl"><Rocket className="w-8 h-8 text-blue-400" /></div>
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-white">Launch a New App</h2>
                  <p className="text-sm text-blue-300/70">From idea to App Store in one click</p>
                </div>
              </div>
              <Tooltip content="Create and launch a new application">
                <Button onClick={() => { setSelectedProjectId(null); setView('project'); }} className="bg-blue-600 hover:bg-blue-700 text-white h-12 px-6 text-base font-semibold">
                  <Plus className="w-5 h-5 mr-2" /> New App
                </Button>
              </Tooltip>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg"><Rocket className="w-5 h-5 text-blue-400" /></div>
                <div>
                  <p className="text-2xl font-bold text-white">{dashboard?.total_projects || 0}</p>
                  <p className="text-xs text-slate-400">Total Projects</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg"><Globe className="w-5 h-5 text-green-400" /></div>
                <div>
                  <p className="text-2xl font-bold text-white">{dashboard?.projects_live || 0}</p>
                  <p className="text-xs text-slate-400">Apps Live</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/20 rounded-lg"><Zap className="w-5 h-5 text-purple-400" /></div>
                <div>
                  <p className="text-2xl font-bold text-white">{dashboard?.total_generations || 0}</p>
                  <p className="text-xs text-slate-400">AI Generations</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500/20 rounded-lg"><BarChart3 className="w-5 h-5 text-orange-400" /></div>
                <div>
                  <p className="text-2xl font-bold text-white">{dashboard?.total_tokens_used?.toLocaleString() || 0}</p>
                  <p className="text-xs text-slate-400">AI Tokens Used</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* HELIXA + Planter Modules - hidden on mobile (accessed via bottom nav) */}
        <div className="hidden md:grid md:grid-cols-2 gap-4 mb-8">
          <Card className="bg-indigo-900/20 border-indigo-800/30 cursor-pointer hover:border-indigo-600 transition-colors" title="Capture and score app ideas with AI" onClick={() => setView('helixa')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/20 rounded-lg">
                    <Brain className="w-6 h-6 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">HELIXA</h3>
                    <p className="text-xs text-indigo-400">Idea Capture & Scoring</p>
                  </div>
                </div>
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                  <Brain className="w-4 h-4 mr-1" /> Open
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-emerald-900/20 border-emerald-800/30 cursor-pointer hover:border-emerald-600 transition-colors" title="Build apps autonomously from ideas using Devin AI" onClick={() => setView('planter')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/20 rounded-lg">
                    <Code2 className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">Planter</h3>
                    <p className="text-xs text-emerald-400">Autonomous App Builder</p>
                  </div>
                </div>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                  <Code2 className="w-4 h-4 mr-1" /> Open
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Setup Status */}
        <Card className="bg-slate-900/50 border-slate-800 mb-8">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white flex items-center gap-2">
                <Shield className="w-5 h-5" /> Setup Status
              </CardTitle>
              <Tooltip content="Configure API keys and signing certificates">
                <Button size="sm" onClick={() => setView('setup')} className="bg-blue-600 hover:bg-blue-700">
                  <Settings className="w-4 h-4 mr-1" /> Configure
                </Button>
              </Tooltip>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {['apple', 'google', 'github', 'ios_signing', 'android_signing'].map(type => {
                const cred = credStatus.find(c => c.credential_type === type);
                const labels: Record<string, string> = {
                  apple: 'Apple Developer', google: 'Google Play', github: 'GitHub',
                  ios_signing: 'iOS Signing', android_signing: 'Android Signing'
                };
                return (
                  <div key={type} className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/50">
                    <div className={`w-2 h-2 rounded-full ${cred?.is_valid ? 'bg-green-400' : cred?.is_configured ? 'bg-yellow-400' : 'bg-slate-600'}`} />
                    <span className="text-xs text-slate-300">{labels[type]}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-2">{configuredCreds}/5 configured, {validCreds}/5 validated</p>
          </CardContent>
        </Card>

        {/* Projects with sorting & filtering */}
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h2 className="text-lg font-semibold text-white shrink-0">Projects</h2>
          <div className="flex items-center gap-2 flex-1 justify-end flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search projects..." className="pl-8 h-8 w-40 bg-slate-800/50 border-slate-700 text-white text-xs" />
            </div>
            <div className="relative">
              <Tooltip content="Sort projects">
                <Button variant="outline" size="sm" className="border-slate-700 text-slate-300 h-8 text-xs gap-1" onClick={() => { setShowSortMenu(!showSortMenu); setShowFilterMenu(false); }}>
                  <ArrowUpDown className="w-3.5 h-3.5" /> {sortLabels[sortBy]} <ChevronDown className="w-3 h-3" />
                </Button>
              </Tooltip>
              {showSortMenu && (
                <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-30 py-1 min-w-36">
                  {(Object.keys(sortLabels) as SortOption[]).map(opt => (
                    <button key={opt} onClick={() => { setSortBy(opt); setShowSortMenu(false); }}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${sortBy === opt ? 'text-blue-400 bg-blue-500/10' : 'text-slate-300 hover:bg-slate-700'}`}>
                      {sortLabels[opt]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <Tooltip content="Filter by project status">
                <Button variant="outline" size="sm" className={`border-slate-700 h-8 text-xs gap-1 ${statusFilter !== 'all' ? 'text-blue-400 border-blue-500/50' : 'text-slate-300'}`}
                  onClick={() => { setShowFilterMenu(!showFilterMenu); setShowSortMenu(false); }}>
                  <Filter className="w-3.5 h-3.5" /> {filterLabels[statusFilter]} <ChevronDown className="w-3 h-3" />
                </Button>
              </Tooltip>
              {showFilterMenu && (
                <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-30 py-1 min-w-36">
                  {(Object.keys(filterLabels) as StatusFilter[]).map(opt => (
                    <button key={opt} onClick={() => { setStatusFilter(opt); setShowFilterMenu(false); }}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${statusFilter === opt ? 'text-blue-400 bg-blue-500/10' : 'text-slate-300 hover:bg-slate-700'}`}>
                      {filterLabels[opt]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Tooltip content="Create and launch a new application">
              <Button onClick={() => { setSelectedProjectId(null); setView('project'); }} size="sm" className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">New App</span><span className="sm:hidden">New</span>
              </Button>
            </Tooltip>
          </div>
        </div>

        {(statusFilter !== 'all' || searchQuery) && (
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {statusFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500/10 border border-blue-500/30 rounded-full text-xs text-blue-300">
                Status: {filterLabels[statusFilter]}
                <button onClick={() => setStatusFilter('all')} className="hover:text-white"><X className="w-3 h-3" /></button>
              </span>
            )}
            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500/10 border border-blue-500/30 rounded-full text-xs text-blue-300">
                Search: "{searchQuery}"
                <button onClick={() => setSearchQuery('')} className="hover:text-white"><X className="w-3 h-3" /></button>
              </span>
            )}
            <span className="text-xs text-slate-500">{filteredProjects.length} of {projects.length} projects</span>
          </div>
        )}

        {projects.length === 0 ? (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-12 text-center">
              <Rocket className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">No projects yet</h3>
              <p className="text-slate-400 mb-6">Start by configuring your credentials, then launch your first app!</p>
              <div className="flex gap-3 justify-center">
                <Button onClick={() => setView('setup')} variant="outline" className="border-slate-700 text-slate-300">
                  <Settings className="w-4 h-4 mr-1" /> Setup Credentials
                </Button>
                <Button onClick={() => { setSelectedProjectId(null); setView('project'); }} className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4 mr-1" /> Launch First App
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {filteredProjects.map(p => (
              <Card key={p.id} className="bg-slate-900/50 border-slate-800 hover:border-slate-700 cursor-pointer transition-colors" onClick={() => openProject(p.id)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0 mr-2">
                      <h3 className="font-semibold text-white truncate">{p.name}</h3>
                      <p className="text-xs text-slate-400">{p.bundle_id || 'No bundle ID'}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={`${statusColor(p.status)} text-white text-xs`}>
                        {statusLabel(p.status)}
                      </Badge>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteProjectId(p.id); setDeletePassword(''); setDeleteError(''); }}
                        className="p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
                        title="Delete project"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span>Platform: {p.platform}</span>
                    <span>{p.questionnaire_complete ? 'Questionnaire done' : 'Questionnaire pending'}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    {p.questionnaire_complete && <div className="w-2 h-2 rounded-full bg-green-400" />}
                    {p.listing_generated && <div className="w-2 h-2 rounded-full bg-blue-400" />}
                    {p.status === 'live' && <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Mobile Bottom Tab Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 z-50">
        <div className="flex items-center justify-around py-2 px-2">
          {[
            { key: 'dashboard' as View, icon: LayoutDashboard, label: 'Home' },
            { key: 'helixa' as View, icon: Brain, label: 'HELIXA' },
            { key: 'planter' as View, icon: Code2, label: 'Planter' },
            { key: 'setup' as View, icon: Settings, label: 'Setup' },
          ].map(tab => {
            const isActive = view === tab.key;
            return (
              <button key={tab.key} onClick={() => setView(tab.key)}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors min-w-[60px] ${
                  isActive ? 'text-blue-400 bg-blue-500/10' : 'text-slate-500 hover:text-slate-300'
                }`}>
                <tab.icon className={`w-5 h-5 ${isActive ? 'text-blue-400' : ''}`} />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Delete confirmation dialog */}
      {(showSortMenu || showFilterMenu) && (
        <div className="fixed inset-0 z-20" onClick={() => { setShowSortMenu(false); setShowFilterMenu(false); }} />
      )}

      {deleteProjectId !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Delete Project</h3>
              <button onClick={() => { setDeleteProjectId(null); setDeletePassword(''); setDeleteError(''); }} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-4">Enter your password to confirm deletion. This action cannot be undone.</p>
            <Input
              type="password"
              placeholder="Your password"
              value={deletePassword}
              onChange={e => setDeletePassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleDeleteProject()}
              className="bg-slate-800 border-slate-700 text-white mb-3"
              autoFocus
            />
            {deleteError && <p className="text-red-400 text-sm mb-3">{deleteError}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 border-slate-700 text-slate-300" onClick={() => { setDeleteProjectId(null); setDeletePassword(''); setDeleteError(''); }}>
                Cancel
              </Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={handleDeleteProject} disabled={!deletePassword || deleting}>
                {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
