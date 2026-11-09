const defineModel = require('./base.model');

module.exports = defineModel('complaints', [
  'id', 'branch_id', 'customer_id', 'created_by', 'assigned_to', 'title',
  'description', 'priority', 'status', 'created_at', 'updated_at'
]);
