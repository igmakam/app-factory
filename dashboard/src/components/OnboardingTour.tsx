import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Rocket, Brain, Code2, Settings, Sparkles, ArrowRight, X } from 'lucide-react';

const ONBOARDING_KEY = 'autolauncher_onboarding_done';

interface OnboardingTourProps {
  onComplete: () => void;
}

const steps = [
  {
    icon: Rocket,
    iconBg: 'bg-blue-500/20',
    iconColor: 'text-blue-400',
    title: 'Welcome to Auto Launch',
    description: 'Your autonomous app launch platform. We\'ll guide you through the key features so you can get started fast.',
    detail: 'Auto Launch helps you go from idea to published app on both iOS and Android stores — with AI doing the heavy lifting.',
  },
  {
    icon: Brain,
    iconBg: 'bg-indigo-500/20',
    iconColor: 'text-indigo-400',
    title: 'HELIXA — Idea Capture',
    description: 'Record your app idea by voice or text. AI structures, scores, and evaluates it automatically.',
    detail: 'HELIXA gives you a viability score, market analysis, build brief, and even an autonomy assessment for how much can be built automatically.',
  },
  {
    icon: Settings,
    iconBg: 'bg-orange-500/20',
    iconColor: 'text-orange-400',
    title: 'Setup — Connect Your Accounts',
    description: 'Link your Apple Developer, Google Play, and GitHub accounts so the system can deploy for you.',
    detail: 'Go to Setup from the dashboard or bottom menu. Enter your API keys and credentials — the system validates them in real-time.',
  },
  {
    icon: Code2,
    iconBg: 'bg-emerald-500/20',
    iconColor: 'text-emerald-400',
    title: 'Planter — Autonomous Builder',
    description: 'Planter uses Devin AI to build your app from a description. It creates a full project and gives you a live URL.',
    detail: 'Start a build from any HELIXA idea or write a custom prompt. Planter handles the full stack — frontend, backend, deployment.',
  },
  {
    icon: Sparkles,
    iconBg: 'bg-purple-500/20',
    iconColor: 'text-purple-400',
    title: 'Launch Pipeline',
    description: 'Create a project, answer the questionnaire, and the AI generates your store listing, strategy, and campaigns.',
    detail: 'The pipeline handles: listing optimization, ASO keywords, launch strategy, campaign content, and store submission — all automated.',
  },
];

export function shouldShowOnboarding(): boolean {
  return !localStorage.getItem(ONBOARDING_KEY);
}

export function markOnboardingDone(): void {
  localStorage.setItem(ONBOARDING_KEY, 'true');
}

export default function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const stepData = steps[currentStep];
  const Icon = stepData.icon;
  const isLast = currentStep === steps.length - 1;

  const handleNext = () => {
    if (isLast) {
      markOnboardingDone();
      onComplete();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleSkip = () => {
    markOnboardingDone();
    onComplete();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl">
        {/* Progress dots */}
        <div className="flex items-center justify-between px-6 pt-5">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === currentStep ? 'w-6 bg-blue-500' : i < currentStep ? 'w-1.5 bg-blue-500/50' : 'w-1.5 bg-slate-700'
                }`}
              />
            ))}
          </div>
          <button onClick={handleSkip} className="text-slate-500 hover:text-slate-300 transition-colors p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 pt-8 pb-6 text-center">
          <div className={`w-16 h-16 rounded-2xl ${stepData.iconBg} flex items-center justify-center mx-auto mb-5`}>
            <Icon className={`w-8 h-8 ${stepData.iconColor}`} />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">{stepData.title}</h2>
          <p className="text-slate-300 text-sm mb-3">{stepData.description}</p>
          <p className="text-slate-500 text-xs leading-relaxed">{stepData.detail}</p>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex items-center gap-3">
          <button onClick={handleSkip} className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
            Skip tour
          </button>
          <div className="flex-1" />
          {currentStep > 0 && (
            <Button variant="outline" size="sm" className="border-slate-700 text-slate-300" onClick={() => setCurrentStep(prev => prev - 1)}>
              Back
            </Button>
          )}
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={handleNext}>
            {isLast ? 'Get Started' : 'Next'}
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
