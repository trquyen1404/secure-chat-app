const { Schedule } = require('../models');

exports.addSchedule = async (req, res) => {
  try {
    const { subjectName, dayOfWeek, startTime, endTime, room, teacherName } = req.body;
    const schedule = await Schedule.create({
      userId: req.userId,
      subjectName,
      dayOfWeek,
      startTime,
      endTime,
      room,
      teacherName
    });
    res.status(201).json(schedule);
  } catch (error) {
    res.status(500).json({ message: 'Error adding schedule' });
  }
};

exports.getMySchedule = async (req, res) => {
  try {
    const schedules = await Schedule.findAll({
      where: { userId: req.userId },
      order: [['dayOfWeek', 'ASC'], ['startTime', 'ASC']]
    });
    res.json(schedules);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching schedule' });
  }
};

exports.deleteSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    await Schedule.destroy({ where: { id, userId: req.userId } });
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting' });
  }
};
