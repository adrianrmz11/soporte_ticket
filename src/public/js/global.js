document.addEventListener("keyup", (e) => {
    if (e.key == "Escape" && window.location.pathname != "/dashboard") {
        window.history.back();
        setTimeout(() => {
            location.reload(true);
        }, 40);
    }
});