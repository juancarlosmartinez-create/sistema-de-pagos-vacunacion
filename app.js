// ==========================================
// CONFIGURACIÓN DE SUPABASE (Desde config.js)
// ==========================================
const SUPABASE_URL = window.CONFIG?.SUPABASE_URL || ""; 
const SUPABASE_ANON_KEY = window.CONFIG?.SUPABASE_ANON_KEY || "";

const supabaseClient = (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) ? window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
) : null;

// ==========================================
// MAPEO DE CORREOS A NOMBRES CORTOS
// ==========================================
function obtenerNombreCorto(email) {
  if (!email) return 'MITZEL';
  const emailLower = email.toLowerCase().trim();
  if (emailLower.includes('auxiliar.caja')) return 'MITZEL';
  if (emailLower.includes('caja.polanco')) return 'GUSTAVO';
  if (emailLower.includes('juancarlos.martinez')) return 'CHARLY';
  
  const usuario = emailLower.split('@')[0];
  return usuario.toUpperCase();
}

// ==========================================
// ESTADO GLOBAL DE LA APLICACIÓN
// ==========================================
let carrito = [];
let historialMemoria = [];
let observacionesMemoria = [];
let modoSuperUsuario = false;
let modoPaciente = 'alumno'; // 'alumno' | 'externo'
let usuarioActual = null;
let modalReembolsoBS = null;
let modalReporteUsuarioBS = null;

// ==========================================
// INICIALIZACIÓN Y CONTROL DE SESIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  const modalEl = document.getElementById('modalReembolso');
  if (modalEl) modalReembolsoBS = new bootstrap.Modal(modalEl);

  const modalRptEl = document.getElementById('modalReporteUsuario');
  if (modalRptEl) modalReporteUsuarioBS = new bootstrap.Modal(modalRptEl);

  if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (session) {
        mostrarAplicacion(session.user);
      } else {
        mostrarLogin();
      }
    });
  } else {
    mostrarAplicacion(null);
  }
});

// ==========================================
// FUNCIONES DE ACCESO Y SESIÓN
// ==========================================
async function iniciarSesion() {
  const emailInput = document.getElementById('loginEmail');
  const passwordInput = document.getElementById('loginPassword');

  if (!emailInput || !passwordInput) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    Swal.fire('Atención', 'Por favor ingresa tu correo y contraseña.', 'warning');
    return;
  }

  if (!supabaseClient) {
    Swal.fire('Error de Configuración', 'No se pudo conectar con Supabase.', 'error');
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) {
      Swal.fire('Error de Acceso', error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message, 'error');
    } else if (data && data.user) {
      mostrarAplicacion(data.user);
    }
  } catch (err) {
    Swal.fire('Error Inesperado', err.message, 'error');
  }
}

async function cerrarSesion() {
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }
  mostrarLogin();
}

function mostrarAplicacion(user) {
  usuarioActual = user;
  const loginOverlay = document.getElementById('loginOverlay');
  const appContent = document.getElementById('appContent');
  const userDisplay = document.getElementById('userEmailDisplay');

  if (loginOverlay) loginOverlay.style.display = 'none';
  if (appContent) appContent.style.display = 'block';

  if (userDisplay && user) {
    const alias = obtenerNombreCorto(user.email);
    userDisplay.innerText = `${alias} (${user.email})`;
  }

  obtenerSiguienteFolioVenta();
  actualizarFechaTicket();
  renderCarrito();
  cargarHistorial();
  cargarObservaciones();
}

function mostrarLogin() {
  const loginOverlay = document.getElementById('loginOverlay');
  const appContent = document.getElementById('appContent');
  if (loginOverlay) loginOverlay.style.display = 'flex';
  if (appContent) appContent.style.display = 'none';
}

async function cambiarPassword() {
  const newPass = document.getElementById('newPasswordInput').value.trim();
  const confirmPass = document.getElementById('confirmPasswordInput').value.trim();

  if (!newPass || newPass.length < 6) {
    Swal.fire('Atención', 'La nueva contraseña debe tener al menos 6 caracteres.', 'warning');
    return;
  }

  if (newPass !== confirmPass) {
    Swal.fire('Atención', 'Las contraseñas no coinciden.', 'warning');
    return;
  }

  try {
    const { error } = await supabaseClient.auth.updateUser({ password: newPass });
    if (error) throw error;

    const modalEl = document.getElementById('modalCambiarPassword');
    const modalBs = bootstrap.Modal.getInstance(modalEl);
    if (modalBs) modalBs.hide();

    document.getElementById('newPasswordInput').value = '';
    document.getElementById('confirmPasswordInput').value = '';

    Swal.fire('Éxito', 'Contraseña actualizada correctamente.', 'success');
  } catch (err) {
    Swal.fire('Error', 'No se pudo cambiar la contraseña: ' + err.message, 'error');
  }
}

// ==========================================
// GENERACIÓN DE FOLIOS (V-XXXX y R-XXXX)
// ==========================================
async function obtenerSiguienteFolioVenta() {
  const defaultFolio = 'V-0001';
  if (!supabaseClient) {
    const elDisplay = document.getElementById('display-folio');
    const elTicket = document.getElementById('t-folio');
    if (elDisplay) elDisplay.innerText = defaultFolio;
    if (elTicket) elTicket.innerText = defaultFolio;
    return defaultFolio;
  }

  try {
    const { data, error } = await supabaseClient
      .from('historial_cobros')
      .select('folio')
      .ilike('folio', 'V-%')
      .order('id', { ascending: false })
      .limit(1);

    if (error) throw error;

    let num = 1;
    if (data && data.length > 0) {
      const ultimo = data[0].folio;
      const partes = ultimo.split('-');
      if (partes.length === 2 && !isNaN(partes[1])) {
        num = parseInt(partes[1], 10) + 1;
      }
    }

    const nuevoFolio = 'V-' + String(num).padStart(4, '0');
    const elDisplay = document.getElementById('display-folio');
    const elTicket = document.getElementById('t-folio');
    if (elDisplay) elDisplay.innerText = nuevoFolio;
    if (elTicket) elTicket.innerText = nuevoFolio;
    return nuevoFolio;
  } catch (e) {
    console.error("Error obteniendo siguiente folio V:", e);
    return defaultFolio;
  }
}

async function obtenerSiguienteFolioReembolso() {
  const defaultFolio = 'R-0001';
  if (!supabaseClient) return defaultFolio;

  try {
    const { data, error } = await supabaseClient
      .from('historial_cobros')
      .select('folio')
      .ilike('folio', 'R-%')
      .order('id', { ascending: false })
      .limit(1);

    if (error) throw error;

    let num = 1;
    if (data && data.length > 0) {
      const ultimo = data[0].folio;
      const partes = ultimo.split('-');
      if (partes.length === 2 && !isNaN(partes[1])) {
        num = parseInt(partes[1], 10) + 1;
      }
    }

    return 'R-' + String(num).padStart(4, '0');
  } catch (e) {
    console.error("Error obteniendo folio R:", e);
    return defaultFolio;
  }
}

// ==========================================
// BÚSQUEDA Y SELECCIÓN DE PACIENTES (3D CONTROLS)
// ==========================================
function setModo(modo) {
  modoPaciente = modo;
  const btnAlumno = document.getElementById('btnModeAlumno');
  const btnExterno = document.getElementById('btnModeExterno');
  const vistaAlumno = document.getElementById('modoAlumnoView');

  if (modo === 'alumno') {
    if (btnAlumno) btnAlumno.classList.add('active');
    if (btnExterno) btnExterno.classList.remove('active');
    if (vistaAlumno) vistaAlumno.style.display = 'block';

    const nomEl = document.getElementById('nombre');
    const famEl = document.getElementById('familia');
    if (nomEl) nomEl.readOnly = true;
    if (famEl) famEl.readOnly = true;
  } else {
    if (btnExterno) btnExterno.classList.add('active');
    if (btnAlumno) btnAlumno.classList.remove('active');
    if (vistaAlumno) vistaAlumno.style.display = 'none';

    const matEl = document.getElementById('matricula');
    const nomEl = document.getElementById('nombre');
    const famEl = document.getElementById('familia');
    const secEl = document.getElementById('seccion');
    const gruEl = document.getElementById('grupo');

    if (matEl) matEl.value = 'EXTERNO';
    if (nomEl) { nomEl.readOnly = false; nomEl.value = ''; }
    if (famEl) { famEl.readOnly = false; famEl.value = ''; }
    if (secEl) secEl.value = 'EXTERNO';
    if (gruEl) gruEl.value = 'EXTERNO';
  }
}

async function buscarPersona() {
  const query = document.getElementById('searchInput').value.trim();
  const listContainer = document.getElementById('results');
  if (query.length < 2) {
    listContainer.innerHTML = '';
    return;
  }

  if (!supabaseClient) return;

  try {
    const { data, error } = await supabaseClient
      .from('personas')
      .select('*')
      .or(`nombre.ilike.%${query}%,matricula.ilike.%${query}%,familia.ilike.%${query}%`)
      .limit(6);

    if (error) throw error;

    listContainer.innerHTML = '';
    data.forEach(p => {
      const a = document.createElement('a');
      a.className = 'list-group-item list-group-item-action cursor-pointer';
      a.innerHTML = `<strong>${p.nombre}</strong> <small class="text-muted">(${p.matricula} - ${p.familia})</small>`;
      a.onclick = () => seleccionarPersona(p);
      listContainer.appendChild(a);
    });
  } catch (e) {
    console.error("Error buscando persona:", e);
  }
}

function seleccionarPersona(p) {
  document.getElementById('matricula').value = p.matricula || '';
  document.getElementById('nombre').value = p.nombre || '';
  document.getElementById('familia').value = p.familia || '';
  document.getElementById('seccion').value = p.seccion || '';
  document.getElementById('grupo').value = p.grupo || '';
  document.getElementById('results').innerHTML = '';
  document.getElementById('searchInput').value = '';
}

function resetearFormularioVenta() {
  carrito = [];
  renderCarrito();

  const searchInput = document.getElementById('searchInput');
  const results = document.getElementById('results');
  if (searchInput) searchInput.value = '';
  if (results) results.innerHTML = '';

  const campos = ['matricula', 'nombre', 'familia', 'seccion', 'grupo'];
  campos.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  setModo('alumno');

  if (searchInput) {
    setTimeout(() => searchInput.focus(), 150);
  }
}

// ==========================================
// CARRITO MULTI-PACIENTE Y RECIBO
// ==========================================
function agregarAlRecibo() {
  const nombre = document.getElementById('nombre').value.trim();
  const concepto = document.getElementById('concepto').value.trim();
  const cantidad = parseInt(document.getElementById('cantidad').value, 10) || 1;
  const importe = parseFloat(document.getElementById('importe').value) || 0;
  const matricula = document.getElementById('matricula').value.trim() || 'EXTERNO';
  const familia = document.getElementById('familia').value.trim() || 'S/F';
  const seccion = document.getElementById('seccion').value.trim() || '---';
  const grupo = document.getElementById('grupo').value.trim() || '---';

  if (!nombre) {
    Swal.fire('Atención', 'Por favor selecciona o ingresa el nombre del paciente.', 'warning');
    return;
  }
  if (!concepto || importe <= 0) {
    Swal.fire('Atención', 'Por favor especifica un concepto válido e importe mayor a $0.', 'warning');
    return;
  }

  const subtotal = cantidad * importe;

  carrito.push({
    matricula,
    nombre,
    familia,
    seccion,
    grupo,
    concepto,
    cantidad,
    importe,
    subtotal
  });

  renderCarrito();

  if (modoPaciente === 'alumno') {
    document.getElementById('matricula').value = '';
    document.getElementById('nombre').value = '';
    document.getElementById('familia').value = '';
    document.getElementById('seccion').value = '';
    document.getElementById('grupo').value = '';
    document.getElementById('searchInput').value = '';
  } else {
    document.getElementById('nombre').value = '';
    document.getElementById('familia').value = '';
  }
}

function eliminarDelRecibo(index) {
  carrito.splice(index, 1);
  renderCarrito();
}

function renderCarrito() {
  const tbody = document.getElementById('tablaCarritoBody');
  const countBadge = document.getElementById('count-items');
  const ticketItems = document.getElementById('t-lista-items');
  const ticketTotal = document.getElementById('t-total');

  if (!tbody) return;

  if (carrito.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-muted py-3">No hay pacientes agregados al recibo aún.</td></tr>`;
    if (countBadge) countBadge.innerText = '0 Pacientes';
    if (ticketItems) ticketItems.innerHTML = `<div class="text-muted text-center py-2">Sin conceptos agregados.</div>`;
    if (ticketTotal) ticketTotal.innerText = '0.00';
    return;
  }

  let totalGeneral = 0;
  let htmlTabla = '';
  let htmlTicket = '';

  const primerItem = carrito[0];
  const elNombre = document.getElementById('t-nombre');
  const elMatricula = document.getElementById('t-matricula');
  const elGrupo = document.getElementById('t-grupo');

  if (elNombre) elNombre.innerText = carrito.length === 1 ? primerItem.nombre : `${carrito.length} Pacientes en Recibo`;
  if (elMatricula) elMatricula.innerText = carrito.length === 1 ? primerItem.matricula : 'MÚLTIPLE';
  if (elGrupo) elGrupo.innerText = carrito.length === 1 ? primerItem.grupo : 'MÚLTIPLE';

  carrito.forEach((item, index) => {
    totalGeneral += item.subtotal;

    htmlTabla += `
      <tr>
        <td>${index + 1}</td>
        <td class="text-start">
          <strong>${item.nombre}</strong><br>
          <small class="text-muted">${item.familia} (${item.matricula})</small>
        </td>
        <td>${item.concepto}</td>
        <td>${item.cantidad}</td>
        <td>$${item.importe.toFixed(2)}</td>
        <td class="fw-bold">$${item.subtotal.toFixed(2)}</td>
        <td>
          <button class="btn btn-sm btn-outline-danger" onclick="eliminarDelRecibo(${index})" title="Eliminar">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>
    `;

    htmlTicket += `
      <div class="ticket-row-item">
        <span class="ticket-col-desc"><strong>${item.cantidad}x</strong> ${item.concepto} <span class="text-secondary">(${item.nombre})</span></span>
        <span class="ticket-col-import">$${item.subtotal.toFixed(2)}</span>
      </div>
    `;
  });

  tbody.innerHTML = htmlTabla;
  if (countBadge) countBadge.innerText = `${carrito.length} Paciente${carrito.length > 1 ? 's' : ''}`;
  if (ticketItems) ticketItems.innerHTML = htmlTicket;
  if (ticketTotal) ticketTotal.innerText = totalGeneral.toFixed(2);
}

function actualizarFechaTicket() {
  const elFecha = document.getElementById('t-fecha');
  if (elFecha) {
    const ahora = new Date();
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const fechaFormateada = `Ciudad de México a ${ahora.getDate()} de ${meses[ahora.getMonth()]} de ${ahora.getFullYear()}`;
    elFecha.innerText = fechaFormateada;
  }
}

function actualizarFormaPagoTicket() {}

// ==========================================
// CONSTRUCTOR DE RECIBO INSTITUCIONAL VECTORIAL (NEGRO PURO)
// Dos copias simétricas (Establecimiento / Cliente) en UNA hoja carta vertical.
// Auto-shrink: la tipografía de la lista se calcula según el número de partidas
// y la longitud de cada renglón, de modo que el recibo nunca crece ni se desborda.
// ==========================================
function construirEstructuraReciboInstitucional(folio, fechaTexto, formaPago, itemsArr, totalGral) {
  const esc = (v) => String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const dinero = (n) => '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const importeItem = (item) => (item.total !== undefined ? item.total : (item.cantidad || 1) * (item.importe || 0));

  // ---------- Datos del alumno (misma lógica que antes) ----------
  const primerNombre = itemsArr.length > 0 ? itemsArr[0].nombre : '---';
  const primerGrupo = itemsArr.length > 0 ? (itemsArr.length === 1 ? (itemsArr[0].grupo || '---') : 'MÚLTIPLE') : '---';
  const primerMatricula = itemsArr.length > 0 ? (itemsArr.length === 1 ? (itemsArr[0].matricula || '---') : 'MÚLTIPLE') : '---';
  const nombreRecibo = itemsArr.length === 1 ? primerNombre : `${itemsArr.length} Pacientes en Recibo`;

  // ---------- Forma de pago ----------
  const fp = String(formaPago || '').trim().toLowerCase();
  const isEfectivo = fp.startsWith('efectivo');
  const isCheque = fp.startsWith('cheque');
  const isTarjeta = fp.includes('tarjeta');
  const marca = (activo) => `<span class="rcb-chk">${activo ? 'X' : '&nbsp;'}</span>`;

  // ---------- Fecha formal: "Ciudad de México a 13 de Octubre de 2026" ----------
  const mesesCap = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const crudo = String(fechaTexto || '').trim();
  const mf = crudo.match(/^.*?\ba\s+(\d{1,2})\s+de\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)\s+de\s+(\d{4})\s*$/);
  let fechaHtml;
  if (mf) {
    const mes = mf[2].charAt(0).toUpperCase() + mf[2].slice(1).toLowerCase();
    fechaHtml = `Ciudad de México a <span class="rcb-u">${esc(mf[1])}</span> de <span class="rcb-u rcb-u-mes">${esc(mes)}</span> de <span class="rcb-u">${esc(mf[3])}</span>`;
  } else if (crudo) {
    fechaHtml = esc(crudo);
  } else {
    const hoy = new Date();
    fechaHtml = `Ciudad de México a <span class="rcb-u">${hoy.getDate()}</span> de <span class="rcb-u rcb-u-mes">${mesesCap[hoy.getMonth()]}</span> de <span class="rcb-u">${hoy.getFullYear()}</span>`;
  }

  // ---------- Imagotipo oficial del colegio (vectorizado del sello, negro puro, sin imágenes externas) ----------
  const IMAGOTIPO_PATH = 'M561.4,123.6L559.5,121.9L556.0,121.3L546.0,121.6L541.5,120.9L539.1,121.5L530.1,128.8L525.7,134.6L521.3,137.3L513.5,145.2L505.5,151.0L499.5,153.9L493.5,159.0L484.0,163.2L471.5,170.6L458.0,176.8L447.5,179.3L435.8,187.1L432.0,185.6L427.5,185.4L415.0,187.8L399.0,192.8L393.5,193.4L387.0,192.7L379.5,194.6L373.5,197.1L364.5,197.6L355.0,199.3L340.0,200.6L328.0,203.0L322.0,202.6L316.0,204.2L308.0,203.5L296.5,203.7L288.5,205.7L283.0,206.3L265.0,206.0L259.0,208.5L255.6,209.2L254.5,210.2L254.4,212.4L257.8,216.5L259.1,220.0L258.9,222.4L257.0,223.6L251.1,221.2L244.5,216.1L236.5,214.0L234.5,214.3L232.9,215.6L232.4,217.0L234.5,221.4L243.1,229.9L247.9,232.4L249.4,234.0L249.9,237.0L247.9,239.0L245.0,238.4L235.0,229.9L220.6,222.3L217.0,219.7L212.5,219.4L210.0,220.3L208.7,224.0L210.6,227.6L218.4,232.0L222.6,236.0L227.2,239.2L234.5,242.8L240.8,250.5L246.5,252.8L247.1,254.4L246.3,255.5L240.8,252.8L236.5,252.6L232.0,250.8L226.9,245.9L223.2,244.1L220.0,241.0L216.2,239.9L210.0,234.2L205.0,233.3L201.3,230.6L195.0,227.9L192.5,227.6L190.8,228.4L189.9,231.0L191.4,237.5L199.9,241.0L203.1,244.1L212.5,250.2L218.1,256.0L226.4,260.4L228.4,263.5L228.3,265.2L227.4,265.8L223.6,265.6L220.4,263.2L216.2,261.6L213.4,259.1L206.2,254.6L202.8,249.6L196.0,247.3L190.0,241.2L183.0,237.0L176.0,235.0L174.0,235.6L171.6,237.5L170.6,239.5L170.8,240.9L177.8,250.5L182.1,254.0L195.9,262.8L201.0,267.7L210.5,271.4L219.5,276.3L223.0,279.0L227.2,284.2L231.5,287.4L238.5,290.3L249.8,298.8L254.5,300.7L260.4,305.2L261.8,307.0L261.5,309.4L259.0,311.1L256.0,311.3L253.0,310.4L246.0,306.1L229.5,294.2L221.5,290.6L212.6,283.3L208.7,278.3L201.9,272.8L200.0,271.8L192.0,269.9L185.1,266.5L180.3,262.3L173.6,258.7L164.7,249.4L156.5,248.5L154.5,249.1L152.9,250.6L151.4,255.0L153.6,258.5L159.4,261.5L163.2,265.0L167.5,265.8L170.5,267.2L174.5,271.2L180.2,275.4L187.0,277.9L198.7,287.6L208.5,294.7L213.0,297.0L217.6,300.5L224.5,302.1L231.5,306.8L236.6,311.4L245.0,315.8L256.6,325.5L261.4,327.4L262.8,329.0L263.4,331.5L262.7,333.9L261.4,335.4L259.0,335.5L251.6,331.2L247.8,326.9L241.7,325.9L238.8,322.4L235.5,319.9L221.0,311.6L212.5,304.9L207.7,303.2L199.7,296.8L194.0,291.0L188.5,288.8L179.8,282.6L175.1,281.2L170.0,275.1L161.3,268.8L156.0,267.3L149.5,263.1L138.0,260.6L135.5,262.1L134.4,265.0L134.4,267.0L135.7,269.5L139.7,272.8L141.9,276.1L152.5,283.6L163.0,288.1L168.3,293.4L177.9,298.2L183.2,302.5L184.6,304.5L184.7,306.3L183.4,307.1L178.1,306.8L174.9,302.8L166.5,299.3L159.5,293.5L153.0,290.6L140.0,281.3L135.1,279.7L125.9,274.2L121.5,273.7L116.4,278.2L115.9,280.0L116.5,281.9L129.5,295.5L134.8,299.6L135.6,302.3L133.9,303.6L131.5,303.2L127.2,298.3L119.5,294.4L108.0,292.9L105.9,293.8L105.2,296.0L105.9,298.5L113.7,306.5L116.8,311.5L117.2,315.0L115.4,317.4L112.5,318.0L106.0,313.8L99.0,311.9L96.4,312.7L95.7,315.5L97.3,320.4L105.8,327.2L107.7,332.0L107.1,333.8L105.5,334.6L99.5,331.3L96.4,331.6L95.3,333.1L94.9,335.5L96.5,340.5L99.2,344.3L103.5,346.4L107.6,349.9L117.5,355.8L125.8,363.5L129.9,365.9L133.1,369.0L145.0,376.6L149.1,379.9L153.5,381.8L159.0,385.5L165.1,391.1L172.0,395.2L178.0,400.8L184.5,404.0L198.0,412.1L212.5,424.1L222.5,429.6L242.0,444.2L255.9,452.8L258.9,456.8L262.5,456.9L266.0,455.7L274.0,450.6L283.0,447.4L291.0,441.6L302.0,436.4L324.5,419.5L364.0,396.5L370.5,391.2L376.5,388.1L381.5,384.2L394.0,377.1L402.0,371.0L418.8,361.1L428.5,354.5L435.9,347.5L439.0,342.0L441.2,329.0L440.5,319.5L441.8,307.5L441.5,301.0L442.4,294.5L442.0,279.5L442.4,272.5L440.5,250.0L441.5,236.5L441.0,220.0L442.5,209.5L443.8,205.5L446.5,202.8L451.5,201.2L457.0,197.6L463.0,196.1L478.9,187.9L483.1,183.8L490.5,178.7L500.5,174.9L510.0,168.6L526.4,162.0L533.5,153.8L543.9,146.9L557.3,130.0L561.1,126.7L561.7,125.0ZM235.5,366.2L237.5,364.9L239.4,365.1L244.1,369.1L249.0,370.7L256.5,375.2L258.9,378.0L258.5,381.4L256.0,383.0L251.2,381.9L247.9,377.6L240.3,374.3L235.8,368.4ZM118.1,340.7L119.6,339.5L122.0,339.4L129.5,343.6L139.5,351.6L146.5,354.9L159.0,362.1L165.0,367.3L169.3,369.4L178.6,377.4L193.2,387.2L197.5,389.3L202.0,393.8L206.4,396.3L209.7,399.4L215.5,402.1L219.3,405.5L227.5,410.9L239.0,415.2L247.8,421.3L252.2,426.4L257.4,430.3L258.8,432.5L258.5,434.8L256.5,435.7L250.5,434.0L246.0,435.6L243.6,434.9L238.0,428.7L230.1,425.6L222.1,419.3L213.9,410.4L208.8,406.6L203.5,404.4L193.6,397.2L185.5,389.7L180.0,387.5L174.9,383.9L170.0,382.4L166.8,379.9L162.5,378.3L158.8,374.5L147.6,360.2L139.0,359.0L131.5,355.6L122.2,345.9L118.3,343.7L117.6,342.5ZM184.7,332.5L189.0,332.8L191.9,333.7L195.2,336.4L200.0,338.3L212.5,349.1L224.3,353.9L226.6,358.0L227.0,362.2L225.0,362.5L220.0,358.2L215.3,357.4L207.0,350.1L201.0,346.6L195.5,344.6L185.8,335.7ZM124.6,317.5L126.5,317.6L130.2,321.0L135.0,324.1L141.5,326.6L146.5,330.7L155.0,333.2L161.9,336.8L169.4,345.7L175.5,351.4L180.5,354.0L184.1,356.9L188.0,357.7L192.0,359.6L196.7,364.3L202.5,365.9L209.0,372.1L224.5,379.1L232.0,386.7L239.0,389.8L242.7,392.6L249.5,394.3L254.9,397.6L258.8,403.0L259.3,405.0L258.7,407.3L257.4,408.3L249.6,408.4L244.5,404.3L242.0,399.6L237.0,400.3L232.9,396.7L229.0,395.9L226.0,394.4L214.9,382.7L207.9,377.2L204.0,374.9L199.5,374.4L194.6,372.9L190.3,367.2L182.1,364.6L175.0,358.1L155.5,345.0L145.4,336.9L135.5,332.6L126.0,322.4L124.4,319.5ZM187.8,308.5L189.5,308.5L200.1,315.1L204.5,316.1L210.5,318.7L230.0,335.1L239.6,340.5L245.4,341.6L249.5,344.9L255.0,348.0L257.6,351.5L258.0,356.2L255.5,357.6L252.5,357.4L245.6,353.4L239.3,346.4L234.0,345.8L225.1,340.5L221.8,337.1L217.0,334.4L210.5,328.3L197.5,319.8L191.2,314.0L188.0,309.9ZM443.1,83.5L440.0,80.0L436.3,77.5L433.5,76.5L430.6,77.3L429.1,82.9L427.9,83.9L421.5,82.2L416.6,79.2L415.2,79.2L415.5,80.7L419.8,84.7L428.6,91.1L429.7,94.9L429.1,95.9L427.5,96.2L423.5,95.3L419.0,92.0L412.5,88.7L408.3,84.4L403.0,81.1L397.5,78.6L392.6,77.4L392.8,78.8L401.1,86.6L410.8,94.1L411.7,96.9L409.5,98.5L395.5,89.3L390.8,83.5L386.0,82.0L379.9,77.9L371.0,76.0L372.7,82.9L371.4,84.5L369.5,84.3L360.5,77.4L354.5,74.6L349.8,71.2L341.5,69.0L339.6,67.7L337.2,58.0L329.9,35.1L325.2,30.5L319.0,22.6L313.1,18.6L308.9,14.6L297.0,7.4L289.0,6.3L278.0,3.4L258.0,3.8L248.0,5.6L233.5,12.2L223.5,19.5L212.3,32.0L209.3,41.0L206.0,46.5L202.2,59.5L199.6,64.5L197.0,66.6L182.0,66.5L172.5,64.6L159.0,64.4L150.5,62.9L138.5,63.7L125.0,62.6L115.5,63.9L104.5,63.5L98.1,64.5L96.8,66.1L95.0,80.5L95.4,107.5L94.5,113.5L94.5,141.0L93.0,161.5L93.6,173.5L92.2,183.5L92.8,189.5L90.6,205.5L86.3,210.8L75.0,217.7L66.5,225.3L60.2,229.8L53.8,237.3L30.6,258.5L26.4,266.0L14.3,282.5L11.8,288.5L7.0,296.0L3.6,303.0L3.6,306.9L5.2,308.4L7.5,308.9L11.5,308.3L18.5,308.9L22.8,307.1L43.6,277.5L47.3,270.6L55.9,263.5L63.2,253.6L72.8,246.3L79.6,238.4L96.0,225.6L102.5,221.9L110.1,215.7L117.0,212.0L134.5,204.7L138.5,201.9L147.5,199.5L162.0,192.4L166.0,191.7L170.5,189.9L176.0,189.4L187.5,183.4L203.5,181.1L209.5,181.2L214.5,179.7L222.5,179.3L228.5,176.2L243.0,173.4L263.0,173.6L271.1,168.8L272.3,166.0L271.9,161.6L273.5,160.3L280.0,164.1L285.2,164.1L285.7,162.4L283.5,159.0L271.7,149.0L270.9,147.1L272.1,145.6L275.0,146.2L280.0,149.0L294.5,160.2L302.4,162.1L303.7,161.2L304.5,158.4L306.0,157.9L313.5,161.7L317.5,162.7L319.5,162.2L321.0,160.9L321.9,156.6L323.1,155.4L331.0,156.9L332.0,156.5L332.2,151.1L333.6,149.4L336.0,149.5L342.5,152.2L346.0,152.5L346.6,147.0L348.6,144.9L350.9,145.1L357.5,150.6L363.0,152.5L364.9,151.3L366.4,147.1L367.6,145.9L375.4,146.9L376.2,146.5L372.7,140.6L372.7,139.4L373.6,138.7L378.5,138.7L392.3,143.1L393.0,142.6L392.8,141.7L388.8,136.5L389.1,134.9L390.6,134.4L398.5,138.2L404.6,139.0L407.6,134.0L414.5,132.4L414.7,130.9L413.0,126.9L414.1,125.1L418.0,124.1L423.1,125.0L421.8,121.5L422.7,119.6L427.5,119.0L433.4,120.6L434.8,120.1L434.9,118.0L433.3,113.5L433.5,111.7L435.0,110.9L439.4,111.8L440.9,110.8L438.1,102.1L438.5,101.1L441.8,99.9L442.7,98.4L440.7,92.0L443.7,86.5ZM346.1,91.0L348.9,90.9L362.0,97.7L364.0,99.6L366.0,102.9L369.4,103.7L370.6,104.6L371.8,107.0L371.8,108.7L370.6,109.2L365.0,105.1L356.6,102.6L350.2,96.9L346.1,91.8ZM294.7,28.1L295.7,29.5L296.2,33.5L297.4,35.9L305.9,42.6L308.7,47.0L310.0,55.0L308.2,64.0L311.8,74.0L312.5,80.0L311.9,83.9L306.9,89.5L303.4,96.0L301.0,98.8L292.5,103.1L286.9,103.9L284.7,106.8L282.0,108.5L272.0,111.1L269.0,110.8L264.5,109.2L256.0,110.6L252.6,110.1L251.2,108.9L250.2,105.0L247.9,102.2L244.5,100.0L238.5,97.9L235.7,94.5L231.1,79.0L228.7,73.5L230.4,65.5L229.3,58.5L229.9,55.0L236.9,44.5L241.8,40.0L246.3,34.2L255.0,30.0L268.5,28.0L282.5,28.9L288.0,30.1Z';
  const svgImagotipo = (clase) => `
    <svg class="${clase}" viewBox="0 0 565.0 460.5" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill="#000000" fill-rule="evenodd" d="${IMAGOTIPO_PATH}"/>
    </svg>`;

  // ---------- AUTO-SHRINK de la lista de vacunas ----------
  const ALTO_MM = 64;     // alto útil de la lista dentro de cada recibo (con margen de seguridad)
  const ANCHO_MM = 107;   // ancho de la columna de lista (56% del ancho útil)
  const PT = 0.3528;      // milímetros por punto tipográfico
  const n = itemsArr.length;
  const textos = itemsArr.map(it => `${it.cantidad || 1} - ${it.concepto || ''} (${it.nombre || ''})`);
  const largos = textos.map(t => t.length);
  const rowMinPara = (cols) => (cols > 1 ? 0 : (n <= 5 ? 9 : (n <= 7 ? 7 : (n <= 9 ? 5.5 : 0))));
  const blancosPara = (cols) => (cols > 1 ? 0 : Math.max(0, 5 - n));

  const evaluar = (cols) => {
    const anchoImp = cols === 1 ? 22 : 15;
    const anchoDesc = (ANCHO_MM - 3 * (cols - 1)) / cols - anchoImp - 3 - 1.5;
    const rowMin = rowMinPara(cols);
    const filasTot = n + blancosPara(cols);
    const porCol = Math.max(1, Math.ceil(filasTot / cols));
    for (let fs = 9; fs >= 4; fs -= 0.25) {
      const lh = fs * PT * 1.18;
      const charsLinea = Math.max(1, Math.floor(anchoDesc / (fs * PT * 0.53)));
      const alturas = largos.map(L => Math.max(rowMin, Math.ceil(L / charsLinea) * lh + 1.5));
      for (let b = 0; b < blancosPara(cols); b++) alturas.push(Math.max(rowMin, lh + 1.5));
      let peor = 0;
      for (let c = 0; c < cols; c++) {
        peor = Math.max(peor, alturas.slice(c * porCol, (c + 1) * porCol).reduce((a, h) => a + h, 0));
      }
      if (peor <= ALTO_MM) return { cols, fs, anchoImp, rowMin, porCol, cabe: true };
    }
    return { cols, fs: 4, anchoImp, rowMin, porCol, cabe: false };
  };

  // Prefiere 1 columna con letra legible (>= 5.5 pt); si no, la opción que quepa con mayor tamaño;
  // si nada cabe (carritos extremos), usa 3 columnas y la lista recorta en silencio (nunca crece el recibo).
  const candidatos = [1, 2, 3].map(evaluar);
  const ajuste = candidatos.find(c => c.cabe && c.fs >= 5.5)
    || candidatos.filter(c => c.cabe).sort((a, b) => b.fs - a.fs)[0]
    || candidatos[2];

  let filasHtml = '';
  itemsArr.forEach((item, i) => {
    filasHtml += `
        <div class="rcb-item">
          <span class="rcb-desc"><b>${esc(item.cantidad || 1)}</b> - ${esc(item.concepto)} <i>(${esc(item.nombre)})</i></span>
          <span class="rcb-imp">${dinero(importeItem(item))}</span>
        </div>`;
  });
  for (let b = 0; b < blancosPara(ajuste.cols); b++) {
    filasHtml += `
        <div class="rcb-item"><span class="rcb-desc">&nbsp;</span><span class="rcb-imp">&nbsp;</span></div>`;
  }
  const vars = `--rf:${ajuste.fs};--cols:${ajuste.cols};--filas:${ajuste.porCol};--rowmin:${ajuste.rowMin}mm;--impw:${ajuste.anchoImp}mm`;

  // ---------- Sello oficial (centro derecha) ----------
  const selloOficial = `
        <div class="rcb-sello">
          ${svgImagotipo('rcb-sello-icono')}
          <div class="rcb-sello-ccm">CCM</div>
          <div class="rcb-sello-txt">
            <div class="rcb-serif">ESCUELA SECUNDARIA DE LA</div>
            <div class="rcb-serif">CIUDAD DE MEXICO, S. C.</div>
            <div>ESC-521104-BH9</div>
            <div>Campos Eliseos 139 11560 CDMX</div>
            <div>Tel. 55-5203-7894</div>
          </div>
        </div>`;

  // ---------- Una copia completa (se usa dos veces, idéntica) ----------
  const copia = (etiqueta) => `
    <section class="rcb-copia" style="${vars}">
      <div class="rcb-cab">
        <div class="rcb-marca">
          ${svgImagotipo('rcb-logo')}
          <div class="rcb-colegio"><span>Colegio</span><span>Ciudad de México</span></div>
        </div>
        <div class="rcb-der">
          <div class="rcb-plantel">Plantel Polanco</div>
          <div class="rcb-recibo"><span>Recibo:</span><span class="rcb-recibo-linea">${esc(folio)}</span></div>
        </div>
      </div>

      <div class="rcb-alumno">
        <div class="rcb-fila">
          <span class="rcb-etq">Nombre del Alumno (a)</span>
          <span class="rcb-linea rcb-linea-nombre">${esc(nombreRecibo)}</span>
        </div>
        <div class="rcb-fila rcb-fila3">
          <div class="rcb-par"><span class="rcb-etq">Grado</span><span class="rcb-linea">${esc(primerGrupo)}</span></div>
          <div class="rcb-par"><span class="rcb-etq">Ciclo</span><span class="rcb-linea">2026-2027</span></div>
          <div class="rcb-par"><span class="rcb-etq">Cuenta</span><span class="rcb-linea">${esc(primerMatricula)}</span></div>
        </div>
      </div>

      <div class="rcb-cuerpo">
        <div class="rcb-lista">${filasHtml}
        </div>
        ${selloOficial}
      </div>

      <div class="rcb-pie">
        <div class="rcb-pagos">
          <span>( ${marca(isEfectivo)} ) Efectivo</span>
          <span>( ${marca(isCheque)} ) Cheque</span>
          <span>( ${marca(isTarjeta)} ) Tarjeta</span>
        </div>
        <div class="rcb-total"><span>Total $</span><span class="rcb-total-monto">${dinero(totalGral).replace('$', '')}</span></div>
      </div>

      <div class="rcb-base">
        <div class="rcb-fecha">${fechaHtml}</div>
        <div class="rcb-tag">${etiqueta}</div>
      </div>
    </section>`;

  return `
    <div class="rcb-hoja">
      ${copia('Copia Establecimiento')}
      ${copia('Copia Cliente')}
    </div>
  `;
}

// ==========================================
// GUARDAR E IMPRIMIR RECIBOS
// ==========================================
async function confirmarGuardarRecibo() {
  if (carrito.length === 0) {
    Swal.fire('Atención', 'El recibo está vacío. Agregue al menos un paciente.', 'warning');
    return;
  }

  const confirmacionGuardar = await Swal.fire({
    title: '¿Deseas guardar este registro?',
    text: 'Asegúrate de que los datos del paciente y el desglose del recibo sean correctos.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#107c41',
    cancelButtonColor: '#dc3545',
    confirmButtonText: 'Sí, guardar',
    cancelButtonText: 'Cancelar'
  });

  if (!confirmacionGuardar.isConfirmed) return;

  const folioVenta = await obtenerSiguienteFolioVenta();
  const formaPago = document.getElementById('forma_pago').value;
  const fechaActual = new Date().toISOString();
  
  const emailUsuario = usuarioActual?.email || 'auxiliar.caja@colegiociudad.edu.mx';
  const aliasVendedor = obtenerNombreCorto(emailUsuario);

  const inserts = carrito.map(item => ({
    folio: folioVenta,
    matricula: item.matricula,
    nombre: item.nombre,
    familia: item.familia,
    seccion: item.seccion,
    grupo: item.grupo,
    concepto: item.concepto,
    cantidad: item.cantidad,
    importe: item.importe,
    total: item.subtotal,
    forma_pago: formaPago,
    fecha: fechaActual,
    created_at: fechaActual,
    estado: 'Activo',
    tipo_movimiento: 'INGRESO',
    monto_reembolsado: 0.00,
    usuario_email: emailUsuario,
    vendedor: aliasVendedor,
    estado_aplicacion: 'Pendiente'
  }));

  const totalGral = carrito.reduce((acc, curr) => acc + curr.subtotal, 0);
  const ahora = new Date();
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const fechaTxt = `Ciudad de México a ${ahora.getDate()} de ${meses[ahora.getMonth()]} de ${ahora.getFullYear()}`;

  if (!supabaseClient) {
    const pregImpresionDemo = await Swal.fire({
      title: '¡Modo Demo!',
      text: `Se guardaría el Folio ${folioVenta} con ${carrito.length} registros. ¿Deseas imprimir el recibo ahora?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#1259a7',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, imprimir',
      cancelButtonText: 'No, finalizar'
    });

    if (pregImpresionDemo.isConfirmed) {
      const printArea = document.getElementById('print-area');
      if (printArea) {
        printArea.innerHTML = construirEstructuraReciboInstitucional(folioVenta, fechaTxt, formaPago, carrito, totalGral);
      }
      window.print();
    }

    resetearFormularioVenta();
    return;
  }

  try {
    const { error } = await supabaseClient.from('historial_cobros').insert(inserts);
    if (error) throw error;

    const pregImpresion = await Swal.fire({
      title: '¡Éxito!',
      text: `El recibo ${folioVenta} ha sido guardado correctamente por ${aliasVendedor}. ¿Deseas imprimir el recibo ahora?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#1259a7',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, imprimir',
      cancelButtonText: 'No, finalizar'
    });

    if (pregImpresion.isConfirmed) {
      const printArea = document.getElementById('print-area');
      if (printArea) {
        printArea.innerHTML = construirEstructuraReciboInstitucional(folioVenta, fechaTxt, formaPago, carrito, totalGral);
      }
      window.print();
    }

    await obtenerSiguienteFolioVenta();
    cargarHistorial();
    resetearFormularioVenta();
  } catch (e) {
    console.error("Error al guardar recibo:", e);
    Swal.fire('Error', 'No se pudo guardar el registro en la base de datos: ' + e.message, 'error');
  }
}

// ==========================================
// HISTORIAL DE REGISTROS Y REPORTES (ADMIN)
// ==========================================
async function cargarHistorial() {
  const tbody = document.getElementById('historialBody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="15" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Cargando registros desde Supabase...</td></tr>`;

  if (!supabaseClient) {
    tbody.innerHTML = `<tr><td colspan="15" class="text-center py-4 text-muted">Configura las claves de Supabase en config.js.</td></tr>`;
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from('historial_cobros')
      .select('*')
      .order('id', { ascending: false });

    if (error) throw error;

    historialMemoria = data || [];
    filtrarTabla();
  } catch (e) {
    console.error("Error al cargar historial:", e);
    tbody.innerHTML = `<tr><td colspan="15" class="text-center py-4 text-danger">Error al obtener historial: ${e.message}</td></tr>`;
  }
}

function renderTablaHistorial(lista) {
  const tbody = document.getElementById('historialBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  let ingresoBruto = 0;
  let totalReembolsadoSum = 0;
  let devolucionesCount = 0;
  let vacunasAplicadasCount = 0;
  const foliosSet = new Set();
  let efectivoNeto = 0;
  let otrosNeto = 0;

  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="15" class="text-center py-4 text-muted">No se encontraron registros en la búsqueda o fechas elegidas.</td></tr>`;
    actualizarKPIs(0, 0, 0, 0, 0, 0, 0, 0);
    return;
  }

  lista.forEach(item => {
    const esEgreso = item.tipo_movimiento === 'EGRESO' || (item.folio && item.folio.startsWith('R-'));
    const esCancelado = item.estado === 'Cancelado' || item.estado === 'CANCELADO';
    const esReembolsadoTotal = item.estado === 'Reembolsado' || item.estado === 'REEMBOLSADO';
    const esReembolsadoParcial = item.estado === 'Reembolso Parcial';

    const cantidad = parseInt(item.cantidad, 10) || 1;
    const importe = parseFloat(item.importe) || 0;
    const subtotal = item.total ? parseFloat(item.total) : (cantidad * importe);

    const emailUsuario = item.usuario_email || item.created_by || '';
    const vendedorAlias = item.vendedor || obtenerNombreCorto(emailUsuario);

    if (!esCancelado) {
      if (esEgreso) {
        totalReembolsadoSum += Math.abs(subtotal);
        devolucionesCount++;
        if (item.forma_pago === 'Efectivo') efectivoNeto -= Math.abs(subtotal);
        else otrosNeto -= Math.abs(subtotal);
      } else {
        ingresoBruto += subtotal;
        if (item.folio) foliosSet.add(item.folio);

        if (item.estado_aplicacion === 'Aplicada' || item.fecha_aplicacion) {
          vacunasAplicadasCount += cantidad;
        }

        const montoReembolsadoPartida = parseFloat(item.monto_reembolsado) || 0;
        const subtotalNetoPartida = subtotal - montoReembolsadoPartida;

        if (item.forma_pago === 'Efectivo') efectivoNeto += subtotalNetoPartida;
        else otrosNeto += subtotalNetoPartida;
      }
    }

    let claseFila = '';
    if (esCancelado) claseFila = 'fila-cancelada';
    else if (esEgreso) claseFila = 'fila-reembolso-egreso';
    else if (esReembolsadoTotal) claseFila = 'fila-reembolsada-total';
    else if (esReembolsadoParcial) claseFila = 'fila-reembolsada-parcial';

    const fechaRaw = item.fecha || item.created_at;
    const fObj = new Date(fechaRaw);
    const fechaTxt = isNaN(fObj.getTime()) 
      ? '—' 
      : fObj.toLocaleDateString('es-MX') + ' ' + fObj.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

    let badgeEstado = `<span class="badge bg-success">Activo</span>`;
    if (esCancelado) badgeEstado = `<span class="badge bg-danger">Cancelado</span>`;
    else if (esEgreso) badgeEstado = `<span class="badge bg-warning text-dark">Egreso (R)</span>`;
    else if (esReembolsadoTotal) badgeEstado = `<span class="badge bg-secondary">Reembolsado</span>`;
    else if (esReembolsadoParcial) badgeEstado = `<span class="badge bg-warning text-dark">Parcial (-$${item.monto_reembolsado})</span>`;

    let btnAplicacionHtml = '';
    const esAplicada = item.estado_aplicacion === 'Aplicada' || item.fecha_aplicacion;

    if (esAplicada) {
      const fApp = new Date(item.fecha_aplicacion);
      const txtFechaApp = isNaN(fApp.getTime()) ? 'Aplicada' : fApp.toLocaleDateString('es-MX') + ' ' + fApp.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      btnAplicacionHtml = `<br><span class="badge bg-info text-dark mt-1" title="Aplicada por: ${item.usuario_aplicacion || 'Personal'}"><i class="bi bi-check2-circle me-1"></i>Aplicada ${txtFechaApp}</span>`;
    } else if (!esCancelado && !esEgreso) {
      btnAplicacionHtml = `<br><button class="btn btn-sm btn-outline-success fw-bold py-0 px-1 mt-1 no-print" onclick="marcarAplicacionVacuna(${item.id})"><i class="bi bi-syringe me-1"></i>APLICACIÓN VACUNA</button>`;
    }

    let accionesHtml = '';
    const itemJson = JSON.stringify(item).replace(/"/g, '&quot;');

    if (!esCancelado && !esEgreso && !esReembolsadoTotal) {
      accionesHtml = `
        <button class="btn btn-sm btn-outline-primary me-1" title="Reimprimir Ticket" onclick="reimprimirFolio('${item.folio}')"><i class="bi bi-printer"></i></button>
        <button class="btn btn-sm btn-outline-warning text-dark me-1" title="Procesar Reembolso Auditado" onclick="abrirModalReembolso(${itemJson})"><i class="bi bi-arrow-counterclockwise"></i></button>
      `;
      if (modoSuperUsuario) {
        accionesHtml += `<button class="btn btn-sm btn-outline-danger" title="Cancelar Registro" onclick="cancelarRegistro('${item.id}', '${item.nombre}')"><i class="bi bi-trash"></i></button>`;
      }
    } else {
      accionesHtml = `<button class="btn btn-sm btn-outline-primary" title="Reimprimir" onclick="reimprimirFolio('${item.folio}')"><i class="bi bi-printer"></i></button>`;
    }

    const tr = document.createElement('tr');
    if (claseFila) tr.className = claseFila;
    tr.innerHTML = `
      <td><small>${fechaTxt}</small></td>
      <td><strong class="${esEgreso ? 'text-warning-emphasis' : 'text-dark'}">${item.folio || '—'}</strong></td>
      <td>${item.folio_referencia ? `<span class="badge bg-light text-dark border">${item.folio_referencia}</span>` : '—'}</td>
      <td><small>${item.matricula || '---'}</small></td>
      <td><strong>${item.nombre || ''}</strong></td>
      <td>${item.familia || '---'}</td>
      <td><small>${item.seccion || ''} / ${item.grupo || ''}</small></td>
      <td>${item.concepto || ''}${item.motivo_reembolso ? `<br><small class="text-muted">Motivo: ${item.motivo_reembolso}</small>` : ''}</td>
      <td class="text-center">${cantidad}</td>
      <td>$${importe.toFixed(2)}</td>
      <td><strong class="${esEgreso ? 'text-danger' : 'text-dark'}">${esEgreso ? '-' : ''}$${Math.abs(subtotal).toFixed(2)}</strong></td>
      <td><span class="badge bg-light text-dark border">${item.forma_pago || 'Efectivo'}</span></td>
      <td><span class="badge bg-secondary-subtle text-secondary border fw-bold">${vendedorAlias}</span></td>
      <td class="text-center">${badgeEstado}${btnAplicacionHtml}</td>
      <td class="text-center no-print">${accionesHtml}</td>
    `;
    tbody.appendChild(tr);
  });

  const ingresoNetoReal = ingresoBruto - totalReembolsadoSum;
  actualizarKPIs(ingresoNetoReal, ingresoBruto, totalReembolsadoSum, devolucionesCount, vacunasAplicadasCount, foliosSet.size, efectivoNeto, otrosNeto);
}

function actualizarKPIs(neto, bruto, reembolsado, devCount, vacunasCount, foliosCount, efectivo, otros) {
  const elNeto = document.getElementById('kpi-total');
  const elBruto = document.getElementById('kpi-bruto-sub');
  const elReembolsos = document.getElementById('kpi-reembolsos');
  const elReembolsosCant = document.getElementById('kpi-reembolsos-cant');
  const elCount = document.getElementById('kpi-count');
  const elFolios = document.getElementById('kpi-folios');
  const elEfectivo = document.getElementById('kpi-efectivo');
  const elOtros = document.getElementById('kpi-otros');

  if (elNeto) elNeto.innerText = `$${neto.toFixed(2)}`;
  if (elBruto) elBruto.innerText = `Bruto: $${bruto.toFixed(2)}`;
  if (elReembolsos) elReembolsos.innerText = `$${reembolsado.toFixed(2)}`;
  if (elReembolsosCant) elReembolsosCant.innerText = `${devCount} Devoluciones`;
  if (elCount) elCount.innerText = vacunasCount;
  if (elFolios) elFolios.innerText = foliosCount;
  if (elEfectivo) elEfectivo.innerText = `$${efectivo.toFixed(2)}`;
  if (elOtros) elOtros.innerText = `$${otros.toFixed(2)}`;
}

// ==========================================
// REGISTRO DE APLICACIÓN DE VACUNA
// ==========================================
async function marcarAplicacionVacuna(id) {
  const item = historialMemoria.find(x => x.id == id);
  if (!item) return;

  const result = await Swal.fire({
    title: '¡ADVERTENCIA DE APLICACIÓN!',
    html: `
      <div class="text-start">
        <p class="mb-2"><strong>Paciente:</strong> ${item.nombre} (${item.familia})</p>
        <p class="mb-2"><strong>Vacuna:</strong> ${item.concepto}</p>
        <p class="mb-0 text-danger fw-bold"><i class="bi bi-exclamation-triangle-fill me-1"></i> ¿Confirmas que la vacuna ha sido administrada físicamente al paciente?</p>
        <small class="text-muted d-block mt-2">Al responder afirmativamente se dejará registro del día, hora exacta y la persona que confirma la aplicación.</small>
      </div>
    `,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#107c41',
    cancelButtonColor: '#dc3545',
    confirmButtonText: 'Sí, confirmar aplicación',
    cancelButtonText: 'Cancelar'
  });

  if (result.isConfirmed) {
    const ahoraIso = new Date().toISOString();
    const aliasAplicador = obtenerNombreCorto(usuarioActual?.email);

    item.fecha_aplicacion = ahoraIso;
    item.estado_aplicacion = 'Aplicada';
    item.usuario_aplicacion = aliasAplicador;

    if (supabaseClient) {
      try {
        await supabaseClient
          .from('historial_cobros')
          .update({
            fecha_aplicacion: ahoraIso,
            estado_aplicacion: 'Aplicada',
            usuario_aplicacion: aliasAplicador
          })
          .eq('id', id);
      } catch (e) {
        console.warn("Actualizado localmente:", e);
      }
    }

    const fObj = new Date(ahoraIso);
    const fechaTxt = fObj.toLocaleDateString('es-MX') + ' ' + fObj.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

    Swal.fire({
      title: '¡Aplicación Registrada!',
      text: `Se registró correctamente la aplicación para ${item.nombre} el ${fechaTxt}.`,
      icon: 'success',
      timer: 2000,
      showConfirmButton: false
    });

    filtrarTabla();
  }
}

// ==========================================
// FILTROS Y BÚSQUEDA POR FECHAS Y TEXTO
// ==========================================
function filtrarTabla() {
  const query = (document.getElementById('filterInput')?.value || '').toLowerCase().trim();
  const fp = document.getElementById('filterPago')?.value || '';
  const fechaInicio = document.getElementById('filterFechaInicio')?.value || '';
  const fechaFin = document.getElementById('filterFechaFin')?.value || '';

  const filtrados = historialMemoria.filter(item => {
    const matchTexto = !query ||
      (item.folio && item.folio.toLowerCase().includes(query)) ||
      (item.folio_referencia && item.folio_referencia.toLowerCase().includes(query)) ||
      (item.nombre && item.nombre.toLowerCase().includes(query)) ||
      (item.familia && item.familia.toLowerCase().includes(query)) ||
      (item.concepto && item.concepto.toLowerCase().includes(query)) ||
      (item.matricula && item.matricula.toLowerCase().includes(query)) ||
      (item.vendedor && item.vendedor.toLowerCase().includes(query)) ||
      (item.usuario_email && item.usuario_email.toLowerCase().includes(query));

    const matchPago = !fp || item.forma_pago === fp;

    let matchFecha = true;
    const fechaRaw = item.fecha || item.created_at;
    if (fechaRaw) {
      const fechaStr = new Date(fechaRaw).toISOString().split('T')[0];
      if (fechaInicio && fechaStr < fechaInicio) matchFecha = false;
      if (fechaFin && fechaStr > fechaFin) matchFecha = false;
    }

    return matchTexto && matchPago && matchFecha;
  });

  renderTablaHistorial(filtrados);
}

function filtrarHoy() {
  const hoyStr = new Date().toISOString().split('T')[0];
  const elIn = document.getElementById('filterFechaInicio');
  const elFin = document.getElementById('filterFechaFin');
  if (elIn) elIn.value = hoyStr;
  if (elFin) elFin.value = hoyStr;
  filtrarTabla();
}

function limpiarFiltros() {
  const elIn = document.getElementById('filterFechaInicio');
  const elFin = document.getElementById('filterFechaFin');
  const elTxt = document.getElementById('filterInput');
  const elPago = document.getElementById('filterPago');

  if (elIn) elIn.value = '';
  if (elFin) elFin.value = '';
  if (elTxt) elTxt.value = '';
  if (elPago) elPago.value = '';

  filtrarTabla();
}

function toggleSuperUsuario(checked) {
  modoSuperUsuario = checked;
  if (checked) {
    Swal.fire({
      title: 'Modo Superusuario Activado',
      text: 'Permisos habilitados para cancelación directa de registros.',
      icon: 'info',
      timer: 1500,
      showConfirmButton: false
    });
  }
  filtrarTabla();
}

// ==========================================
// REPORTE DE ENTREGAS / CORTE POR USUARIO
// ==========================================
function generarReportePorUsuario() {
  const fechaInicio = document.getElementById('filterFechaInicio')?.value || '';
  const fechaFin = document.getElementById('filterFechaFin')?.value || '';

  const itemsFiltrados = historialMemoria.filter(item => {
    if (item.estado === 'Cancelado' || item.estado === 'CANCELADO') return false;
    const fechaRaw = item.fecha || item.created_at;
    if (!fechaRaw) return true;
    const fechaStr = new Date(fechaRaw).toISOString().split('T')[0];
    if (fechaInicio && fechaStr < fechaInicio) return false;
    if (fechaFin && fechaStr > fechaFin) return false;
    return true;
  });

  const resumenUsuarios = {};
  let totalGeneral = 0;

  itemsFiltrados.forEach(item => {
    const esEgreso = item.tipo_movimiento === 'EGRESO' || (item.folio && item.folio.startsWith('R-'));
    const cantidad = parseInt(item.cantidad, 10) || 1;
    const importe = parseFloat(item.importe) || 0;
    const subtotal = item.total ? parseFloat(item.total) : (cantidad * importe);
    const montoReembolsado = parseFloat(item.monto_reembolsado) || 0;

    const emailRaw = item.usuario_email || item.created_by || '';
    const alias = item.vendedor || obtenerNombreCorto(emailRaw);

    if (!resumenUsuarios[alias]) {
      resumenUsuarios[alias] = { alias, email: emailRaw, total: 0, cantidadOps: 0 };
    }

    if (esEgreso) {
      resumenUsuarios[alias].total -= Math.abs(subtotal);
      totalGeneral -= Math.abs(subtotal);
    } else {
      const neto = subtotal - montoReembolsado;
      resumenUsuarios[alias].total += neto;
      resumenUsuarios[alias].cantidadOps += 1;
      totalGeneral += neto;
    }
  });

  return {
    fechaInicio: fechaInicio ? fechaInicio : 'Inicio',
    fechaFin: fechaFin ? fechaFin : 'Actualidad',
    registros: itemsFiltrados.length,
    totalGeneral,
    usuarios: Object.values(resumenUsuarios)
  };
}

function abrirModalReporteUsuario() {
  const datos = generarReportePorUsuario();

  document.getElementById('rpt-rango-fechas').innerText = `${datos.fechaInicio} al ${datos.fechaFin}`;
  document.getElementById('rpt-cant-registros').innerText = datos.registros;
  document.getElementById('rpt-total-general').innerText = `$${datos.totalGeneral.toFixed(2)}`;

  const containerList = document.getElementById('rpt-lista-usuarios');
  containerList.innerHTML = '';

  if (datos.usuarios.length === 0) {
    containerList.innerHTML = `<div class="p-3 text-muted text-center">No hay cobros registrados en el rango seleccionado.</div>`;
  } else {
    datos.usuarios.forEach(u => {
      const div = document.createElement('div');
      div.className = 'list-group-item d-flex justify-content-between align-items-center py-3';
      div.innerHTML = `
        <div>
          <strong class="text-primary fs-6">• ${u.alias}</strong>
          <span class="text-muted small d-block">${u.email || 'Usuario registrado'} (${u.cantidadOps} transacciones)</span>
        </div>
        <span class="fs-5 fw-bold text-success">$${u.total.toFixed(2)}</span>
      `;
      containerList.appendChild(div);
    });
  }

  if (modalReporteUsuarioBS) modalReporteUsuarioBS.show();
}

function exportarCorteUsuarioExcel() {
  const datos = generarReportePorUsuario();
  let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
  csvContent += "MÓDULO DE CORTE DE CAJA POR USUARIO - COLEGIO CIUDAD DE MÉXICO\n";
  csvContent += `Rango Fechas,${datos.fechaInicio} al ${datos.fechaFin}\n`;
  csvContent += `Total Registros,${datos.registros}\n`;
  csvContent += `Total General,$${datos.totalGeneral.toFixed(2)}\n\n`;
  csvContent += "Usuario / Alias,Correo Electrónico,Transacciones,Monto Total a Entregar ($)\n";

  datos.usuarios.forEach(u => {
    csvContent += `"${u.alias}","${u.email}",${u.cantidadOps},${u.total.toFixed(2)}\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Corte_Caja_Usuarios_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function imprimirCorteUsuario() {
  const printArea = document.getElementById('print-area');
  const clon = document.getElementById('corteUsuarioPrintArea').cloneNode(true);
  printArea.innerHTML = '';
  printArea.appendChild(clon);
  window.print();
}

// ==========================================
// REEMBOLSOS AUDITADOS Y CANCELACIÓN
// ==========================================
function abrirModalReembolso(item) {
  const subtotalOriginal = item.total ? parseFloat(item.total) : (item.cantidad || 1) * (item.importe || 0);
  const reembolsadoPrevio = parseFloat(item.monto_reembolsado) || 0;
  const maxReembolsable = subtotalOriginal - reembolsadoPrevio;

  document.getElementById('rf-item-id').value = item.id;
  document.getElementById('rf-folio-origen').value = item.folio;
  document.getElementById('rf-monto-maximo').value = maxReembolsable;

  document.getElementById('rf-txt-folio').innerText = item.folio || '--';
  document.getElementById('rf-txt-paciente').innerText = item.nombre || '--';
  document.getElementById('rf-txt-concepto').innerText = `${item.concepto} (${item.cantidad || 1} unidad/es)`;
  document.getElementById('rf-txt-total').innerText = `$${subtotalOriginal.toFixed(2)}`;

  document.getElementById('rfTipoTotal').checked = true;
  const montoInput = document.getElementById('rf-monto-input');
  montoInput.value = maxReembolsable.toFixed(2);
  montoInput.readOnly = true;

  document.getElementById('rf-motivo-input').value = '';
  document.getElementById('rf-monto-help').innerText = 'Devolución por el monto total disponible de esta partida.';

  if (modalReembolsoBS) modalReembolsoBS.show();
}

function toggleTipoReembolso() {
  const esTotal = document.getElementById('rfTipoTotal').checked;
  const maxMonto = parseFloat(document.getElementById('rf-monto-maximo').value) || 0;
  const montoInput = document.getElementById('rf-monto-input');
  const helpTxt = document.getElementById('rf-monto-help');

  if (esTotal) {
    montoInput.value = maxMonto.toFixed(2);
    montoInput.readOnly = true;
    helpTxt.innerText = 'Devolución por el monto total disponible de esta partida.';
  } else {
    montoInput.readOnly = false;
    montoInput.focus();
    helpTxt.innerText = `Ingrese la cantidad a devolver (Máximo $${maxMonto.toFixed(2)}).`;
  }
}

async function ejecutarReembolsoAuditado() {
  const id = document.getElementById('rf-item-id').value;
  const folioOrigen = document.getElementById('rf-folio-origen').value;
  const maxMonto = parseFloat(document.getElementById('rf-monto-maximo').value) || 0;
  const esTotal = document.getElementById('rfTipoTotal').checked;
  const montoReembolso = parseFloat(document.getElementById('rf-monto-input').value) || 0;
  const motivo = document.getElementById('rf-motivo-input').value.trim();

  if (!motivo) {
    Swal.fire('Atención', 'Por favor capture el motivo del reembolso para efectos de auditoría.', 'warning');
    return;
  }

  if (montoReembolso <= 0 || montoReembolso > maxMonto) {
    Swal.fire('Atención', `El monto a reembolsar debe ser mayor a $0 y no superar $${maxMonto.toFixed(2)}.`, 'warning');
    return;
  }

  const itemOriginal = historialMemoria.find(x => x.id == id);
  if (!itemOriginal) return;

  const folioEgreso = await obtenerSiguienteFolioReembolso();
  const fechaActual = new Date().toISOString();
  const nuevoEstadoOriginal = (esTotal || montoReembolso === maxMonto) ? 'Reembolsado' : 'Reembolso Parcial';
  const acumuladoReembolsado = (parseFloat(itemOriginal.monto_reembolsado) || 0) + montoReembolso;

  try {
    const { error: errUpdate } = await supabaseClient
      .from('historial_cobros')
      .update({
        estado: nuevoEstadoOriginal,
        monto_reembolsado: acumuladoReembolsado,
        motivo_reembolso: motivo
      })
      .eq('id', id);

    if (errUpdate) throw errUpdate;

    const registroEgreso = {
      folio: folioEgreso,
      folio_referencia: folioOrigen,
      matricula: itemOriginal.matricula,
      nombre: itemOriginal.nombre,
      familia: itemOriginal.familia,
      seccion: itemOriginal.seccion,
      grupo: itemOriginal.grupo,
      concepto: `REEMBOLSO: ${itemOriginal.concepto}`,
      cantidad: itemOriginal.cantidad,
      importe: -montoReembolso,
      total: -montoReembolso,
      forma_pago: itemOriginal.forma_pago,
      fecha: fechaActual,
      created_at: fechaActual,
      estado: 'Reembolsado',
      tipo_movimiento: 'EGRESO',
      motivo_reembolso: motivo,
      usuario_email: usuarioActual?.email,
      vendedor: obtenerNombreCorto(usuarioActual?.email)
    };

    const { error: errInsert } = await supabaseClient.from('historial_cobros').insert([registroEgreso]);
    if (errInsert) throw errInsert;

    if (modalReembolsoBS) modalReembolsoBS.hide();

    Swal.fire({
      title: '¡Reembolso Procesado!',
      html: `Se generó el folio de egreso <strong>${folioEgreso}</strong> asociado al folio <strong>${folioOrigen}</strong>.`,
      icon: 'success'
    });

    await cargarHistorial();
  } catch (e) {
    console.error("Error al ejecutar reembolso:", e);
    Swal.fire('Error', 'No se pudo procesar el reembolso: ' + e.message, 'error');
  }
}

async function cancelarRegistro(id, nombrePaciente) {
  const result = await Swal.fire({
    title: '¿Cancelar Registro?',
    text: `¿Confirma la cancelación del registro de ${nombrePaciente}? Quedará anulado en auditoría.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    confirmButtonText: 'Sí, cancelar'
  });

  if (result.isConfirmed) {
    try {
      const { error } = await supabaseClient
        .from('historial_cobros')
        .update({ estado: 'Cancelado' })
        .eq('id', id);

      if (error) throw error;

      Swal.fire('Cancelado', 'El registro ha sido marcado como cancelado.', 'success');
      await cargarHistorial();
    } catch (e) {
      console.error("Error al cancelar:", e);
      Swal.fire('Error', 'No se pudo cancelar el registro: ' + e.message, 'error');
    }
  }
}

// ==========================================
// REIMPRESIÓN (DOBLE COPIA INSTITUCIONAL)
// ==========================================
function reimprimirFolio(folio) {
  const items = historialMemoria.filter(x => x.folio === folio && x.estado !== 'Cancelado' && x.estado !== 'CANCELADO');
  if (items.length === 0) {
    Swal.fire('Atención', 'No se encontraron registros activos para este folio.', 'info');
    return;
  }

  const primerItem = items[0];
  let total = 0;
  items.forEach(item => {
    total += (item.total !== undefined ? item.total : ((item.cantidad || 1) * (item.importe || 0)));
  });

  const fechaRaw = primerItem.fecha || primerItem.created_at;
  const fObj = new Date(fechaRaw);
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const fechaStr = isNaN(fObj.getTime()) 
    ? '' 
    : `Ciudad de México a ${fObj.getDate()} de ${meses[fObj.getMonth()]} de ${fObj.getFullYear()}`;

  const printArea = document.getElementById('print-area');
  if (printArea) {
    printArea.innerHTML = construirEstructuraReciboInstitucional(folio, fechaStr, primerItem.forma_pago || 'Efectivo', items, total);
  }

  window.print();
}

function exportarExcel() {
  if (!historialMemoria || historialMemoria.length === 0) {
    Swal.fire('Atención', 'No hay datos para exportar.', 'warning');
    return;
  }

  let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
  csvContent += "Fecha,Folio,Folio Referencia,Matricula,Paciente,Familia,Seccion,Grupo,Concepto,Cantidad,Importe,Total,Forma Pago,Vendedor,Estado,Aplicacion Vacuna,Fecha Aplicacion\n";

  historialMemoria.forEach(row => {
    const fecha = row.fecha || row.created_at ? new Date(row.fecha || row.created_at).toLocaleString('es-MX') : '';
    const subtotal = row.total ? row.total : ((row.cantidad || 1) * (row.importe || 0));
    const alias = row.vendedor || obtenerNombreCorto(row.usuario_email);
    const fechaApp = row.fecha_aplicacion ? new Date(row.fecha_aplicacion).toLocaleString('es-MX') : 'Pendiente';

    const line = [
      `"${fecha}"`,
      `"${row.folio || ''}"`,
      `"${row.folio_referencia || ''}"`,
      `"${row.matricula || ''}"`,
      `"${row.nombre || ''}"`,
      `"${row.familia || ''}"`,
      `"${row.seccion || ''}"`,
      `"${row.grupo || ''}"`,
      `"${row.concepto || ''}"`,
      row.cantidad || 1,
      row.importe || 0,
      subtotal,
      `"${row.forma_pago || ''}"`,
      `"${alias}"`,
      `"${row.estado || ''}"`,
      `"${row.estado_aplicacion || 'Pendiente'}"`,
      `"${fechaApp}"`
    ].join(",");
    csvContent += line + "\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Reporte_Vacunacion_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function imprimirReporte() {
  window.print();
}

// ==========================================
// MÓDULO OBSERVACIONES Y APRENDIZAJE
// ==========================================
function cargarObservaciones() {
  const local = localStorage.getItem('ccm_observaciones_vacunacion');
  if (local) {
    try {
      observacionesMemoria = JSON.parse(local);
    } catch (e) {
      observacionesMemoria = [];
    }
  } else {
    observacionesMemoria = [
      {
        id: 1,
        ciclo: '2026-2027',
        texto: 'Asegurar buena ventilación en el área de enfermería durante la hora pico de cobro.',
        fecha: new Date().toISOString(),
        usuario: 'MITZEL'
      },
      {
        id: 2,
        ciclo: '2027-2028',
        texto: 'Solicitar un lote adicional de vacunas VPH con 2 semanas de anticipación al inicio de ciclo.',
        fecha: new Date().toISOString(),
        usuario: 'CHARLY'
      }
    ];
    guardarObservacionesLocal();
  }

  renderObservaciones();
}

function guardarObservacionesLocal() {
  localStorage.setItem('ccm_observaciones_vacunacion', JSON.stringify(observacionesMemoria));
}

function renderObservaciones() {
  const list2026 = document.getElementById('listaObs2026');
  const list2027 = document.getElementById('listaObs2027');
  const count2026 = document.getElementById('count-obs-2026');
  const count2027 = document.getElementById('count-obs-2027');

  if (!list2026 || !list2027) return;

  const obs2026 = observacionesMemoria.filter(x => x.ciclo === '2026-2027');
  const obs2027 = observacionesMemoria.filter(x => x.ciclo === '2027-2028');

  if (count2026) count2026.innerText = `${obs2026.length} Nota/s`;
  if (count2027) count2027.innerText = `${obs2027.length} Nota/s`;

  if (obs2026.length === 0) {
    list2026.innerHTML = `<p class="text-muted text-center py-3 small">Sin observaciones registradas para este ciclo.</p>`;
  } else {
    list2026.innerHTML = obs2026.map(item => `
      <div class="card mb-2 border-info-subtle bg-light shadow-sm">
        <div class="card-body p-2.5">
          <p class="mb-1 text-dark small">${item.texto}</p>
          <div class="d-flex justify-content-between align-items-center text-muted" style="font-size: 0.75rem;">
            <span><i class="bi bi-person me-1"></i><strong>${item.usuario}</strong> • ${new Date(item.fecha).toLocaleString('es-MX')}</span>
            <button class="btn btn-sm btn-link text-danger p-0 no-print" onclick="eliminarObservacion(${item.id})" title="Eliminar nota"><i class="bi bi-trash"></i></button>
          </div>
        </div>
      </div>
    `).join('');
  }

  if (obs2027.length === 0) {
    list2027.innerHTML = `<p class="text-muted text-center py-3 small">Sin observaciones registradas para este ciclo.</p>`;
  } else {
    list2027.innerHTML = obs2027.map(item => `
      <div class="card mb-2 border-warning-subtle bg-light shadow-sm">
        <div class="card-body p-2.5">
          <p class="mb-1 text-dark small">${item.texto}</p>
          <div class="d-flex justify-content-between align-items-center text-muted" style="font-size: 0.75rem;">
            <span><i class="bi bi-person me-1"></i><strong>${item.usuario}</strong> • ${new Date(item.fecha).toLocaleString('es-MX')}</span>
            <button class="btn btn-sm btn-link text-danger p-0 no-print" onclick="eliminarObservacion(${item.id})" title="Eliminar nota"><i class="bi bi-trash"></i></button>
          </div>
        </div>
      </div>
    `).join('');
  }
}

function agregarObservacion(ciclo) {
  const inputId = ciclo === '2026-2027' ? 'txtNota2026' : 'txtNota2027';
  const txtEl = document.getElementById(inputId);
  if (!txtEl) return;

  const texto = txtEl.value.trim();
  if (!texto) {
    Swal.fire('Atención', 'Por favor escribe el contenido de la observación.', 'warning');
    return;
  }

  const nuevaObs = {
    id: Date.now(),
    ciclo,
    texto,
    fecha: new Date().toISOString(),
    usuario: obtenerNombreCorto(usuarioActual?.email)
  };

  observacionesMemoria.unshift(nuevaObs);
  guardarObservacionesLocal();
  renderObservaciones();

  txtEl.value = '';
  Swal.fire({
    title: '¡Guardado!',
    text: 'Observación agregada correctamente.',
    icon: 'success',
    timer: 1500,
    showConfirmButton: false
  });
}

function eliminarObservacion(id) {
  Swal.fire({
    title: '¿Eliminar observación?',
    text: 'Esta acción no se puede deshacer.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    confirmButtonText: 'Sí, eliminar'
  }).then(result => {
    if (result.isConfirmed) {
      observacionesMemoria = observacionesMemoria.filter(x => x.id !== id);
      guardarObservacionesLocal();
      renderObservaciones();
      Swal.fire({
        title: 'Eliminada',
        text: 'La observación ha sido eliminada.',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false
      });
    }
  });
}

function exportarObservacionesExcel() {
  if (!observacionesMemoria || observacionesMemoria.length === 0) {
    Swal.fire('Atención', 'No hay observaciones para exportar.', 'warning');
    return;
  }

  let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
  csvContent += "MÓDULO DE OBSERVACIONES Y APRENDIZAJE - COLEGIO CIUDAD DE MÉXICO\n\n";
  csvContent += "Ciclo,Fecha,Usuario / Vendedor,Observación / Nota\n";

  observacionesMemoria.forEach(row => {
    const fecha = new Date(row.fecha).toLocaleString('es-MX');
    const line = [
      `"${row.ciclo}"`,
      `"${fecha}"`,
      `"${row.usuario}"`,
      `"${row.texto.replace(/"/g, '""')}"`
    ].join(",");
    csvContent += line + "\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Observaciones_Vacunacion_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function imprimirObservaciones() {
  const printArea = document.getElementById('print-area');
  const content = document.getElementById('observaciones-pane')?.cloneNode(true);
  if (printArea && content) {
    printArea.innerHTML = '';
    printArea.appendChild(content);
    window.print();
  }
}
