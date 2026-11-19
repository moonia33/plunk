/**
 * Signup form types
 */

export type FormType = 'INLINE' | 'POPUP' | 'SLIDE_IN' | 'BAR' | 'PAGE';
export type FormStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED';

export interface FormContent {
  title: string;
  body?: string;
  emailPlaceholder?: string;
  button: string;
  consentText?: string;
  successTitle?: string;
  successBody?: string;
  step2Title?: string;
  step2Button?: string;
  barText?: string;
  teaserText?: string;
}

export interface FormFieldOption {
  value: string;
  label: Record<string, string>;
}

export interface FormField {
  key: string;
  label: Record<string, string>;
  options: FormFieldOption[];
}

export interface FormRules {
  trigger: 'immediate' | 'delay' | 'scroll' | 'exit';
  delaySeconds: number;
  scrollPercent: number;
  minPageviews: number;
  urlInclude: string[];
  urlExclude: string[];
  locales: string[];
  hideForSubscribers: boolean;
  hideForCustomers: boolean;
  dismissDays: number;
  teaser: boolean;
  mobile: 'same' | 'slide_in' | 'hide';
}

export interface FormStyle {
  accent?: string;
  background?: string;
  text?: string;
  imageUrl?: string;
  position?: 'bottom-right' | 'bottom-left' | 'top' | 'bottom';
}

/** A form as the dashboard sees it. */
export interface FormDefinition {
  id: string;
  name: string;
  type: FormType;
  status: FormStatus;
  content: Record<string, FormContent>;
  consentVersion: number;
  fields: FormField[];
  rules: FormRules;
  style: FormStyle;
  doubleOptIn: boolean;
  views: number;
  submissions: number;
  createdAt: string;
  updatedAt: string;
}

/** Project-wide form settings. The Turnstile secret is write-only. */
export interface FormSettings {
  turnstileEnabled: boolean;
  turnstileSiteKey: string | null;
  turnstileHostnames: string[];
  hasTurnstileSecret: boolean;
}

/** A form as the embed script receives it: texts resolved to one locale. */
export interface PublicForm {
  id: string;
  type: FormType;
  content: FormContent;
  fields: {key: string; label: string; options: {value: string; label: string}[]}[];
  rules: FormRules;
  style: FormStyle;
}
