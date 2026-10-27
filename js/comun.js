/* Funciones compartidas por la página pública y los paneles. */

const C = window.RIFA_CONFIG;

const Api = (() => {
  const url = () => (C.API_URL || '').trim();

  async function pedir(opciones, query) {
    if (!url()) {
      const e = new Error('La página todavía no está conectada al servidor.');
      e.codigo = 'SIN_API';
      throw e;
    }
    let r;
    try {
      // Sin encabezados propios: así el navegador no hace la consulta previa (CORS) que Apps Script no admite.
      r = await fetch(query ? url() + '?' + new URLSearchParams(query) : url(), opciones);
    } catch (e) {
      throw new Error('No hay conexión. Revisá tu internet y probá de nuevo.');
    }
    let data;
    try { data = await r.json(); } catch (e) { throw new Error('El servidor no respondió correctamente. Probá de nuevo.'); }
    if (!data.ok) {
      const e = new Error(data.error || 'Ocurrió un error.');
      e.codigo = data.codigo;
      e.extra = data.extra;
      throw e;
    }
    return data;
  }

  return {
    configurada: () => !!url(),
    get: (params) => pedir({ method: 'GET' }, params),
    post: (body) => pedir({ method: 'POST', body: JSON.stringify(body) }),
  };
})();

const fmt = {
  pesos: (n) => '$' + Number(n || 0).toLocaleString('es-UY'),
  num: (n) => Number(n || 0).toLocaleString('es-UY'),
  talon: (n) => String(n).padStart(6, '0'),   // como figura en el talón impreso: 001001
};

function $(sel, base) { return (base || document).querySelector(sel); }
function $$(sel, base) { return Array.from((base || document).querySelectorAll(sel)); }

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const almacen = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* modo privado */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* modo privado */ } },
};

let avisoTimer;
function aviso(texto, tipo) {
  let el = $('#aviso');
  if (!el) {
    el = document.createElement('div');
    el.id = 'aviso';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = texto;
  el.className = 'aviso visible ' + (tipo || '');
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { el.className = 'aviso ' + (tipo || ''); }, 5000);
}

/** Link de comprobante de una operación. */
function linkComprobante(op, t) {
  const base = location.href.replace(/[^/]*(\?.*)?(#.*)?$/, '');
  return base + 'index.html?op=' + encodeURIComponent(op) + '&t=' + encodeURIComponent(t);
}

/** Convierte un teléfono uruguayo a formato internacional para WhatsApp (099 123 456 → 59899123456). */
function telWhatsApp(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('598')) return d;
  if (d.startsWith('0')) d = d.slice(1);
  return d.length === 8 ? '598' + d : d;
}

function boton(btn, cargando, texto) {
  if (cargando) {
    btn.dataset.texto = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> ' + (texto || 'Procesando…');
  } else {
    btn.disabled = false;
    if (btn.dataset.texto) btn.innerHTML = btn.dataset.texto;
  }
}

/**
 * Grilla de números con pestañas de a 200, búsqueda y selección.
 * estados: 'v' vendido · 'r' reservado · 'a' en talonario de otro · 'm' en mi talonario (vendedor) · sin estado = disponible
 */
class Grilla {
  constructor(el, opciones) {
    this.el = el;
    this.o = Object.assign({ bloque: 200, max: C.MAX_POR_COMPRA, onCambio: () => {}, textoA: 'En talonario' }, opciones);
    this.estados = new Map();
    this.sel = new Set();
    this.bloqueActual = 0;
    this.soloDisponibles = false;
    this.montar();
  }

  montar() {
    const nBloques = Math.ceil((C.HASTA - C.DESDE + 1) / this.o.bloque);
    const tabs = [];
    for (let i = 0; i < nBloques; i++) {
      const a = C.DESDE + i * this.o.bloque;
      const b = Math.min(a + this.o.bloque - 1, C.HASTA);
      tabs.push(`<button type="button" role="tab" class="tab" data-b="${i}">${a}–${b}</button>`);
    }
    this.el.innerHTML = `
      <div class="grilla-herramientas">
        <form class="buscador" autocomplete="off">
          <label class="sr" for="${this.el.id}-buscar">Buscar un número</label>
          <input id="${this.el.id}-buscar" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="Buscá un número: 1985">
          <button type="submit" class="btn btn-sec">Buscar</button>
        </form>
        <div class="grilla-acciones">
          <button type="button" class="btn btn-ghost azar">🎲 Al azar</button>
          <label class="check"><input type="checkbox" class="solo-disp"> Solo disponibles</label>
        </div>
      </div>
      <div class="tabs" role="tablist">${tabs.join('')}</div>
      <div class="leyenda">
        <span><i class="n-ej"></i>Disponible</span>
        <span><i class="n-ej sel"></i>Elegido</span>
        <span><i class="n-ej r"></i>Reservado</span>
        <span><i class="n-ej v"></i>Vendido</span>
        ${this.o.conMios ? '<span><i class="n-ej m"></i>Mi talonario</span>' : ''}
        <span><i class="n-ej a"></i>${esc(this.o.textoA)}</span>
      </div>
      <div class="numeros" role="group" aria-label="Números"></div>`;
    this.grid = $('.numeros', this.el);

    $('.tabs', this.el).addEventListener('click', (e) => {
      const t = e.target.closest('.tab');
      if (t) this.irABloque(Number(t.dataset.b));
    });
    this.grid.addEventListener('click', (e) => {
      const b = e.target.closest('.n');
      if (b) this.alternar(Number(b.dataset.n));
    });
    $('.buscador', this.el).addEventListener('submit', (e) => {
      e.preventDefault();
      this.buscar($('input', e.target).value);
    });
    $('.azar', this.el).addEventListener('click', () => this.azar());
    $('.solo-disp', this.el).addEventListener('change', (e) => {
      this.soloDisponibles = e.target.checked;
      this.render();
    });
    this.irABloque(0);
  }

  seleccionable(n) {
    const e = this.estados.get(n);
    return !e || e === 'm';
  }

  irABloque(i) {
    this.bloqueActual = i;
    $$('.tab', this.el).forEach((t) => {
      const activo = Number(t.dataset.b) === i;
      t.classList.toggle('activo', activo);
      t.setAttribute('aria-selected', activo);
      if (activo && t.scrollIntoView) t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    this.render();
  }

  render() {
    const a = C.DESDE + this.bloqueActual * this.o.bloque;
    const b = Math.min(a + this.o.bloque - 1, C.HASTA);
    const nombres = { v: 'vendido', r: 'reservado', a: this.o.textoA.toLowerCase(), m: 'de tu talonario' };
    let html = '';
    for (let n = a; n <= b; n++) {
      const e = this.estados.get(n);
      const libre = this.seleccionable(n);
      if (this.soloDisponibles && !libre) continue;
      const sel = this.sel.has(n);
      const clase = 'n' + (e ? ' ' + e : '') + (sel ? ' sel' : '');
      const etiqueta = n + (sel ? ', elegido' : libre ? ', disponible' : ', ' + nombres[e]);
      html += `<button type="button" class="${clase}" data-n="${n}" aria-label="${etiqueta}" aria-pressed="${sel}"${libre ? '' : ' disabled'}>${n}</button>`;
    }
    this.grid.innerHTML = html || '<p class="vacio">No quedan números disponibles en este bloque.</p>';
  }

  setEstados(mapa) {
    this.estados = mapa;
    const perdidos = [...this.sel].filter((n) => !this.seleccionable(n));
    perdidos.forEach((n) => this.sel.delete(n));
    this.render();
    if (perdidos.length) this.o.onCambio(this.sel, perdidos);
  }

  alternar(n) {
    if (!this.seleccionable(n)) return;
    if (this.sel.has(n)) this.sel.delete(n);
    else {
      if (this.sel.size >= this.o.max) {
        aviso(`Podés elegir hasta ${this.o.max} números por compra.`, 'error');
        return;
      }
      this.sel.add(n);
    }
    this.render();
    this.o.onCambio(this.sel, []);
  }

  quitar(n) {
    this.sel.delete(n);
    this.render();
    this.o.onCambio(this.sel, []);
  }

  limpiar() {
    this.sel.clear();
    this.render();
    this.o.onCambio(this.sel, []);
  }

  buscar(valor) {
    const n = Number(String(valor).trim());
    if (!Number.isInteger(n) || n < C.DESDE || n > C.HASTA) {
      aviso(`Los números van del ${C.DESDE} al ${C.HASTA}.`, 'error');
      return;
    }
    const bloque = Math.floor((n - C.DESDE) / this.o.bloque);
    if (this.soloDisponibles && !this.seleccionable(n)) {
      this.soloDisponibles = false;
      $('.solo-disp', this.el).checked = false;
    }
    this.irABloque(bloque);
    const btn = $(`.n[data-n="${n}"]`, this.grid);
    if (btn) {
      btn.scrollIntoView({ block: 'center', behavior: 'smooth' });
      btn.classList.add('destello');
      setTimeout(() => btn.classList.remove('destello'), 1600);
    }
    const e = this.estados.get(n);
    if (!this.seleccionable(n)) {
      aviso(`El ${n} no está disponible (${{ v: 'vendido', r: 'reservado', a: this.o.textoA.toLowerCase() }[e]}).`, 'error');
    } else if (!this.sel.has(n)) {
      this.alternar(n);
      if (this.sel.has(n)) aviso(`¡El ${n} está disponible y quedó elegido!`, 'ok');
    }
  }

  azar() {
    const libres = [];
    for (let n = C.DESDE; n <= C.HASTA; n++) if (this.seleccionable(n) && !this.sel.has(n)) libres.push(n);
    if (!libres.length) return aviso('No quedan números disponibles.', 'error');
    const n = libres[Math.floor(Math.random() * libres.length)];
    this.buscar(n);
  }

  disponibles() {
    let c = 0;
    for (let n = C.DESDE; n <= C.HASTA; n++) if (this.seleccionable(n)) c++;
    return c;
  }
}

/** Arma el mapa de estados desde la respuesta del servidor. */
function mapaEstados(r) {
  const m = new Map();
  (r.a || []).forEach((n) => m.set(n, 'a'));
  (r.m || []).forEach((n) => m.set(n, 'm'));
  (r.r || []).forEach((n) => m.set(n, 'r'));
  (r.v || []).forEach((n) => m.set(n, 'v'));
  return m;
}

/** HTML del comprobante (página pública y panel de vendedores). */
function htmlComprobante(d) {
  return `
    <article class="comprobante" id="comprobante">
      <header>
        <img src="img/logo.png" alt="" width="56" height="56">
        <div>
          <div class="comp-esc">Escuela Roosevelt</div>
          <h2>Comprobante de compra</h2>
        </div>
        <span class="sello">✔ Confirmada</span>
      </header>
      <p class="comp-nombre">${esc(d.nombre)}</p>
      <div class="comp-numeros">${d.numeros.map((n) => `<span title="N.º de rifa ${fmt.talon(n)}">${fmt.talon(n)}</span>`).join('')}</div>
      <dl>
        <div><dt>Total</dt><dd>${fmt.pesos(d.importe)}</dd></div>
        <div><dt>Pago</dt><dd>${d.metodo === 'efectivo' ? 'Efectivo' : 'Mercado Pago'}</dd></div>
        <div><dt>Fecha</dt><dd>${esc(d.fecha)}</dd></div>
        <div><dt>Operación</dt><dd>${esc(d.op)}</dd></div>
      </dl>
      <p class="comp-premio">🏆 Viaje a Río de Janeiro para 2 personas · Sorteo: <b>${esc(d.sorteo || C.SORTEO)}</b></p>
    </article>`;
}
