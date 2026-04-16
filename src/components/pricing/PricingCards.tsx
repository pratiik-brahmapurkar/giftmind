import { PLANS, PlanSlug } from '@/lib/geoConfig';

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
    <div>
      <div className={`grid gap-4 ${compact ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 md:grid-cols-3'}`}>
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
                relative rounded-2xl border flex flex-col
                ${compact ? 'p-4' : 'p-6'}
                ${isDark
                  ? 'bg-gray-900 text-white border-gray-700'
                  : isHighlighted || isRecommended
                    ? 'bg-white border-purple-500 border-2 shadow-lg shadow-purple-100'
                    : 'bg-white border-gray-200'}
              `}
            >
              {/* Badge */}
              {plan.badge && (
                <div className={`
                  absolute -top-3 left-1/2 -translate-x-1/2 
                  px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap
                  ${isDark ? 'bg-purple-500 text-white'
                    : isRecommended ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700'}
                `}>
                  {plan.badge}
                </div>
              )}

              {isRecommended && (
                <p className={`text-xs text-center mb-1 ${isDark ? 'text-gray-300' : 'text-purple-600'}`}>
                  Most chosen by gifters
                </p>
              )}

              {/* Header */}
              <div className="text-center mb-4">
                <span className="text-2xl">{plan.emoji}</span>
                <h3 className={`text-xl font-bold mt-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {plan.name}
                </h3>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {plan.maxRecipients === -1 ? 'Unlimited people' : `${plan.maxRecipients} people`} · {plan.validityDays} days
                </p>
              </div>

              {/* Price */}
              <div className="text-center mb-4">
                <span className={`text-4xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  ${plan.price}
                </span>
                <div className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {plan.perSession}/session
                </div>
                {plan.savings && (
                  <span className="inline-block mt-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-700">
                    {plan.savings}
                  </span>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className={isDark ? 'text-green-400' : 'text-green-500'}>✓</span>
                    <span className={isDark ? 'text-gray-300' : 'text-gray-600'}>{feature}</span>
                  </li>
                ))}
                {plan.lockedFeatures.map((locked, i) => (
                  <li key={`l-${i}`} className="flex items-start gap-2 text-sm">
                    <span className="text-gray-300">✗</span>
                    <span className="text-gray-400">
                      {locked.text}
                      <span className="text-xs ml-1 text-purple-400">
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
                  w-full py-3 rounded-xl font-semibold text-sm transition-colors
                  ${isCurrent
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : isDark
                      ? 'bg-purple-600 text-white hover:bg-purple-700'
                      : isHighlighted || isRecommended
                        ? 'bg-purple-600 text-white hover:bg-purple-700'
                        : 'border border-purple-600 text-purple-600 hover:bg-purple-50'}
                `}
              >
                {isCurrent ? 'Current Plan' : plan.buttonText}
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="text-center mt-6 space-y-1">
        <p className="text-sm text-gray-500">
          All plans include: AI recommendations · Confidence scores · Regional store links
        </p>
        <p className="text-sm text-purple-600 font-medium">
          🎁 Start with 3 free credits on Spark — no card needed
        </p>
        <p className="text-xs text-gray-400">
          All prices in USD. PayPal accepts cards from 200+ countries.
        </p>
      </div>
    </div>
  );
}

export default PricingCards;
