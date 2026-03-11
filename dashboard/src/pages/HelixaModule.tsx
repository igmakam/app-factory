import { useState, useEffect, useRef, useCallback } from 'react';
import { api, HelixaIdeaSummary, HelixaIdea, HelixaSynthesizedIdea, HelixaExperimentalIdea, HelixaExperimentalStats } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import {
  ArrowLeft, Mic, MicOff, Send, Brain, Lightbulb, FlaskConical, Trash2,
  ChevronRight, Loader2, Check, X, MessageSquare, Rocket, BarChart3,
  Zap, Target, DollarSign, Bot, Star, TrendingUp, Search
} from 'lucide-react';

interface Props {
  onBack: () => void;
  onBuildApp?: (ideaId: number) => void;
}

// ============ VOICE RECORDER ============

function VoiceRecorder({ onTranscript, onTextSubmit, autoSubmitVoice = true }: { onTranscript: (text: string) => void; onTextSubmit: (text: string) => void; autoSubmitVoice?: boolean }) {
  const [recording, setRecording] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunks.current = [];
      recorder.ondataavailable = (e) => chunks.current.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        setTranscribing(true);
        try {
          const result = await api.helixa.transcribe(blob);
          const transcribedText = result.text;
          onTranscript(transcribedText);
          setTextInput(transcribedText);
          // Auto-submit voice recordings so they are always saved
          if (autoSubmitVoice && transcribedText.trim()) {
            onTextSubmit(transcribedText.trim());
            setTextInput('');
          }
        } catch {
          toast({
            title: 'Transcription failed',
            description: 'Try typing your idea instead.',
            variant: 'destructive',
          });
        } finally {
          setTranscribing(false);
        }
      };
      recorder.start();
      mediaRecorder.current = recorder;
      setRecording(true);
    } catch {
      toast({
        title: 'Microphone access denied',
        description: 'Please type your idea instead.',
        variant: 'destructive',
      });
    }
  };

  const stopRecording = () => {
    mediaRecorder.current?.stop();
    setRecording(false);
  };

  const handleSubmit = () => {
    if (textInput.trim()) {
      onTextSubmit(textInput.trim());
      setTextInput('');
    }
  };

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-indigo-400 text-lg flex items-center gap-2">
          <Lightbulb className="w-5 h-5" /> Capture New Idea
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Button
            onClick={recording ? stopRecording : startRecording}
            disabled={transcribing}
            className={recording ? 'bg-red-600 hover:bg-red-700 animate-pulse' : 'bg-indigo-600 hover:bg-indigo-700'}
            size="sm"
          >
            {transcribing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : recording ? <MicOff className="w-4 h-4 mr-1" /> : <Mic className="w-4 h-4 mr-1" />}
            {transcribing ? 'Transcribing...' : recording ? 'Stop Recording' : 'Voice Capture'}
          </Button>
        </div>
        <div className="flex gap-2">
          <Input
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Or type your idea here..."
            className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
          <Button onClick={handleSubmit} disabled={!textInput.trim()} className="bg-indigo-600 hover:bg-indigo-700" size="sm">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============ IDEA LIST ============

function IdeaList({ ideas, selectedId, onSelect, searchQuery, onSearchChange }: { ideas: HelixaIdeaSummary[]; selectedId: number | null; onSelect: (id: number) => void; searchQuery?: string; onSearchChange?: (q: string) => void }) {
  const filteredIdeas = searchQuery
    ? ideas.filter(i => i.idea_name.toLowerCase().includes(searchQuery.toLowerCase()) || i.product_type.toLowerCase().includes(searchQuery.toLowerCase()))
    : ideas;
  const scoreColor = (s: number) => s >= 8 ? 'text-green-400' : s >= 6 ? 'text-yellow-400' : 'text-red-400';
  const typeBadge = (t: string) => {
    const colors: Record<string, string> = {
      SaaS: 'bg-blue-500/20 text-blue-400', Marketplace: 'bg-purple-500/20 text-purple-400',
      Tool: 'bg-green-500/20 text-green-400', Platform: 'bg-orange-500/20 text-orange-400',
      Infra: 'bg-red-500/20 text-red-400', Other: 'bg-slate-500/20 text-slate-400',
    };
    return colors[t] || colors.Other;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider shrink-0">
          Ideas ({ideas.length})
        </h3>
        {ideas.length > 3 && onSearchChange && (
          <div className="relative flex-1 max-w-52">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
            <Input
              value={searchQuery || ''}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="Search..."
              className="pl-7 h-7 bg-slate-800/50 border-slate-700 text-white text-xs"
            />
          </div>
        )}
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
        {filteredIdeas.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Brain className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>{searchQuery ? 'No matching ideas.' : 'No ideas yet. Capture your first idea above!'}</p>
          </div>
        ) : (
          filteredIdeas.map(idea => (
            <div
              key={idea.id}
              onClick={() => onSelect(idea.id)}
              className={`p-3 rounded-lg cursor-pointer transition-all border ${
                selectedId === idea.id
                  ? 'bg-indigo-900/30 border-indigo-500'
                  : 'bg-slate-800/30 border-slate-700 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h4 className="text-white font-medium text-sm truncate">{idea.idea_name}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className={`${typeBadge(idea.product_type)} text-xs px-1.5 py-0`}>{idea.product_type}</Badge>
                    <span className="text-xs text-slate-500">{new Date(idea.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-bold ${scoreColor(idea.overall_score)}`}>{idea.overall_score}</span>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ============ SCORE BAR ============

function ScoreBar({ label, value, max = 10 }: { label: string; value: number; max?: number }) {
  const pct = (value / max) * 100;
  const color = value >= 8 ? 'bg-green-500' : value >= 6 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="text-white font-medium">{value}/{max}</span>
      </div>
      <div className="w-full bg-slate-700 rounded-full h-2">
        <div className={`${color} rounded-full h-2 transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ============ IDEA DETAIL ============

function IdeaDetail({ idea, onDelete, onCreateApp, onBack }: { idea: HelixaIdea; onDelete: () => void; onCreateApp: () => void; onBack?: () => void }) {
  const [detailTab, setDetailTab] = useState('concept');

  return (
    <div className="space-y-4">
      {onBack && (
        <Button onClick={onBack} size="sm" variant="ghost" className="text-slate-400 hover:text-white md:hidden">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Ideas
        </Button>
      )}
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-bold text-white truncate">{idea.idea_name}</h3>
          <p className="text-sm text-slate-400">{idea.product_type} | Score: <span className="text-indigo-400 font-bold">{idea.overall_score}</span></p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button onClick={onCreateApp} size="sm" className="bg-green-600 hover:bg-green-700">
            <Rocket className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">Create App</span>
          </Button>
          <Button onClick={onDelete} size="sm" variant="ghost" className="text-red-400 hover:text-red-300">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Tabs value={detailTab} onValueChange={setDetailTab}>
        <TabsList className="bg-slate-800 border-slate-700 w-full justify-start flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="concept" className="data-[state=active]:bg-indigo-600 text-xs"><Target className="w-3 h-3 mr-1" />Concept</TabsTrigger>
          <TabsTrigger value="scores" className="data-[state=active]:bg-indigo-600 text-xs"><BarChart3 className="w-3 h-3 mr-1" />Scores</TabsTrigger>
          <TabsTrigger value="valuation" className="data-[state=active]:bg-indigo-600 text-xs"><DollarSign className="w-3 h-3 mr-1" />Valuation</TabsTrigger>
          <TabsTrigger value="brief" className="data-[state=active]:bg-indigo-600 text-xs"><Zap className="w-3 h-3 mr-1" />Build Brief</TabsTrigger>
          <TabsTrigger value="autonomy" className="data-[state=active]:bg-indigo-600 text-xs"><Bot className="w-3 h-3 mr-1" />Devin AI</TabsTrigger>
        </TabsList>

        <TabsContent value="concept" className="mt-3">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4 space-y-3">
              <div>
                <h4 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Problem</h4>
                <p className="text-sm text-slate-300 mt-1">{idea.structured_idea?.problem_statement}</p>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Solution</h4>
                <p className="text-sm text-slate-300 mt-1">{idea.structured_idea?.proposed_solution}</p>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Target Users</h4>
                <p className="text-sm text-slate-300 mt-1">{idea.structured_idea?.target_users}</p>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Use Case</h4>
                <p className="text-sm text-slate-300 mt-1">{idea.structured_idea?.use_case}</p>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Monetization</h4>
                <p className="text-sm text-slate-300 mt-1">{idea.structured_idea?.monetization_model}</p>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Core Value</h4>
                <p className="text-sm text-slate-300 mt-1">{idea.structured_idea?.core_value_proposition}</p>
              </div>
              <div className="pt-2 border-t border-slate-700">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Raw Input</h4>
                <p className="text-xs text-slate-500 mt-1 italic">"{idea.raw_input}"</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scores" className="mt-3">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4 space-y-3">
              <div className="text-center mb-4">
                <span className="text-4xl font-bold text-indigo-400">{idea.scores?.overall_score ?? idea.overall_score}</span>
                <p className="text-xs text-slate-500 mt-1">Overall Score (Weighted)</p>
              </div>
              <ScoreBar label="Viability (25%)" value={idea.scores?.viability_score ?? 0} />
              <ScoreBar label="Market Demand (25%)" value={idea.scores?.market_demand ?? 0} />
              <ScoreBar label="Competition (15%)" value={idea.scores?.competition_density ?? 0} />
              <ScoreBar label="Monetization (15%)" value={idea.scores?.monetization_strength ?? 0} />
              <ScoreBar label="Build Complexity (10%)" value={idea.scores?.build_complexity ?? 0} />
              <ScoreBar label="Scalability (10%)" value={idea.scores?.scalability ?? 0} />
              {idea.scores?.scoring_notes && (
                <div className="pt-3 border-t border-slate-700 space-y-2">
                  <h4 className="text-xs font-semibold text-indigo-400 uppercase">Scoring Notes</h4>
                  {Object.entries(idea.scores.scoring_notes).map(([k, v]) => (
                    <div key={k} className="text-xs">
                      <span className="text-slate-400 capitalize">{k.replace(/_/g, ' ')}: </span>
                      <span className="text-slate-300">{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="valuation" className="mt-3">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4 space-y-4">
              {idea.valuation?.summary && (() => {
                const s = idea.valuation.summary;
                const recVal = String(s.recommended_valuation || (s.recommended ? `$${s.recommended}M` : 'N/A'));
                const rangeLow = String(s.valuation_range_low || (s.range_low ? `$${s.range_low}M` : '-'));
                const rangeHigh = String(s.valuation_range_high || (s.range_high ? `$${s.range_high}M` : '-'));
                const conf = String(s.confidence_level || s.confidence || '-');
                const stage = String(s.stage_assessment || s.stage || '-');
                return (
                  <div className="text-center p-4 bg-indigo-900/20 rounded-lg border border-indigo-800/30">
                    <p className="text-xs text-indigo-400 uppercase font-semibold">Recommended Valuation</p>
                    <p className="text-2xl font-bold text-white mt-1">{recVal}</p>
                    <p className="text-xs text-slate-400 mt-1">Range: {rangeLow} - {rangeHigh}</p>
                    <p className="text-xs text-slate-500 mt-1">Confidence: {conf} | Stage: {stage}</p>
                  </div>
                );
              })()}
              {idea.valuation?.berkus_method && (() => {
                const bm = idea.valuation.berkus_method;
                const factors = bm.factors as Array<{factor: string; value: number}> | undefined;
                const total = String(bm.total_valuation || (bm.total ? `$${bm.total}M` : '-'));
                return (
                  <div>
                    <h4 className="text-xs font-semibold text-indigo-400 uppercase mb-2">Berkus Method</h4>
                    {factors ? factors.map((f, i) => (
                      <div key={i} className="flex justify-between text-xs py-1 border-b border-slate-700/50">
                        <span className="text-slate-400">{f.factor}</span>
                        <span className="text-white">${(f.value / 1000).toFixed(0)}K</span>
                      </div>
                    )) : Object.entries(bm).filter(([k]) => k !== 'total' && k !== 'total_valuation').map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs py-1 border-b border-slate-700/50">
                        <span className="text-slate-400 capitalize">{k.replace(/_/g, ' ')}</span>
                        <span className="text-white">${typeof v === 'number' ? (v >= 1000 ? `${(v/1000).toFixed(0)}K` : `${(v * 1000).toFixed(0)}K`) : String(v)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm font-bold mt-2 text-indigo-400">
                      <span>Total</span>
                      <span>{total}</span>
                    </div>
                  </div>
                );
              })()}
              {idea.valuation?.unit_economics && (() => {
                const ue = idea.valuation.unit_economics;
                const arpu = Number(ue.arpu_monthly || ue.ARPU || ue.arpu || 0);
                const cac = Number(ue.cac || ue.CAC || 0);
                const ltv = Number(ue.ltv || ue.LTV || 0);
                const ltvCac = Number(ue.ltv_cac_ratio || ue.LTV_CAC_Ratio || ue.ltv_cac || 0);
                return (
                  <div>
                    <h4 className="text-xs font-semibold text-indigo-400 uppercase mb-2">Unit Economics</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-900/50 p-2 rounded">
                        <span className="text-slate-500">ARPU</span>
                        <p className="text-white font-medium">${arpu}/mo</p>
                      </div>
                      <div className="bg-slate-900/50 p-2 rounded">
                        <span className="text-slate-500">CAC</span>
                        <p className="text-white font-medium">${cac}</p>
                      </div>
                      <div className="bg-slate-900/50 p-2 rounded">
                        <span className="text-slate-500">LTV</span>
                        <p className="text-white font-medium">${ltv}</p>
                      </div>
                      <div className="bg-slate-900/50 p-2 rounded">
                        <span className="text-slate-500">LTV/CAC</span>
                        <p className="text-white font-medium">{ltvCac}x</p>
                      </div>
                    </div>
                  </div>
                );
              })()}
              {idea.valuation?.risk_factors && idea.valuation.risk_factors.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-red-400 uppercase mb-1">Risk Factors</h4>
                  <ul className="space-y-1">{idea.valuation.risk_factors.map((r, i) => (
                    <li key={i} className="text-xs text-slate-400 flex items-start gap-1"><X className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />{r}</li>
                  ))}</ul>
                </div>
              )}
              {idea.valuation?.upside_catalysts && idea.valuation.upside_catalysts.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-green-400 uppercase mb-1">Upside Catalysts</h4>
                  <ul className="space-y-1">{idea.valuation.upside_catalysts.map((u, i) => (
                    <li key={i} className="text-xs text-slate-400 flex items-start gap-1"><TrendingUp className="w-3 h-3 text-green-400 mt-0.5 shrink-0" />{u}</li>
                  ))}</ul>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="brief" className="mt-3">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4 space-y-3">
              <div>
                <h4 className="text-xs font-semibold text-indigo-400 uppercase">Product</h4>
                <p className="text-white font-medium">{idea.build_brief?.product_name}</p>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-indigo-400 uppercase">Problem</h4>
                <p className="text-sm text-slate-300">{idea.build_brief?.problem}</p>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-indigo-400 uppercase">Solution</h4>
                <p className="text-sm text-slate-300">{idea.build_brief?.solution}</p>
              </div>
              {idea.build_brief?.core_features && (
                <div>
                  <h4 className="text-xs font-semibold text-indigo-400 uppercase">Core Features</h4>
                  <ul className="mt-1 space-y-1">{idea.build_brief.core_features.map((f, i) => (
                    <li key={i} className="text-xs text-slate-300 flex items-start gap-1"><Check className="w-3 h-3 text-green-400 mt-0.5 shrink-0" />{f}</li>
                  ))}</ul>
                </div>
              )}
              {idea.build_brief?.mvp_scope && (
                <div>
                  <h4 className="text-xs font-semibold text-indigo-400 uppercase">MVP Scope</h4>
                  <ul className="mt-1 space-y-1">{idea.build_brief.mvp_scope.map((m, i) => (
                    <li key={i} className="text-xs text-slate-300 flex items-start gap-1"><Star className="w-3 h-3 text-yellow-400 mt-0.5 shrink-0" />{m}</li>
                  ))}</ul>
                </div>
              )}
              {idea.build_brief?.suggested_tech_stack && (
                <div>
                  <h4 className="text-xs font-semibold text-indigo-400 uppercase">Tech Stack</h4>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {Object.entries(idea.build_brief.suggested_tech_stack).map(([k, v]) => (
                      <Badge key={k} className="bg-slate-700 text-slate-300 text-xs">{k}: {v}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {idea.build_brief?.basic_user_flow && (
                <div>
                  <h4 className="text-xs font-semibold text-indigo-400 uppercase">User Flow</h4>
                  <ol className="mt-1 space-y-1">{idea.build_brief.basic_user_flow.map((s, i) => (
                    <li key={i} className="text-xs text-slate-300"><span className="text-indigo-400 font-bold mr-1">{i + 1}.</span>{s}</li>
                  ))}</ol>
                </div>
              )}
              <div className="pt-3 border-t border-slate-700">
                <Button onClick={onCreateApp} className="w-full bg-green-600 hover:bg-green-700">
                  <Rocket className="w-4 h-4 mr-2" /> Create App from This Brief
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="autonomy" className="mt-3">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4 space-y-3">
              <div className="text-center p-3 bg-indigo-900/20 rounded-lg border border-indigo-800/30">
                <p className="text-xs text-indigo-400 uppercase font-semibold">Autonomy Score</p>
                <p className="text-3xl font-bold text-white mt-1">{idea.autonomy?.autonomy_score ?? 'N/A'}/10</p>
                <Badge className={`mt-1 ${
                  idea.autonomy?.feasibility_verdict?.includes('Fully') ? 'bg-green-500/20 text-green-400' :
                  idea.autonomy?.feasibility_verdict?.includes('Mostly') ? 'bg-blue-500/20 text-blue-400' :
                  'bg-yellow-500/20 text-yellow-400'
                }`}>{idea.autonomy?.feasibility_verdict}</Badge>
                <p className="text-xs text-slate-500 mt-1">Est. Build: {idea.autonomy?.estimated_build_time}</p>
              </div>
              {idea.autonomy?.capabilities && (
                <div>
                  <h4 className="text-xs font-semibold text-indigo-400 uppercase mb-2">Capabilities Breakdown</h4>
                  {idea.autonomy.capabilities.map((c, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-700/50">
                      <span className="text-xs text-slate-300">{c.area}</span>
                      <div className="flex items-center gap-2">
                        <Badge className={`text-xs px-1.5 py-0 ${
                          c.status === 'can_do' ? 'bg-green-500/20 text-green-400' :
                          c.status === 'partial' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>{c.score}/10</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {idea.autonomy?.what_devin_can_do && (
                <div>
                  <h4 className="text-xs font-semibold text-green-400 uppercase mb-1">What AI Can Do</h4>
                  <ul className="space-y-1">{idea.autonomy.what_devin_can_do.map((d, i) => (
                    <li key={i} className="text-xs text-slate-400 flex items-start gap-1"><Check className="w-3 h-3 text-green-400 mt-0.5 shrink-0" />{d}</li>
                  ))}</ul>
                </div>
              )}
              {idea.autonomy?.what_user_must_do && (
                <div>
                  <h4 className="text-xs font-semibold text-yellow-400 uppercase mb-1">What You Must Do</h4>
                  <ul className="space-y-1">{idea.autonomy.what_user_must_do.map((d, i) => (
                    <li key={i} className="text-xs text-slate-400 flex items-start gap-1"><MessageSquare className="w-3 h-3 text-yellow-400 mt-0.5 shrink-0" />{d}</li>
                  ))}</ul>
                </div>
              )}
              {idea.autonomy?.recommendation && (
                <div className="p-3 bg-slate-900/50 rounded-lg">
                  <h4 className="text-xs font-semibold text-indigo-400 uppercase mb-1">Recommendation</h4>
                  <p className="text-xs text-slate-300">{idea.autonomy.recommendation}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============ SYNTHESIS PANEL ============

function SynthesisPanel({ items, onGenerate, onFeedback, onDelete, generating }: {
  items: HelixaSynthesizedIdea[];
  onGenerate: () => void;
  onFeedback: (id: number, status: string, comment?: string) => void;
  onDelete: (id: number) => void;
  generating: boolean;
}) {
  const [commentId, setCommentId] = useState<number | null>(null);
  const [commentText, setCommentText] = useState('');

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      pending: 'bg-slate-500/20 text-slate-400', approved: 'bg-green-500/20 text-green-400',
      rejected: 'bg-red-500/20 text-red-400', revised: 'bg-blue-500/20 text-blue-400',
    };
    return map[s] || map.pending;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Brain className="w-5 h-5 text-indigo-400" /> Idea Synthesis
        </h3>
        <Button onClick={onGenerate} disabled={generating} size="sm" className="bg-indigo-600 hover:bg-indigo-700">
          {generating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Zap className="w-4 h-4 mr-1" />}
          {generating ? 'Synthesizing...' : 'Generate Hybrids'}
        </Button>
      </div>
      <p className="text-xs text-slate-500">AI combines your existing ideas to create innovative hybrid concepts.</p>

      {items.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <Brain className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No synthesized ideas yet. Click "Generate Hybrids" to create some!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <Card key={item.id} className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h4 className="text-white font-medium text-sm">{item.title}</h4>
                    <p className="text-xs text-slate-400 mt-1">{item.description}</p>
                  </div>
                  <Badge className={`${statusBadge(item.status)} text-xs ml-2 shrink-0`}>{item.status}</Badge>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {item.source_idea_names?.map((name, i) => (
                    <Badge key={i} className="bg-slate-700 text-slate-400 text-xs">{name}</Badge>
                  ))}
                </div>
                {item.concept && (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    {item.concept.unique_angle && (
                      <div className="col-span-2 bg-indigo-900/20 p-2 rounded">
                        <span className="text-indigo-400 font-semibold">Unique Angle: </span>
                        <span className="text-slate-300">{item.concept.unique_angle}</span>
                      </div>
                    )}
                    {item.concept.monetization && (
                      <div className="bg-slate-900/50 p-2 rounded">
                        <span className="text-slate-500">Monetization: </span>
                        <span className="text-slate-300">{item.concept.monetization}</span>
                      </div>
                    )}
                    {item.concept.estimated_potential && (
                      <div className="bg-slate-900/50 p-2 rounded">
                        <span className="text-slate-500">Potential: </span>
                        <span className="text-slate-300">{item.concept.estimated_potential}</span>
                      </div>
                    )}
                  </div>
                )}
                {item.ai_revision && (
                  <div className="mt-2 p-2 bg-blue-900/20 rounded text-xs border border-blue-800/30">
                    <span className="text-blue-400 font-semibold">AI Revision: </span>
                    <span className="text-slate-300">{item.ai_revision}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-700/50">
                  <Button size="sm" variant="ghost" className="text-green-400 hover:text-green-300 text-xs h-7"
                    onClick={() => onFeedback(item.id, 'approved')}>
                    <Check className="w-3 h-3 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 text-xs h-7"
                    onClick={() => onFeedback(item.id, 'rejected')}>
                    <X className="w-3 h-3 mr-1" /> Reject
                  </Button>
                  <Button size="sm" variant="ghost" className="text-blue-400 hover:text-blue-300 text-xs h-7"
                    onClick={() => setCommentId(commentId === item.id ? null : item.id)}>
                    <MessageSquare className="w-3 h-3 mr-1" /> Comment
                  </Button>
                  <Button size="sm" variant="ghost" className="text-slate-500 hover:text-red-400 text-xs h-7 ml-auto"
                    onClick={() => onDelete(item.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
                {commentId === item.id && (
                  <div className="flex gap-2 mt-2">
                    <Input
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Your feedback for AI refinement..."
                      className="bg-slate-900 border-slate-600 text-white text-xs h-8"
                    />
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 h-8" onClick={() => {
                      if (commentText.trim()) { onFeedback(item.id, 'comment', commentText); setCommentText(''); setCommentId(null); }
                    }}>
                      <Send className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ EXPERIMENTAL PANEL ============

function ExperimentalPanel({ items, stats, onGenerate, onFeedback, onDelete, generating }: {
  items: HelixaExperimentalIdea[];
  stats: HelixaExperimentalStats | null;
  onGenerate: () => void;
  onFeedback: (id: number, status: string, comment?: string) => void;
  onDelete: (id: number) => void;
  generating: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-indigo-400" /> Experimental Lab
        </h3>
        <Button onClick={onGenerate} disabled={generating} size="sm" className="bg-indigo-600 hover:bg-indigo-700">
          {generating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <FlaskConical className="w-4 h-4 mr-1" />}
          {generating ? 'Generating...' : 'Generate Idea'}
        </Button>
      </div>

      {stats && stats.total > 0 && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {[
            { label: 'Total', value: stats.total, icon: Brain },
            { label: 'Avg Score', value: stats.avg_score, icon: BarChart3 },
            { label: 'Best', value: stats.best_score, icon: Star },
            { label: '8+ Ideas', value: stats.above_8_count, icon: TrendingUp },
            { label: '9+ Ideas', value: stats.above_9_count, icon: Zap },
            { label: 'Success', value: `${stats.success_rate}%`, icon: Target },
          ].map((s, i) => (
            <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-lg p-2 text-center">
              <s.icon className="w-4 h-4 text-indigo-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-white">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <FlaskConical className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No experimental ideas yet. Generate one!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const scoreColor = item.overall_score >= 8 ? 'text-green-400' : item.overall_score >= 6 ? 'text-yellow-400' : 'text-red-400';
            return (
              <Card key={item.id} className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-white font-medium text-sm">{item.idea_name}</h4>
                        <Badge className="bg-slate-700 text-slate-400 text-xs">{item.product_type}</Badge>
                        <Badge className={`text-xs ${item.status === 'approved' ? 'bg-green-500/20 text-green-400' : item.status === 'rejected' ? 'bg-red-500/20 text-red-400' : 'bg-slate-500/20 text-slate-400'}`}>{item.status}</Badge>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{item.description}</p>
                      {item.learning_note && (
                        <p className="text-xs text-indigo-400 mt-1 italic">Note: {item.learning_note}</p>
                      )}
                    </div>
                    <div className="text-right ml-3">
                      <span className={`text-xl font-bold ${scoreColor}`}>{item.overall_score}</span>
                      <p className="text-xs text-slate-500">#{item.generation_number}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-700/50">
                    <Button size="sm" variant="ghost" className="text-green-400 hover:text-green-300 text-xs h-7"
                      onClick={() => onFeedback(item.id, 'approved')}>
                      <Check className="w-3 h-3 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 text-xs h-7"
                      onClick={() => onFeedback(item.id, 'rejected')}>
                      <X className="w-3 h-3 mr-1" /> Reject
                    </Button>
                    <Button size="sm" variant="ghost" className="text-slate-500 hover:text-red-400 text-xs h-7 ml-auto"
                      onClick={() => onDelete(item.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============ MAIN MODULE ============

export default function HelixaModule({ onBack, onBuildApp }: Props) {
  const [mainTab, setMainTab] = useState('ideas');
  const [ideas, setIdeas] = useState<HelixaIdeaSummary[]>([]);
  const [selectedIdea, setSelectedIdea] = useState<HelixaIdea | null>(null);
  const [selectedIdeaId, setSelectedIdeaId] = useState<number | null>(null);
  const [synthesized, setSynthesized] = useState<HelixaSynthesizedIdea[]>([]);
  const [experimental, setExperimental] = useState<HelixaExperimentalIdea[]>([]);
  const [expStats, setExpStats] = useState<HelixaExperimentalStats | null>(null);
  const [processing, setProcessing] = useState(false);
  const [synthGenerating, setSynthGenerating] = useState(false);
  const [expGenerating, setExpGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dataImported, setDataImported] = useState(false);

  const loadIdeas = useCallback(async () => {
    try {
      const data = await api.helixa.ideas.list();
      setIdeas(data);
    } catch (e) { console.error(e); }
  }, []);

  const loadSynthesized = useCallback(async () => {
    try {
      const data = await api.helixa.synthesized.list();
      setSynthesized(data);
    } catch (e) { console.error(e); }
  }, []);

  const loadExperimental = useCallback(async () => {
    try {
      const [data, stats] = await Promise.all([
        api.helixa.experimental.list(),
        api.helixa.experimental.stats(),
      ]);
      setExperimental(data);
      setExpStats(stats);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      // Auto-import data on first load
      if (!dataImported) {
        try {
          await api.helixa.importData();
          setDataImported(true);
        } catch { /* already imported or no data */ }
      }
      await Promise.all([loadIdeas(), loadSynthesized(), loadExperimental()]);
      setLoading(false);
    };
    init();
  }, [dataImported, loadIdeas, loadSynthesized, loadExperimental]);

  const selectIdea = async (id: number) => {
    setSelectedIdeaId(id);
    try {
      const detail = await api.helixa.ideas.get(id);
      setSelectedIdea(detail);
    } catch (e) { console.error(e); }
  };

  const processIdea = async (text: string) => {
    setProcessing(true);
    try {
      const result = await api.helixa.ideas.process(text);
      await loadIdeas();
      setSelectedIdea(result);
      setSelectedIdeaId(result.id);
    } catch (e) {
      console.error(e);
      toast({ title: 'Failed to process idea', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  type DeleteTarget = { kind: 'idea' | 'synth' | 'exp'; id: number };
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [ideaSearchQuery, setIdeaSearchQuery] = useState('');

  const deleteIdea = async (id: number) => {
    await api.helixa.ideas.delete(id);
    toast({ title: 'Idea deleted' });
    if (selectedIdeaId === id) { setSelectedIdea(null); setSelectedIdeaId(null); }
    await loadIdeas();
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true);
    try {
      if (deleteTarget.kind === 'idea') {
        await deleteIdea(deleteTarget.id);
      } else if (deleteTarget.kind === 'synth') {
        await deleteSynth(deleteTarget.id);
      } else {
        await deleteExp(deleteTarget.id);
      }
    } catch (e) {
      console.error(e);
      toast({ title: 'Delete failed', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setDeleteBusy(false);
      setDeleteTarget(null);
    }
  };

  const createAppFromIdea = (id: number) => {
    if (onBuildApp) {
      onBuildApp(id);
    }
  };

  const generateSynthesis = async () => {
    setSynthGenerating(true);
    try {
      await api.helixa.synthesized.generate();
      await loadSynthesized();
    } catch (e) {
      console.error(e);
      toast({ title: 'Synthesis failed', description: 'Need at least 2 ideas.', variant: 'destructive' });
    } finally {
      setSynthGenerating(false);
    }
  };

  const synthFeedback = async (id: number, status: string, comment?: string) => {
    await api.helixa.synthesized.feedback(id, status, comment || '');
    await loadSynthesized();
  };

  const deleteSynth = async (id: number) => {
    await api.helixa.synthesized.delete(id);
    toast({ title: 'Synthesized idea deleted' });
    await loadSynthesized();
  };

  const generateExperimental = async () => {
    setExpGenerating(true);
    try {
      await api.helixa.experimental.generate();
      await loadExperimental();
    } catch (e) {
      console.error(e);
      toast({ title: 'Generation failed', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setExpGenerating(false);
    }
  };

  const expFeedback = async (id: number, status: string, comment?: string) => {
    await api.helixa.experimental.feedback(id, status, comment || '');
    await loadExperimental();
  };

  const deleteExp = async (id: number) => {
    await api.helixa.experimental.delete(id);
    toast({ title: 'Experimental idea deleted' });
    await loadExperimental();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 mt-4">Loading HELIXA...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-400 hover:text-white">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">HELIXA</h1>
                <p className="text-xs text-indigo-400">Voice-First Idea Capture & Scoring</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="hidden sm:inline">{ideas.length} ideas</span>
            <span className="hidden sm:inline">|</span>
            <span className="hidden sm:inline">{synthesized.length} synth</span>
            <span className="hidden sm:inline">|</span>
            <span className="hidden sm:inline">{experimental.length} exp</span>
            <span className="sm:hidden">{ideas.length + synthesized.length + experimental.length} total</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <Tabs value={mainTab} onValueChange={setMainTab}>
          <TabsList className="bg-slate-800/50 border border-slate-700 mb-6">
            <TabsTrigger value="ideas" className="data-[state=active]:bg-indigo-600">
              <Lightbulb className="w-4 h-4 mr-1" /> Ideas ({ideas.length})
            </TabsTrigger>
            <TabsTrigger value="synthesis" className="data-[state=active]:bg-indigo-600">
              <Brain className="w-4 h-4 mr-1" /> Synthesis ({synthesized.length})
            </TabsTrigger>
            <TabsTrigger value="experimental" className="data-[state=active]:bg-indigo-600">
              <FlaskConical className="w-4 h-4 mr-1" /> Lab ({experimental.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ideas">
            {/* Mobile: show either list OR detail, not both */}
            {selectedIdea ? (
              <div className="md:hidden">
                <IdeaDetail
                  idea={selectedIdea}
                  onDelete={() => setDeleteTarget({ kind: 'idea', id: selectedIdea.id })}
                  onCreateApp={() => createAppFromIdea(selectedIdea.id)}
                  onBack={() => { setSelectedIdea(null); setSelectedIdeaId(null); }}
                />
              </div>
            ) : (
              <div className="md:hidden space-y-4">
                <VoiceRecorder
                  onTranscript={() => {}}
                  onTextSubmit={processIdea}
                />
                {processing && (
                  <Card className="bg-indigo-900/20 border-indigo-800/30">
                    <CardContent className="p-4 flex items-center gap-3">
                      <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                      <div>
                        <p className="text-sm text-white">Processing idea...</p>
                        <p className="text-xs text-slate-400">5-step AI pipeline</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
                <IdeaList ideas={ideas} selectedId={selectedIdeaId} onSelect={selectIdea} searchQuery={ideaSearchQuery} onSearchChange={setIdeaSearchQuery} />
              </div>
            )}

            {/* Desktop: side-by-side layout */}
            <div className="hidden md:grid md:grid-cols-5 gap-6">
              {/* Left panel - capture + list */}
              <div className="md:col-span-2 space-y-4">
                <VoiceRecorder
                  onTranscript={() => {}}
                  onTextSubmit={processIdea}
                />
                {processing && (
                  <Card className="bg-indigo-900/20 border-indigo-800/30">
                    <CardContent className="p-4 flex items-center gap-3">
                      <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                      <div>
                        <p className="text-sm text-white">Processing idea...</p>
                        <p className="text-xs text-slate-400">5-step AI pipeline: Structure → Score → Valuate → Brief → Autonomy</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
                <IdeaList ideas={ideas} selectedId={selectedIdeaId} onSelect={selectIdea} searchQuery={ideaSearchQuery} onSearchChange={setIdeaSearchQuery} />
              </div>

              {/* Right panel - detail */}
              <div className="md:col-span-3">
                {selectedIdea ? (
                  <IdeaDetail
                    idea={selectedIdea}
                    onDelete={() => setDeleteTarget({ kind: 'idea', id: selectedIdea.id })}
                    onCreateApp={() => createAppFromIdea(selectedIdea.id)}
                  />
                ) : (
                  <Card className="bg-slate-800/30 border-slate-700 h-full min-h-64">
                    <CardContent className="flex items-center justify-center h-full p-12">
                      <div className="text-center text-slate-500">
                        <Brain className="w-16 h-16 mx-auto mb-4 opacity-30" />
                        <p className="text-lg">Select an idea to view details</p>
                        <p className="text-sm mt-1">Or capture a new one using voice or text</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="synthesis">
            <SynthesisPanel
              items={synthesized}
              onGenerate={generateSynthesis}
              onFeedback={synthFeedback}
              onDelete={(id) => setDeleteTarget({ kind: 'synth', id })}
              generating={synthGenerating}
            />
          </TabsContent>

          <TabsContent value="experimental">
            <ExperimentalPanel
              items={experimental}
              stats={expStats}
              onGenerate={generateExperimental}
              onFeedback={expFeedback}
              onDelete={(id) => setDeleteTarget({ kind: 'exp', id })}
              generating={expGenerating}
            />
          </TabsContent>
        </Tabs>
      </main>

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Delete item</h3>
              <button onClick={() => setDeleteTarget(null)} className="text-slate-400 hover:text-white" disabled={deleteBusy}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-4">This action cannot be undone.</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 border-slate-700 text-slate-300" onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>
                Cancel
              </Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={confirmDelete} disabled={deleteBusy}>
                {deleteBusy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
