require('dotenv').config();
const express = require('express');
const fs = require('fs');
const Database = require('./class/Database');
const { join, resolve } = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const { getConnection, selectOne, selectAll, insert, update } = require('./modules/connection');
const { obtenerTickets, obtenerTicket, obtenerSeguimientos, obtenerUsuario, obtenerTicketsUsuario ,obtenerUsuarioCreador} = require('./modules/queries');
const io = require('socket.io');
const { enviarNotificacion } = require('./email/emails');
const { Console } = require('console');
const { console } = require('inspector');
const app = express();

// Configuración de despliegue.
const APP_PORT = 4543;
const MAX_AGE_SESSION = 60_000 * 15;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
    
    // const regexp_match_format = /^[a-zA-ZñÑ0-9@_]+$/g;
    // const user_format = user?.match(regexp_match_format);
    // const pass_format = pass?.match(regexp_match_format);

    // if (!user_format || !pass_format) {
    //     req.session.error = "Formato de credenciales no válido.";
    //     return res.redirect('/');
    // }

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

        console.log("Datos de los seguimientos:", _seguimientos);

        const usuarioCreador = await obtenerUsuarioCreador(ticket.id);
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
            usuarioCreador,
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
    const usuario = req.session.usuario;

    // Cambiar estado del ticket
    await update(`UPDATE tickets SET estado = 1 WHERE id = @ticketId`, { ticketId });

    console.log(`El usuario ${usuario} ha abierto el ticket con ID: ${ticketId}`);

    // Insertar seguimiento automático
    await insert(`
        INSERT INTO seguimiento (id_usuario, id_ticket, comentario, tseguimiento)
        VALUES (@id_usuario, @ticketId, @comentario, @tseguimiento)
    `, {
        id_usuario: -1,
        ticketId,
        comentario: `<b>${usuario}</b> ha abierto el ticket a las ${new Date().toLocaleTimeString()}.`,
        tseguimiento: "ACTIVIDAD"
    });

    // Obtener datos del ticket
    const ticketData = await selectOne(`
        SELECT t.id, t.titulo, t.idcreador, u.usuario AS correo_creador, u.usuario AS nombre_creador
        FROM tickets t
        JOIN usuario u ON u.id = t.idcreador
        WHERE t.id = @ticketId
    `, { ticketId });


    const Creador = await obtenerUsuarioCreador(ticketId);


    // Verificación
    if (!ticketData) {
        console.warn("No se encontró información del ticket para enviar correo.");
        return res.redirect(`/tickets?id=${ticketId}`);
    }

    try {
        await enviarNotificacion(
            ticketData.correo_creador,                     // destino
            `Ticket #${ticketId} marcado como En Curso`,  // asunto
            'abierto',                                     // plantilla HTML: abierto.html
            {
                NOMBRE: ticketData.nombre_creador,
                ID_TICKET: ticketData.id,
                TITULO: ticketData.titulo
            }
        );
        console.log("Correo enviado al creador del ticket.");
    } catch (error) {
        console.error("❌ Error al enviar correo:", error);
    }

    return res.redirect(`/tickets?id=${ticketId}`);
});

app.post('/close_ticket', requiresLogin, async (req, res) => {
    const { ticketId = null } = req.body;
    const usuario = req.session.usuario;

    // Cambiar estado del ticket a CERRADO (0)
    await update(`UPDATE tickets SET estado = 0 WHERE id = @ticketId`, { ticketId });

    // Insertar seguimiento automático
    await insert(`
        INSERT INTO seguimiento (id_usuario, id_ticket, comentario, tseguimiento)
        VALUES (@id_usuario, @ticketId, @comentario, @tseguimiento)
    `, {
        id_usuario: -1,
        ticketId,
        comentario: `<b>${usuario}</b> ha cerrado el ticket a las ${new Date().toLocaleTimeString()}.`,
        tseguimiento: "ACTIVIDAD"
    });

    // Obtener datos del ticket para el correo
    const ticketData = await selectOne(`
        SELECT t.id, t.titulo, t.idcreador, u.usuario AS correo_creador, u.usuario AS nombre_creador
        FROM tickets t
        JOIN usuario u ON u.id = t.idcreador
        WHERE t.id = @ticketId
    `, { ticketId });

    if (!ticketData) {
        console.warn("No se encontró información del ticket para enviar correo.");
        return res.redirect(`/tickets?id=${ticketId}`);
    }

    try {
        await enviarNotificacion(
            ticketData.correo_creador,
            `Ticket #${ticketId} cerrado correctamente`,
            'cerrado', // plantilla cerrado.html
            {
                NOMBRE: ticketData.nombre_creador,
                ID_TICKET: ticketData.id,
                TITULO: ticketData.titulo
            }
        );
        console.log("✅ Correo de cierre de ticket enviado.");
    } catch (error) {
        console.error("❌ Error al enviar correo de cierre:", error);
    }

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
    const id_usuario_creador = id_usuario;


    console.log("Datos del ticket SJKHLAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:", {
        titulo,descripcion, categoria, ubicacion, id_usuario, id_usuario_creador
    });

    // 1. Crear el ticket (asignado a nadie aún; idusuario será actualizado por trigger)
    await insert(`
        INSERT INTO tickets (idusuario, titulo, descripcion, estado, categoria, ubicacion, idcreador)
        VALUES (@id_usuario, @titulo, @descripcion, 2, @categoria, @ubicacion, @id_usuario_creador)
    `, {
        titulo,
        descripcion,
        id_usuario,
        categoria,
        ubicacion,
        id_usuario_creador
    });

    // 2. Obtener el ID del ticket recién creado (último insertado por este usuario)
    const ticketRecienCreado = await selectOne(`
        SELECT TOP 1 * FROM tickets
        WHERE idcreador = @idcreador
        ORDER BY fcreacion DESC
    `, { idcreador: id_usuario_creador });

    if (!ticketRecienCreado) {
        console.error("❌ No se encontró el ticket recién creado.");
        return res.redirect('/tickets');
    }

    const ticketId = ticketRecienCreado.id;

    // 3. Enviar notificación al creador del ticket
    try {
        await enviarNotificacion(
            req.session.usuario, // correo del creador
            `Ticket #${ticketId} creado correctamente`,
            'creado', // plantilla: creado.html
            {
                NOMBRE: req.session.usuario,
                ID_TICKET: ticketId,
                TITULO: titulo
            }
        );
        console.log("✅ Correo de creación enviado al creador.");
    } catch (err) {
        console.error("❌ Error enviando correo al creador:", err);
    }

    // 4. Esperar un poco a que el TRIGGER actualice el idusuario (asignatario)
    await sleep(1000); // espera 1 segundo

    // 5. Obtener datos actualizados del ticket, ya con idusuario asignado por el trigger
    const ticketConSoporte = await selectOne(`
        SELECT t.id, t.titulo, u.usuario AS correo_soporte
        FROM tickets t
        JOIN usuario u ON u.id = t.idusuario
        WHERE t.id = @ticketId
    `, { ticketId });

    // 6. Enviar correo al soporte asignado
    if (ticketConSoporte?.correo_soporte) {
        try {
            await enviarNotificacion(
                ticketConSoporte.correo_soporte,
                `🎯 Nuevo ticket asignado: #${ticketId}`,
                'asignado',
                {
                    NOMBRE: ticketConSoporte.correo_soporte,
                    ID_TICKET: ticketId,
                    TITULO: titulo
                }
            );
            console.log("✅ Correo enviado al soporte asignado.");
        } catch (err) {
            console.error("❌ Error enviando correo al soporte:", err);
        }
    } else {
        console.warn("⚠️ No se encontró correo del soporte asignado.");
    }

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

    // 1. Insertar el comentario en la tabla seguimiento
    await insert(`
        INSERT INTO seguimiento (id_usuario, id_ticket, comentario)
        VALUES (@id_usuario, @ticketId, @comentario)
    `, { id_usuario, ticketId, comentario });

    // 2. Obtener los datos del ticket, creador y soporte asignado
    const ticketData = await selectOne(`
        SELECT t.id, t.titulo, t.idcreador, t.idusuario AS idsoporte, 
               c.usuario AS correo_creador, s.usuario AS correo_soporte
        FROM tickets t
        JOIN usuario c ON t.idcreador = c.id
        JOIN usuario s ON t.idusuario = s.id
        WHERE t.id = @ticketId
    `, { ticketId });

    // 3. Enviar correo al creador del ticket
    if (ticketData?.correo_creador) {
        try {
            await enviarNotificacion(
                ticketData.correo_creador,
                `Nuevo comentario en el ticket #${ticketId}`,
                'comentario_creador',
                {
                    NOMBRE: ticketData.correo_creador,
                    ID_TICKET: ticketId,
                    TITULO: ticketData.titulo,
                    COMENTARIO: comentario
                }
            );
            console.log("✅ Correo enviado al creador.");
        } catch (err) {
            console.error("❌ Error enviando correo al creador:", err);
        }
    }

    // 4. Si el comentario lo hace alguien distinto al soporte, enviar correo al soporte asignado
    if (ticketData?.correo_soporte && ticketData.idsoporte !== id_usuario) {
        try {
            await enviarNotificacion(
                ticketData.correo_soporte,
                `Nuevo comentario en el ticket #${ticketId}`,
                'comentario_soporte',
                {
                    NOMBRE: ticketData.correo_soporte,
                    ID_TICKET: ticketId,
                    TITULO: ticketData.titulo,
                    COMENTARIO: comentario
                }
            );
            console.log("✅ Correo enviado al soporte.");
        } catch (err) {
            console.error("❌ Error enviando correo al soporte:", err);
        }
    }

    // Redirigir al ticket para ver el seguimiento
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

app.post('/assign_ticket', requiresLogin, async (req, res) => {
    const ticketId = parseInt(req.body.ticketId);
    const userId = parseInt(req.body.responsable);

    // 1. Actualizar el ticket con el nuevo asignatario
    await update(`
        UPDATE tickets
        SET idusuario = @user
        WHERE id = @ticket
    `, { user: userId, ticket: ticketId });

    // 2. Obtener información del nuevo asignado y del ticket
    const datos = await selectOne(`
        SELECT 
            t.id,
            t.titulo,
            t.idcreador,
            u.usuario AS correo_asignado,
            u.usuario AS nombre_asignado,
            c.usuario AS correo_creador
        FROM tickets t
        JOIN usuario u ON t.idusuario = u.id
        JOIN usuario c ON t.idcreador = c.id
        WHERE t.id = @ticketId
    `, { ticketId });

    // 3. Enviar correo al asignado

    console.log("Datos del ticket para asignatarios:", datos);

    if (datos?.correo_asignado) {
        try {
            await enviarNotificacion(
                datos.correo_asignado,
                `🎯 Te asignaron un nuevo ticket #${ticketId}`,
                'asignado',
                {
                    NOMBRE: datos.correo_asignado,
                    ID_TICKET: datos.id,
                    TITULO: datos.titulo
                }
            );
            console.log("✅ Correo enviado al nuevo asignatario.");
        } catch (err) {
            console.error("❌ Error enviando correo al asignado:", err);
        }
    }

    // 4. (Opcional) Avisar al creador del ticket que hubo cambio
    // if (datos?.correo_creador) {
    //     try {
    //         await enviarNotificacion(
    //             datos.correo_creador,
    //             `🔄 El ticket #${ticketId} fue asignado a un soporte`,
    //             'reasignado',
    //             {
    //                 ID_TICKET: datos.id,
    //                 TITULO: datos.titulo
    //             }
    //         );
    //         console.log("📩 Aviso enviado al creador del ticket.");
    //     } catch (err) {
    //         console.error("⚠️ Error notificando al creador:", err);
    //     }
    // }

    res.redirect('/dashboard');
});
// Inicializar encendido de forma asíncrona.
(async function init() {
    //await db.connect()
    app.listen(APP_PORT, () => console.log(`✅ Servidor de ticket alojado en el puerto: ${APP_PORT}`));
})();

process.on('uncaughtException', (err) => console.log(err));
process.on('unhandledRejection', (err) => console.log(err));