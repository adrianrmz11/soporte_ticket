require('dotenv').config();
const express = require('express');
const fs = require('fs');
const Database = require('./class/Database');
const { join, resolve } = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const { getConnection, selectOne, selectAll, insert, update } = require('./modules/connection');
const { obtenerTickets, obtenerTicket, obtenerSeguimientos, obtenerUsuario, obtenerTicketsUsuario } = require('./modules/queries');
const io = require('socket.io');

const app = express();

// Configuración de despliegue.
const APP_PORT = 4543;
const MAX_AGE_SESSION = 60_000 * 15;

// Configuración del servidor.
app.set('view engine', 'ejs');
app.engine('html', require('ejs').renderFile);
app.set('views', './src/views/');
app.use(express.static('./src/public'));
app.use(express.static('./src/assets'));
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
    const rolUsuario = await selectOne(`select * from rol where idusuario = @idusuario`, { idusuario: usuarioAcceso.id });

    req.session.userId = usuarioAcceso.id;
    req.session.expiresAt = Date.now() + MAX_AGE_SESSION;
    req.session.role = rolUsuario?.rol ?? 'USUARIO';
    req.session.usuario = usuarioAcceso.usuario;

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


    const ticketsPorDia = //await selectAll(`select DAY(fcreacion) as dia, COUNT(*) as tickets from tickets group by DAY(fcreacion)`);

    await selectAll(`
-- Obtener mes y año actuales
DECLARE @mes INT = MONTH(GETDATE());
DECLARE @anio INT = YEAR(GETDATE());

-- Calcular último día del mes actual
DECLARE @ultimodia INT = DAY(EOMONTH(GETDATE()));

-- Generar tabla de días y contar tickets
WITH DiasDelMes AS (
    SELECT 1 AS dia
    UNION ALL
    SELECT dia + 1 FROM DiasDelMes WHERE dia + 1 <= @ultimodia
)
SELECT d.dia, COUNT(t.id) AS tickets
FROM DiasDelMes d
LEFT JOIN tickets t 
    ON DAY(t.fcreacion) = d.dia 
    AND MONTH(t.fcreacion) = @mes 
    AND YEAR(t.fcreacion) = @anio
GROUP BY d.dia
ORDER BY d.dia
OPTION (MAXRECURSION 31);  -- para limitar la recursión a 31 días

    `)

    res.render('dashboard.html', {
        location: 1,
        ticketsPendientes,
        ticketsEnProceso,
        ticketsVencidos,
        ticketsFinalizados,
        rol: req.session.role,
        session: req.session,
        ticketsPorDia
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
            obtenerUsuario,
            rol: req.session.role,
            session: req.session
        });

        return;
    }

    if (req.session.role !== 'ADMINISTRADOR') {
        var tickets = await obtenerTicketsUsuario(null, req.session.userId);

        res.render('dashboard.html', {
            location: 2,
            tickets,
            rol: req.session.role,
            session: req.session
        });

        return;
    }

    var tickets = await obtenerTickets();

    res.render('dashboard.html', {
        location: 2,
        tickets,
        rol: req.session.role,
        session: req.session
    });
});

app.get('/new_ticket', requiresLogin, async (req, res) => {
    res.render('dashboard.html', {
        location: 9,
        rol: req.session.role,
        session: req.session
    });
});

app.post('/open_ticket', requiresLogin, async (req, res) => {
    const { ticketId = null } = req.body;

    // Cambiar estado del ticket.
    await update(`update tickets set estado = 1 where id = @ticketId`, { ticketId });

    const usuario = req.session.usuario;

    // Agregar un registro de seguimiento.
    await insert(`insert into seguimiento (id_usuario, id_ticket, comentario, tseguimiento) values (@id_usuario, @ticketId, @comentario, @tseguimiento)`, {
        id_usuario: -1, // -1 indica que es un seguimiento automático.
        ticketId,
        comentario: `<b>${usuario}</b> ha abierto el ticket a las ${new Date().toLocaleTimeString()}.`,
        tseguimiento: "ACTIVIDAD"
    });

    return res.redirect(`/tickets?id=${ticketId}`);
});

app.post('/close_ticket', requiresLogin, async (req, res) => {
    const { ticketId = null } = req.body;

    await update(`update tickets set estado = 0 where id = @ticketId`, { ticketId });

    const usuario = req.session.usuario;

    // Agregar un registro de seguimiento.
    await insert(`insert into seguimiento (id_usuario, id_ticket, comentario, tseguimiento) values (@id_usuario, @ticketId, @comentario, @tseguimiento)`, {
        id_usuario: -1, // -1 indica que es un seguimiento automático.
        ticketId,
        comentario: `<b>${usuario}</b> ha cerrado el ticket a las ${new Date().toLocaleTimeString()}.`,
        tseguimiento: "ACTIVIDAD"
    });

    return res.redirect(`/tickets?id=${ticketId}`);
});

app.post('/new_ticket', requiresLogin, async (req, res) => {
    const {
        titulo = null, 
        descripcion = null,
        categoria = null,
        ubicacion = null
    } = req.body;

    if (!titulo || !descripcion || !categoria || !ubicacion) {
        req.session.error = "Debe completar todos los campos.";
        return res.redirect('/new_ticket');
    }

    const id_usuario = req.session.userId;
    const id_usuario_creador=id_usuario;
    await insert(`insert into tickets (idusuario, titulo, descripcion, estado, categoria, ubicacion,idcreador) values (@id_usuario, @titulo, @descripcion, 2, @categoria, @ubicacion,@id_usuario_creador)`, {
        titulo,
        descripcion,
        id_usuario,
        categoria,
        ubicacion,
        id_usuario_creador
    });

    res.redirect('/tickets');
});

app.get('/inventory', requiresLogin, async (req, res) => {
    res.render('dashboard.html', {
        location: 3
    });
});

app.get('/users', requiresLogin, async (req, res) => {
    const usuarios = await selectAll(`
            select 
            u.usuario,
            u.fcreacion,
            coalesce((select rol from rol where idusuario = u.id), 'USUARIO') as rol
            from usuario u
            order by id
        `);

    if (req.session.role != "ADMINISTRADOR") {
        return res.render('dashboard.html', {
            location: -1,
            usuarios,
            rol: req.session.role,
            session: req.session
        });
    }

    res.render('dashboard.html', {
        location: 4,
        usuarios,
        rol: req.session.role,
        session: req.session
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

app.get('/new_user', requiresLogin, async (req, res) => {
    res.render('dashboard.html', {
        location: 10,
        rol: req.session.role,
        session: req.session
    });
});

app.post('/new_user', requiresLogin, async (req, res) => {
    const {
        usuario = null,
        clave = null,
        rol = null
    } = req.body;

    await insert(`insert into usuario (idpersona, usuario, clave) values (@idpersona, @usuario, @clave)`, {
        idpersona: 0,
        usuario,
        clave
    });

    console.log(req.body);

    if (rol && rol != 'USUARIO') {
        const usuarioAcceso = await selectOne(`select * from usuario where usuario = @usuario`, { usuario });

        await insert(`insert into rol (idusuario, rol) values (@idusuario, @rol)`, {
            idusuario: usuarioAcceso.id,
            rol
        });
    }

    res.redirect('/users');
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

app.get('/assign_ticket', requiresLogin, async (req, res) => {
    console.log("metodo get")
    const ticketId = req.query.id;
    const usuarios = await selectAll(`select * from usuario u inner join rol r on u.id = r.idusuario where r.rol = 'SOPORTE'`);

    res.render('dashboard.html', {
        location: 11,
        ticketId,
        session: req.session,
        rol: req.session.role,
        usuarios
    });
});


app.post('/assign_ticket',requiresLogin,async(req,res)=>{
    console.log("el post");
    console.log(req.body);
    const ticketId = req.body.ticketId;
    const usuario= req.body.responsable;
    console.log(ticketId);
    console.log(usuario);
    var ticket =parseInt(ticketId);
    var user = parseInt(usuario);

    await update(
            `UPDATE tickets
             SET idusuario = @user
             WHERE id = @ticket`,
            { user, ticket: ticketId }
        );


    res.redirect('/dashboard')
});
// Inicializar encendido de forma asíncrona.
(async function init() {
    //await db.connect()
    app.listen(APP_PORT, () => console.log(`✅ Servidor de ticket alojado en el puerto: ${APP_PORT}`));
})();

process.on('uncaughtException', (err) => console.log(err));
process.on('unhandledRejection', (err) => console.log(err));