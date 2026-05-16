const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// 1. Resume Builder / Career
const ResumeProfile = sequelize.define('ResumeProfile', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  skills: { type: DataTypes.JSONB, defaultValue: [] },
  experience: { type: DataTypes.JSONB, defaultValue: [] },
  education: { type: DataTypes.JSONB, defaultValue: [] }
});

// 3. Internship Journal
const InternshipJournal = sequelize.define('InternshipJournal', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  entryDate: { type: DataTypes.DATE },
  content: { type: DataTypes.TEXT },
  supervisorFeedback: { type: DataTypes.TEXT }
});

// 9. Group Buy
const GroupBuy = sequelize.define('GroupBuy', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  itemName: { type: DataTypes.STRING, allowNull: false },
  price: { type: DataTypes.INTEGER },
  minParticipants: { type: DataTypes.INTEGER },
  currentParticipants: { type: DataTypes.JSONB, defaultValue: [] }
});

// 11. Encrypted Vault (Metadata only, content is encrypted)
const VaultFile = sequelize.define('VaultFile', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  fileName: { type: DataTypes.STRING },
  encryptedKey: { type: DataTypes.TEXT }, // Master key encrypted for this file
  fileData: { type: DataTypes.TEXT } // Encrypted blob
});

// 13. Secret Santa
const SecretSantaSession = sequelize.define('SecretSantaSession', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  groupId: { type: DataTypes.UUID },
  pairings: { type: DataTypes.JSONB, defaultValue: {} } // { giverId: receiverId }
});

module.exports = { ResumeProfile, InternshipJournal, GroupBuy, VaultFile, SecretSantaSession };
