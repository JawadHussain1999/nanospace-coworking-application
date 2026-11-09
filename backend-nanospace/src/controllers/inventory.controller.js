const router = require('express').Router();
const pool = require('../models/database.model');
const ah = require('../utils/asyncHandler');
const {allowRoles} = require('../middleware/auth');
router.get('/', ah(async(req,res)=>{
  const result = await pool.query('SELECT * FROM inventory_items WHERE is_active=TRUE ORDER BY name');
  res.json({data:result.rows});
}));
router.post('/', allowRoles('SUPER_ADMIN'), ah(async(req,res)=>{
  const {name,description,hsnSac,rate,unit,taxPercent=0,productType='WORKSPACE',sellable=true,trackInventory=false} = req.body;
  if(!name || rate === undefined || !unit) return res.status(400).json({error:'name, rate and unit are required.'});
  const result=await pool.query(
    `INSERT INTO inventory_items(name,description,hsn_sac,rate,unit,tax_percent,product_type,sellable,track_inventory)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [name,description||null,hsnSac||null,rate,unit,taxPercent,productType,sellable,trackInventory]);
  res.status(201).json({data:result.rows[0]});
}));
router.patch('/:id', allowRoles('SUPER_ADMIN'), ah(async(req,res)=>{
  const {name,description,hsnSac,rate,unit,taxPercent,productType,isActive,sellable,trackInventory}=req.body;
  const result=await pool.query(
    `UPDATE inventory_items SET name=COALESCE($2,name),description=COALESCE($3,description),hsn_sac=COALESCE($4,hsn_sac),
     rate=COALESCE($5,rate),unit=COALESCE($6,unit),tax_percent=COALESCE($7,tax_percent),product_type=COALESCE($8,product_type),
     is_active=COALESCE($9,is_active),sellable=COALESCE($10,sellable),track_inventory=COALESCE($11,track_inventory),updated_at=NOW()
     WHERE id=$1 RETURNING *`,
    [req.params.id,name,description,hsnSac,rate,unit,taxPercent,productType,isActive,sellable,trackInventory]);
  if(!result.rowCount)return res.status(404).json({error:'Inventory item not found.'});
  res.json({data:result.rows[0]});
}));
module.exports=router;
