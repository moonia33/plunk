/**
 * Event data as templates, conditions and webhooks see it.
 *
 * `/v1/track` keeps a field off the contact when it is sent as `{value, persistent: false}`,
 * and the workflow context stores the event data as sent. Without unwrapping, an order or
 * cart sent that way is only reachable as `event.cart.value.items`. Top-level wrappers are
 * replaced with their value so `event.cart.items` works the same for both kinds of field.
 */
export function unwrapEventContext(context: unknown): Record<string, unknown> {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context as Record<string, unknown>)) {
    out[key] =
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'value' in value &&
      (value as {persistent?: unknown}).persistent === false
        ? (value as {value: unknown}).value
        : value;
  }
  return out;
}
