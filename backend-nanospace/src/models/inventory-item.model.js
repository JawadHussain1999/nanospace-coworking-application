const defineModel = require('./base.model');

module.exports = defineModel('inventory_items', [
  'id', 'name', 'description', 'hsn_sac', 'rate', 'unit', 'tax_percent',
  'product_type', 'is_active', 'sellable', 'track_inventory', 'created_at', 'updated_at'
]);
