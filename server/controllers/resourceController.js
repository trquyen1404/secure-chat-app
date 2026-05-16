const { Resource, User } = require('../models');

exports.addResource = async (req, res) => {
  try {
    const { groupId, title, fileUrl, fileType, fileSize, category } = req.body;
    const userId = req.userId;

    const resource = await Resource.create({
      groupId,
      userId,
      title,
      fileUrl,
      fileType,
      fileSize,
      category
    });

    res.status(201).json(resource);
  } catch (error) {
    console.error('Add resource error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getGroupResources = async (req, res) => {
  try {
    const { groupId } = req.params;
    const resources = await Resource.findAll({
      where: { groupId },
      include: [{ model: User, as: 'Uploader', attributes: ['id', 'username', 'displayName'] }],
      order: [['isPinned', 'DESC'], ['createdAt', 'DESC']]
    });
    res.json(resources);
  } catch (error) {
    console.error('Get resources error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.deleteResource = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const resource = await Resource.findByPk(id);
    if (!resource) return res.status(404).json({ message: 'Resource not found' });
    
    // Only uploader or admin/teacher (logic simplified) can delete
    if (resource.userId !== userId) {
      return res.status(403).json({ message: 'No permission' });
    }

    await resource.destroy();
    res.json({ message: 'Resource deleted' });
  } catch (error) {
    console.error('Delete resource error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.togglePin = async (req, res) => {
  try {
    const { id } = req.params;
    const resource = await Resource.findByPk(id);
    if (!resource) return res.status(404).json({ message: 'Resource not found' });

    resource.isPinned = !resource.isPinned;
    await resource.save();
    res.json(resource);
  } catch (error) {
    console.error('Toggle pin error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
