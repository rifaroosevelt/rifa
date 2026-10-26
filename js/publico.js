/* Página pública: selección de números, datos del comprador, pago y comprobante. */

(function () {
  const params = new URLSearchParams(location.search);
  if (params.get('op') && params.get('t')) {
    modoResultado(params.get('op'), params.get('t'));
  } else {
    modoCompra();
  }

  if (C.WHATSAPP_CONTACTO) {
    const p = $('#contacto-wa');
    p.hidden = false;
    $('a', p).href = 'https://wa.me/' + C.WHATSAPP_CONTACTO;
  }

  /* ---------------- Paso 1: elegir números ---------------- */

  function modoCompra() {
    const grilla = new Grilla($('#grilla'), { onCambio: actualizarCarrito, textoA: 'En talonario' });
    const dlg = $('#dlg-datos');

    $('#btn-comprar').addEventListener('click', () => abrirDatos(grilla, dlg));
    $('#carrito-chips').addEventListener('click', (e) => {
      const c = e.target.closest('.chip');
      if (c) grilla.quitar(Number(c.dataset.n));
    });
    $('[data-cerrar]', dlg).addEventListener('click', () => dlg.close());
    $('#form-datos').addEventListener('submit', (e) => {
      e.preventDefault();
      pagar(grilla, dlg);
    });

    cargarEstado(grilla);
    setInterval(() => { if (!document.hidden && !dlg.open) cargarEstado(grilla); }, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) cargarEstado(grilla); });

    function actualizarCarrito(sel, perdidos) {
      const lista = [...sel].sort((a, b) => a - b);
      $('#carrito').classList.toggle('visible', lista.length > 0);
      document.body.classList.toggle('con-carrito', lista.length > 0);
      $('#carrito-total').textContent = fmt.pesos(lista.length * C.PRECIO);
      $('#carrito-cant').textContent = lista.length === 1 ? '1 número' : lista.length + ' números';
      $('#carrito-chips').innerHTML = lista.map((n) => `<button type="button" class="chip" data-n="${n}" aria-label="Quitar ${n}">${n}</button>`).join('');
      $('#btn-comprar').disabled = lista.length === 0;
      if (perdidos && perdidos.length) {
        aviso((perdidos.length === 1 ? 'El ' + perdidos[0] + ' acaba de ser tomado' : 'Los números ' + perdidos.join(', ') + ' acaban de ser tomados') + ' por otra persona.', 'error');
      }
    }
  }

  async function cargarEstado(grilla) {
    if (!Api.configurada()) {
      $('#vista-previa').hidden = false;
      actualizarCifras(grilla, 0);
      return;
    }
    try {
      const r = await Api.get({ accion: 'estado' });
      grilla.setEstados(mapaEstados(r));
      actualizarCifras(grilla, (r.v || []).length);
    } catch (e) {
      aviso(e.message, 'error');
    }
  }

  function actualizarCifras(grilla, vendidos) {
    const total = C.HASTA - C.DESDE + 1;
    $('#cifra-disp').textContent = fmt.num(grilla.disponibles());
    $('#cifra-vend').textContent = fmt.num(vendidos);
    $('#prog').style.width = Math.max(1, (vendidos / total) * 100) + '%';
    $('.barra-prog').setAttribute('aria-valuenow', vendidos);
  }

  /* ---------------- Paso 2: datos y pago ---------------- */

  function abrirDatos(grilla, dlg) {
    const lista = [...grilla.sel].sort((a, b) => a - b);
    if (!lista.length) return;
    $('#dlg-numeros').textContent = lista.join(', ');
    $('#dlg-total').textContent = fmt.pesos(lista.length * C.PRECIO);
    const guardados = almacen.get('rifa_comprador');
    if (guardados) {
      ['nombre', 'telefono', 'email'].forEach((k) => { const el = $(`#form-datos [name=${k}]`); if (!el.value) el.value = guardados[k] || ''; });
    }
    dlg.showModal();
  }

  async function pagar(grilla, dlg) {
    const f = $('#form-datos');
    const datos = {
      nombre: f.nombre.value.trim(),
      telefono: f.telefono.value.trim(),
      email: f.email.value.trim(),
    };
    if (datos.nombre.length < 3 || !datos.nombre.includes(' ')) return marcar(f.nombre, 'Escribí tu nombre y apellido.');
    if (datos.telefono.replace(/\D/g, '').length < 8) return marcar(f.telefono, 'Revisá tu teléfono.');
    if (!/^\S+@\S+\.\S{2,}$/.test(datos.email)) return marcar(f.email, 'Revisá tu correo electrónico.');
    if (!$('#f-acepto').checked) return marcar($('#f-acepto'), 'Marcá la casilla para continuar.');
    if (!Api.configurada()) return aviso('Vista previa: todavía no se pueden hacer compras.', 'error');

    const btn = $('#btn-pagar');
    boton(btn, true, 'Reservando tus números…');
    try {
      const numeros = [...grilla.sel].sort((a, b) => a - b);
      const r = await Api.post(Object.assign({ accion: 'reservar', numeros, web: f.web.value }, datos));
      almacen.set('rifa_comprador', datos);
      almacen.set('rifa_ultima', { op: r.op, t: r.t });
      btn.innerHTML = '<span class="spinner"></span> Abriendo Mercado Pago…';
      location.href = r.link;
    } catch (e) {
      boton(btn, false);
      if (e.codigo === 'NO_DISPONIBLE') {
        dlg.close();
        await cargarEstado(grilla);
      }
      aviso(e.message, 'error');
    }
  }

  function marcar(el, texto) {
    aviso(texto, 'error');
    el.focus();
  }

  /* ---------------- Paso 3: confirmación ---------------- */

  function modoResultado(op, t) {
    $('#compra').hidden = true;
    $('#resultado').hidden = false;
    $('#carrito').hidden = true;
    const caja = $('#resultado-contenido');
    let intentos = 0;
    pintarEspera(caja);
    consultar();

    async function consultar() {
      intentos++;
      try {
        const d = await Api.post({ accion: 'consultar', op, t });
        if (d.estado === 'aprobada' || d.estado === 'resuelta') return pintarAprobada(caja, d);
        if (d.estado === 'revisar') return pintarRevisar(caja, d);
        if (d.estado === 'pendiente') {
          if (/rejected|cancelled/.test(d.pagoEstado)) return pintarRechazada(caja, d);
          if (intentos < 40) {
            pintarEspera(caja, intentos > 10);
            setTimeout(consultar, intentos < 10 ? 3000 : 6000);
            return;
          }
          return pintarPendienteLarga(caja, d);
        }
        return pintarVencida(caja, d);
      } catch (e) {
        if (intentos < 5) { setTimeout(consultar, 4000); return; }
        caja.innerHTML = `<div class="estado-caja tarjeta"><div class="icono">⚠️</div><h1>No pudimos consultar tu compra</h1>
          <p>${esc(e.message)}</p><div class="acciones"><button class="btn btn-azul" onclick="location.reload()">Reintentar</button></div></div>`;
      }
    }
  }

  function pintarEspera(caja, lenta) {
    caja.innerHTML = `<div class="estado-caja tarjeta" style="padding:32px 20px">
      <div class="spinner grande"></div>
      <h1>Confirmando tu pago…</h1>
      <p>Estamos verificando el pago directamente con Mercado Pago. No cierres esta página.</p>
      ${lenta ? '<p class="nota">Está tardando un poco más de lo normal. Seguimos verificando.</p>' : ''}
    </div>`;
  }

  function pintarAprobada(caja, d) {
    almacen.del('rifa_ultima');
    const link = location.href;
    const texto = `¡Ya tengo mi rifa de la Escuela Roosevelt! Mis números: ${d.numeros.join(', ')}. Sorteo: ${d.sorteo}. Comprobante: ${link}`;
    caja.innerHTML = `
      <div class="estado-caja" style="margin-bottom:20px">
        <div class="icono">🎉</div>
        <h1>¡Gracias por colaborar!</h1>
        <p>Tu compra quedó confirmada. ${d.canal === 'online' ? 'También te enviamos este comprobante por correo.' : ''}</p>
      </div>
      ${htmlComprobante(d)}
      <div class="estado-caja"><div class="acciones">
        <button class="btn btn-azul" onclick="window.print()">🖨️ Guardar o imprimir</button>
        <a class="btn btn-sec" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(texto)}">Compartir por WhatsApp</a>
        <a class="btn btn-ghost" href="./">Comprar más números</a>
      </div></div>`;
  }

  function pintarRevisar(caja, d) {
    caja.innerHTML = `<div class="estado-caja tarjeta"><div class="icono">📋</div><h1>Recibimos tu pago</h1>
      <p>Tu pago (operación <b>${esc(d.op)}</b>) fue aprobado, pero necesitamos revisar tu compra. La Escuela se va a comunicar con vos a la brevedad.</p></div>`;
  }

  function pintarRechazada(caja, d) {
    caja.innerHTML = `<div class="estado-caja tarjeta"><div class="icono">💳</div><h1>El pago no se aprobó</h1>
      <p>Mercado Pago rechazó el pago. Tus números (${d.numeros.join(', ')}) siguen reservados por unos minutos: podés intentarlo de nuevo con otro medio de pago.</p>
      <div class="acciones">
        ${d.link ? `<a class="btn btn-pri" href="${esc(d.link)}">Intentar de nuevo</a>` : ''}
        <a class="btn btn-ghost" href="./">Volver al inicio</a>
      </div></div>`;
  }

  function pintarPendienteLarga(caja, d) {
    caja.innerHTML = `<div class="estado-caja tarjeta"><div class="icono">⏳</div><h1>Tu pago todavía no se confirmó</h1>
      <p>Si ya pagaste, no te preocupes: el sistema sigue verificando con Mercado Pago y te va a llegar el comprobante por correo. Podés volver a abrir esta página más tarde.</p>
      <div class="acciones">
        <button class="btn btn-azul" onclick="location.reload()">Volver a consultar</button>
        ${d.link ? `<a class="btn btn-pri" href="${esc(d.link)}">Ir a pagar</a>` : ''}
      </div></div>`;
  }

  function pintarVencida(caja, d) {
    caja.innerHTML = `<div class="estado-caja tarjeta"><div class="icono">⌛</div><h1>La reserva venció</h1>
      <p>No recibimos un pago aprobado a tiempo, así que los números se liberaron. Podés elegir números de nuevo.</p>
      <div class="acciones"><a class="btn btn-pri" href="./">Elegir números</a></div></div>`;
  }
})();
