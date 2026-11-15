import type {FormSettings} from '@plunk/types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  IconSpinner,
  Input,
  Label,
  Switch,
  Textarea,
} from '@plunk/ui';
import {Save} from 'lucide-react';
import {useState} from 'react';
import {toast} from 'sonner';
import useSWR from 'swr';

import {network} from '../../lib/network';

/** Project-wide Cloudflare Turnstile widget used by every signup form of the project. */
export function TurnstileSettings() {
  const {data, mutate} = useSWR<FormSettings>('/forms/settings');
  const [loadedFor, setLoadedFor] = useState<FormSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [siteKey, setSiteKey] = useState('');
  const [secret, setSecret] = useState('');
  const [hostnames, setHostnames] = useState('');
  const [saving, setSaving] = useState(false);

  if (data && loadedFor !== data) {
    setLoadedFor(data);
    setEnabled(data.turnstileEnabled);
    setSiteKey(data.turnstileSiteKey ?? '');
    setSecret('');
    setHostnames(data.turnstileHostnames.join('\n'));
  }

  const save = async () => {
    setSaving(true);
    try {
      const saved = await network.fetch<FormSettings>('PATCH', '/forms/settings', {
        turnstileEnabled: enabled,
        turnstileSiteKey: siteKey.trim() || null,
        turnstileHostnames: hostnames
          .split(/[\s,]+/)
          .map(hostname => hostname.trim())
          .filter(Boolean),
        ...(secret.trim() ? {turnstileSecret: secret.trim()} : {}),
      } as never);
      await mutate(saved, false);
      toast.success('Bot protection saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Couldn’t save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bot protection</CardTitle>
        <CardDescription>
          Cloudflare Turnstile for every form of this project. Create a widget for your shop domains in the Cloudflare
          dashboard and paste its keys here. Switch it off while testing on other hosts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!data ? (
          <IconSpinner />
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="turnstile-enabled">Require Turnstile on submit</Label>
              <Switch id="turnstile-enabled" checked={enabled} onCheckedChange={setEnabled} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="turnstile-site-key">Site key</Label>
                <Input id="turnstile-site-key" value={siteKey} onChange={event => setSiteKey(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="turnstile-secret">Secret key</Label>
                <Input
                  id="turnstile-secret"
                  type="password"
                  autoComplete="off"
                  value={secret}
                  placeholder={data.hasTurnstileSecret ? 'Saved. Enter a new key to replace it.' : ''}
                  onChange={event => setSecret(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="turnstile-hostnames">Allowed hostnames</Label>
              <Textarea
                id="turnstile-hostnames"
                rows={3}
                value={hostnames}
                placeholder={'shop.example.com\nwww.shop.example.com'}
                onChange={event => setHostnames(event.target.value)}
              />
              <p className="text-xs text-neutral-500">
                One per line. Tokens issued on other hosts are rejected. Do not add localhost in production.
              </p>
            </div>
            <Button onClick={save} disabled={saving}>
              {saving ? <IconSpinner /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
