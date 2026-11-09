const pool = require('../db/pool');

function defineModel(tableName, columns, defaultOrderBy = 'created_at') {
  const allowedColumns = new Set(columns);

  function validateColumn(column) {
    if (!allowedColumns.has(column)) {
      throw new Error(`Unknown column "${column}" for model "${tableName}".`);
    }
  }

  function validateAttributes(attributes) {
    if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
      throw new TypeError('Model attributes must be an object.');
    }
    for (const column of Object.keys(attributes)) validateColumn(column);
  }

  return class Model {
    static async findAll({ where = {}, orderBy = defaultOrderBy, direction = 'DESC' } = {}) {
      validateAttributes(where);
      validateColumn(orderBy);
      const sortDirection = String(direction).toUpperCase();
      if (!['ASC', 'DESC'].includes(sortDirection)) {
        throw new TypeError('Sort direction must be ASC or DESC.');
      }

      const values = [];
      const conditions = Object.entries(where).map(([column, value]) => {
        if (value === null) return `${column} IS NULL`;
        values.push(value);
        return `${column} = $${values.length}`;
      });
      const whereClause = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
      const result = await pool.query(
        `SELECT * FROM ${tableName}${whereClause} ORDER BY ${orderBy} ${sortDirection}`,
        values
      );
      return result.rows;
    }

    static async findById(id) {
      const result = await pool.query(`SELECT * FROM ${tableName} WHERE id = $1`, [id]);
      return result.rows[0] || null;
    }

    static async create(attributes) {
      validateAttributes(attributes);
      const entries = Object.entries(attributes);
      if (!entries.length) throw new TypeError('At least one model attribute is required.');

      const columnNames = entries.map(([column]) => column);
      const placeholders = entries.map((_, index) => `$${index + 1}`);
      const result = await pool.query(
        `INSERT INTO ${tableName} (${columnNames.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
        entries.map(([, value]) => value)
      );
      return result.rows[0];
    }

    static async updateById(id, attributes) {
      validateAttributes(attributes);
      const entries = Object.entries(attributes).filter(([column]) => column !== 'id');
      if (!entries.length) throw new TypeError('At least one updatable model attribute is required.');

      const values = entries.map(([, value]) => value);
      const assignments = entries.map(([column], index) => `${column} = $${index + 1}`);
      if (allowedColumns.has('updated_at')) assignments.push('updated_at = NOW()');
      values.push(id);

      const result = await pool.query(
        `UPDATE ${tableName} SET ${assignments.join(', ')} WHERE id = $${values.length} RETURNING *`,
        values
      );
      return result.rows[0] || null;
    }
  };
}

module.exports = defineModel;
