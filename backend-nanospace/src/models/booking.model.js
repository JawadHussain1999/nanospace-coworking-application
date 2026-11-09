const defineModel = require('./base.model');

module.exports = defineModel('bookings', [
  'id', 'branch_id', 'workspace_id', 'customer_id', 'inventory_item_id',
  'created_by', 'starts_at', 'ends_at', 'quantity', 'seat_count', 'unit_rate', 'tax_percent',
  'subtotal', 'tax_amount', 'total_amount', 'advance_amount', 'status', 'booking_source', 'notes',
  'created_at', 'updated_at'
]);
