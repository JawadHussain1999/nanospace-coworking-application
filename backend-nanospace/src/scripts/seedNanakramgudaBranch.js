require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const pool = require('../models/database.model');

async function setupNanakramguda() {
  const client = await pool.connect();
  try {
    console.log('--- Setting up Nanakramguda Workspaces ---');
    const branchRes = await client.query("SELECT id, name FROM branches WHERE name ILIKE '%nanakramguda%' OR code = 'NANAKRAMGUDA' LIMIT 1");
    if (!branchRes.rowCount) {
      console.error('Nanakramguda branch not found in database!');
      return;
    }
    const branchId = branchRes.rows[0].id;
    console.log(`Found Nanakramguda branch: ${branchId}`);

    // Inventory items for mapping
    const invRes = await client.query('SELECT id, name FROM inventory_items');
    const invMap = {};
    invRes.rows.forEach(item => {
      invMap[item.name] = item.id;
    });

    const getInv = (nameKeyword, fallbackRate = 8500) => {
      const match = invRes.rows.find(i => i.name.toLowerCase().includes(nameKeyword.toLowerCase()));
      return match ? match.id : null;
    };

    const cabin10Inv = getInv('10 Seater') || getInv('Private office');
    const cabin20Inv = getInv('23 Seater') || getInv('Private office');
    const hotDeskInv = getInv('Hot seat') || getInv('Hot Seat');
    const confInv = getInv('Conference Room');
    const podInv = getInv('Podcast Room');

    // Specified spaces for Nanakramguda:
    // 4 x 10-seater private cabins
    // 3 x 20-seater private cabins
    // 4 x 6-seater hot desks
    // 1 x Conference room (10-seater)
    // 1 x Podcast room (4-seater)
    const spaces = [
      // 4 x 10-seater private cabins
      {
        code: 'NNG1-private cabin 10 seater',
        name: 'NNG1-private cabin 10 seater',
        type: 'PRIVATE_CABIN',
        capacity: 10,
        floor: 'Ground Floor',
        status: 'OCCUPIED', // Sample occupied
        inventoryId: cabin10Inv,
        x: 40, y: 50, w: 120, h: 90
      },
      {
        code: 'NNG2-private cabin 10 seater',
        name: 'NNG2-private cabin 10 seater',
        type: 'PRIVATE_CABIN',
        capacity: 10,
        floor: 'Ground Floor',
        status: 'AVAILABLE',
        inventoryId: cabin10Inv,
        x: 180, y: 50, w: 120, h: 90
      },
      {
        code: 'NNG3-private cabin 10 seater',
        name: 'NNG3-private cabin 10 seater',
        type: 'PRIVATE_CABIN',
        capacity: 10,
        floor: 'Ground Floor',
        status: 'AVAILABLE',
        inventoryId: cabin10Inv,
        x: 320, y: 50, w: 120, h: 90
      },
      {
        code: 'NNG4-private cabin 10 seater',
        name: 'NNG4-private cabin 10 seater',
        type: 'PRIVATE_CABIN',
        capacity: 10,
        floor: 'Ground Floor',
        status: 'AVAILABLE',
        inventoryId: cabin10Inv,
        x: 460, y: 50, w: 120, h: 90
      },

      // 3 x 20-seater private cabins
      {
        code: 'NNG1-private cabin 20 seater',
        name: 'NNG1-private cabin 20 seater',
        type: 'PRIVATE_CABIN',
        capacity: 20,
        floor: 'Ground Floor',
        status: 'OCCUPIED', // Sample occupied
        inventoryId: cabin20Inv,
        x: 40, y: 160, w: 180, h: 110
      },
      {
        code: 'NNG2-private cabin 20 seater',
        name: 'NNG2-private cabin 20 seater',
        type: 'PRIVATE_CABIN',
        capacity: 20,
        floor: 'Ground Floor',
        status: 'AVAILABLE',
        inventoryId: cabin20Inv,
        x: 240, y: 160, w: 180, h: 110
      },
      {
        code: 'NNG3-private cabin 20 seater',
        name: 'NNG3-private cabin 20 seater',
        type: 'PRIVATE_CABIN',
        capacity: 20,
        floor: 'Ground Floor',
        status: 'AVAILABLE',
        inventoryId: cabin20Inv,
        x: 440, y: 160, w: 180, h: 110
      },

      // 4 x 6-seater hot desks
      {
        code: 'NNG1-hot desk 6 seater',
        name: 'NNG1-hot desk 6 seater',
        type: 'HOT_DESK',
        capacity: 6,
        floor: 'Ground Floor',
        status: 'AVAILABLE',
        inventoryId: hotDeskInv,
        x: 40, y: 290, w: 130, h: 80
      },
      {
        code: 'NNG2-hot desk 6 seater',
        name: 'NNG2-hot desk 6 seater',
        type: 'HOT_DESK',
        capacity: 6,
        floor: 'Ground Floor',
        status: 'OCCUPIED', // Sample occupied
        inventoryId: hotDeskInv,
        x: 190, y: 290, w: 130, h: 80
      },
      {
        code: 'NNG3-hot desk 6 seater',
        name: 'NNG3-hot desk 6 seater',
        type: 'HOT_DESK',
        capacity: 6,
        floor: 'Ground Floor',
        status: 'AVAILABLE',
        inventoryId: hotDeskInv,
        x: 340, y: 290, w: 130, h: 80
      },
      {
        code: 'NNG4-hot desk 6 seater',
        name: 'NNG4-hot desk 6 seater',
        type: 'HOT_DESK',
        capacity: 6,
        floor: 'Ground Floor',
        status: 'AVAILABLE',
        inventoryId: hotDeskInv,
        x: 490, y: 290, w: 130, h: 80
      },

      // 1 x Conference room (10-seater)
      {
        code: 'NNG1-conference room 10 seater',
        name: 'NNG1-conference room 10 seater',
        type: 'MEETING_ROOM',
        capacity: 10,
        floor: 'Ground Floor',
        status: 'AVAILABLE',
        inventoryId: confInv,
        x: 640, y: 50, w: 160, h: 140
      },

      // 1 x Podcast room (4-seater)
      {
        code: 'NNG1-podcast room',
        name: 'NNG1-podcast room',
        type: 'PODCAST_ROOM',
        capacity: 4,
        floor: 'Ground Floor',
        status: 'AVAILABLE',
        inventoryId: podInv,
        x: 640, y: 210, w: 160, h: 120
      }
    ];

    for (const space of spaces) {
      const q = `
        INSERT INTO workspaces (branch_id, floor, code, name, workspace_type, capacity, inventory_item_id, status, layout_x, layout_y, layout_width, layout_height, is_active, layout_published)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, TRUE, TRUE)
        ON CONFLICT (branch_id, floor, code)
        DO UPDATE SET
          name = EXCLUDED.name,
          workspace_type = EXCLUDED.workspace_type,
          capacity = EXCLUDED.capacity,
          inventory_item_id = EXCLUDED.inventory_item_id,
          status = EXCLUDED.status,
          layout_x = EXCLUDED.layout_x,
          layout_y = EXCLUDED.layout_y,
          layout_width = EXCLUDED.layout_width,
          layout_height = EXCLUDED.layout_height,
          is_active = TRUE,
          layout_published = TRUE
        RETURNING id, code, name, capacity, status;
      `;
      const res = await client.query(q, [
        branchId,
        space.floor,
        space.code,
        space.name,
        space.type,
        space.capacity,
        space.inventoryId,
        space.status,
        space.x,
        space.y,
        space.w,
        space.h
      ]);
      console.log(`Upserted workspace: ${res.rows[0].code} | Status: ${res.rows[0].status} | Capacity: ${res.rows[0].capacity}`);
    }

    console.log('Successfully configured all 13 Nanakramguda workspaces in database!');
  } catch (err) {
    console.error('Error in setupNanakramguda:', err);
  } finally {
    client.release();
    pool.end();
  }
}

setupNanakramguda();
