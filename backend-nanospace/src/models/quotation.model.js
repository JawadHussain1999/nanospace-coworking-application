const defineModel = require('./base.model');

module.exports = defineModel('quotations', [
  'id', 'branch_id', 'customer_id', 'created_by', 'quotation_number', 'items',
  'subtotal', 'tax_amount', 'discount_amount', 'total_amount', 'valid_until',
  'status', 'notes', 'created_at', 'updated_at'
]);
