// Planes comerciales. El límite de usuarios es editable por empresa;
// aquí solo se propone el valor por defecto al elegir un plan.
export const PLANS = ['basico', 'profesional', 'empresa', 'a_medida'] as const;
export type Plan = (typeof PLANS)[number];

export const PLAN_INFO: Record<Plan, { label: string; defaultUsers: number | null }> = {
  basico: { label: 'Básico', defaultUsers: 5 },
  profesional: { label: 'Profesional', defaultUsers: 15 },
  empresa: { label: 'Empresa', defaultUsers: 50 },
  a_medida: { label: 'A medida', defaultUsers: null },
};

export const planLabel = (p: string) => PLAN_INFO[p as Plan]?.label ?? p;
