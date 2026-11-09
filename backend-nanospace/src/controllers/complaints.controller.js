const router=require('express').Router();
const pool=require('../models/database.model');
const ah=require('../utils/asyncHandler');
const {allowRoles}=require('../middleware/auth');
const staff=['SUPER_ADMIN','BRANCH_ADMIN','RECEPTION_ADMIN'];
router.get('/',ah(async(req,res)=>{
 const u=req.user;let result;
 const select = `SELECT cm.*, c.full_name AS customer, c.full_name AS customer_name,
                        b.name AS branch, b.name AS branch_name,
                        cm.title AS issue, cm.created_at AS date
                 FROM complaints cm
                 LEFT JOIN customers c ON c.id=cm.customer_id
                 LEFT JOIN branches b ON b.id=cm.branch_id`;
 let sql = `${select} WHERE 1=1`;
 const p = [];
 if (u.role === 'CUSTOMER') {
   p.push(u.id);
   sql += ` AND c.user_id = $${p.length}`;
 } else if (u.role === 'EMPLOYEE') {
   p.push(u.id);
   sql += ` AND cm.assigned_to = $${p.length}`;
 } else if (u.role !== 'SUPER_ADMIN') {
   p.push(u.branch_id);
   sql += ` AND cm.branch_id = $${p.length}`;
 } else if (req.query.branch && req.query.branch.toLowerCase() !== 'all branches') {
   const bRes = await pool.query('SELECT id FROM branches WHERE name ILIKE $1 OR code ILIKE $1 LIMIT 1', [req.query.branch]);
   if (bRes.rowCount) {
     p.push(bRes.rows[0].id);
     sql += ` AND cm.branch_id = $${p.length}`;
   }
 }
 sql += ' ORDER BY cm.created_at DESC';
 result = await pool.query(sql, p);
 res.json({data:result.rows});
}));
router.post('/',ah(async(req,res)=>{
 const u=req.user;const {branchId,customerId,title,description,priority='MEDIUM'}=req.body;
 const branch=u.role==='SUPER_ADMIN'?branchId:u.branch_id;
 if(!branch||!title||!description)return res.status(400).json({error:'branchId (Super Admin only), title and description are required.'});
 let customer=null;
 if(u.role==='CUSTOMER'){
  const c=await pool.query('SELECT id FROM customers WHERE user_id=$1',[u.id]);if(!c.rowCount)return res.status(400).json({error:'Customer profile not found.'});customer=c.rows[0].id;
 }else if(customerId){
  const c=await pool.query('SELECT id FROM customers WHERE id=$1 AND branch_id=$2',[customerId,branch]);if(!c.rowCount)return res.status(404).json({error:'Customer not found.'});customer=c.rows[0].id;
 }
 const result=await pool.query('INSERT INTO complaints(branch_id,customer_id,created_by,title,description,priority) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[branch,customer,u.id,title,description,priority]);
 res.status(201).json({data:result.rows[0]});
}));
router.patch('/:id/status',allowRoles(...staff),ah(async(req,res)=>{
 const {status,assignedTo}=req.body;
 if(!['OPEN','IN_PROGRESS','RESOLVED','CLOSED'].includes(status))return res.status(400).json({error:'Invalid complaint status.'});
 const p=[req.params.id,status,assignedTo??null];let sql='UPDATE complaints SET status=$2,assigned_to=COALESCE($3,assigned_to),updated_at=NOW() WHERE id=$1';
 if(req.user.role!=='SUPER_ADMIN'){p.push(req.user.branch_id);sql+=` AND branch_id=$${p.length}`;}
 sql+=' RETURNING *';const result=await pool.query(sql,p);
 if(!result.rowCount)return res.status(404).json({error:'Complaint not found.'});res.json({data:result.rows[0]});
}));
module.exports=router;
