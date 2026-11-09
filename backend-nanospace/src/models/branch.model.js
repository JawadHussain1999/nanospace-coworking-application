const defineModel = require('./base.model');

module.exports = defineModel('branches', [
  'id', 'name', 'code', 'address', 'is_active', 'created_at', 'updated_at'
]);
