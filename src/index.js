const express = require('express');
const fs = require('fs');
const Database = require('./class/Database');
const { join, resolve } = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');

const app = express();

// Configuración de despliegue.
const APP_PORT = 4543;
const MAX_AGE_SESSION = 60_000 * 15;

// Configuración del servidor.
app.set('view engine', 'ejs');
app.engine('html', require('ejs').renderFile);
app.set('views', './src/views/');
app.use(express.static('./src/public'));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(session({
    secret: '1D06E1021CB7A4D09BB1F485B0DB43996BB9F5EB523F95D0BB26E279EAF2C1F7',
    cookie: {
        secure: false
    }
}));

// Crea la conexion a la base de datos.
const db = new Database('./src/db/sst.db');

// Funciones intermediarias.
function requiresLogin(req, res, next) {
    if (!req.session.userId || req.session?.expiresAt < Date.now()) {
        req.session.destroy();
        return res.redirect('/');
    }

    next();
}

// Asignar rutas.
app.get('/', (req, res) => {
    const error = req.session.error ?? null;

    if (error) {
        delete req.session.error;
    }
    
    res.render('index.html', {
        error
    });
});
    
app.post('/login', async (req, res) => {
    const { user = null, pass = null } = req.body;

    const result = await db.query(`select * from usuario where usuario = '${user}' and clave = '${pass}'`);
    
    const regexp_match_format = /^[a-zA-ZñÑ0-9@_]+$/g;
    const user_format = user?.match(regexp_match_format);
    const pass_format = pass?.match(regexp_match_format);

    if (!user_format || !pass_format) {
        req.session.error = "Formato de credenciales no válido.";
        return res.redirect('/');
    }

    if (result.count < 1) {
        req.session.error = "Credenciales inválidas.";
        return res.redirect('/');
    }

    const usuarioAcceso = result.first();

    req.session.userId = usuarioAcceso.id;
    req.session.expiresAt = Date.now() + MAX_AGE_SESSION;
    res.redirect('/dashboard');
});

app.get('/logout', async (req, res) => {
    req.session.destroy();
    return res.redirect('/');
});

app.get('/dashboard', requiresLogin, async (req, res) => {
    res.render('dashboard.html', {
        location: 1
    });
});

app.get('/tickets', requiresLogin, async (req, res) => {
    res.render('dashboard.html', {
        location: 2
    });
});

app.get('/inventory', requiresLogin, async (req, res) => {
    res.render('dashboard.html', {
        location: 3
    });
});

app.get('/users', requiresLogin, async (req, res) => {
    res.render('dashboard.html', {
        location: 4
    });
});

app.get('/departments', requiresLogin, async (req, res) => {
    res.render('dashboard.html', {
        location: 5
    });
});

app.get('/computers', async (req, res) => {
    const result = await db.query('select * from procesador order by descripcion');
    const cpus = result.all();

    res.render('dashboard.html', {
        location: 6,
        cpus
    });
});

app.get('/cpu', async (req, res) => {
    const result = await db.query('select * from procesador');
    const cpus = result.all();

    res.render('dashboard.html', {
        location: 7,
        cpus
    });
});

app.post('/cpu', async (req, res) => {
    var {
        cpuDescription = null,
        cpuCores = null,
        cpuThreads = null
    } = req.body;

    cpuDescription = cpuDescription?.toUpperCase();

    await db.query(`insert into procesador(descripcion, nucleos, hilos) values ('${cpuDescription}', ${cpuCores}, ${cpuThreads})`);

    res.redirect('/cpu');
});

// Inicializar encendido de forma asíncrona.
(async function init() {
    await db.connect();

    app.listen(APP_PORT, () => console.log(`Servidor de ticket alojado en el puerto ${APP_PORT}`));
})();

process.on('uncaughtException', (err) => console.log(err));
process.on('unhandledRejection', (err) => console.log(err));