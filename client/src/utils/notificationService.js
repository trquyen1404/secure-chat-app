/**
 * Browser Notification Service for UTT Secure Chat
 */

class NotificationService {
  constructor() {
    this.audio = new Audio('/assets/notification.mp3');
    this.audio.volume = 0.5;
  }

  async requestPermission() {
    if (!('Notification' in window)) {
      console.warn('This browser does not support desktop notification');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  }

  playNotificationSound() {
    this.audio.play().catch(err => console.warn('Could not play notification sound:', err));
  }

  showNotification(title, options = {}) {
    if (Notification.permission === 'granted') {
      const defaultOptions = {
        icon: '/logo192.png', // Replace with your logo
        badge: '/logo192.png',
        silent: false,
        ...options
      };

      const notification = new Notification(title, defaultOptions);
      
      notification.onclick = (event) => {
        event.preventDefault();
        window.focus();
        notification.close();
      };

      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000);
    }
  }

  async notifyNewMessage(senderName, messageText, isGroup = false) {
    await this.requestPermission();
    this.playNotificationSound();
    
    const title = isGroup ? `Nhóm mới: ${senderName}` : senderName;
    const body = messageText.length > 50 ? messageText.substring(0, 50) + '...' : messageText;
    
    this.showNotification(title, { body });
  }
}

export default new NotificationService();
