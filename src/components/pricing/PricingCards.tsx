import { PLANS, PlanSlug } from '@/lib/geoConfig';
import { Check, X, Sparkles } from 'lucide-react';

interface PricingCardsProps {
  currentPlan?: PlanSlug;
  highlightPlan?: PlanSlug;
  onBuyClick: (slug: string) => void;
  compact?: boolean;
}

export function PricingCards({
  currentPlan = 'spark',
  highlightPlan = 'confident',
  onBuyClick,
  compact = false,
}: PricingCardsProps) {
  const paidPlans: PlanSlug[] = ['thoughtful', 'confident', 'gifting-pro'];

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className={`grid gap-8 ${compact ? 'lg:grid-cols-3' : 'md:grid-cols-2 lg:grid-cols-3'} items-stretch`}>
        {paidPlans.map((slug) => {
          const plan = PLANS[slug];
          const isCurrent = currentPlan === slug;
          const isHighlighted = highlightPlan === slug;
          const isDark = 'isDark' in plan && plan.isDark;
          const isRecommended = 'isRecommended' in plan && plan.isRecommended;

          return (
            <div
              key={slug}
              className={`
                relative flex flex-col rounded-3xl transition-all duration-300
                hover:scale-[1.02] hover:shadow-2xl overflow-visible
                ${compact ? 'p-6' : 'p-8'}
                ${isDark
                  ? 'bg-gradient-to-b from-gray-900 to-gray-800 text-white border-gray-700/50 border backdrop-blur-sm shadow-[0_8px_30px_rgb(0,0,0,0.12)]'
                  : isHighlighted || isRecommended
                    ? 'bg-white ring-2 ring-purple-500 shadow-[0_0_40px_rgba(168,85,247,0.3)]'
                    : 'bg-white border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'}
              `}
            >
              {/* Badge */}
              {plan.badge && (
                <div className={`
                  absolute -top-4 left-1/2 -translate-x-1/2 
                  px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap tracking-wide flex items-center gap-1.5 shadow-md
                  ${isDark ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white'
                    : isRecommended ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white'
                    : 'bg-gray-100/80 backdrop-blur-md text-gray-700 border border-gray-200/50'}
                `}>
                  {(isRecommended || isDark) && <Sparkles className="w-3.5 h-3.5" />}
                  {plan.badge}
                </div>
              )}

              {isRecommended ? (
                <p className={`text-xs font-bold text-center mb-6 tracking-wider uppercase ${isDark ? 'text-purple-300' : 'text-purple-600'}`}>
                  Most chosen by gifters
                </p>
              ) : (
                <div className="h-4 mb-6"></div>
              )}

              {/* Header */}
              <div className="text-center mb-8">
                <span className="text-4xl inline-block mb-3 bg-white/10 p-3 rounded-2xl ring-1 ring-black/5 shadow-sm transform transition-transform hover:scale-110 duration-300">{plan.emoji}</span>
                <h3 className={`text-2xl font-black tracking-tight mt-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {plan.name}
                </h3>
                <p className={`text-sm font-medium mt-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {plan.maxRecipients === -1 ? 'Unlimited people' : `${plan.maxRecipients} people`} <span className="mx-1 opacity-50">•</span> {plan.validityDays} days
                </p>
              </div>

              {/* Price */}
              <div className="text-center mb-8">
                <div className="flex items-start justify-center gap-1">
                  <span className={`text-2xl font-bold mt-1.5 ${isDark ? 'text-white' : 'text-gray-900'}`}>$</span>
                  <span className={`text-6xl font-black tracking-tighter ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {plan.price}
                  </span>
                </div>
                <div className={`text-sm font-medium mt-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {plan.perSession}/session
                </div>
                {plan.savings && (
                  <div className="mt-3">
                    <span className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-full shadow-sm hover:scale-105 transition-transform ${isDark ? 'bg-green-500/10 text-green-400 ring-1 ring-green-500/20' : 'bg-green-100 text-green-700 ring-1 ring-green-600/10'}`}>
                      <Sparkles className="w-3 h-3" />
                      {plan.savings}
                    </span>
                  </div>
                )}
              </div>

              <div className={`h-px w-full mb-8 ${isDark ? 'bg-gradient-to-r from-transparent via-gray-700 to-transparent' : 'bg-gradient-to-r from-transparent via-gray-200 to-transparent'}`} />

              {/* Features */}
              <ul className="space-y-4 mb-8 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm group">
                    <div className={`mt-0.5 rounded-full p-0.5 transition-colors ${isDark ? 'bg-green-500/20 text-green-400 group-hover:bg-green-500/30' : 'bg-green-100 text-green-600 group-hover:bg-green-200'}`}>
                      <Check className="w-3 h-3" strokeWidth={3} />
                    </div>
                    <span className={`font-medium leading-relaxed ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{feature}</span>
                  </li>
                ))}
                {plan.lockedFeatures.map((locked, i) => (
                  <li key={`l-${i}`} className="flex items-start gap-3 text-sm opacity-60 group">
                    <div className="mt-0.5 rounded-full p-0.5 bg-gray-100/50 text-gray-400 transition-colors group-hover:bg-gray-200/50">
                      <X className="w-3 h-3" strokeWidth={3} />
                    </div>
                    <span className={`font-medium leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {locked.text}
                      <span className="text-xs font-bold ml-1.5 px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-600 transition-colors group-hover:bg-purple-500/20 group-hover:text-purple-700">
                        {PLANS[locked.unlockPlan as PlanSlug]?.name} ↑
                      </span>
                    </span>
                  </li>
                ))}
              </ul>

              {/* Button */}
              <button
                onClick={() => !isCurrent && onBuyClick(slug)}
                disabled={isCurrent}
                className={`
                  w-full py-4 rounded-2xl font-bold text-sm transition-all duration-300
                  ${isCurrent
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                    : isDark
                      ? 'bg-white text-gray-900 hover:bg-gray-100 hover:scale-[1.02] active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(255,255,255,0.2)]'
                      : isHighlighted || isRecommended
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:scale-[1.02] active:scale-95 shadow-[0_0_20px_rgba(147,51,234,0.3)] hover:shadow-[0_0_30px_rgba(147,51,234,0.4)]'
                        : 'bg-indigo-50/50 border-2 border-indigo-100 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 hover:scale-[1.02] active:scale-95 hover:text-indigo-700'}
                `}
              >
                {isCurrent ? 'Current Plan' : plan.buttonText}
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="text-center mt-12 space-y-4 pb-8">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/50 backdrop-blur-md shadow-sm border border-gray-100 text-sm font-medium text-gray-600 hover:scale-105 transition-transform duration-300">
          <Sparkles className="w-4 h-4 text-purple-500" />
          All plans include: AI recommendations · Confidence scores · Regional store links
        </div>
        <p className="text-sm text-purple-600 font-bold tracking-wide flex items-center justify-center gap-2">
          <span className="text-xl inline-block drop-shadow-sm hover:rotate-12 transition-transform duration-300">🎁</span> 
          Start with 3 free credits on Spark — no card needed
        </p>
        <div className="inline-flex items-center justify-center gap-2 px-4 py-1.5 rounded-full bg-gray-50 text-xs font-medium text-gray-500 border border-gray-200/50">
          <svg className="w-4 h-4 text-[#00457C]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.067 8.478c.492.88.556 2.014.3 3.327-.74 3.806-3.276 5.12-6.514 5.12h-.5a.805.805 0 0 0-.794.68l-.04.22-.63 3.993c-.125.794-.808 1.4-1.614 1.4h-2.52c-.44 0-.75-.41-.65-.84l1.45-9.15.53-3.37c.1-.64.66-1.12 1.3-1.12h3.54c2.51 0 4.1.48 4.75 1.54.43.7-.06 2.45-.6 3.86zM8.347 2.16L6.5 13.91c-.05.35.2.66.55.66h2.8l.68-4.28.16-1.02c.15-.93.96-1.6 1.9-1.6h2.24c3.55 0 5.86-1.5 6.64-5.18.17-.8.15-1.5-.06-2.12-.55-1.57-2.33-2.13-4.86-2.13H10.15c-.87 0-1.62.63-1.78 1.48z" />
          </svg>
          All prices in USD. PayPal accepts cards from 200+ countries.
        </div>
      </div>
    </div>
  );
}

export default PricingCards;
