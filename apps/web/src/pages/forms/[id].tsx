import type {FormContent, FormDefinition, FormField, FormRules, FormStyle} from '@plunk/types';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  IconSpinner,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from '@plunk/ui';
import {ArrowLeft, Plus, Save, Trash2, X} from 'lucide-react';
import {NextSeo} from 'next-seo';
import Link from 'next/link';
import {useRouter} from 'next/router';
import {useEffect, useState} from 'react';
import {toast} from 'sonner';
import useSWR from 'swr';

import {DashboardLayout} from '../../components/DashboardLayout';
import {API_URI} from '../../lib/constants';
import {conversionRate, FORM_STATUS_VARIANTS, FORM_TYPE_LABELS} from '../../lib/forms';
import {network} from '../../lib/network';

type Draft = Pick<
  FormDefinition,
  'name' | 'type' | 'status' | 'doubleOptIn' | 'content' | 'fields' | 'rules' | 'style'
>;

const CONTENT_FIELDS: {key: keyof FormContent; label: string; long?: boolean}[] = [
  {key: 'title', label: 'Title'},
  {key: 'body', label: 'Text', long: true},
  {key: 'emailPlaceholder', label: 'Email placeholder'},
  {key: 'button', label: 'Button'},
  {key: 'consentText', label: 'Consent text (stored with every signup)', long: true},
  {key: 'barText', label: 'Bar text (bar forms)'},
  {key: 'step2Title', label: 'Second step title'},
  {key: 'step2Button', label: 'Second step button'},
  {key: 'successTitle', label: 'Success title'},
  {key: 'successBody', label: 'Success text', long: true},
];

function Choice<T extends string>({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: T;
  onChange: (value: T) => void;
  options: [T, string][];
}) {
  return (
    <Select value={value} onValueChange={next => onChange(next as T)}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([option, label]) => (
          <SelectItem key={option} value={option}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Toggle({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-neutral-200 p-4">
      <div>
        <Label htmlFor={id} className="font-medium">
          {label}
        </Label>
        {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

const lines = (value: string) =>
  value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

export default function FormEditorPage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : undefined;
  const {data: form, mutate} = useSWR<FormDefinition>(id ? `/forms/${id}` : null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [locale, setLocale] = useState('');
  const [newLocale, setNewLocale] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (form && draftId !== form.id) {
      const {name, type, status, doubleOptIn, content, fields, rules, style} = form;
      setDraft({name, type, status, doubleOptIn, content, fields, rules, style});
      setDraftId(form.id);
      setLocale(Object.keys(content)[0] ?? 'en');
    }
  }, [form, draftId]);

  if (!form || !draft || draftId !== form.id) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-24">
          <IconSpinner />
        </div>
      </DashboardLayout>
    );
  }

  const update = (patch: Partial<Draft>) => setDraft({...draft, ...patch});
  const rules = (patch: Partial<FormRules>) => update({rules: {...draft.rules, ...patch}});
  const style = (patch: Partial<FormStyle>) => update({style: {...draft.style, ...patch}});
  const content = draft.content[locale] ?? {title: '', button: ''};
  const setContent = (key: keyof FormContent, value: string) =>
    update({content: {...draft.content, [locale]: {...content, [key]: value}}});
  const setField = (index: number, field: FormField) =>
    update({fields: draft.fields.map((current, i) => (i === index ? field : current))});

  const addLocale = () => {
    const code = newLocale.trim();
    if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(code) || draft.content[code]) return;
    update({content: {...draft.content, [code]: {...content}}});
    setLocale(code);
    setNewLocale('');
  };

  const removeLocale = (code: string) => {
    const rest = {...draft.content};
    delete rest[code];
    update({content: rest});
    setLocale(Object.keys(rest)[0] ?? '');
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await network.fetch<FormDefinition>('PATCH', `/forms/${form.id}`, draft as never);
      await mutate(saved, {revalidate: false});
      toast.success('Form saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Couldn’t save the form. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    await network.fetch('DELETE', `/forms/${form.id}`);
    toast.success('Form deleted');
    await router.push('/forms');
  };

  const inline = draft.type === 'INLINE' || draft.type === 'PAGE';
  const snippet = [
    `<script>window.PlunkForms = {key: 'pk_...', locale: '${locale || 'en'}', subscribed: false, customer: false};</script>`,
    `<script src="${API_URI}/forms/embed.js" async></script>`,
    ...(inline ? [`<div data-plunk-form="${form.id}"></div>`] : []),
  ].join('\n');

  return (
    <>
      <NextSeo title={form.name} />
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Link href="/forms" className="text-neutral-500 hover:text-neutral-900" aria-label="Back to forms">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <h1 className="text-2xl font-bold text-neutral-900">{form.name}</h1>
              <Badge variant={FORM_STATUS_VARIANTS[form.status]}>{form.status.toLowerCase()}</Badge>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? <IconSpinner /> : <Save className="h-4 w-4" />}
                Save
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              ['Views', form.views.toLocaleString()],
              ['Signups', form.submissions.toLocaleString()],
              ['Conversion', conversionRate(form)],
            ].map(([label, value]) => (
              <Card key={label}>
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Form</CardTitle>
              <CardDescription>
                Popups are shown as slide-ins on mobile unless you change it in the rules.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={draft.name} maxLength={100} onChange={e => update({name: e.target.value})} />
              </div>
              <div>
                <Label htmlFor="type">Type</Label>
                <Choice
                  id="type"
                  value={draft.type}
                  onChange={type => update({type})}
                  options={Object.entries(FORM_TYPE_LABELS) as [Draft['type'], string][]}
                />
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <Choice
                  id="status"
                  value={draft.status}
                  onChange={status => update({status})}
                  options={[
                    ['DRAFT', 'Draft'],
                    ['ACTIVE', 'Active'],
                    ['PAUSED', 'Paused'],
                  ]}
                />
              </div>
              <div>
                <Label htmlFor="position">Position</Label>
                <Choice
                  id="position"
                  value={draft.style.position ?? (draft.type === 'BAR' ? 'bottom' : 'bottom-right')}
                  onChange={position => style({position})}
                  options={
                    draft.type === 'BAR'
                      ? [
                          ['top', 'Top'],
                          ['bottom', 'Bottom'],
                        ]
                      : [
                          ['bottom-right', 'Bottom right'],
                          ['bottom-left', 'Bottom left'],
                        ]
                  }
                />
              </div>
              <div className="sm:col-span-3">
                <Toggle
                  id="doi"
                  label="Double opt-in"
                  hint="New contacts get the newsletter.signup_requested event and stay unsubscribed until they confirm. Off: subscribed at once with newsletter.subscribed."
                  checked={draft.doubleOptIn}
                  onChange={doubleOptIn => update({doubleOptIn})}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Texts</CardTitle>
              <CardDescription>
                One set per locale. Visitors get their locale, then the language, then the first one.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {Object.keys(draft.content).map(code => (
                  <span
                    key={code}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${code === locale ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-700'}`}
                  >
                    <button type="button" onClick={() => setLocale(code)}>
                      {code}
                    </button>
                    {Object.keys(draft.content).length > 1 && (
                      <button type="button" aria-label={`Remove ${code}`} onClick={() => removeLocale(code)}>
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
                <Input
                  className="h-8 w-24"
                  placeholder="lv"
                  value={newLocale}
                  onChange={e => setNewLocale(e.target.value)}
                />
                <Button type="button" variant="outline" size="sm" onClick={addLocale}>
                  <Plus className="h-4 w-4" />
                  Locale
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {CONTENT_FIELDS.map(({key, label, long}) => (
                  <div key={key} className={long ? 'sm:col-span-2' : undefined}>
                    <Label htmlFor={`content-${key}`}>{label}</Label>
                    {long ? (
                      <Textarea
                        id={`content-${key}`}
                        rows={2}
                        value={content[key] ?? ''}
                        onChange={e => setContent(key, e.target.value)}
                      />
                    ) : (
                      <Input
                        id={`content-${key}`}
                        value={content[key] ?? ''}
                        onChange={e => setContent(key, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Second step: interests</CardTitle>
              <CardDescription>
                Optional checkbox questions after the email. Values are saved on the contact as a list, e.g. interests =
                [karpine, feeder].
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {draft.fields.map((field, index) => (
                <div key={index} className="space-y-3 rounded-lg border border-neutral-200 p-4">
                  <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
                    <div>
                      <Label>Contact field</Label>
                      <Input
                        value={field.key}
                        placeholder="interests"
                        onChange={e => setField(index, {...field, key: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Question ({locale})</Label>
                      <Input
                        value={field.label[locale] ?? ''}
                        onChange={e => setField(index, {...field, label: {...field.label, [locale]: e.target.value}})}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="self-end"
                      aria-label="Remove question"
                      onClick={() => update({fields: draft.fields.filter((_, i) => i !== index)})}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {field.options.map((option, optionIndex) => {
                    const setOption = (next: typeof option) =>
                      setField(index, {...field, options: field.options.map((o, i) => (i === optionIndex ? next : o))});
                    return (
                      <div key={optionIndex} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
                        <Input
                          value={option.value}
                          placeholder="karpine"
                          onChange={e => setOption({...option, value: e.target.value})}
                        />
                        <Input
                          value={option.label[locale] ?? ''}
                          placeholder={`Label (${locale})`}
                          onChange={e => setOption({...option, label: {...option.label, [locale]: e.target.value}})}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          aria-label="Remove option"
                          onClick={() =>
                            setField(index, {...field, options: field.options.filter((_, i) => i !== optionIndex)})
                          }
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setField(index, {...field, options: [...field.options, {value: '', label: {}}]})}
                  >
                    <Plus className="h-4 w-4" />
                    Option
                  </Button>
                </div>
              ))}
              {draft.fields.length < 3 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => update({fields: [...draft.fields, {key: 'interests', label: {}, options: []}]})}
                >
                  <Plus className="h-4 w-4" />
                  Question
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Display rules</CardTitle>
              <CardDescription>
                Inline and landing page forms only use the URL, locale and audience rules.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="trigger">Show</Label>
                <Choice
                  id="trigger"
                  value={draft.rules.trigger}
                  onChange={trigger => rules({trigger})}
                  options={[
                    ['immediate', 'Immediately'],
                    ['delay', 'After a delay'],
                    ['scroll', 'After scrolling'],
                    ['exit', 'On exit intent (desktop)'],
                  ]}
                />
              </div>
              {draft.rules.trigger === 'delay' && (
                <div>
                  <Label htmlFor="delay">Delay, seconds</Label>
                  <Input
                    id="delay"
                    type="number"
                    min={0}
                    max={600}
                    value={draft.rules.delaySeconds}
                    onChange={e => rules({delaySeconds: Number(e.target.value)})}
                  />
                </div>
              )}
              {(draft.rules.trigger === 'scroll' || draft.rules.trigger === 'exit') && (
                <div>
                  <Label htmlFor="scroll">Scroll, % {draft.rules.trigger === 'exit' ? '(mobile fallback)' : ''}</Label>
                  <Input
                    id="scroll"
                    type="number"
                    min={0}
                    max={100}
                    value={draft.rules.scrollPercent}
                    onChange={e => rules({scrollPercent: Number(e.target.value)})}
                  />
                </div>
              )}
              <div>
                <Label htmlFor="pageviews">From page view no.</Label>
                <Input
                  id="pageviews"
                  type="number"
                  min={1}
                  max={50}
                  value={draft.rules.minPageviews}
                  onChange={e => rules({minPageviews: Number(e.target.value)})}
                />
              </div>
              <div>
                <Label htmlFor="dismiss">After closing, hide for days</Label>
                <Input
                  id="dismiss"
                  type="number"
                  min={0}
                  max={365}
                  value={draft.rules.dismissDays}
                  onChange={e => rules({dismissDays: Number(e.target.value)})}
                />
              </div>
              <div>
                <Label htmlFor="mobile">On mobile</Label>
                <Choice
                  id="mobile"
                  value={draft.rules.mobile}
                  onChange={mobile => rules({mobile})}
                  options={[
                    ['slide_in', 'Slide-in instead of popup'],
                    ['same', 'Same as desktop'],
                    ['hide', 'Do not show'],
                  ]}
                />
              </div>
              <div>
                <Label htmlFor="locales">Only locales (comma separated)</Label>
                <Input
                  id="locales"
                  placeholder="all"
                  defaultValue={draft.rules.locales.join(', ')}
                  onBlur={e =>
                    rules({
                      locales: e.target.value
                        .split(',')
                        .map(v => v.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
              <div className="sm:col-span-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="include">Only on pages (one per line, * = any)</Label>
                  <Textarea
                    id="include"
                    rows={3}
                    placeholder="/lt/*"
                    defaultValue={draft.rules.urlInclude.join('\n')}
                    onBlur={e => rules({urlInclude: lines(e.target.value)})}
                  />
                </div>
                <div>
                  <Label htmlFor="exclude">Never on pages</Label>
                  <Textarea
                    id="exclude"
                    rows={3}
                    placeholder="*checkout*"
                    defaultValue={draft.rules.urlExclude.join('\n')}
                    onBlur={e => rules({urlExclude: lines(e.target.value)})}
                  />
                </div>
              </div>
              <div className="sm:col-span-3 grid gap-4 sm:grid-cols-2">
                <Toggle
                  id="hideSubscribers"
                  label="Hide from subscribers"
                  checked={draft.rules.hideForSubscribers}
                  onChange={hideForSubscribers => rules({hideForSubscribers})}
                />
                <Toggle
                  id="hideCustomers"
                  label="Hide from customers"
                  checked={draft.rules.hideForCustomers}
                  onChange={hideForCustomers => rules({hideForCustomers})}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Style</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-4">
              {(['accent', 'background', 'text'] as const).map(key => (
                <div key={key}>
                  <Label htmlFor={`style-${key}`} className="capitalize">
                    {key}
                  </Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      aria-label={key}
                      className="h-10 w-12 cursor-pointer rounded border border-neutral-200"
                      value={draft.style[key] ?? (key === 'background' ? '#ffffff' : '#1c1c1c')}
                      onChange={e => style({[key]: e.target.value})}
                    />
                    <Input
                      id={`style-${key}`}
                      value={draft.style[key] ?? ''}
                      placeholder="#1c1c1c"
                      onChange={e => style({[key]: e.target.value || undefined})}
                    />
                  </div>
                </div>
              ))}
              <div>
                <Label htmlFor="image">Image URL (https)</Label>
                <Input
                  id="image"
                  value={draft.style.imageUrl ?? ''}
                  onChange={e => style({imageUrl: e.target.value || undefined})}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Embed</CardTitle>
              <CardDescription>
                Add once to every page. Use the project&apos;s public key (pk_) and pass whether the visitor is a
                subscriber or customer.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto rounded-lg bg-neutral-50 p-4 text-xs text-neutral-800">{snippet}</pre>
            </CardContent>
          </Card>
        </div>

        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          onConfirm={remove}
          title="Delete form?"
          description="The form disappears from your site. Contacts and events it created stay."
          confirmText="Delete"
          variant="destructive"
        />
      </DashboardLayout>
    </>
  );
}
