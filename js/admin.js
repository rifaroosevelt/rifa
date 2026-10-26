/* Panel de administración: resumen, búsqueda, correcciones auditables, vendedores y reportes. */

(function () {
  const CLAVE = 'rifa_sesion_admin';
  let sesion = almacen.get(CLAVE);
  let vendedoresCache = [];

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
      if (r.rol !== 'admin') {
        await Api.post({ accion: 'logout', sesion: r.sesion });
        throw new Error('Tu usuario no es administrador. Usá el panel de vendedores.');
      }
      sesion = { sesion: r.sesion, nombre: r.nombre };
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
    if (mensaje) aviso(mensaje, 'error');
    mostrarLogin();
  }

  async function llamar(accion, datos) {
    try {
      return await Api.post(Object.assign({ accion, sesion: sesion.sesion }, datos || {}));
    } catch (e) {
      if (e.codigo === 'SESION') cerrarSesion(e.message);
      throw e;
    }
  }

  function iniciarApp() {
    $('#v-login').hidden = true;
    $('#v-app').hidden = false;
    $('#nav-sesion').hidden = false;
    $('#quien').textContent = sesion.nombre;
    mostrarVista('resumen');
  }

  $$('.pestanas button').forEach((b) => b.addEventListener('click', () => mostrarVista(b.dataset.vista)));

  function mostrarVista(v) {
    $$('.pestanas button').forEach((x) => x.classList.toggle('activo', x.dataset.vista === v));
    $$('.vista').forEach((s) => { s.hidden = s.id !== 'vista-' + v; });
    ({ resumen: cargarResumen, vendidos: cargarVendidos, operaciones: cargarOperaciones, movimientos: cargarMovimientos, vendedores: cargarVendedores }[v] || (() => {}))();
  }

  /* ---------------- Diálogo genérico ---------------- */

  function formulario(titulo, campos, textoBoton, intro) {
    const dlg = $('#dlg');
    const form = $('#dlg-form');
    $('#dlg-titulo').textContent = titulo;
    form.innerHTML = (intro ? `<p>${intro}</p>` : '') + campos.map((c) => `
      <div class="campo">
        <label for="d-${c.name}">${esc(c.label)}</label>
        ${c.type === 'textarea'
          ? `<textarea id="d-${c.name}" name="${c.name}" rows="3">${esc(c.value || '')}</textarea>`
          : `<input id="d-${c.name}" name="${c.name}" type="${c.type || 'text'}" value="${esc(c.value || '')}">`}
        ${c.ayuda ? `<small>${esc(c.ayuda)}</small>` : ''}
      </div>`).join('') + `<button class="btn btn-azul btn-bloque" type="submit">${esc(textoBoton)}</button>`;
    dlg.showModal();
    return new Promise((resolve) => {
      const cerrar = () => { dlg.close(); resolve(null); };
      $('[data-cerrar]', dlg).onclick = cerrar;
      dlg.oncancel = (e) => { e.preventDefault(); cerrar(); };
      form.onsubmit = (e) => {
        e.preventDefault();
        const datos = {};
        campos.forEach((c) => { datos[c.name] = form[c.name].value.trim(); });
        const falta = campos.find((c) => c.required && !datos[c.name]);
        if (falta) return aviso('Completá: ' + falta.label, 'error');
        dlg.close();
        resolve(datos);
      };
    });
  }

  /* ---------------- Resumen ---------------- */

  async function cargarResumen() {
    const el = $('#vista-resumen');
    el.innerHTML = '<p><span class="spinner"></span> Cargando…</p>';
    try {
      const r = await llamar('admin_resumen');
      const pct = ((r.vendidos / r.total) * 100).toFixed(1);
      const maxDia = Math.max(1, ...r.porFecha.map((d) => d.cantidad));
      el.innerHTML = `
        ${!r.mpConfigurado ? '<div class="banda-aviso" style="border-radius:12px;margin-bottom:12px">Mercado Pago todavía no está configurado en la planilla.</div>' : ''}
        ${r.aRevisar.length ? `<div class="tarjeta" style="border:2px solid var(--rojo);margin-bottom:14px">
          <h3 style="color:var(--rojo)">⚠️ ${r.aRevisar.length} operación(es) para revisar</h3>
          ${r.aRevisar.map((o) => `<p style="margin:4px 0"><b>${esc(o.op)}</b> · ${esc(o.nombre)} · ${esc(o.numeros)} · ${esc(o.pagoEstado)}
            <button class="btn btn-sec btn-chico" data-resolver="${esc(o.op)}">Marcar resuelta</button></p>`).join('')}
        </div>` : ''}
        <div class="kpis">
          <div class="kpi destacado"><small>Recaudación confirmada</small><b>${fmt.pesos(r.recaudacion)}</b></div>
          <div class="kpi"><small>Vendidos</small><b>${fmt.num(r.vendidos)}</b></div>
          <div class="kpi"><small>Disponibles</small><b>${fmt.num(r.disponibles)}</b></div>
          <div class="kpi"><small>Reservados</small><b>${fmt.num(r.reservados)}</b></div>
          <div class="kpi"><small>Efectivo</small><b>${fmt.pesos(r.efectivo)}</b></div>
          <div class="kpi"><small>Mercado Pago</small><b>${fmt.pesos(r.mercadopago)}</b></div>
          <div class="kpi"><small>Vendidos online</small><b>${fmt.num(r.online)}</b></div>
          <div class="kpi"><small>Vendidos presencial</small><b>${fmt.num(r.presencial)}</b></div>
        </div>
        <div class="tarjeta" style="margin-bottom:14px">
          <div class="cifras" style="display:flex;justify-content:space-between;font-weight:800;margin-bottom:8px">
            <span>Avance: ${pct}% vendido</span><span>${fmt.num(r.enTalonarios)} disponibles en talonarios · ${r.pendientes} pagos pendientes</span>
          </div>
          <div class="barra-prog"><i style="width:${pct}%"></i></div>
        </div>
        <div class="dos-col">
          <div>
            <h3>Ventas por vendedor</h3>
            <div class="tabla-envoltura"><table>
              <thead><tr><th>Vendedor</th><th class="num">Números</th><th class="num">Efectivo</th><th class="num">MP</th><th class="num">Total</th></tr></thead>
              <tbody>${r.porVendedor.map((v) => `<tr><td>${esc(v.nombre)}</td><td class="num">${v.cantidad}</td>
                <td class="num">${fmt.pesos(v.efectivo)}</td><td class="num">${fmt.pesos(v.mercadopago)}</td>
                <td class="num"><b>${fmt.pesos(v.efectivo + v.mercadopago)}</b></td></tr>`).join('') || '<tr><td colspan="5">Sin ventas todavía.</td></tr>'}</tbody>
            </table></div>
          </div>
          <div>
            <h3>Ventas por fecha</h3>
            <div class="tarjeta barras">${r.porFecha.slice(-31).map((d) => `<div class="fila"><span>${d.dia.split('-').reverse().join('/')}</span>
              <i style="width:${(d.cantidad / maxDia) * 100}%"></i><span>${d.cantidad} · ${fmt.pesos(d.importe)}</span></div>`).join('') || 'Sin ventas todavía.'}</div>
          </div>
        </div>`;
      $$('[data-resolver]', el).forEach((b) => b.addEventListener('click', () => resolver(b.dataset.resolver)));
    } catch (e) {
      el.innerHTML = '';
      aviso(e.message, 'error');
    }
  }

  async function resolver(op) {
    const d = await formulario('Marcar como resuelta', [{ name: 'motivo', label: 'Qué se hizo', type: 'textarea', required: true, ayuda: 'Ej.: se le reintegró el pago / se le asignó otro número.' }], 'Guardar');
    if (!d) return;
    try { await llamar('admin_resolver', { op, motivo: d.motivo }); aviso('Operación resuelta.', 'ok'); cargarResumen(); }
    catch (e) { aviso(e.message, 'error'); }
  }

  /* ---------------- Vendidos (lista completa con filtros) ---------------- */

  let vendidos = [];

  async function cargarVendidos() {
    const el = $('#res-vendidos');
    el.innerHTML = '<p><span class="spinner"></span> Cargando…</p>';
    try {
      const r = await llamar('admin_vendidos');
      vendidos = r.vendidos;
      const elegido = $('#vf-vendedor').value;
      const nombres = [...new Map(vendidos.map((x) => [x.vendedor, x.vendedorNombre])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
      $('#vf-vendedor').innerHTML = '<option value="">Todos los vendedores</option>' +
        nombres.map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('');
      $('#vf-vendedor').value = nombres.some(([id]) => id === elegido) ? elegido : '';
      pintarVendidos();
    } catch (e) {
      el.innerHTML = '';
      aviso(e.message, 'error');
    }
  }

  function vendidosFiltrados() {
    const q = $('#vf-texto').value.trim().toLowerCase();
    const digitos = q.replace(/\D/g, '');
    const canal = $('#vf-canal').value, metodo = $('#vf-metodo').value, vendedor = $('#vf-vendedor').value;
    return vendidos.filter((x) =>
      (!canal || x.canal === canal) && (!metodo || x.metodo === metodo) && (!vendedor || x.vendedor === vendedor) &&
      (!q || String(x.numero).includes(q) || String(x.nombre).toLowerCase().includes(q) ||
        String(x.email).toLowerCase().includes(q) || (digitos.length >= 4 && String(x.telefono).replace(/\D/g, '').includes(digitos))));
  }

  function pintarVendidos() {
    const lista = vendidosFiltrados();
    const efectivo = lista.filter((x) => x.metodo === 'efectivo').length;
    const online = lista.filter((x) => x.canal === 'online').length;
    $('#vend-kpis').innerHTML = `
      <div class="kpi destacado"><small>Números en la lista</small><b>${fmt.num(lista.length)}</b></div>
      <div class="kpi"><small>Importe</small><b>${fmt.pesos(lista.length * C.PRECIO)}</b></div>
      <div class="kpi"><small>Presencial · online</small><b>${fmt.num(lista.length - online)} · ${fmt.num(online)}</b></div>
      <div class="kpi"><small>Efectivo · MP</small><b>${fmt.num(efectivo)} · ${fmt.num(lista.length - efectivo)}</b></div>`;
    const el = $('#res-vendidos');
    if (!lista.length) {
      el.innerHTML = `<p class="tarjeta">${vendidos.length ? 'Ningún número coincide con los filtros.' : 'Todavía no hay números vendidos.'}</p>`;
      return;
    }
    el.innerHTML = `<div class="tabla-envoltura" style="max-height:70vh"><table>
      <thead><tr><th>N.º</th><th>Comprador</th><th>Teléfono</th><th>Correo</th><th>Fecha</th><th>Canal</th><th>Pago</th><th>Vendedor</th></tr></thead>
      <tbody>${lista.map((x) => `<tr>
        <td><b>${x.numero}</b></td><td>${esc(x.nombre)}</td><td style="white-space:nowrap">${esc(x.telefono)}</td><td>${esc(x.email)}</td>
        <td style="white-space:nowrap">${esc(x.fecha)}</td><td>${x.canal === 'online' ? '🌐 Online' : '🤝 Presencial'}</td>
        <td>${x.metodo === 'efectivo' ? '💵 Efectivo' : '📱 Mercado Pago'}</td><td>${esc(x.vendedorNombre)}</td></tr>`).join('')}</tbody>
    </table></div>`;
  }

  ['#vf-texto', '#vf-canal', '#vf-metodo', '#vf-vendedor'].forEach((s) => $(s).addEventListener('input', pintarVendidos));
  $('#vend-actualizar').addEventListener('click', cargarVendidos);
  $('#vend-descargar').addEventListener('click', () => {
    const filas = [['Número', 'Comprador', 'Teléfono', 'Correo', 'Fecha', 'Canal', 'Pago', 'Vendedor', 'Operación', 'ID pago MP']]
      .concat(vendidosFiltrados().map((x) => [x.numero, x.nombre, x.telefono, x.email, x.fecha, x.canal,
        x.metodo === 'efectivo' ? 'efectivo' : 'mercadopago', x.vendedorNombre, x.op, x.pago]));
    descargarCsv(filas, 'vendidos');
  });

  /* ---------------- Buscar y corregir ---------------- */

  $('#form-buscar').addEventListener('submit', (e) => { e.preventDefault(); buscar(); });

  async function buscar() {
    const q = $('#q').value.trim();
    if (!q) return;
    const el = $('#res-buscar');
    el.innerHTML = '<p><span class="spinner"></span> Buscando…</p>';
    try {
      const r = await llamar('admin_buscar', { q });
      if (!r.resultados.length) { el.innerHTML = '<p class="tarjeta">Sin resultados.</p>'; return; }
      el.innerHTML = `<div class="tabla-envoltura"><table>
        <thead><tr><th>N.º</th><th>Estado</th><th>Comprador</th><th>Contacto</th><th>Venta</th><th>Operación</th><th></th></tr></thead>
        <tbody>${r.resultados.map((x) => `<tr>
          <td><b>${x.numero}</b>${x.asignado ? `<br><small>Talonario ${esc(x.asignado)}</small>` : ''}</td>
          <td><span class="badge b-${esc(x.estado)}">${esc(x.estado)}</span>${x.vence ? `<br><small>vence ${esc(x.vence)}</small>` : ''}</td>
          <td>${esc(x.nombre)}</td>
          <td>${esc(x.telefono)}<br><small>${esc(x.email)}</small></td>
          <td>${esc(x.fecha)}<br><small>${esc(x.metodo)} · ${esc(x.canal)} · ${esc(x.vendedor)}</small></td>
          <td><small>${esc(x.op)}${x.pago ? '<br>MP ' + esc(x.pago) : ''}</small></td>
          <td style="white-space:nowrap">${x.estado === 'vendido' ? `
            <button class="btn btn-sec btn-chico" data-corregir='${esc(JSON.stringify(x))}'>Corregir datos</button>
            <button class="btn btn-peligro btn-chico" data-anular="${x.numero}">Anular</button>` : ''}
            ${x.estado === 'reservado' ? `<button class="btn btn-sec btn-chico" data-verificar="${esc(x.op)}">Verificar pago</button>
              <button class="btn btn-peligro btn-chico" data-liberar="${esc(x.op)}">Liberar</button>` : ''}</td>
        </tr>`).join('')}</tbody></table></div>`;
      conectarAcciones(el, buscar);
    } catch (e) {
      el.innerHTML = '';
      aviso(e.message, 'error');
    }
  }

  function conectarAcciones(el, recargar) {
    $$('[data-corregir]', el).forEach((b) => b.addEventListener('click', async () => {
      const x = JSON.parse(b.dataset.corregir);
      const d = await formulario('Corregir datos del N.º ' + x.numero, [
        { name: 'nombre', label: 'Nombre y apellido', value: x.nombre, required: true },
        { name: 'telefono', label: 'Teléfono', value: x.telefono, required: true },
        { name: 'email', label: 'Correo', value: x.email },
        { name: 'motivo', label: 'Motivo de la corrección', type: 'textarea', required: true },
      ], 'Guardar corrección', 'El cambio queda registrado en el historial con los datos anteriores.');
      if (!d) return;
      try { await llamar('admin_corregir', Object.assign({ numero: x.numero }, d)); aviso('Datos corregidos.', 'ok'); recargar(); }
      catch (e) { aviso(e.message, 'error'); }
    }));
    $$('[data-anular]', el).forEach((b) => b.addEventListener('click', async () => {
      const d = await formulario('Anular venta del N.º ' + b.dataset.anular, [
        { name: 'motivo', label: 'Motivo de la anulación', type: 'textarea', required: true },
      ], 'Anular venta', 'El número vuelve a quedar disponible. Queda registrado quién lo anuló, cuándo y los datos del comprador.');
      if (!d) return;
      try {
        const r = await llamar('admin_anular', { numeros: [Number(b.dataset.anular)], motivo: d.motivo });
        aviso('Venta anulada.', 'ok');
        if (r.avisos.length) alert('Importante:\n' + r.avisos.join('\n'));
        recargar();
      } catch (e) { aviso(e.message, 'error'); }
    }));
    $$('[data-liberar]', el).forEach((b) => b.addEventListener('click', async () => {
      const d = await formulario('Liberar reserva', [{ name: 'motivo', label: 'Motivo', type: 'textarea', required: true }],
        'Liberar', 'Antes de liberar se consulta Mercado Pago: si hay un pago aprobado, la venta se confirma en lugar de liberarse.');
      if (!d) return;
      try { const r = await llamar('admin_liberar', { op: b.dataset.liberar, motivo: d.motivo }); aviso(r.mensaje, 'ok'); recargar(); }
      catch (e) { aviso(e.message, 'error'); }
    }));
    $$('[data-verificar]', el).forEach((b) => b.addEventListener('click', async () => {
      boton(b, true, '…');
      try {
        const r = await llamar('admin_verificar', { op: b.dataset.verificar });
        alert(r.pagos.length ? 'Pagos en Mercado Pago:\n' + r.pagos.map((p) => `#${p.id}: ${p.estado} (${p.detalle}) $${p.importe}`).join('\n')
          : 'Mercado Pago no tiene pagos para esta operación.');
        recargar();
      } catch (e) { aviso(e.message, 'error'); boton(b, false); }
    }));
    $$('[data-reenviar]', el).forEach((b) => b.addEventListener('click', async () => {
      boton(b, true, '…');
      try { await llamar('admin_reenviar', { op: b.dataset.reenviar }); aviso('Comprobante reenviado.', 'ok'); }
      catch (e) { aviso(e.message, 'error'); }
      boton(b, false);
    }));
    $$('[data-resolver]', el).forEach((b) => b.addEventListener('click', () => resolver(b.dataset.resolver)));
  }

  /* ---------------- Operaciones ---------------- */

  $('#f-estado').addEventListener('change', cargarOperaciones);

  async function cargarOperaciones() {
    const el = $('#res-operaciones');
    el.innerHTML = '<p><span class="spinner"></span> Cargando…</p>';
    try {
      const r = await llamar('admin_operaciones', { estado: $('#f-estado').value });
      if (!r.operaciones.length) { el.innerHTML = '<p class="tarjeta">No hay operaciones.</p>'; return; }
      el.innerHTML = `<div class="tabla-envoltura"><table>
        <thead><tr><th>Operación</th><th>Estado</th><th>Números</th><th>Comprador</th><th>Pago</th><th class="num">Importe</th><th></th></tr></thead>
        <tbody>${r.operaciones.map((o) => `<tr>
          <td><small>${esc(o.op)}<br>${esc(o.fecha)}</small></td>
          <td><span class="badge b-${esc(o.estado)}">${esc(o.estado)}</span>${o.pagoEstado ? `<br><small>${esc(o.pagoEstado)}</small>` : ''}</td>
          <td>${esc(o.numeros)}</td>
          <td>${esc(o.nombre)}<br><small>${esc(o.telefono)} ${esc(o.email)}</small></td>
          <td><small>${esc(o.metodo)} · ${esc(o.canal)} · ${esc(o.vendedor)}${o.pago ? '<br>MP ' + esc(o.pago) : ''}</small></td>
          <td class="num">${fmt.pesos(o.importe)}</td>
          <td style="white-space:nowrap">
            ${o.estado === 'pendiente' ? `<button class="btn btn-sec btn-chico" data-verificar="${esc(o.op)}">Verificar</button>
              <button class="btn btn-peligro btn-chico" data-liberar="${esc(o.op)}">Liberar</button>` : ''}
            ${(o.estado === 'aprobada' || o.estado === 'resuelta') ? `<a class="btn btn-sec btn-chico" target="_blank" rel="noopener" href="${esc(linkComprobante(o.op, o.t))}">Comprobante</a>
              ${o.email ? `<button class="btn btn-ghost btn-chico" data-reenviar="${esc(o.op)}">Reenviar</button>` : ''}` : ''}
            ${o.estado === 'revisar' ? `<button class="btn btn-sec btn-chico" data-resolver="${esc(o.op)}">Resolver</button>` : ''}
          </td></tr>`).join('')}</tbody></table></div>`;
      conectarAcciones(el, cargarOperaciones);
    } catch (e) {
      el.innerHTML = '';
      aviso(e.message, 'error');
    }
  }

  /* ---------------- Historial ---------------- */

  async function cargarMovimientos() {
    const el = $('#res-movimientos');
    el.innerHTML = '<p><span class="spinner"></span> Cargando…</p>';
    try {
      const r = await llamar('admin_movimientos');
      el.innerHTML = `<div class="tabla-envoltura"><table>
        <thead><tr><th>Fecha</th><th>Tipo</th><th>Números</th><th>Operación</th><th>Usuario</th><th>Detalle</th></tr></thead>
        <tbody>${r.movimientos.map((m) => `<tr><td style="white-space:nowrap">${esc(m.fecha)}</td><td><b>${esc(m.tipo)}</b></td>
          <td>${esc(m.numeros)}</td><td><small>${esc(m.op)}</small></td><td>${esc(m.usuario)}</td>
          <td><small style="word-break:break-word">${esc(m.detalle).slice(0, 400)}</small></td></tr>`).join('')}</tbody></table></div>`;
    } catch (e) {
      el.innerHTML = '';
      aviso(e.message, 'error');
    }
  }

  /* ---------------- Vendedores y talonarios ---------------- */

  async function cargarVendedores() {
    const el = $('#res-vendedores');
    el.innerHTML = '<p><span class="spinner"></span> Cargando…</p>';
    try {
      const r = await llamar('admin_vendedores');
      vendedoresCache = r.vendedores;
      $('#a-vend').innerHTML = '<option value="">— Quitar asignación (vuelve a la venta online) —</option>' +
        r.vendedores.filter((v) => v.activo).map((v) => `<option value="${esc(v.id)}">${esc(v.nombre)} (${esc(v.id)})</option>`).join('');
      el.innerHTML = `<div class="tabla-envoltura"><table>
        <thead><tr><th>ID</th><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th>Talonarios</th><th></th></tr></thead>
        <tbody>${r.vendedores.map((v) => `<tr>
          <td>${esc(v.id)}</td><td>${esc(v.nombre)}</td><td>${esc(v.usuario)}</td><td>${esc(v.rol)}</td>
          <td><span class="badge ${v.activo ? 'b-aprobada' : 'b-cancelada'}">${v.activo ? 'habilitado' : 'deshabilitado'}</span></td>
          <td><small>${esc(v.talonarios) || '—'}${v.cantidadAsignada ? ` (${v.cantidadAsignada})` : ''}</small></td>
          <td><button class="btn btn-sec btn-chico" data-editar="${esc(v.id)}">Editar</button></td></tr>`).join('')}</tbody></table></div>`;
      $$('[data-editar]', el).forEach((b) => b.addEventListener('click', () => editarVendedor(b.dataset.editar)));
    } catch (e) {
      el.innerHTML = '';
      aviso(e.message, 'error');
    }
  }

  function editarVendedor(id) {
    const v = vendedoresCache.find((x) => x.id === id);
    const f = $('#form-vendedor');
    f.id.value = v.id;
    f.nombre.value = v.nombre;
    f.usuario.value = v.usuario;
    f.clave.value = '';
    f.rol.value = v.rol;
    f.activo.value = v.activo ? 'SÍ' : 'NO';
    $('#titulo-vendedor').textContent = 'Editar ' + v.nombre;
    $('#ayuda-clave').textContent = 'Dejala vacía para no cambiarla.';
    $('#v-cancelar').hidden = false;
    f.scrollIntoView({ behavior: 'smooth' });
  }

  function limpiarVendedor() {
    const f = $('#form-vendedor');
    f.reset();
    f.id.value = '';
    $('#titulo-vendedor').textContent = 'Agregar vendedor';
    $('#ayuda-clave').textContent = 'Mínimo 8 caracteres. Entregásela en persona.';
    $('#v-cancelar').hidden = true;
  }
  $('#v-cancelar').addEventListener('click', limpiarVendedor);

  $('#form-vendedor').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = $('button[type=submit]', f);
    boton(btn, true, 'Guardando…');
    try {
      await llamar('admin_guardar_vendedor', {
        id: f.id.value || undefined, nombre: f.nombre.value, usuario: f.usuario.value,
        clave: f.clave.value || undefined, rol: f.rol.value, activo: f.activo.value,
      });
      aviso('Vendedor guardado.', 'ok');
      limpiarVendedor();
      cargarVendedores();
    } catch (err) {
      aviso(err.message, 'error');
    } finally {
      boton(btn, false);
    }
  });

  $('#form-asignar').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const nombre = f.vendedorId.value ? f.vendedorId.selectedOptions[0].textContent : 'nadie (venta online)';
    if (!confirm(`¿Asignar los números ${f.desde.value} a ${f.hasta.value} a ${nombre}?`)) return;
    const btn = $('button[type=submit]', f);
    boton(btn, true, 'Asignando…');
    try {
      const r = await llamar('admin_asignar', { desde: Number(f.desde.value), hasta: Number(f.hasta.value), vendedorId: f.vendedorId.value });
      aviso(`Listo: ${r.cantidad} números asignados.`, 'ok');
      f.desde.value = '';
      f.hasta.value = '';
      cargarVendedores();
    } catch (err) {
      aviso(err.message, 'error');
    } finally {
      boton(btn, false);
    }
  });

  /* ---------------- Exportar ---------------- */

  /** Descarga filas como CSV que Excel abre bien en español (separador ; y acentos). */
  function descargarCsv(filas, nombre) {
    const csv = '﻿' + filas.map((f) => f.map((c) => {
      let s = String(c == null ? '' : c);
      if (/^[=+\-@]/.test(s)) s = "'" + s;          // evita fórmulas al abrir en Excel
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `rifa-roosevelt-${nombre}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  $$('[data-exportar]').forEach((b) => b.addEventListener('click', async () => {
    boton(b, true, 'Preparando…');
    try {
      const r = await llamar('admin_exportar', { tipo: b.dataset.exportar });
      descargarCsv(r.filas, b.dataset.exportar);
    } catch (e) {
      aviso(e.message, 'error');
    } finally {
      boton(b, false);
    }
  }));
})();
