import { cn } from '../../lib/utils'

export interface WorkingDay {
  active: boolean
  start: string
  end: string
}

/** Chaves "0".."6" seguindo Date.getDay() (0 = domingo). */
export type WeeklyHours = Record<string, WorkingDay>

export const DAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

/** Mesmo default usado hoje em api/_services/agentService.ts (DEFAULT_HOURS) —
 *  garante que o que aparece na tela bate com o comportamento real quando
 *  a clínica ainda não configurou nada. */
export const DEFAULT_WEEKLY_HOURS: WeeklyHours = {
  '0': { active: false, start: '09:00', end: '12:00' },
  '1': { active: true,  start: '09:00', end: '18:00' },
  '2': { active: true,  start: '09:00', end: '18:00' },
  '3': { active: true,  start: '09:00', end: '18:00' },
  '4': { active: true,  start: '09:00', end: '18:00' },
  '5': { active: true,  start: '09:00', end: '18:00' },
  '6': { active: false, start: '09:00', end: '12:00' },
}

export function normalizeWeeklyHours(value: WeeklyHours | null | undefined): WeeklyHours {
  const base = { ...DEFAULT_WEEKLY_HOURS }
  if (!value) return base
  for (const day of Object.keys(base)) {
    if (value[day]) base[day] = { ...base[day], ...value[day] }
  }
  return base
}

interface WeeklyHoursEditorProps {
  value: WeeklyHours
  onChange: (value: WeeklyHours) => void
}

export default function WeeklyHoursEditor({ value, onChange }: WeeklyHoursEditorProps) {
  function updateDay(day: string, patch: Partial<WorkingDay>) {
    onChange({ ...value, [day]: { ...value[day], ...patch } })
  }

  return (
    <div className="space-y-1.5">
      {DAY_LABELS.map((label, i) => {
        const day = String(i)
        const wd = value[day] ?? DEFAULT_WEEKLY_HOURS[day]
        return (
          <div
            key={day}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-xl transition-colors',
              wd.active ? 'bg-white border border-slate-200' : 'bg-slate-50 border border-transparent',
            )}
          >
            <button
              type="button"
              onClick={() => updateDay(day, { active: !wd.active })}
              className={cn(
                'w-9 h-5 rounded-full transition-all duration-200 relative shrink-0',
                wd.active ? 'bg-brand-500' : 'bg-slate-200',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200',
                  wd.active ? 'left-4' : 'left-0.5',
                )}
              />
            </button>

            <p className={cn('text-sm font-medium w-20 shrink-0', wd.active ? 'text-slate-700' : 'text-slate-400')}>
              {label}
            </p>

            {wd.active ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="time"
                  value={wd.start}
                  onChange={e => updateDay(day, { start: e.target.value })}
                  className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent w-28"
                />
                <span className="text-xs text-slate-400">até</span>
                <input
                  type="time"
                  value={wd.end}
                  onChange={e => updateDay(day, { end: e.target.value })}
                  className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent w-28"
                />
              </div>
            ) : (
              <p className="text-xs text-slate-400 flex-1">Fechado</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
