/*
 * Configuración de la página. Esto es lo ÚNICO que hay que editar después de instalar el servidor.
 * Acá no va ninguna clave: la URL del servidor es pública por diseño.
 */
window.RIFA_CONFIG = {
  // URL de la aplicación web de Apps Script (termina en /exec). Mientras esté vacía, la página
  // se muestra en "vista previa" y no permite comprar.
  API_URL: 'https://script.google.com/macros/s/AKfycbxCybl3yYhfgzo2b6AyrBPZ9VaRYaIsF9yXwwLv24uVLBnA1EoptmXZu36JF_K7AFEe/exec',

  PRECIO: 500,
  DESDE: 1001,
  HASTA: 3000,
  MAX_POR_COMPRA: 20,
  SORTEO: 'viernes 18 de diciembre de 2026, 13:00 h',

  // Opcional: WhatsApp de la escuela para consultas, con código de país (ej. '59899123456').
  WHATSAPP_CONTACTO: '',
};
