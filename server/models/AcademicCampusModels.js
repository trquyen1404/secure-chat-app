const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// 1. Peer Tutoring
const TutorRequest = sequelize.define('TutorRequest', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  subject: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  status: { type: DataTypes.STRING, defaultValue: 'open' } // open, matched, closed
});
TutorRequest.associate = (models) => {
  TutorRequest.belongsTo(models.User, { foreignKey: 'userId' });
};

// 3. Course Review
const CourseReview = sequelize.define('CourseReview', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  courseName: { type: DataTypes.STRING, allowNull: false },
  lecturerName: { type: DataTypes.STRING },
  rating: { type: DataTypes.INTEGER },
  content: { type: DataTypes.TEXT }
});
CourseReview.associate = (models) => {
  CourseReview.belongsTo(models.User, { foreignKey: 'userId' });
};

// 4. Project Showcase
const Project = sequelize.define('Project', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  title: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  link: { type: DataTypes.STRING },
  imageUrl: { type: DataTypes.TEXT }
});
Project.associate = (models) => {
  Project.belongsTo(models.User, { foreignKey: 'userId' });
};

// 6. Canteen Order
const CanteenOrder = sequelize.define('CanteenOrder', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  items: { type: DataTypes.JSONB, allowNull: false },
  totalPrice: { type: DataTypes.INTEGER },
  status: { type: DataTypes.STRING, defaultValue: 'pending' } // pending, preparing, ready, completed
});

// 7. Library Booking
const LibraryBooking = sequelize.define('LibraryBooking', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  seatNumber: { type: DataTypes.STRING, allowNull: false },
  startTime: { type: DataTypes.DATE, allowNull: false },
  endTime: { type: DataTypes.DATE, allowNull: false }
});

module.exports = { TutorRequest, CourseReview, Project, CanteenOrder, LibraryBooking };
