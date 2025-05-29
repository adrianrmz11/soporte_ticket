require('dotenv').config();
const express = require('express');
const fs = require('fs');
const Database = require('./class/Database');
const { join, resolve } = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const { getConnection, selectOne, selectAll, insert } = require('./modules/connection');
const { obtenerTickets, obtenerTicket, obtenerSeguimientos, obtenerUsuario } = require('./modules/queries');

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
    },
    resave: false,
    saveUninitialized: false
}));

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

    const result = await selectOne(`select * from usuario where usuario = @user and clave = @pass`, { user, pass });
    
    const regexp_match_format = /^[a-zA-ZñÑ0-9@_]+$/g;
    const user_format = user?.match(regexp_match_format);
    const pass_format = pass?.match(regexp_match_format);

    if (!user_format || !pass_format) {
        req.session.error = "Formato de credenciales no válido.";
        return res.redirect('/');
    }

    if (!result) {
        req.session.error = "Credenciales inválidas.";
        return res.redirect('/');
    }

    const usuarioAcceso = result;

    req.session.userId = usuarioAcceso.id;
    req.session.expiresAt = Date.now() + MAX_AGE_SESSION;
    res.redirect('/dashboard');
});

app.get('/logout', async (req, res) => {
    req.session.destroy();
    return res.redirect('/');
});

app.get('/dashboard', requiresLogin, async (req, res) => {
    const ticketsPendientes = await selectAll(`select * from tickets where estado = 2 order by fcreacion desc`);
    const ticketsEnProceso = await selectAll(`select * from tickets where estado = 1 order by fcreacion desc`);
    const ticketsVencidos = await selectAll(`select * from tickets where estado = 3 order by fcreacion desc`);
    const ticketsFinalizados = await selectAll(`select * from tickets where estado = 0 order by fcreacion desc`);

    res.render('dashboard.html', {
        location: 1,
        ticketsPendientes,
        ticketsEnProceso,
        ticketsVencidos,
        ticketsFinalizados
    });
});

app.get('/tickets', requiresLogin, async (req, res) => {
    const ticketId = req.query['id'];

    if (ticketId) {
        const ticket = await obtenerTicket(ticketId);
        const _seguimientos = await obtenerSeguimientos(ticketId);

        const seguimientos = [];

        for (const seguimiento of _seguimientos) {
            const usuario = await obtenerUsuario(seguimiento.id_usuario);

            seguimientos.push({
                usuario: usuario ?? 'Desconocido',
                ...seguimiento
            });
        }

        res.render('dashboard.html', {
            location: 8,
            ticket,
            seguimientos,
            obtenerUsuario
        });

        return;
    }

    const tickets = await obtenerTickets();

    res.render('dashboard.html', {
        location: 2,
        tickets
    });
});

app.get('/new_ticket', requiresLogin, async (req, res) => {
    res.render('dashboard.html', {
        location: 9
    });
});

app.post('/new_ticket', requiresLogin, async (req, res) => {
    const { titulo = null, descripcion = null } = req.body;

    if (!titulo || !descripcion) {
        req.session.error = "Debe completar todos los campos.";
        return res.redirect('/new_ticket');
    }

    const id_usuario = req.session.userId;

    await insert(`insert into tickets (idusuario, titulo, descripcion, estado) values (@id_usuario, @titulo, @descripcion, 2)`, {
        titulo,
        descripcion,
        id_usuario
    });

    res.redirect('/tickets');
});

app.get('/inventory', requiresLogin, async (req, res) => {
    res.render('dashboard.html', {
        location: 3
    });
});

app.get('/users', requiresLogin, async (req, res) => {
    const usuarios = await selectAll('select * from usuario order by id');

    res.render('dashboard.html', {
        location: 4,
        usuarios
    });
});

app.get('/departments', requiresLogin, async (req, res) => {
    res.render('dashboard.html', {
        location: 5
    });
});

app.get('/computers', async (req, res) => {
    const cpus = await selectAll('select * from procesador order by descripcion');

    res.render('dashboard.html', {
        location: 6,
        cpus
    });
});

app.get('/cpu', async (req, res) => {
    const cpus = await selectAll('select * from procesador');

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

app.post('/ticket_seguimiento', requiresLogin, async (req, res) => {
    const { ticketId, comentario } = req.body;

    const id_usuario = req.session.userId;

    await insert(`insert into seguimiento (id_usuario, id_ticket, comentario) values (@id_usuario, @ticketId, @comentario)`, {
        id_usuario,
        ticketId,
        comentario
    });

    // Redirigir al ticket.
    res.redirect(`/tickets?id=${ticketId}`);
});

// Inicializar encendido de forma asíncrona.
(async function init() {
    //await db.connect()
    app.listen(APP_PORT, () => console.log(`✅ Servidor de ticket alojado en el puerto: ${APP_PORT}`));
})();

process.on('uncaughtException', (err) => console.log(err));
process.on('unhandledRejection', (err) => console.log(err));