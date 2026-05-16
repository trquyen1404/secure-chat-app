import api from './axiosConfig';

const VAPID_PUBLIC_KEY = 'BBxEZc_2BkFS1XeVLmUYDbr9r-g2SoJPbTKtjUYNwtu_RqEHaKeytrgJmaUU9fhec1ty0Uz5QXrzEQa9orRzq7c';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeToNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications are not supported by this browser');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    
    // Check existing subscription
    let subscription = await registration.pushManager.getSubscription();
    
    if (!subscription) {
      // Create new subscription
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    // Send subscription to backend
    await api.post('/api/notifications/subscribe', {
      subscription,
      deviceInfo: navigator.userAgent
    });

    console.log('Push notification subscription successful');
  } catch (err) {
    console.error('Failed to subscribe to push notifications', err);
  }
}

export async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered');
    } catch (err) {
      console.error('Service Worker registration failed', err);
    }
  }
}
