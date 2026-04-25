const webpush = require('web-push');
const User = require('../models/User');

// const publicVapidKey = process.env.VAPID_PUBLIC_KEY || 'BAcO9s5n7n65j9B__pYk-_lGtyX_48hSDEpQ4b87sY1D-mXKX_p9g3-6_t5B-B9X4A-P8U5n39h';
// const privateVapidKey = process.env.VAPID_PRIVATE_KEY || '9_D8_EHD01d3x-9Jg8E0r55m3_Z1sS2k-_n2O14';

// webpush.setVapidDetails('mailto:support@securechat.com', publicVapidKey, privateVapidKey);

exports.getVapidPublicKey = (req, res) => {
  res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY || 'DISABLED' });
};

exports.subscribe = async (req, res) => {
  try {
    const subscription = req.body;
    await User.update({ webPushSubscription: subscription }, { where: { id: req.userId } });
    res.status(201).json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to subscribe to push notifications' });
  }
};
