import { getJSON, setJSON } from "./store.ts";

/**
 * Push notifications for the mobile app. Devices register an Expo push token for
 * the signed-in person; the server sends through Expo's push service, which
 * forwards to Apple and Google. No keys are needed on our side for Expo's service.
 */
export type Device = { token: string; platform: string; addedAt: string };

const key = (teacherId: string) => `devices:${teacherId}`;
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export function isExpoPushToken(t: unknown): t is string {
  return typeof t === "string" && /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(t);
}

export async function devicesFor(teacherId: string): Promise<Device[]> {
  return (await getJSON<Device[]>(key(teacherId))) ?? [];
}

export async function registerDevice(teacherId: string, token: string, platform: string): Promise<void> {
  const list = (await devicesFor(teacherId)).filter((d) => d.token !== token);
  list.push({ token, platform, addedAt: new Date().toISOString() });
  await setJSON(key(teacherId), list.slice(-5)); // a person rarely has more than a few phones
}

export async function unregisterDevice(teacherId: string, token: string): Promise<void> {
  const list = (await devicesFor(teacherId)).filter((d) => d.token !== token);
  await setJSON(key(teacherId), list);
}

export type PushMessage = { title: string; body: string; data?: Record<string, unknown> };

/** Send one message to every device of each listed person. Returns how many devices were addressed. */
export async function sendPush(teacherIds: string[], msg: PushMessage): Promise<{ devices: number; errors: string[] }> {
  const unique = [...new Set(teacherIds)];
  const lists = await Promise.all(unique.map(devicesFor));
  const tokens = lists.flat().map((d) => d.token).filter(isExpoPushToken);
  const errors: string[] = [];
  if (!tokens.length) return { devices: 0, errors };
  const payload = tokens.map((to) => ({ to, sound: "default", title: msg.title, body: msg.body, data: msg.data ?? {} }));
  // Expo accepts up to 100 messages per request.
  for (let i = 0; i < payload.length; i += 100) {
    try {
      const r = await fetch(EXPO_PUSH_URL, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload.slice(i, i + 100)) });
      if (!r.ok) errors.push(`push service answered ${r.status}`);
      else {
        const j = await r.json().catch(() => null) as { data?: { status: string; message?: string; details?: { error?: string } }[] } | null;
        j?.data?.forEach((d, idx) => {
          if (d.status === "error") {
            errors.push(d.message || "push error");
            // A device that no longer exists: forget its token.
            if (d.details?.error === "DeviceNotRegistered") {
              const bad = payload[i + idx].to;
              unique.forEach((id) => { unregisterDevice(id, bad).catch(() => {}); });
            }
          }
        });
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "push failed");
    }
  }
  return { devices: tokens.length, errors };
}
