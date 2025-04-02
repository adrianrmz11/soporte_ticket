require('dotenv').config();
const sql = require("mssql");
const fs = require("fs");

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

const sqlToJsType = (sqlType) => {
    const typeMap = {
        "int": "number",
        "bigint": "number",
        "smallint": "number",
        "tinyint": "number",
        "decimal": "number",
        "numeric": "number",
        "float": "number",
        "real": "number",
        "bit": "boolean",
        "char": "string",
        "varchar": "string",
        "text": "string",
        "nchar": "string",
        "nvarchar": "string",
        "ntext": "string",
        "date": "string",
        "datetime": "string",
        "datetime2": "string",
        "smalldatetime": "string",
        "time": "string",
        "timestamp": "string",
    };
    return typeMap[sqlType] || "any";
};

async function getDatabaseSchema() {
    try {
        let pool = await sql.connect(config);
        let tables = await pool.request().query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'`);
        let schema = {};

        for (let table of tables.recordset) {
            let tableName = table.TABLE_NAME;
            let columns = await pool.request().query(`SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tableName}'`);
            schema[tableName] = columns.recordset.map(col => ({
                name: col.COLUMN_NAME,
                type: sqlToJsType(col.DATA_TYPE),
            }));
        }

        return schema;
    } catch (err) {
        console.error("Error al conectar a SQL Server:", err);
    } finally {
        sql.close();
    }
}

async function generateClassFile() {
    try {
        let schema = await getDatabaseSchema();
        let classes = Object.entries(schema).map(([table, columns]) => {
            let className = table.charAt(0).toUpperCase() + table.slice(1);
            let properties = columns.map(col => `    /** @type {${col.type}} */\n    this.${col.name} = null;`).join("\n");
            let columnNames = columns.map(col => col.name).join(", ");
            let columnParams = columns.map(col => `@${col.name}`).join(", ");
            let columnInputs = columns.map(col => `request.input('${col.name}', sql.${col.type.charAt(0).toUpperCase() + col.type.slice(1)}, this.${col.name});`).join("\n    ");
            
            return `class ${className} {\n  constructor() {\n${properties}\n  }\n\n  async select(id) {\n    let pool = await sql.connect(config);\n    let result = await pool.request().input('id', sql.Int, id).query(\`SELECT * FROM ${table} WHERE id = @id\`);\n    return result.recordset[0];\n  }\n\n  async insert() {\n    let pool = await sql.connect(config);\n    let request = pool.request();\n    ${columnInputs}\n    let result = await request.query(\`INSERT INTO ${table} (${columnNames}) VALUES (${columnParams})\`);\n    return result;\n  }\n\n  async update(id) {\n    let pool = await sql.connect(config);\n    let request = pool.request().input('id', sql.Int, id);\n    ${columnInputs}\n    let result = await request.query(\`UPDATE ${table} SET ${columns.map(col => `${col.name} = @${col.name}`).join(", ")} WHERE id = @id\`);\n    return result;\n  }\n\n  async delete(id) {\n    let pool = await sql.connect(config);\n    let result = await pool.request().input('id', sql.Int, id).query(\`DELETE FROM ${table} WHERE id = @id\`);\n    return result;\n  }\n}`;
        }).join("\n\n");

        fs.writeFileSync("models.js", classes, "utf8");
        console.log("✅ Archivo models.js generado con éxito.");
    } catch (err) {
        console.error("Error generando el archivo:", err);
    }
}

generateClassFile();