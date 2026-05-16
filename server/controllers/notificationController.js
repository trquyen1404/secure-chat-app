const { PushSubscription } = require('../models');

exports.subscribe = async (req, res) => {
  try {
    const { subscription, deviceInfo } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }

    // Save or update subscription
    await PushSubscription.findOrCreate({
      where: { 
        userId: req.user.id, 
        'subscription.endpoint': subscription.endpoint 
      },
      defaults: {
        userId: req.user.id,
        subscription,
        deviceInfo
      }
    });

    res.status(201).json({ message: 'Subscribed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body;
    await PushSubscription.destroy({
      where: { 
        userId: req.user.id, 
        'subscription.endpoint': endpoint 
      }
    });
    res.json({ message: 'Unsubscribed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
