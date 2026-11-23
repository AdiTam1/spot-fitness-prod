/* SPOT Fitness Push-Only Service Worker (No fetch caching - safe for Next.js App Router) */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json() || {};
  } catch {
    payload = { body: event.data.text ? event.data.text() : '' };
  }

  const notif =
    payload && typeof payload.notification === 'object' && payload.notification
      ? payload.notification
      : payload;

  const title = notif.title || 'SPOT Fitness';
  const body = notif.body || 'יש לך עדכון חדש באפליקציה';
  const targetUrl =
    notif.navigate ||
    notif.url ||
    (payload.spotData && payload.spotData.url) ||
    '/';
  const spotData = payload.spotData || notif.data || {};
  const tag = notif.tag || spotData.spotPushId || `spot-push-${Date.now()}`;

  const showPromise = self.registration.showNotification(title, {
    body,
    icon: notif.icon || '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag,
    dir: 'rtl',
    lang: 'he-IL',
    data: {
      navigate: targetUrl,
      spotScreen: spotData.spotScreen,
      spotMealSlotId: spotData.spotMealSlotId,
      spotDate: spotData.spotDate,
      spotPushId: spotData.spotPushId,
      spotKind: spotData.spotKind,
    },
  });

  const badgeCount =
    typeof notif.app_badge === 'number' && notif.app_badge > 0
      ? notif.app_badge
      : 1;
  const badgePromise =
    self.navigator && typeof self.navigator.setAppBadge === 'function'
      ? self.navigator.setAppBadge(badgeCount).catch(() => {})
      : Promise.resolve();

  event.waitUntil(Promise.all([showPromise, badgePromise]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const rawNavigate = data.navigate || '/';
  let absoluteTargetUrl = self.location.origin + '/';
  try {
    absoluteTargetUrl = new URL(rawNavigate, self.location.origin).href;
  } catch {
    absoluteTargetUrl = self.location.origin + '/';
  }

  let parsedParams = {};
  try {
    const u = new URL(absoluteTargetUrl);
    parsedParams = {
      spotPushId:
        data.spotPushId || u.searchParams.get('spotPushId') || `sw-${Date.now()}`,
      spotScreen:
        data.spotScreen || u.searchParams.get('spotScreen') || 'journal',
      spotMealSlotId:
        data.spotMealSlotId || u.searchParams.get('spotMealSlotId') || undefined,
      spotDate: data.spotDate || u.searchParams.get('spotDate') || undefined,
      spotKind: data.spotKind || u.searchParams.get('spotKind') || undefined,
    };
  } catch {
    parsedParams = {
      spotPushId: data.spotPushId || `sw-${Date.now()}`,
      spotScreen: data.spotScreen || 'journal',
      spotMealSlotId: data.spotMealSlotId,
      spotDate: data.spotDate,
      spotKind: data.spotKind,
    };
  }

  const clearBadgePromise =
    self.navigator && typeof self.navigator.clearAppBadge === 'function'
      ? self.navigator.clearAppBadge().catch(() => {})
      : Promise.resolve();

  const routePromise = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then(async (clientList) => {
      for (const client of clientList) {
        if (
          client.url &&
          client.url.startsWith(self.location.origin) &&
          'focus' in client
        ) {
          await client.focus();
          client.postMessage({
            type: 'SPOT_PUSH_DEEP_LINK',
            target: parsedParams,
          });
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(absoluteTargetUrl);
      }
    });

  event.waitUntil(Promise.all([clearBadgePromise, routePromise]));
});
