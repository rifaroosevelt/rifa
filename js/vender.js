/* Panel de vendedores: venta presencial en efectivo o con Mercado Pago. */

(function () {
  const CLAVE = 'rifa_sesion_vendedor';
  let sesion = almacen.get(CLAVE);
  let grilla;
  let sondeo;

  if (!Api.configurada()) {
    document.body.insertAdjacentHTML('afterbegin', '<div class="banda-aviso">El panel todavía no está conectado al servidor (falta API_URL en js/config.js).</div>');
  }

  if (sesion) iniciarApp(); else mostrarLogin();

  /* ---------------- Sesión ---------------- */

  function mostrarLogin() {
    $('#v-login').hidden = false;
    $('#v-app').hidden = true;
    $('#nav-sesion').hidden = true;
  }

  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[type=submit]', e.target);
    boton(btn, true, 'Ingresando…');
    try {
      const r = await Api.post({ accion: 'login', usuario: $('#l-usuario').value, clave: $('#l-clave').value });
      sesion = { sesion: r.sesion, nombre: r.nombre, rol: r.rol, id: r.id };
      almacen.set(CLAVE, sesion);
      $('#l-clave').value = '';
      iniciarApp();
    } catch (err) {
      aviso(err.message, 'error');
    } finally {
      boton(btn, false);
    }
  });

  $('#salir').addEventListener('click', async (e) => {
    e.preventDefault();
    try { await Api.post({ accion: 'logout', sesion: sesion.sesion }); } catch (x) { /* igual se cierra */ }
    cerrarSesion();
  });

  function cerrarSesion(mensaje) {
    almacen.del(CLAVE);
    sesion = null;
    clearInterval(sondeo);
    if (mensaje) aviso(mensaje, 'error');
    mostrarLogin();
  }

  /** Llama al servidor con la sesión; si venció, vuelve al login. */
  async function llamar(accion, datos) {
    try {
      return await Api.post(Object.assign({ accion, sesion: sesion.sesion }, datos || {}));
    } catch (e) {
      if (e.codigo === 'SESION') cerrarSesion(e.message);
      throw e;
    }
  }

  /* ---------------- App ---------------- */

  function iniciarApp() {
    $('#v-login').hidden = true;
    $('#v-app').hidden = false;
    $('#nav-sesion').hidden = false;
    $('#quien').textContent = sesion.nombre;
    if (!grilla) {
      grilla = new Grilla($('#grilla'), { onCambio: actualizarSeleccion, conMios: true, textoA: 'Talonario de otro vendedor' });
    }
    cargarEstado();
  }

  $$('.pestanas button').forEach((b) => b.addEventListener('click', () => {
    $$('.pestanas button').forEach((x) => x.classList.toggle('activo', x === b));
    $('#vista-vender').hidden = b.dataset.vista !== 'vender';
    $('#vista-ventas').hidden = b.dataset.vista !== 'ventas';
    if (b.dataset.vista === 'ventas') cargarVentas();
    else cargarEstado();
  }));

  async function cargarEstado() {
    try {
      const r = await llamar('vend_estado');
      grilla.setEstados(mapaEstados(r));
    } catch (e) {
      aviso(e.message, 'error');
    }
  }

  function actualizarSeleccion(sel, perdidos) {
    const lista = [...sel].sort((a, b) => a - b);
    $('#sel-numeros').textContent = lista.length ? lista.join(', ') : 'Ninguno';
    $('#sel-total').textContent = fmt.pesos(lista.length * C.PRECIO);
    // El importe se recalcula con cada número elegido; si cambia la selección hay que volver a confirmar el cobro.
    $('#conf-texto').textContent = lista.length
      ? `Recibí ${fmt.pesos(lista.length * C.PRECIO)} en efectivo (${lista.length === 1 ? '1 número' : lista.length + ' números'})`
      : 'Elegí primero los números';
    $('#c-cobre').disabled = !lista.length;
    $('#c-cobre').checked = false;
    if (perdidos && perdidos.length) aviso('Ya no están disponibles: ' + perdidos.join(', '), 'error');
  }

  $$('input[name=metodo]').forEach((r) => r.addEventListener('change', () => {
    const m = $('input[name=metodo]:checked').value;
    $('#conf-efectivo').hidden = m !== 'efectivo';
    $('#nota-mp').hidden = m !== 'mercadopago';
    $('#btn-vender').textContent = m === 'mercadopago' ? 'Generar cobro con Mercado Pago' : 'Confirmar venta en efectivo';
  }));

  $('#form-venta').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const numeros = [...grilla.sel].sort((a, b) => a - b);
    const metodo = ($('input[name=metodo]:checked') || {}).value;
    if (!numeros.length) return aviso('Elegí al menos un número.', 'error');
    if (f.nombre.value.trim().length < 3) return aviso('Escribí el nombre y apellido del comprador.', 'error');
    if (f.telefono.value.replace(/\D/g, '').length < 8) return aviso('Revisá el teléfono.', 'error');
    if (!metodo) return aviso('Elegí cómo paga.', 'error');
    if (metodo === 'efectivo' && !$('#c-cobre').checked) return aviso('Confirmá que recibiste el dinero.', 'error');

    const btn = $('#btn-vender');
    boton(btn, true, metodo === 'efectivo' ? 'Registrando venta…' : 'Generando cobro…');
    try {
      const r = await llamar('vend_vender', {
        numeros, metodo,
        nombre: f.nombre.value.trim(), telefono: f.telefono.value.trim(), email: f.email.value.trim(),
        cobroConfirmado: metodo === 'efectivo' ? $('#c-cobre').checked : undefined,
      });
      const comprador = { nombre: f.nombre.value.trim(), telefono: f.telefono.value.trim() };
      if (metodo === 'efectivo') mostrarExito(r, comprador);
      else mostrarCobroMP(r, comprador);
    } catch (err) {
      aviso(err.message, 'error');
      if (err.codigo === 'NO_DISPONIBLE') cargarEstado();
    } finally {
      boton(btn, false);
    }
  });

  function mostrarExito(r, comprador) {
    clearInterval(sondeo);
    const link = linkComprobante(r.op, r.t);
    const texto = `¡Gracias por colaborar con la Escuela Roosevelt! Tus números: ${r.numeros.join(', ')}. Sorteo: ${C.SORTEO}. Tu comprobante: ${link}`;
    $('#venta-form').hidden = true;
    $('#venta-resultado').hidden = false;
    $('#venta-resultado').innerHTML = `
      <div class="tarjeta estado-caja">
        <div class="icono">✅</div>
        <h1>Venta confirmada</h1>
        <p><b>${esc(comprador.nombre)}</b> · ${r.numeros.join(', ')} · ${fmt.pesos(r.importe)}</p>
        <p class="nota">Los números ya figuran como vendidos en la planilla.</p>
        <div class="acciones">
          <a class="btn btn-pri" target="_blank" rel="noopener" href="https://wa.me/${telWhatsApp(comprador.telefono)}?text=${encodeURIComponent(texto)}">Enviar comprobante por WhatsApp</a>
          <a class="btn btn-sec" target="_blank" rel="noopener" href="${esc(link)}">Ver comprobante</a>
          <button class="btn btn-azul" id="nueva-venta">Nueva venta</button>
        </div>
      </div>`;
    $('#nueva-venta').addEventListener('click', nuevaVenta);
  }

  function mostrarCobroMP(r, comprador) {
    $('#venta-form').hidden = true;
    const res = $('#venta-resultado');
    res.hidden = false;
    const texto = `Hola ${comprador.nombre}! Este es el link para pagar tu rifa de la Escuela Roosevelt (números ${r.numeros.join(', ')}, total ${fmt.pesos(r.importe)}): ${r.link}`;
    res.innerHTML = `
      <div class="tarjeta estado-caja">
        <h1>Cobro con Mercado Pago</h1>
        <p><b>${esc(comprador.nombre)}</b> · ${r.numeros.join(', ')} · <b>${fmt.pesos(r.importe)}</b></p>
        <div class="qr" id="qr"></div>
        <p class="nota">Que escanee el código con la cámara del celular, o mandale el link.</p>
        <div class="acciones">
          <a class="btn btn-pri" target="_blank" rel="noopener" href="https://wa.me/${telWhatsApp(comprador.telefono)}?text=${encodeURIComponent(texto)}">Enviar link por WhatsApp</a>
          <button class="btn btn-sec" id="copiar-link">Copiar link</button>
        </div>
        <p id="estado-mp" style="margin-top:18px;font-weight:800"><span class="spinner"></span> Esperando el pago…</p>
        <div class="acciones">
          <button class="btn btn-peligro btn-chico" id="cancelar-mp">Cancelar y liberar números</button>
        </div>
      </div>`;
    if (window.QRCode) new QRCode($('#qr'), { text: r.link, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
    else $('#qr').textContent = r.link;
    $('#copiar-link').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(r.link); aviso('Link copiado.', 'ok'); }
      catch (e) { prompt('Copiá el link:', r.link); }
    });
    $('#cancelar-mp').addEventListener('click', async (e) => {
      if (!confirm('¿Cancelar este cobro? Los números vuelven a quedar disponibles.')) return;
      boton(e.target, true, 'Cancelando…');
      try {
        const x = await llamar('vend_cancelar', { op: r.op });
        clearInterval(sondeo);
        aviso(x.mensaje, 'ok');
        if (x.estado === 'aprobada') return revisarPago(r, comprador);
        nuevaVenta();
      } catch (err) {
        aviso(err.message, 'error');
        boton(e.target, false);
      }
    });

    clearInterval(sondeo);
    sondeo = setInterval(() => revisarPago(r, comprador), 5000);
  }

  async function revisarPago(r, comprador) {
    try {
      const d = await llamar('vend_consultar', { op: r.op });
      const estado = $('#estado-mp');
      if (d.estado === 'aprobada' || d.estado === 'resuelta') {
        clearInterval(sondeo);
        mostrarExito(Object.assign({}, r, { t: d.t }), comprador);
      } else if (d.estado === 'revisar') {
        clearInterval(sondeo);
        if (estado) estado.innerHTML = '⚠️ Pago aprobado, pero la operación quedó para revisar por la administración.';
      } else if (d.estado !== 'pendiente') {
        clearInterval(sondeo);
        if (estado) estado.innerHTML = '⌛ La reserva ' + esc(d.estado) + '. Los números se liberaron.';
      } else if (estado && /rejected/.test(d.pagoEstado)) {
        estado.innerHTML = '<span class="spinner"></span> El pago fue rechazado: puede intentar de nuevo con otro medio.';
      }
    } catch (e) { /* se reintenta en el próximo ciclo */ }
  }

  function nuevaVenta() {
    clearInterval(sondeo);
    $('#form-venta').reset();
    $('#conf-efectivo').hidden = true;
    $('#nota-mp').hidden = true;
    $('#btn-vender').textContent = 'Confirmar venta';
    grilla.limpiar();
    $('#venta-resultado').hidden = true;
    $('#venta-form').hidden = false;
    cargarEstado();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------- Mis ventas ---------------- */

  async function cargarVentas() {
    $('#mis-ventas').innerHTML = '<p><span class="spinner"></span> Cargando…</p>';
    try {
      const r = await llamar('vend_mis_ventas');
      $('#mis-kpis').innerHTML = `
        <div class="kpi"><small>Números vendidos</small><b>${fmt.num(r.resumen.cantidad)}</b></div>
        <div class="kpi destacado"><small>Total</small><b>${fmt.pesos((r.resumen.efectivo || 0) + (r.resumen.mercadopago || 0))}</b></div>
        <div class="kpi"><small>Efectivo a entregar</small><b>${fmt.pesos(r.resumen.efectivo)}</b></div>
        <div class="kpi"><small>Mercado Pago</small><b>${fmt.pesos(r.resumen.mercadopago)}</b></div>`;
      if (!r.ventas.length) {
        $('#mis-ventas').innerHTML = '<p class="tarjeta">Todavía no registraste ventas.</p>';
        return;
      }
      $('#mis-ventas').innerHTML = r.ventas.map((v) => `
        <div class="venta">
          <div class="cab"><span class="nums">${esc(v.numeros)}</span><span class="badge b-${esc(v.estado)}">${esc(v.estado)}</span></div>
          <div class="meta">${esc(v.nombre)} · ${esc(v.telefono)}</div>
          <div class="meta">${esc(v.fecha)} · ${v.metodo === 'efectivo' ? '💵 Efectivo' : '📱 Mercado Pago'} · ${fmt.pesos(v.importe)}</div>
          <div class="acciones">
            ${v.estado === 'aprobada' || v.estado === 'resuelta' ? `<a class="btn btn-sec btn-chico" target="_blank" rel="noopener" href="${esc(linkComprobante(v.op, v.t))}">Comprobante</a>` : ''}
            ${v.estado === 'pendiente' && v.link ? `<a class="btn btn-sec btn-chico" target="_blank" rel="noopener" href="${esc(v.link)}">Link de pago</a>
              <button class="btn btn-peligro btn-chico" data-cancelar="${esc(v.op)}">Cancelar</button>` : ''}
          </div>
        </div>`).join('');
      $$('[data-cancelar]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('¿Cancelar esta reserva y liberar los números?')) return;
        boton(b, true, '…');
        try {
          const x = await llamar('vend_cancelar', { op: b.dataset.cancelar });
          aviso(x.mensaje, 'ok');
          cargarVentas();
        } catch (err) {
          aviso(err.message, 'error');
          boton(b, false);
        }
      }));
    } catch (e) {
      $('#mis-ventas').innerHTML = '';
      aviso(e.message, 'error');
    }
  }
})();
