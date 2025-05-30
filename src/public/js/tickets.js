$("#filtro-ticket").on("change", function() {
    const filtro = $(this).val();
    // Aquí puedes agregar la lógica para filtrar los tickets según el valor seleccionado

    if (filtro == -1) {
        $(".contenedor-ticket").show();
        return;
    }

    $(`.contenedor-ticket[idEstado="${filtro}"]`).show();
    $(`.contenedor-ticket[idEstado!="${filtro}"]`).hide();
});