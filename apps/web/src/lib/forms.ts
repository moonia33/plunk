import type {FormDefinition, FormStatus, FormType} from '@plunk/types';

export const FORM_TYPE_LABELS: Record<FormType, string> = {
  INLINE: 'Inline',
  POPUP: 'Popup',
  SLIDE_IN: 'Slide-in',
  BAR: 'Bar',
  PAGE: 'Landing page',
};

export const FORM_STATUS_VARIANTS: Record<FormStatus, 'success' | 'neutral' | 'warning'> = {
  ACTIVE: 'success',
  DRAFT: 'neutral',
  PAUSED: 'warning',
};

export function conversionRate(form: Pick<FormDefinition, 'views' | 'submissions'>): string {
  if (!form.views) return '—';
  return `${((form.submissions / form.views) * 100).toFixed(1)}%`;
}
