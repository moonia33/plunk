import type {FormDefinition} from '@plunk/types';
import {Badge, Button, Card, CardContent, EmptyState, IconSpinner} from '@plunk/ui';
import {Plus, SquarePen} from 'lucide-react';
import {NextSeo} from 'next-seo';
import Link from 'next/link';
import {useRouter} from 'next/router';
import {useState} from 'react';
import {toast} from 'sonner';
import useSWR from 'swr';

import {DashboardLayout} from '../../components/DashboardLayout';
import {TurnstileSettings} from '../../components/forms/TurnstileSettings';
import {conversionRate, FORM_STATUS_VARIANTS, FORM_TYPE_LABELS} from '../../lib/forms';
import {network} from '../../lib/network';

export default function FormsPage() {
  const router = useRouter();
  const {data, isLoading} = useSWR<{forms: FormDefinition[]}>('/forms');
  const [creating, setCreating] = useState(false);

  const create = async () => {
    setCreating(true);
    try {
      const form = await network.fetch<FormDefinition>('POST', '/forms', {
        name: 'Newsletter popup',
        type: 'POPUP',
        status: 'DRAFT',
        content: {en: {title: 'Get our news first', button: 'Subscribe'}},
      } as never);
      await router.push(`/forms/${form.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Couldn’t create the form. Try again.');
      setCreating(false);
    }
  };

  const forms = data?.forms ?? [];

  return (
    <>
      <NextSeo title="Forms" />
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900">Forms</h1>
              <p className="text-neutral-500 mt-2 text-sm sm:text-base">
                Signup forms for your site: popups, slide-ins, bars and inline blocks with display rules and double
                opt-in.
              </p>
            </div>
            <Button onClick={create} disabled={creating}>
              {creating ? <IconSpinner /> : <Plus className="h-4 w-4" />}
              New form
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex justify-center py-16">
                  <IconSpinner />
                </div>
              ) : forms.length === 0 ? (
                <EmptyState
                  icon={SquarePen}
                  title="No forms yet"
                  description="Create a form, then add the embed script to your site."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-500">
                        <th className="px-6 py-3 font-medium">Name</th>
                        <th className="px-6 py-3 font-medium">Type</th>
                        <th className="px-6 py-3 font-medium">Status</th>
                        <th className="px-6 py-3 text-right font-medium">Views</th>
                        <th className="px-6 py-3 text-right font-medium">Signups</th>
                        <th className="px-6 py-3 text-right font-medium">Conversion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {forms.map(form => (
                        <tr key={form.id} className="border-b border-neutral-50 last:border-0 hover:bg-neutral-50">
                          <td className="px-6 py-4">
                            <Link href={`/forms/${form.id}`} className="font-medium text-neutral-900 hover:underline">
                              {form.name}
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-neutral-600">{FORM_TYPE_LABELS[form.type]}</td>
                          <td className="px-6 py-4">
                            <Badge variant={FORM_STATUS_VARIANTS[form.status]}>{form.status.toLowerCase()}</Badge>
                          </td>
                          <td className="px-6 py-4 text-right tabular-nums">{form.views.toLocaleString()}</td>
                          <td className="px-6 py-4 text-right tabular-nums">{form.submissions.toLocaleString()}</td>
                          <td className="px-6 py-4 text-right tabular-nums font-medium">{conversionRate(form)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <TurnstileSettings />
        </div>
      </DashboardLayout>
    </>
  );
}
