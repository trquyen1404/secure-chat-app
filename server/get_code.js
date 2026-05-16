const { User } = require('./models');
const { Op } = require('sequelize');

async function checkUTTUsers() {
  try {
    const users = await User.findAll({
      where: {
        email: { [Op.like]: '%utt.edu.vn' }
      },
      attributes: ['username', 'email', 'verificationToken', 'isVerified'],
      order: [['createdAt', 'DESC']]
    });

    console.log('--- UTT USERS ---');
    users.forEach(u => {
      console.log(`User: ${u.username} | Email: ${u.email} | Code: ${u.verificationToken} | Verified: ${u.isVerified}`);
    });
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkUTTUsers();
