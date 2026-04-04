self.addEventListener('push', function(event) {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch(e) {
      data = { title: 'Tin nhắn bảo mật', body: 'Bạn có tin nhắn mới' };
    }
  }

  const title = data.title || 'Thông báo mới';
  const options = {
    body: data.body || 'Bạn có thông báo mới.',
    icon: '/vite.svg', // generic icon
    badge: '/vite.svg'
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});
