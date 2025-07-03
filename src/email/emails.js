const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // desde .env
    pass: process.env.EMAIL_PASS
  }
});

/**
 * Lee una plantilla HTML y reemplaza las variables.
 * @param {string} templateName - Nombre del archivo (sin extensión).
 * @param {object} data - Datos para inyectar en {{llaves}}.
 * @returns {string} HTML final.
 */
function renderTemplate(templateName, data) {
  const filePath = path.join(__dirname, 'emailTemplates', `${templateName}.html`);
  let html = fs.readFileSync(filePath, 'utf8');

  for (const key in data) {
    const value = data[key];
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    html = html.replace(regex, value);
  }

  return html;
}

/**
 * Envía un correo.
 * @param {string|string[]} to - Destinatarios
 * @param {string} subject
 * @param {string} templateName - Nombre del archivo HTML sin extensión
 * @param {object} data - Datos para la plantilla
 */
async function enviarNotificacion(to, subject, templateName, data) {
  const html = renderTemplate(templateName, data);

  const info = await transporter.sendMail({
    from: `"Soporte Técnico" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html
  });

  console.log(`Correo enviado: ${info.messageId}`);
}

module.exports = {
  enviarNotificacion
};
