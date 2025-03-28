// Importado de web-cooperativa

const sqlite3 = require("sqlite3");

class Database {
    /**
     * Crea una nueva instancia de Database.
     * @param {string} databasePath Ruta del archivo DB.
     */
    constructor(databasePath) {
        this.connection = null;

        this.databasePath = databasePath;
    }

    /**
     * Crea una conexión a la base de datos.
     */
    async connect() {
        await new Promise((resolve, reject) => {
            this.connection = new sqlite3.Database(this.databasePath, err => {
                if (err)
                    reject(`No se pudo realizar la conexion a la base de datos.\n${err}`);
    
                resolve(undefined);
            });
        });

        console.log("Se ha realizado la conexion a la base de datos.");

        return this;
    }

    /**
     * Realiza una sentencia sql a la base de datos.
     * @param {string} sql Sentencia SQL a realizar.
     */
    async query(sql) {
        /** @type {QueryResult} */
        const result = await new Promise((resolve, reject) => {
            this.connection.all(sql, (err, rows) => {
                if (err)
                    reject(err);

                if (!rows)
                    return resolve();
    
                resolve( new QueryResult(rows) );
            });
        });

        return result;
    }
}

class QueryResult {
    /**
     * @param {{ [rowName: string]: string|number }[]} _list 
     */
    constructor(_list) {
        this._list = _list;
        this.count = this._list.length;
    }

    first(defaultValue = null) {
        return this._list[0] ?? defaultValue;
    }

    last(defaultValue = null) {
        return this._list[this.count - 1] ?? defaultValue;
    }

    all() {
        return this._list;
    }
}

module.exports = Database;