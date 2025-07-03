const { selectAll, selectOne } = require("./connection");

const TicketEstado = {
    FINALIZADO: 0,
    EN_PROCESO: 1,
    PENDIENTE: 2,
    VENCIDO: 3
};

function isEmpty() {

}

/**
 * Obtiene los tickets registrados.
 * @param {keyof TicketEstado} filtroEstado Filtro de estado.
 */
async function obtenerTickets(filtroEstado = null) {
/*     var query = `
        select 
            t.id, 
            u.usuario, 
            t.titulo, 
            t.descripcion, 
            t.estado,
            (
                case
                    when t.estado = 0 then 'Finalizado'
                    when t.estado = 1 then 'En proceso'
                    when t.estado = 2 then 'Pendiente'
                    when t.estado = 3 then 'Vencido'
                    else 'Sin definir'
                end
            ) as destado,
            t.fcreacion 
        from tickets t 
        inner join usuario u on t.idusuario = u.id
    `; */

    var query = `
        select 
            t.id, 
            u.usuario, 
            t.titulo, 
            t.descripcion, 
            t.estado,
            t.categoria,
            t.ubicacion,
            coalesce(t.prioridad, 0) as prioridad,
            (
                case
                    when t.estado = 0 then 'Finalizado'
                    when t.estado = 1 then 'En proceso'
                    when t.estado = 2 then 'Pendiente'
                    when t.estado = 3 then 'Vencido'
                    else 'Sin definir'
                end
            ) as destado,
            t.fcreacion 
        from tickets t 
        inner join usuario u on t.idusuario = u.id
        left join persona p on u.idpersona = u.idpersona
        order by t.fcreacion desc
    `;

    const estadoElegido = TicketEstado[filtroEstado];

    // Ha escogido un filtro.
    // Ej: Recuperar todos los tickets en estado pendiente.
    if (estadoElegido) {
        query += ` where t.estado = @estado`;
        
        const results = await selectAll(query, {
            estado: estadoElegido
        });

        return results;
    }

    const results = await selectAll(query);

    return results;
}

/**
 * Obtiene los tickets registrados.
 * @param {keyof TicketEstado} filtroEstado Filtro de estado.
 */
async function obtenerTicketsUsuario(filtroEstado = null, userId = null) {
    var query = `
        select 
            t.id, 
            u.usuario, 
            t.titulo, 
            t.descripcion, 
            t.estado,
            t.categoria,
            t.ubicacion,
            coalesce(t.prioridad, 0) as prioridad,
            (
                case
                    when t.estado = 0 then 'Finalizado'
                    when t.estado = 1 then 'En proceso'
                    when t.estado = 2 then 'Pendiente'
                    when t.estado = 3 then 'Vencido'
                    else 'Sin definir'
                end
            ) as destado,
            t.fcreacion 
        from tickets t 
        inner join usuario u on t.idusuario = u.id
        left join persona p on u.idpersona = u.idpersona
        where t.idcreador = @userId or t.idusuario=@userId
        order by t.fcreacion desc
    `;

    const estadoElegido = TicketEstado[filtroEstado];

    // Ha escogido un filtro.
    // Ej: Recuperar todos los tickets en estado pendiente.
    if (estadoElegido) {
        query += ` and t.estado = @estado`;
        
        const results = await selectAll(query, {
            estado: estadoElegido,
            userId
        });

        return results;
    }

    const results = await selectAll(query, { userId });

    return results;
}

/**
 * Obtiene el ticket mediante su identificador.
 * @param {string|number} id Identificador del ticket.
 */
async function obtenerTicket(id) {
    var query = `
       SELECT 
    t.id, 
    t.titulo, 
    t.descripcion, 
    t.fcreacion, 
    t.categoria,
    t.ubicacion,
    CASE
        WHEN t.estado = 0 THEN 'Finalizado'
        WHEN t.estado = 1 THEN 'En proceso'
        WHEN t.estado = 2 THEN 'Pendiente'
        WHEN t.estado = 3 THEN 'Vencido'
        ELSE 'Sin definir'
    END AS estado,
    u.usuario AS asignado,           -- usuario asignado (t.idusuario)
    c.usuario AS creador             -- usuario creador (t.idcreador)
FROM tickets t
INNER JOIN usuario u ON t.idusuario = u.id     -- soporte asignado
INNER JOIN usuario c ON t.idcreador = c.id     -- creador del ticket
WHERE t.id = @id
    `;

    const result = await selectOne(query, { id });

    return result;
}
async function obtenerUsuarioCreador(ticketid) {

    var query = `
       select u.usuario from usuario u join tickets t on t.idcreador= u.id where t.id= @ticketid
    `;

    const result = await selectOne(query, { ticketid });
    

    if (!result) {
        return null;
    }

    return {
        nombre_creador: result.usuario
    };
}
async function obtenerSeguimientos(ticketId) {
    var query = `
        select id_usuario, comentario, fcreacion, tseguimiento from seguimiento where id_ticket = @ticketId
    `;

    const results = await selectAll(query, { ticketId });
    return results;
}



async function obtenerUsuario(idusuario) {
    var query = `
        select usuario from usuario where id = @idusuario
    `;

    const result = await selectOne(query, { idusuario });

    if (!result) {
        return null;
    }

    return result.usuario;
}

module.exports = {
    obtenerTickets,
    obtenerTicket,
    obtenerSeguimientos,
    obtenerUsuario,
    obtenerTicketsUsuario,
    obtenerUsuarioCreador
};