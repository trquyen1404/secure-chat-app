const webpush = require('web-push');
const { PushSubscription } = require('../models');

// Configure web-push with VAPID keys
webpush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:admin@securechat.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

exports.sendNotification = async (userId, payload) => {
  try {
    const subscriptions = await PushSubscription.findAll({ where: { userId } });
    
    const notifications = subscriptions.map(sub => {
      return webpush.sendNotification(sub.subscription, JSON.stringify(payload))
        .catch(err => {
          if (err.statusCode === 404 || err.statusCode === 410) {
            // Subscription expired or invalid, remove it
            return PushSubscription.destroy({ where: { id: sub.id } });
          }
          console.error('[Push] Failed to send to subscription:', sub.id, err.message);
        });
    });

    await Promise.all(notifications);
  } catch (err) {
    console.error('[Push] Error in sendNotification:', err.message);
  }
};

exports.sendGroupNotification = async (groupId, payload, excludeUserId = null) => {
  try {
    const { GroupMember } = require('../models');
    const members = await GroupMember.findAll({ where: { groupId } });
    
    const userIds = members
      .map(m => m.userId)
      .filter(uid => uid !== excludeUserId);

    const tasks = userIds.map(uid => exports.sendNotification(uid, payload));
    await Promise.all(tasks);
  } catch (err) {
    console.error('[Push] Error in sendGroupNotification:', err.message);
  }
};
