const router=require('express').Router();
const pool=require('../models/database.model');
const ah=require('../utils/asyncHandler');
const {allowRoles}=require('../middleware/auth');

async function resolveBranchId(req, requestedBranch) {
  const branch = req.user.role === 'SUPER_ADMIN' ? requestedBranch : req.user.branch_id;
  if (!branch) return null;
  if (/^[0-9a-f]{8}-/i.test(branch)) return branch;
  const result = await pool.query(
    'SELECT id FROM branches WHERE name ILIKE $1 OR code ILIKE $1 LIMIT 1',
    [branch]
  );
  return result.rows[0]?.id || null;
}

const bookableLayoutTypes = {
  cabin: { workspaceType: 'PRIVATE_CABIN', category: 'private_cabin', capacity: 4, name: 'Private Cabin' },
  private_cabin: { workspaceType: 'PRIVATE_CABIN', category: 'private_cabin', capacity: 4, name: 'Private Cabin' },
  conference_room: { workspaceType: 'CONFERENCE_ROOM', category: 'conference_room', capacity: 8, name: 'Conference Room' },
  meeting_room: { workspaceType: 'MEETING_ROOM', category: 'conference_room', capacity: 6, name: 'Meeting Room' },
  open_desk: { workspaceType: 'OPEN_DESK', category: 'open_desk', capacity: 10, name: 'Open Desk Area' },
  podcast_room: { workspaceType: 'PODCAST_ROOM', category: 'podcast_room', capacity: 4, name: 'Podcast Room' },
};

const workspaceTypeCategory = (type) => {
  const value = String(type || '').toUpperCase();
  if (value.includes('PRIVATE') || value.includes('CABIN') || value.includes('OFFICE')) return 'private_cabin';
  if (value.includes('CONFERENCE') || value.includes('MEETING')) return 'conference_room';
  if (value.includes('PODCAST') || value.includes('STUDIO') || value.includes('RECORD')) return 'podcast_room';
  if (value.includes('OPEN') || value.includes('HOT') || value.includes('DESK')) return 'open_desk';
  return '';
};

async function syncBookableLayoutWorkspaces(client, branchId, floor, objects) {
  const result = await client.query(
    `SELECT id, code, name, workspace_type, capacity FROM workspaces
     WHERE branch_id = $1 AND floor = $2 AND is_active = TRUE ORDER BY code`,
    [branchId, floor]
  );
  const existing = result.rows;
  const used = new Set();
  for (const object of objects) {
    const definition = bookableLayoutTypes[String(object.type || '').toLowerCase()];
    if (!definition) continue;
    const capacity = Number(object.capacity) > 0 ? Number(object.capacity) : definition.capacity;
    const candidates = existing.filter((workspace) =>
      !used.has(String(workspace.id)) &&
      workspaceTypeCategory(workspace.workspace_type) === definition.category
    );
    const label = String(object.label || '').toLowerCase().replace(/ · /g, ' ');
    const match = candidates.find((workspace) => Number(workspace.capacity) === capacity) ||
      candidates.find((workspace) => Math.abs(Number(workspace.capacity) - capacity) <= 2) ||
      (label ? candidates.find((workspace) => String(workspace.name || '').toLowerCase().includes(label)) : null) ||
      candidates[0];
    if (match) {
      used.add(String(match.id));
      continue;
    }

    const objectId = String(object.id || '');
    const code = `${definition.workspaceType.replace(/_/g, '-')}-${objectId.slice(-8).toUpperCase()}`;
    const name = label || definition.name;
    const inserted = await client.query(
      `INSERT INTO workspaces (
         branch_id, floor, code, name, workspace_type, capacity, status,
         layout_x, layout_y, layout_width, layout_height,
         draft_layout_x, draft_layout_y, layout_published, is_active
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'AVAILABLE', $7, $8, $9, $10, $7, $8, TRUE, TRUE)
       ON CONFLICT (branch_id, floor, code) DO UPDATE SET
         name = EXCLUDED.name, workspace_type = EXCLUDED.workspace_type,
         capacity = EXCLUDED.capacity, layout_x = EXCLUDED.layout_x,
         layout_y = EXCLUDED.layout_y, layout_width = EXCLUDED.layout_width,
         layout_height = EXCLUDED.layout_height, layout_published = TRUE,
         is_active = TRUE, updated_at = NOW()
       RETURNING id`,
      [branchId, floor, code, name, definition.workspaceType, capacity, object.x, object.y, object.width, object.height]
    );
    used.add(String(inserted.rows[0].id));
    existing.push({
      id: inserted.rows[0].id,
      workspace_type: definition.workspaceType,
      capacity,
      name,
      code,
    });
  }
}

router.get('/', ah(async (req, res) => {
  const { branchId, floor, branch: queryBranch } = req.query;
  let targetBranch = req.user.role === 'SUPER_ADMIN' ? (branchId || queryBranch) : req.user.branch_id;
  if (targetBranch && !/^[0-9a-f]{8}-/i.test(targetBranch) && String(targetBranch).toLowerCase() !== 'all branches') {
    const bRes = await pool.query('SELECT id FROM branches WHERE name ILIKE $1 OR code ILIKE $1 LIMIT 1', [targetBranch]);
    if (bRes.rowCount) targetBranch = bRes.rows[0].id;
  }
  if (req.user.role !== 'SUPER_ADMIN' && targetBranch && targetBranch !== req.user.branch_id) {
    return res.status(403).json({ error: 'Cannot access another branch.' });
  }

  const params = [];
  let sql = `SELECT w.*, b.name AS branch_name,
               COALESCE(booked.booked_seats, 0)::int AS booked_seats,
               GREATEST(w.capacity - COALESCE(booked.booked_seats, 0), 0)::int AS available_capacity,
               CASE
                 WHEN w.status = 'MAINTENANCE' THEN 'MAINTENANCE'
                 WHEN w.status = 'RESERVED' THEN 'RESERVED'
                 WHEN COALESCE(booked.booked_seats, 0) >= w.capacity THEN 'OCCUPIED'
                 WHEN w.status = 'OCCUPIED' AND COALESCE(booked.booked_seats, 0) = 0 THEN 'OCCUPIED'
                 ELSE 'AVAILABLE'
               END AS status,
               (NOT w.layout_published OR
                 w.draft_layout_x IS DISTINCT FROM w.layout_x OR
                 w.draft_layout_y IS DISTINCT FROM w.layout_y) AS layout_has_draft
             FROM workspaces w
             JOIN branches b ON b.id = w.branch_id
             LEFT JOIN LATERAL (
               SELECT COALESCE(SUM(CASE
                        WHEN booked_workspace.workspace_type ~* '(CONFERENCE|MEETING|BOARDROOM)' THEN booked_workspace.capacity
                        ELSE COALESCE(
                          substring(CONCAT(inventory.name, ' ', inventory.description) FROM '([0-9]+)[[:space:]-]*[Ss]eater')::int,
                          bk.seat_count
                        )
                      END), 0)::int AS booked_seats
               FROM bookings bk
               JOIN workspaces booked_workspace ON booked_workspace.id = bk.workspace_id
               LEFT JOIN inventory_items inventory ON inventory.id = bk.inventory_item_id
               WHERE bk.workspace_id = w.id
                 AND bk.status IN ('CONFIRMED', 'REQUESTED')
                 AND bk.starts_at < CURRENT_DATE + INTERVAL '1 day'
                 AND bk.ends_at > CURRENT_DATE
             ) booked ON TRUE
             WHERE w.is_active = TRUE`;

  if (targetBranch && String(targetBranch).toLowerCase() !== 'all branches') {
    params.push(targetBranch);
    sql += ` AND w.branch_id = $${params.length}`;
  }
  if (floor) {
    params.push(floor);
    sql += ` AND w.floor = $${params.length}`;
  }
  if (!['SUPER_ADMIN', 'BRANCH_ADMIN'].includes(req.user.role)) {
    sql += ' AND w.layout_published = TRUE';
  }
  sql += ' ORDER BY b.name, w.floor, w.code';
  const result = await pool.query(sql, params);
  res.json({ data: result.rows });
}));

router.get('/layout', ah(async (req, res) => {
  const { branch: requestedBranch, branchId, floor } = req.query;
  if (!floor) return res.status(400).json({ error: 'Select a floor to load its layout.' });
  const branchIdValue = await resolveBranchId(req, branchId || requestedBranch);
  if (!branchIdValue) return res.status(404).json({ error: 'Branch not found.' });

  const result = await pool.query(
    `SELECT draft_objects, published_objects,
            draft_objects IS DISTINCT FROM published_objects AS has_object_draft
     FROM workspace_floor_layouts WHERE branch_id = $1 AND floor = $2`,
    [branchIdValue, floor]
  );
  const row = result.rows[0];
  const isAdmin = ['SUPER_ADMIN', 'BRANCH_ADMIN'].includes(req.user.role);
  res.json({
    data: {
      objects: row ? (isAdmin ? row.draft_objects : row.published_objects) : [],
      hasDraft: Boolean(row?.has_object_draft),
    },
  });
}));

router.post('/layout/draft', allowRoles('SUPER_ADMIN', 'BRANCH_ADMIN'), ah(async (req, res) => {
  const { branch: requestedBranch, branchId, floor, objects, publish = false } = req.body;
  if (!floor || !Array.isArray(objects)) {
    return res.status(400).json({ error: 'A floor and list of layout objects are required.' });
  }
  if (objects.length > 500) {
    return res.status(400).json({ error: 'A floor layout cannot contain more than 500 objects.' });
  }
  const branchIdValue = await resolveBranchId(req, branchId || requestedBranch);
  if (!branchIdValue) return res.status(404).json({ error: 'Branch not found.' });

  const allowedTypes = new Set([
    'desk', 'chair', 'cabin', 'table', 'private_cabin', 'conference_room', 'open_desk',
    'bathroom', 'cafeteria', 'reception', 'pantry', 'meeting_room', 'corridor', 'wall',
    'door', 'lift', 'stairs', 'storage', 'lounge', 'podcast_room', 'external_wall', 'internal_wall',
    'glass_partition', 'plant', 'sofa', 'reception_counter', 'named_area'
  ]);
  const normalizedObjects = [];
  for (const object of objects) {
    const type = String(object?.type || '').toLowerCase();
    const x = Number(object?.x);
    const y = Number(object?.y);
    const width = Number(object?.width);
    const height = Number(object?.height);
    const rotation = Number(object?.rotation || 0);
    if (
      !object || typeof object.id !== 'string' || object.id.length > 80 ||
      !allowedTypes.has(type) ||
      ![x, y, width, height, rotation].every(Number.isFinite) ||
      x < 0 || x > 1320 || y < 0 || y > 780 ||
      width < 20 || width > 1320 || height < 20 || height > 780 ||
      rotation < 0 || rotation >= 360 ||
      x + width > 1320 || y + height > 780
    ) {
      return res.status(400).json({ error: 'One or more layout objects have invalid details.' });
    }
    normalizedObjects.push({
      id: object.id,
      type,
      x,
      y,
      width,
      height,
      rotation,
      label: typeof object.label === 'string' ? object.label.slice(0, 40) : '',
      capacity: Math.max(0, Math.min(500, Number.parseInt(object.capacity ?? 0, 10) || 0)),
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO workspace_floor_layouts(branch_id, floor, draft_objects)
       VALUES($1, $2, $3::jsonb)
       ON CONFLICT(branch_id, floor) DO UPDATE SET
         draft_objects = EXCLUDED.draft_objects, updated_at = NOW()
       RETURNING id, draft_objects, draft_objects IS DISTINCT FROM published_objects AS has_draft`,
      [branchIdValue, floor, JSON.stringify(normalizedObjects)]
    );

    let published = false;
    if (publish) {
      const publishedResult = await client.query(
        `UPDATE workspace_floor_layouts
         SET published_objects = draft_objects, published_at = NOW(), updated_at = NOW()
         WHERE branch_id = $1 AND floor = $2`,
        [branchIdValue, floor]
      );
      published = publishedResult.rowCount > 0;
      await client.query(
        `UPDATE workspaces
         SET layout_x = COALESCE(draft_layout_x, layout_x),
             layout_y = COALESCE(draft_layout_y, layout_y),
             layout_published = TRUE, updated_at = NOW()
         WHERE branch_id = $1 AND floor = $2 AND is_active = TRUE`,
        [branchIdValue, floor]
      );
      await syncBookableLayoutWorkspaces(client, branchIdValue, floor, normalizedObjects);
    }
    await client.query('COMMIT');
    res.json({ data: { objects: result.rows[0].draft_objects, hasDraft: result.rows[0].has_draft && !published, published, saved: true } });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.post('/publish', allowRoles('SUPER_ADMIN', 'BRANCH_ADMIN'), ah(async (req, res) => {
  const { branch: rawBranch, branchId, floor } = req.body;
  if (!floor || !(branchId || rawBranch || req.user.branch_id)) {
    return res.status(400).json({ error: 'Select a branch and floor before publishing the layout.' });
  }

  let branch = req.user.role === 'SUPER_ADMIN' ? (branchId || rawBranch) : req.user.branch_id;
  if (branch && !/^[0-9a-f]{8}-/i.test(branch)) {
    const branchResult = await pool.query(
      'SELECT id FROM branches WHERE name ILIKE $1 OR code ILIKE $1 LIMIT 1',
      [branch]
    );
    branch = branchResult.rows[0]?.id;
  }
  if (!branch) return res.status(404).json({ error: 'Branch not found.' });
  if (req.user.role !== 'SUPER_ADMIN' && branch !== req.user.branch_id) {
    return res.status(403).json({ error: 'Cannot publish a layout for another branch.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const workspaces = await client.query(
      `UPDATE workspaces
       SET layout_x = COALESCE(draft_layout_x, layout_x),
           layout_y = COALESCE(draft_layout_y, layout_y),
           layout_published = TRUE,
           updated_at = NOW()
       WHERE branch_id = $1 AND floor = $2 AND is_active = TRUE
       RETURNING id`,
      [branch, floor]
    );
    const layouts = await client.query(
      `UPDATE workspace_floor_layouts
       SET published_objects = draft_objects, published_at = NOW(), updated_at = NOW()
       WHERE branch_id = $1 AND floor = $2
       RETURNING id, published_objects`,
      [branch, floor]
    );
    if (layouts.rowCount) {
      await syncBookableLayoutWorkspaces(client, branch, floor, layouts.rows[0].published_objects || []);
    }
    if (!workspaces.rowCount && !layouts.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No workspaces or floor objects were found on this floor.' });
    }
    await client.query('COMMIT');
    res.json({ success: true, publishedCount: workspaces.rowCount, floor });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));
router.post('/',allowRoles('SUPER_ADMIN','BRANCH_ADMIN','RECEPTION_ADMIN'),ah(async(req,res)=>{
  const {branchId,branch:rawBranch,floor='Ground Floor',code,name,workspaceType='PRIVATE_CABIN',type,capacity=1,inventoryItemId,layoutX,layoutY,layoutWidth,layoutHeight,status='AVAILABLE'}=req.body;
  let branch=req.user.role==='SUPER_ADMIN'?(branchId||rawBranch):req.user.branch_id;
  if(branch&&!/^[0-9a-f]{8}-/i.test(branch)){
    const bRes=await pool.query('SELECT id FROM branches WHERE name ILIKE $1 OR code ILIKE $1 LIMIT 1',[branch]);
    if(bRes.rowCount)branch=bRes.rows[0].id;
  }
  if(!branch){
    const bRes=await pool.query('SELECT id FROM branches LIMIT 1');
    branch=bRes.rows[0]?.id;
  }
  const finalCode=code||name||`WS-${Date.now().toString().slice(-4)}`;
  const finalName=name||code;
  const finalType=workspaceType||type||'PRIVATE_CABIN';
  const cleanStatus=['AVAILABLE','OCCUPIED','RESERVED','MAINTENANCE'].includes(String(status).toUpperCase())?String(status).toUpperCase():'AVAILABLE';

  const result=await pool.query(
    `INSERT INTO workspaces(branch_id,floor,code,name,workspace_type,capacity,inventory_item_id,layout_x,layout_y,layout_width,layout_height,draft_layout_x,draft_layout_y,layout_published,status)
     VALUES($1,$2,$3,$4,$5,$6,$7,NULL,NULL,$8,$9,$10,$11,FALSE,$12)
     ON CONFLICT (branch_id, floor, code) DO UPDATE SET
       name = EXCLUDED.name,
       workspace_type = EXCLUDED.workspace_type,
       capacity = EXCLUDED.capacity,
       status = EXCLUDED.status,
       is_active = TRUE,
       updated_at = NOW()
     RETURNING *`,
    [branch,floor,finalCode,finalName,finalType,Number(capacity)||1,inventoryItemId||null,layoutWidth??null,layoutHeight??null,layoutX??null,layoutY??null,cleanStatus]);
  res.status(201).json({data:result.rows[0]});
}));
router.patch('/:id',allowRoles('SUPER_ADMIN','BRANCH_ADMIN','RECEPTION_ADMIN'),ah(async(req,res)=>{
  const {status,name,workspaceType,type,capacity,inventoryItemId,layoutX,layoutY,layoutWidth,layoutHeight,isActive}=req.body;
  const params=[req.params.id];
  const finalType=workspaceType||type;
  const cleanStatus=status?String(status).toUpperCase():null;
  let sql=`UPDATE workspaces SET name=COALESCE($2,name),workspace_type=COALESCE($3,workspace_type),capacity=COALESCE($4,capacity),
    inventory_item_id=COALESCE($5,inventory_item_id),draft_layout_x=COALESCE($6,draft_layout_x),draft_layout_y=COALESCE($7,draft_layout_y),
    layout_width=COALESCE($8,layout_width),layout_height=COALESCE($9,layout_height),status=COALESCE($10,status),
    is_active=COALESCE($11,is_active),updated_at=NOW() WHERE id=$1`;
  params.push(name||null,finalType||null,capacity||null,inventoryItemId||null,layoutX??null,layoutY??null,layoutWidth??null,layoutHeight??null,cleanStatus,isActive??null);
  if(req.user.role!=='SUPER_ADMIN'){params.push(req.user.branch_id);sql+=` AND branch_id=$${params.length}`;}
  sql+=' RETURNING *';
  const result=await pool.query(sql,params);
  if(!result.rowCount)return res.status(404).json({error:'Workspace not found.'});
  res.json({data:result.rows[0]});
}));
router.delete('/:id',allowRoles('SUPER_ADMIN','BRANCH_ADMIN'),ah(async(req,res)=>{
  const params=[req.params.id];
  let sql='UPDATE workspaces SET is_active=FALSE, updated_at=NOW() WHERE id=$1';
  if(req.user.role!=='SUPER_ADMIN'){params.push(req.user.branch_id);sql+=` AND branch_id=$${params.length}`;}
  sql+=' RETURNING id';
  const result=await pool.query(sql,params);
  if(!result.rowCount)return res.status(404).json({error:'Workspace not found.'});
  res.json({success:true,message:'Workspace deleted.'});
}));
module.exports=router;
