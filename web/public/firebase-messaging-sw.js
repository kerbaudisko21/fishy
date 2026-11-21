/* global importScripts, firebase */
// Background team alerts (Firebase Cloud Messaging). The Firebase config arrives in the query string
// when the page registers this worker, so no project values are hard-coded here.
importScripts('https://www.gstatic.com/firebasejs/13.4.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/13.4.0/firebase-messaging-compat.js');

const params = Object.fromEntries(new URL(self.location.href).searchParams);
firebase.initializeApp(params);

firebase.messaging().onBackgroundMessage((payload) => {
  const data = payload.data || {};
  self.registration.showNotification(data.title || 'FISHY', {
    body: data.body || 'A payment check needs your attention.',
    icon: '/apple-touch-icon.png',
    badge: '/favicon-32.png',
    data: { url: data.incidentId ? `/incident?id=${encodeURIComponent(data.incidentId)}` : '/' },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url || '/'));
});
