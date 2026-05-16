const { User } = require('./models');

async function testCreate() {
  try {
    const [user, created] = await User.findOrCreate({
      where: { username: 'utt_assistant' },
      defaults: {
        username: 'utt_assistant',
        displayName: 'Trợ lý ảo UTT 🤖',
        email: 'assistant@utt.edu.vn',
        password: 'virtual_user_no_login',
        publicKey: 'BOT_VIRTUAL_KEY',
        dhPublicKey: 'BOT_VIRTUAL_KEY',
        role: 'bot',
        isVerified: true
      }
    });
    console.log('Bot user exists/created:', !!user);
    process.exit(0);
  } catch (err) {
    console.error('ERROR DETAIL:', err);
    if (err.errors) {
      err.errors.forEach(e => console.log(' - Path:', e.path, 'Message:', e.message));
    }
    process.exit(1);
  }
}

testCreate();
