$("#boton-responder-seguimiento").click(function(e) {
    $("#contenedor-seguimiento-acciones").removeAttr("hidden");
    $("#contenedor-seguimiento-abrir").attr("hidden", "hidden");
    $("#contenedor-seguimiento-texto").removeAttr("hidden");
});

$("#boton-cancelar-seguimiento").click(function(e) {
    $("#contenedor-seguimiento-acciones").attr("hidden", "hidden");
    $("#contenedor-seguimiento-abrir").removeAttr("hidden");
    $("#contenedor-seguimiento-texto").attr("hidden", "hidden");
});

function preventSending(event) {
    event.preventDefault();
    return false;
}