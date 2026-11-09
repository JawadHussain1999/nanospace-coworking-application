const defineModel = require('./base.model');

module.exports = defineModel('workspaces', [
  'id', 'branch_id', 'floor', 'code', 'name', 'workspace_type', 'capacity',
  'inventory_item_id', 'status', 'layout_x', 'layout_y', 'layout_width',
  'layout_height', 'is_active', 'created_at', 'updated_at'
]);
