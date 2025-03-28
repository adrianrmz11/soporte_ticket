/* const dirMac = $("#dir-mac");
const dirIp = $("#dir-ip");

function filter(el, pattern) {
    var prevVal;

    $(el).on('input', function(e) {
        const val = $(el).val();
        
        if (!val.match(pattern) && val.length > 0) {
            $(el).val(prevVal);
            return;
        }

        prevVal = val;
    });
}

function formatMac(el) {
    $(el).on('input', function(e) {
        const val = $(el).val();

        var value = val.replace(/[^A-Fa-f0-9]/g, "");
        var formatted = value.toUpperCase().match(/.{1,2}/g)?.join(":") || "";
        $(el).val(formatted);
    });
}

function formatIp(el) {
    $(el).on('input', function(e) {
        let value = e.target.value.replace(/[^0-9]/g, ""); // Permitir solo números
        let formattedValue = "";
        let blocks = [];

        // Generar los octetos de la IP asegurando que no excedan 255
        for (let i = 0; i < value.length; i += 1) {
            let part = value.slice(0, i + 1); // Tomar de 1 en 1 para evaluar
            if (parseInt(part) > 255) break; // Si el número es mayor a 255, detener
            
            if (part.length >= 3 || parseInt(part) > 25) { // Si es un número válido, lo agrupa
                blocks.push(part);
                value = value.slice(i + 1);
                i = -1; // Reiniciar contador
            }
        }

        // Si hay partes restantes, agregarlas
        if (value) blocks.push(value);
        
        formattedValue = blocks.join(".");

        // Limitar a 4 bloques
        formattedValue = formattedValue.split(".").slice(0, 4).join(".");

        e.target.value = formattedValue;
    });
} */

//filter(dirMac, /^\d+$/g);
/* formatMac(dirMac);
formatIp(dirIp); */