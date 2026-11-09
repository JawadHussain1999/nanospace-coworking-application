const defineModel = require('./base.model');

module.exports = defineModel('users', [
  'id', 'full_name', 'email', 'password_hash', 'role', 'branch_id',
  'is_active', 'created_at', 'updated_at'
]);
