## Instalación

1. **Clona utilizando el siguiente comando:**

```bash
git clone https://github.com/adrianrmz11/soporte_ticket.git
```

2. **Abre el CMD en el directorio del repositorio**

3. **Instala las dependencias correspondientes ejecutando el siguiente comando:**

```bash
install
```

> *Si el npm arroja un error, ejecuta los siguientes comandos:*
> 
> ```bash
> set NODE_TLS_REJECT_UNAUTHORIZED=0
> ```
> 
> ```bash
> npm config set strict-ssl false
> ```
> 
> *Una vez ejecutado los dos anteriores comandos, repite el*  _**PASO 3**_

4. Una vez instaladas las dependencias, ejecuta el siguiente comando:

```bash
npm run dev
```

*Una vez que la consola imprima lo siguiente:*

```bash
✅ Servidor de ticket alojado en el puerto: 4543
```

Pega el siguiente enlace en tu navegador: 
```
http://localhost:4543/
``` 