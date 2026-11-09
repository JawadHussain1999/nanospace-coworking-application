const router=require('express').Router();
const pool=require('../models/database.model');
const ah=require('../utils/asyncHandler');
const {allowRoles}=require('../middleware/auth');
const staff=['SUPER_ADMIN','BRANCH_ADMIN','RECEPTION_ADMIN'];
router.get('/',ah(async(req,res)=>{
const u=req.user;let result;
 const select = `SELECT q.*, c.full_name AS customer, c.full_name AS customer_name, b.name AS branch, b.name AS branch_name, q.total_amount AS amount, q.created_at AS date
                 FROM quotations q
                 JOIN customers c ON c.id=q.customer_id
                 LEFT JOIN branches b ON b.id=q.branch_id`;
 let sql = `${select} WHERE 1=1`;
 const p = [];
 if (u.role === 'CUSTOMER') {
   p.push(u.id);
   sql += ` AND c.user_id = $${p.length}`;
 } else if (u.role !== 'SUPER_ADMIN') {
   p.push(u.branch_id);
   sql += ` AND q.branch_id = $${p.length}`;
 } else if (req.query.branch && req.query.branch.toLowerCase() !== 'all branches') {
   const bRes = await pool.query('SELECT id FROM branches WHERE name ILIKE $1 OR code ILIKE $1 LIMIT 1', [req.query.branch]);
   if (bRes.rowCount) {
     p.push(bRes.rows[0].id);
     sql += ` AND q.branch_id = $${p.length}`;
   }
 }
 sql += ' ORDER BY q.created_at DESC';
 result = await pool.query(sql, p);
 res.json({data:result.rows});
}));
router.post('/',allowRoles(...staff),ah(async(req,res)=>{
 const u=req.user;const {branchId,customerId,items,discountAmount=0,validUntil,notes,taxRate=18,taxMode='CGST_SGST'}=req.body;
 const branch=u.role==='SUPER_ADMIN'?branchId:u.branch_id;
 if(!branch||!customerId||!Array.isArray(items)||!items.length)return res.status(400).json({error:'branchId, customerId and a non-empty items array are required.'});
 const cust=await pool.query('SELECT id FROM customers WHERE id=$1 AND branch_id=$2',[customerId,branch]);
 if(!cust.rowCount)return res.status(404).json({error:'Customer not found for this branch.'});
 const ids=[...new Set(items.map(i=>i.inventoryItemId))];
 if(ids.some(x=>!x))return res.status(400).json({error:'Every item requires inventoryItemId and quantity.'});
 const inv=await pool.query('SELECT id,name,description,hsn_sac,rate,tax_percent,unit FROM inventory_items WHERE id=ANY($1::uuid[]) AND is_active=TRUE AND sellable=TRUE',[ids]);
 if(inv.rowCount!==ids.length)return res.status(400).json({error:'One or more inventory items are invalid.'});
 const map=new Map(inv.rows.map(i=>[i.id,i]));
 const rate=Number(taxRate);
 const mode=String(taxMode).toUpperCase();
 if(!Number.isFinite(rate)||rate<0||rate>100)return res.status(400).json({error:'taxRate must be between 0 and 100.'});
 if(!['CGST_SGST','IGST'].includes(mode))return res.status(400).json({error:'taxMode must be CGST_SGST or IGST.'});
 let subtotal=0;
 const snapshots=items.map(line=>{
   const item=map.get(line.inventoryItemId);const qty=Number(line.quantity);
   if(!Number.isInteger(qty)||qty<1)throw Object.assign(new Error('Item quantity must be a positive integer.'),{status:400});
   const lineSubtotal=Number(item.rate)*qty;const lineTax=Number((lineSubtotal*Number(item.tax_percent)/100).toFixed(2));
   subtotal+=lineSubtotal;
   return {inventoryItemId:item.id,name:item.name,description:item.description,hsn_sac:item.hsn_sac,unit:item.unit,quantity:qty,unitRate:Number(item.rate),taxPercent:Number(item.tax_percent),subtotal:lineSubtotal,taxAmount:lineTax,total:Number((lineSubtotal+lineTax).toFixed(2))};
 });
 subtotal=Number(subtotal.toFixed(2));
 const discount=Number(discountAmount);
 if(!Number.isFinite(discount)||discount<0||discount>subtotal)return res.status(400).json({error:'Invalid discountAmount.'});
 const taxableSubtotal=Number((subtotal-discount).toFixed(2));
 const taxAmount=Number((taxableSubtotal*rate/100).toFixed(2));
 const total=Number((taxableSubtotal+taxAmount).toFixed(2));
 const discountRatio=subtotal>0?taxableSubtotal/subtotal:0;
 let accruedTaxable=0;let allocatedTaxable=0;let allocatedTax=0;
 const taxedSnapshots=snapshots.map((item,index)=>{
  accruedTaxable+=item.subtotal*discountRatio;
  const roundedTaxable=Number(accruedTaxable.toFixed(2));
  const taxableLine=Number((roundedTaxable-allocatedTaxable).toFixed(2));
  allocatedTaxable=roundedTaxable;
  const roundedTax=index===snapshots.length-1?taxAmount:Number((accruedTaxable*rate/100).toFixed(2));
  const lineTax=Number((roundedTax-allocatedTax).toFixed(2));
  allocatedTax=roundedTax;
  return {...item,taxPercent:rate,subtotal:taxableLine,taxAmount:lineTax,total:Number((taxableLine+lineTax).toFixed(2))};
 });
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(62514001)');
  const branchResult=await client.query('SELECT name FROM branches WHERE id=$1',[branch]);
  if(!branchResult.rowCount)throw Object.assign(new Error('Quotation branch not found.'),{status:404});
  const {getQuotationNumberPrefix}=require('../utils/quotationBranchDetails');
  const prefix=getQuotationNumberPrefix(branchResult.rows[0].name);
  const latest=await client.query(
   `SELECT COALESCE(MAX(SUBSTRING(quotation_number FROM '([0-9]+)$')::BIGINT),0) AS latest
    FROM quotations WHERE branch_id=$1 AND quotation_number ~ $2`,
   [branch,`^${prefix}-QT-[0-9]+$`]
  );
  const number=`${prefix}-QT-${String(Number(latest.rows[0].latest)+1).padStart(2,'0')}`;
  const result=await client.query(
   `INSERT INTO quotations(branch_id,customer_id,created_by,quotation_number,items,subtotal,tax_amount,discount_amount,total_amount,tax_rate,tax_mode,valid_until,notes)
    VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
   [branch,customerId,u.id,number,JSON.stringify(taxedSnapshots),subtotal,taxAmount,discount,total,rate,mode,validUntil||null,notes||null]
  );
  await client.query('COMMIT');
  res.status(201).json({data:result.rows[0]});
 }catch(error){await client.query('ROLLBACK');throw error;}
 finally{client.release();}
}));
router.get('/:id/pdf',allowRoles(...staff,'CUSTOMER'),ah(async(req,res)=>{
 const u=req.user;const params=[req.params.id];let scope="($1='SUPER_ADMIN' OR 1=0)";
 if(u.role==='SUPER_ADMIN')scope='TRUE';
 else if(u.role==='CUSTOMER')scope=`c.user_id='${u.id}'`;
 else scope=`q.branch_id='${u.branch_id}'`;
 const result=await pool.query(`SELECT q.*,c.full_name AS customer_name,c.company_name,c.email AS customer_email,c.phone AS customer_phone,c.gstin AS customer_gstin,c.address AS customer_address,b.name AS branch_name,b.address AS branch_address
  FROM quotations q JOIN customers c ON c.id=q.customer_id LEFT JOIN branches b ON b.id=q.branch_id
  WHERE (q.id::text=$1 OR q.quotation_number=$1) AND (${scope}) LIMIT 1`,params);
 if(!result.rowCount)return res.status(404).json({error:'Quotation not found.'});
 const {generateQuotationPdf}=require('../utils/pdfHelper');const pdf=await generateQuotationPdf(result.rows[0]);const filename=String(result.rows[0].quotation_number||req.params.id).replace(/[^a-zA-Z0-9_-]/g,'_');
 res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${filename}.pdf"`);res.send(pdf);
}));
router.post('/:id/email',allowRoles(...staff),ah(async(req,res)=>{
 const u=req.user;const params=[req.params.id];let scope='TRUE';
 if(u.role!=='SUPER_ADMIN'){params.push(u.branch_id);scope=`q.branch_id=$${params.length}`;}
 const result=await pool.query(`SELECT q.*,c.full_name AS customer_name,c.email AS customer_email,c.company_name,c.phone AS customer_phone,c.gstin AS customer_gstin,c.address AS customer_address,b.name AS branch_name,b.address AS branch_address
  FROM quotations q JOIN customers c ON c.id=q.customer_id LEFT JOIN branches b ON b.id=q.branch_id
  WHERE (q.id::text=$1 OR q.quotation_number=$1) AND ${scope} LIMIT 1`,params);
 if(!result.rowCount)return res.status(404).json({error:'Quotation not found.'});
 const quotation=result.rows[0];
 if(!quotation.customer_email)return res.status(400).json({error:'The selected customer does not have an email address.'});
 const {generateQuotationPdf}=require('../utils/pdfHelper');
 const {getQuotationBranchDetails}=require('../utils/quotationBranchDetails');
 const {sendQuotationEmail}=require('../utils/mailer');
 const branchDetails=getQuotationBranchDetails(quotation.branch_name||quotation.branch);
 const pdf=await generateQuotationPdf(quotation);
 try{
  await sendQuotationEmail({
   email:quotation.customer_email,
   customerName:quotation.customer_name,
   quotationNumber:quotation.quotation_number,
   quotationDate:new Date(quotation.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric',timeZone:'Asia/Kolkata'}),
   validUntil:quotation.valid_until?new Date(quotation.valid_until).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric',timeZone:'Asia/Kolkata'}):null,
   branchName:branchDetails.name,
   branchAddress:branchDetails.address,
   branchPhone:branchDetails.phone,
   branchEmail:branchDetails.email,
   total:quotation.total_amount,
   pdf,
  });
 }catch(error){
  console.error(`Could not email quotation ${quotation.quotation_number} to its customer:`,error.message);
  return res.status(502).json({error:error.message.includes('SMTP is not configured')?error.message:'The quotation email could not be delivered. Check the SMTP configuration and try again.'});
 }
 if(quotation.status==='DRAFT'){
  await pool.query("UPDATE quotations SET status='SENT',updated_at=NOW() WHERE id=$1 AND status='DRAFT'",[quotation.id]);
 }
 res.json({data:{quotation_number:quotation.quotation_number,email:quotation.customer_email,status:'SENT'}});
}));
router.patch('/:id/status',ah(async(req,res)=>{
 const {status}=req.body;const u=req.user;
 if(!['SENT','ACCEPTED','REJECTED','EXPIRED','DRAFT'].includes(status))return res.status(400).json({error:'Invalid quotation status.'});
 let result;
 if(staff.includes(u.role)){
  const p=[req.params.id,status];let sql='UPDATE quotations SET status=$2,updated_at=NOW() WHERE id=$1';
  if(u.role!=='SUPER_ADMIN'){p.push(u.branch_id);sql+=` AND branch_id=$${p.length}`;}
  sql+=' RETURNING *';result=await pool.query(sql,p);
 }else if(u.role==='CUSTOMER'&&['ACCEPTED','REJECTED'].includes(status)){
  result=await pool.query(`UPDATE quotations q SET status=$2,updated_at=NOW() FROM customers c WHERE q.id=$1 AND q.customer_id=c.id AND c.user_id=$3 AND q.status='SENT' RETURNING q.*`,[req.params.id,status,u.id]);
 }else return res.status(403).json({error:'You cannot change quotation status.'});
 if(!result.rowCount)return res.status(404).json({error:'Quotation not found or status transition not allowed.'});
 res.json({data:result.rows[0]});
}));
module.exports=router;
