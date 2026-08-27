import { FiArrowDown, FiArrowUp, FiMinus } from 'react-icons/fi';

const accentColors = {
  blue:    { icon: 'bg-brand-100 text-brand-600', bar: 'from-brand-300 via-brand-500 to-brand-400' },
  amber:   { icon: 'bg-amber-100 text-amber-600', bar: 'from-amber-300 via-amber-500 to-amber-400' },
  emerald: { icon: 'bg-emerald-100 text-emerald-600', bar: 'from-emerald-300 via-emerald-500 to-emerald-400' },
  rose:    { icon: 'bg-rose-100 text-rose-600', bar: 'from-rose-300 via-rose-500 to-rose-400' },
  violet:  { icon: 'bg-violet-100 text-violet-600', bar: 'from-violet-300 via-violet-500 to-violet-400' },
  orange:  { icon: 'bg-orange-100 text-orange-600', bar: 'from-orange-300 via-orange-500 to-orange-400' },
  sky:     { icon: 'bg-sky-100 text-sky-600', bar: 'from-sky-300 via-sky-500 to-sky-400' },
};

const trendIcons = {
  up: FiArrowUp,
  down: FiArrowDown,
  neutral: FiMinus,
};

const toneToAccent = {
  red: 'rose',
  green: 'emerald',
  primary: 'blue',
};

export default function StatsCard({
  title,
  label,
  value,
  color,
  icon: Icon,
  accent = 'blue',
  tone,
  trend,
  trendLabel,
  helper,
}) {
  const displayTitle = title || label;
  const displayHelper = trendLabel || helper;
  const resolvedAccent = toneToAccent[tone] || tone || accent;
  const palette = accentColors[resolvedAccent] || accentColors.blue;
  const TrendIcon = trend ? trendIcons[trend] : null;

  return (
    <div className="stat-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-slate-500">{displayTitle}</p>
          <p className={`mt-1.5 text-2xl font-bold sm:text-3xl ${color || 'text-slate-800'}`}>
            {value}
          </p>
          {(trend || displayHelper) && (
            <div className="mt-2 flex items-center gap-1">
              {TrendIcon && (
                <TrendIcon
                  size={12}
                  className={
                    trend === 'up' ? 'text-emerald-500' :
                    trend === 'down' ? 'text-rose-500' :
                    'text-slate-400'
                  }
                />
              )}
              {displayHelper && <span className="text-[12px] text-slate-500">{displayHelper}</span>}
            </div>
          )}
        </div>
        {Icon && (
          <div className={`rounded-xl p-2.5 ${palette.icon}`}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}
