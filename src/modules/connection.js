const mssql = require('mssql');

const config = {
    user: process.env.MSSQL_USER,
    port: 1433,
    password: process.env.MSSQL_PASS,
    server: process.env.MSSQL_SERVER,
    database: process.env.MSSQL_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: false,
        useUTC: true
    }
};

/**
 * @type {mssql.ConnectionPool}
 */
var pool;

/**
 * Obtiene la conexión a la base de datos.
 */
async function getConnection() {
    if (pool) {
        return pool;
    }

    try {
        /**
         * @type {mssql.ConnectionPool}
         */
        const connection = await mssql.connect(config);

        pool = connection;

        console.log("✅ Conexión establecida a la base de datos.");
        return connection;
    }
    catch(err) {
        console.log("⛔ No se ha podido conectarse a la base de datos.");
        return null;
    }
}

function getType(value) {
    const dataTypes = {
        "string": mssql.VarChar,
        "number": mssql.Int,
        "boolean": mssql.Bit
    };

    return dataTypes[typeof value] ?? "unknown";
}

/**
 * Executes a select operation.
 * @param {string} sql Query to provide.
 * @param {{ [param: string]: (string|number) }} params
 */
async function select(sql, params) {
    const pool = await getConnection();

    const stmt = pool.request();

    for (const param in params) {
        const value = params[param];
        stmt.input(param, value);
    }

    const result = await stmt.query(sql);

    return result.recordset;
}

/**
 * Executes a select one operation.
 * @param {string} sql Query to provide.
 * @param {{ [param: string]: (string|number) }} params
 * @returns {Promise<*|null>}
 */
async function selectOne(sql, params) {
    const results = await select(sql, params);

    return results[0] ?? null;
}

/**
 * Executes a select all operation.
 * @param {string} sql Query to provide.
 * @param {{ [param: string]: (string|number) }} params
 * @returns {Promise<*[]>}
 */
async function selectAll(sql, params) {
    return await select(sql, params);
}

async function insert(sql, params) {
    const pool = await getConnection();

    const stmt = pool.request();

    for (const param in params) {
        const value = params[param];
        stmt.input(param, value);
    }

    const result = stmt.query(sql);
}

module.exports = {
    getConnection,
    select,
    selectOne,
    selectAll
};

