const { Resource, User, GroupMember } = require('../models');

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
    
    // Allow uploader, group admin or teacher to delete
    const member = await GroupMember.findOne({ where: { groupId: resource.groupId, userId } });
    const isUploader = resource.userId === userId;
    const isAdmin = member && member.role === 'admin';
    const isTeacher = req.user && req.user.role === 'teacher';

    if (!isUploader && !isAdmin && !isTeacher) {
      return res.status(403).json({ error: 'Bạn không có quyền xóa tài liệu này.' });
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
    const userId = req.userId;
    const resource = await Resource.findByPk(id);
    if (!resource) return res.status(404).json({ message: 'Resource not found' });

    // Verify membership & permissions: uploader, group admin or teacher can pin
    const member = await GroupMember.findOne({ where: { groupId: resource.groupId, userId } });
    if (!member) {
      return res.status(403).json({ error: 'Truy cập bị từ chối: Bạn không phải thành viên của nhóm học tập này.' });
    }

    const isUploader = resource.userId === userId;
    const isAdmin = member.role === 'admin';
    const isTeacher = req.user && req.user.role === 'teacher';

    if (!isUploader && !isAdmin && !isTeacher) {
      return res.status(403).json({ error: 'Chỉ người tải lên, giảng viên hoặc quản trị viên nhóm mới có quyền ghim tài liệu.' });
    }

    resource.isPinned = !resource.isPinned;
    await resource.save();
    res.json(resource);
  } catch (error) {
    console.error('Toggle pin error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
