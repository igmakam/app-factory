import { useState, useEffect, useRef } from 'react';
import { api, HelixaIdeaSummary, HelixaIdea, PlanterSession, PlanterSessionDetail } from '../lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, Send, Loader2, Brain, Code2, Eye, Play,
  ExternalLink, FileCode, Globe, Rocket,
  Clock, CheckCircle2, AlertCircle, MessageSquare,
  GitPullRequest, History
} from 'lucide-react';

interface Props {
  onBack: () => void;
  initialIdeaId?: number | null;
}

type ViewMode = 'select' | 'building' | 'history';

export default function Planter({ onBack, initialIdeaId }: Props) {
  const [ideas, setIdeas] = useState<HelixaIdeaSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('select');

  // Building state
  const [activeSession, setActiveSession] = useState<PlanterSessionDetail | null>(null);
  const [buildingIdeaName, setBuildingIdeaName] = useState('');
  const [creating, setCreating] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [pollInterval, setPollInterval] = useState<ReturnType<typeof setInterval> | null>(null);

  // History state
  const [sessions, setSessions] = useState<PlanterSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Custom build
  const [customName, setCustomName] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const ideasList = await api.helixa.ideas.list();
        setIdeas(ideasList);
        if (initialIdeaId) {
          const idea = await api.helixa.ideas.get(initialIdeaId);
          startBuild(idea);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    init();
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [initialIdeaId]);

  const startBuild = async (idea: HelixaIdea) => {
    setCreating(true);
    setBuildingIdeaName(idea.idea_name);
    setViewMode('building');
    try {
      const result = await api.planter.build({
        idea_id: idea.id,
        idea_name: idea.idea_name,
        idea_description: idea.structured_idea?.problem_statement || '',
      });
      const sessionDetail: PlanterSessionDetail = {
        id: 0, user_id: 0, idea_id: idea.id, idea_name: idea.idea_name,
        devin_session_id: result.session_id, session_url: result.session_url,
        status: 'running', title: idea.idea_name, pr_url: '', frontend_url: '',
        backend_url: '', repo_url: '', created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setActiveSession(sessionDetail);
      startPolling(result.session_id);
    } catch (e) {
      console.error(e);
      setActiveSession({
        id: 0, user_id: 0, idea_id: idea.id, idea_name: idea.idea_name,
        devin_session_id: '', session_url: '', status: 'error',
        title: 'Failed to create session', pr_url: '', frontend_url: '',
        backend_url: '', repo_url: '', created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } finally {
      setCreating(false);
    }
  };

  const startCustomBuild = async () => {
    if (!customName.trim()) return;
    setCreating(true);
    setBuildingIdeaName(customName);
    setViewMode('building');
    try {
      const result = await api.planter.build({
        idea_name: customName,
        idea_description: customDescription,
      });
      const sessionDetail: PlanterSessionDetail = {
        id: 0, user_id: 0, idea_id: null, idea_name: customName,
        devin_session_id: result.session_id, session_url: result.session_url,
        status: 'running', title: customName, pr_url: '', frontend_url: '',
        backend_url: '', repo_url: '', created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setActiveSession(sessionDetail);
      startPolling(result.session_id);
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  };

  const startPolling = (sessionId: string) => {
    if (pollInterval) clearInterval(pollInterval);
    const interval = setInterval(async () => {
      try {
        const data = await api.planter.getSession(sessionId);
        setActiveSession(data);
        if (['finished', 'error', 'exit', 'suspended'].includes(data.status)) {
          clearInterval(interval);
          setPollInterval(null);
        }
      } catch (e) {
        console.error('Poll error:', e);
      }
    }, 10000);
    setPollInterval(interval);
  };

  const sendMessage = async () => {
    if (!messageInput.trim() || !activeSession?.devin_session_id) return;
    setSendingMessage(true);
    try {
      await api.planter.sendMessage(activeSession.devin_session_id, messageInput);
      setMessageInput('');
    } catch (e) {
      console.error(e);
    } finally {
      setSendingMessage(false);
    }
  };

  const loadHistory = async () => {
    setLoadingSessions(true);
    setViewMode('history');
    try {
      const data = await api.planter.sessions();
      setSessions(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSessions(false);
    }
  };

  const viewSession = async (session: PlanterSession) => {
    setViewMode('building');
    setBuildingIdeaName(session.idea_name);
    try {
      const detail = await api.planter.getSession(session.devin_session_id);
      setActiveSession(detail);
      if (['running', 'working', 'blocked'].includes(detail.status)) {
        startPolling(session.devin_session_id);
      }
    } catch {
      setActiveSession(session as PlanterSessionDetail);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': case 'working': return <Loader2 className="w-4 h-4 animate-spin text-yellow-400" />;
      case 'blocked': return <AlertCircle className="w-4 h-4 text-orange-400" />;
      case 'finished': return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case 'error': case 'exit': return <AlertCircle className="w-4 h-4 text-red-400" />;
      default: return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      running: 'bg-yellow-500/20 text-yellow-400',
      working: 'bg-yellow-500/20 text-yellow-400',
      blocked: 'bg-orange-500/20 text-orange-400',
      finished: 'bg-green-500/20 text-green-400',
      error: 'bg-red-500/20 text-red-400',
      exit: 'bg-red-500/20 text-red-400',
      suspended: 'bg-slate-500/20 text-slate-400',
    };
    const labels: Record<string, string> = {
      running: 'Building...', working: 'Building...', blocked: 'Needs Input',
      finished: 'Complete', error: 'Error', exit: 'Stopped', suspended: 'Paused',
    };
    return (
      <Badge className={`text-xs ${colors[status] || 'bg-slate-500/20 text-slate-400'}`}>
        {labels[status] || status}
      </Badge>
    );
  };

  const scoreColor = (s: number) => s >= 8 ? 'text-green-400' : s >= 6 ? 'text-yellow-400' : 'text-red-400';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-950">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 mt-4">Loading Planter...</p>
        </div>
      </div>
    );
  }

  // ==================== HISTORY VIEW ====================
  if (viewMode === 'history') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-950">
        <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setViewMode('select')} className="text-slate-400 hover:text-white">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
                  <History className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-white">Build History</h1>
                  <p className="text-xs text-emerald-400">Previous Devin sessions</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-8">
          {loadingSessions ? (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-400 mx-auto" />
              <p className="text-slate-400 mt-2">Loading sessions...</p>
            </div>
          ) : sessions.length === 0 ? (
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-12 text-center">
                <History className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">No builds yet</h3>
                <p className="text-slate-400">Start building an app from your ideas</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {sessions.map(session => (
                <Card
                  key={session.id}
                  className="bg-slate-900/50 border-slate-800 hover:border-emerald-600/50 cursor-pointer transition-all"
                  onClick={() => viewSession(session)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(session.status)}
                        <div>
                          <h3 className="font-semibold text-white">{session.idea_name || session.title || 'Untitled'}</h3>
                          <p className="text-xs text-slate-500">{new Date(session.created_at).toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(session.status)}
                        {session.session_url && (
                          <Button size="sm" variant="ghost" className="text-slate-400 text-xs"
                            onClick={(e) => { e.stopPropagation(); window.open(session.session_url, '_blank'); }}>
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  // ==================== BUILDING VIEW ====================
  if (viewMode === 'building') {
    return (
      <div className="h-screen flex flex-col bg-slate-950">
        <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm shrink-0">
          <div className="px-4 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Button variant="ghost" size="sm" onClick={() => { setViewMode('select'); setActiveSession(null); if (pollInterval) { clearInterval(pollInterval); setPollInterval(null); } }} className="text-slate-400 hover:text-white flex-shrink-0">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 bg-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Code2 className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-sm font-bold text-white truncate">{buildingIdeaName}</h1>
                  <p className="text-xs text-emerald-400">Planter Builder</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {activeSession && getStatusBadge(activeSession.status)}
              {activeSession?.session_url && (
                <Button size="sm" variant="outline" className="border-emerald-700 text-emerald-400 text-xs hidden sm:flex"
                  onClick={() => window.open(activeSession.session_url, '_blank')}>
                  <ExternalLink className="w-3 h-3 mr-1" /> Devin Session
                </Button>
              )}
              {activeSession?.pr_url && (
                <Button size="sm" variant="outline" className="border-blue-700 text-blue-400 text-xs hidden sm:flex"
                  onClick={() => window.open(activeSession.pr_url, '_blank')}>
                  <GitPullRequest className="w-3 h-3 mr-1" /> PR
                </Button>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left Panel - Session Info (full width on mobile) */}
          <div className="w-full md:w-1/2 md:border-r border-slate-800 flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {creating && (
                <div className="flex items-center gap-3 p-4 bg-emerald-900/20 border border-emerald-700/30 rounded-lg">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                  <div>
                    <p className="text-sm text-white font-medium">Creating Devin session...</p>
                    <p className="text-xs text-slate-400">Setting up autonomous build for {buildingIdeaName}</p>
                  </div>
                </div>
              )}

              {activeSession && !creating && (
                <>
                  <Card className="bg-slate-900/50 border-slate-800">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        {getStatusIcon(activeSession.status)}
                        <h3 className="text-sm font-semibold text-white">Session Status</h3>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Status</span>
                          <span className="text-white capitalize">{activeSession.status}</span>
                        </div>
                        {activeSession.title && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Title</span>
                            <span className="text-white">{activeSession.title}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-slate-400">Session ID</span>
                          <span className="text-slate-300 font-mono text-[10px]">{activeSession.devin_session_id}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Started</span>
                          <span className="text-white">{new Date(activeSession.created_at).toLocaleTimeString()}</span>
                        </div>
                        {activeSession.updated_at && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Last Update</span>
                            <span className="text-white">{new Date(activeSession.updated_at).toLocaleTimeString()}</span>
                          </div>
                        )}
                      </div>
                      <div className="mt-3 space-y-1.5">
                        {activeSession.session_url && (
                          <a href={activeSession.session_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                            <Eye className="w-3 h-3" /> Watch Devin build in real-time
                          </a>
                        )}
                        {activeSession.pr_url && (
                          <a href={activeSession.pr_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                            <GitPullRequest className="w-3 h-3" /> View Pull Request
                          </a>
                        )}
                        {activeSession.repo_url && (
                          <a href={activeSession.repo_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 transition-colors">
                            <FileCode className="w-3 h-3" /> GitHub Repository
                          </a>
                        )}
                        {activeSession.frontend_url && (
                          <a href={activeSession.frontend_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300 transition-colors">
                            <Globe className="w-3 h-3" /> Live Frontend
                          </a>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {(activeSession.status === 'running' || activeSession.status === 'working') && (
                    <div className="p-3 bg-yellow-900/20 border border-yellow-700/30 rounded-lg">
                      <p className="text-xs text-yellow-400 font-medium">Devin is building your app autonomously</p>
                      <p className="text-xs text-slate-400 mt-1">Click "Devin Session" to watch progress in real-time. You can also send instructions below.</p>
                    </div>
                  )}
                  {activeSession.status === 'blocked' && (
                    <div className="p-3 bg-orange-900/20 border border-orange-700/30 rounded-lg">
                      <p className="text-xs text-orange-400 font-medium">Devin needs your input</p>
                      <p className="text-xs text-slate-400 mt-1">Open the Devin session to see what's needed, or send a message below.</p>
                    </div>
                  )}
                  {activeSession.status === 'finished' && (
                    <div className="p-3 bg-green-900/20 border border-green-700/30 rounded-lg">
                      <p className="text-xs text-green-400 font-medium">Build complete!</p>
                      <p className="text-xs text-slate-400 mt-1">Your app has been built and deployed. Check the session for deployed URLs.</p>
                    </div>
                  )}
                  {activeSession.status === 'error' && (
                    <div className="p-3 bg-red-900/20 border border-red-700/30 rounded-lg">
                      <p className="text-xs text-red-400 font-medium">Build encountered an error</p>
                      <p className="text-xs text-slate-400 mt-1">Open the Devin session to see details.</p>
                    </div>
                  )}
                  {pollInterval && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                      Auto-refreshing status every 10s
                    </div>
                  )}

                  {/* Mobile-only: prominent session link since iframe is hidden */}
                  {activeSession.session_url && (
                    <div className="md:hidden space-y-2">
                      <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => window.open(activeSession.session_url, '_blank')}>
                        <Eye className="w-4 h-4 mr-2" /> Watch Devin Build Live
                      </Button>
                      {activeSession.pr_url && (
                        <Button variant="outline" className="w-full border-blue-700 text-blue-400"
                          onClick={() => window.open(activeSession.pr_url, '_blank')}>
                          <GitPullRequest className="w-4 h-4 mr-2" /> View Pull Request
                        </Button>
                      )}
                      {activeSession.frontend_url && (
                        <Button variant="outline" className="w-full border-green-700 text-green-400"
                          onClick={() => window.open(activeSession.frontend_url, '_blank')}>
                          <Globe className="w-4 h-4 mr-2" /> Open Live App
                        </Button>
                      )}
                    </div>
                  )}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>

            {activeSession && ['running', 'working', 'blocked'].includes(activeSession.status) && (
              <div className="border-t border-slate-800 p-3">
                <div className="flex gap-2">
                  <Input
                    value={messageInput}
                    onChange={e => setMessageInput(e.target.value)}
                    placeholder="Send instructions to Devin..."
                    className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                    onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  />
                  <Button onClick={sendMessage} disabled={!messageInput.trim() || sendingMessage} className="bg-emerald-600 hover:bg-emerald-700">
                    {sendingMessage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Messages are sent directly to the Devin session</p>
              </div>
            )}
          </div>

          {/* Right Panel - Devin Session Embed (hidden on mobile) */}
          <div className="hidden md:flex md:w-1/2 flex-col">
            <div className="border-b border-slate-800 px-3 py-1.5 flex items-center gap-2">
              <div className="flex items-center gap-1 px-3 py-1 rounded text-xs bg-emerald-600/20 text-emerald-400">
                <Eye className="w-3 h-3" /> Live Session
              </div>
              {activeSession?.session_url && (
                <Button size="sm" variant="ghost" className="ml-auto text-slate-500 text-xs"
                  onClick={() => window.open(activeSession.session_url, '_blank')}>
                  <ExternalLink className="w-3 h-3 mr-1" /> Open Full View
                </Button>
              )}
            </div>
            <div className="flex-1 bg-slate-900">
              {activeSession?.session_url ? (
                <iframe
                  src={activeSession.session_url}
                  className="w-full h-full border-0"
                  title="Devin Session"
                  allow="clipboard-read; clipboard-write"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-slate-500">
                  <div className="text-center">
                    <Eye className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p className="text-lg">Devin Session Preview</p>
                    <p className="text-sm mt-1">
                      {creating ? 'Creating session...' : 'Session will appear here when active'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== IDEA SELECTION VIEW ====================
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-950">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-400 hover:text-white">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
                <Code2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Planter</h1>
                <p className="text-xs text-emerald-400">Autonomous App Builder (Powered by Devin AI)</p>
              </div>
            </div>
          </div>
          <Button size="sm" variant="outline" className="border-slate-700 text-slate-400" onClick={loadHistory}>
            <History className="w-4 h-4 mr-1" /> Build History
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">Build an App Autonomously</h2>
          <p className="text-slate-400">Select a HELIXA idea or describe a new app. Devin AI will build it end-to-end.</p>
        </div>

        <Card className="bg-slate-900/50 border-slate-800 mb-6">
          <CardContent className="p-4">
            {!showCustom ? (
              <Button variant="outline" className="w-full border-dashed border-emerald-700/50 text-emerald-400 hover:bg-emerald-900/20"
                onClick={() => setShowCustom(true)}>
                <MessageSquare className="w-4 h-4 mr-2" /> Build from custom description
              </Button>
            ) : (
              <div className="space-y-3">
                <Input value={customName} onChange={e => setCustomName(e.target.value)}
                  placeholder="App name (e.g., Task Tracker Pro)"
                  className="bg-slate-800 border-slate-700 text-white" />
                <Input value={customDescription} onChange={e => setCustomDescription(e.target.value)}
                  placeholder="Describe what the app should do..."
                  className="bg-slate-800 border-slate-700 text-white" />
                <div className="flex gap-2">
                  <Button onClick={startCustomBuild} disabled={!customName.trim() || creating} className="bg-emerald-600 hover:bg-emerald-700">
                    {creating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Rocket className="w-4 h-4 mr-1" />}
                    Start Building
                  </Button>
                  <Button variant="ghost" onClick={() => setShowCustom(false)} className="text-slate-400">Cancel</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {ideas.length === 0 ? (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-12 text-center">
              <Brain className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">No ideas yet</h3>
              <p className="text-slate-400 mb-4">Go to HELIXA first to capture and score your app ideas, or use custom build above</p>
              <Button onClick={onBack} className="bg-indigo-600 hover:bg-indigo-700">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {ideas.map(idea => (
              <Card key={idea.id}
                className="bg-slate-900/50 border-slate-800 hover:border-emerald-600/50 cursor-pointer transition-all"
                onClick={async () => { const full = await api.helixa.ideas.get(idea.id); startBuild(full); }}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-white truncate flex-1">{idea.idea_name}</h3>
                    <span className={`text-xl font-bold ml-2 ${scoreColor(idea.overall_score)}`}>{idea.overall_score}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">{idea.product_type}</Badge>
                    <span className="text-xs text-slate-500">{new Date(idea.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-1 text-xs text-emerald-400">
                    <Play className="w-3 h-3" /> Click to build with Devin AI
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
