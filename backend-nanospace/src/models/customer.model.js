const defineModel = require('./base.model');

module.exports = defineModel('customers', [
  'id', 'user_id', 'branch_id', 'full_name', 'email', 'phone',
  'company_name', 'gstin', 'pan_number', 'address', 'created_at', 'updated_at'
]);
