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
// ESTADO GLOBAL DE LA APLICACIÓN
// ==========================================
let carrito = [];
let historialMemoria = [];
let modoSuperUsuario = false;
let modoPaciente = 'alumno'; // 'alumno' | 'externo'
let modalReembolsoBS = null;

// ==========================================
// INICIALIZACIÓN Y CONTROL DE SESIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  const modalEl = document.getElementById('modalReembolso');
  if (modalEl) {
    modalReembolsoBS = new bootstrap.Modal(modalEl);
  }

  if (supabaseClient) {
    // Verificar si ya existe una sesión activa al cargar la página
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      mostrarAplicacion(session.user);
    } else {
      mostrarLogin();
    }

    // Escuchar cambios en el estado de autenticación (Login / Logout)
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (session) {
        mostrarAplicacion(session.user);
      } else {
        mostrarLogin();
      }
    });
  } else {
    // Si no hay cliente de Supabase, se muestra la app en modo Demo
    mostrarAplicacion(null);
  }
});

// ==========================================
// FUNCIÓN DE INICIO DE SESIÓN
// ==========================================
async function iniciarSesion() {
  const emailInput = document.getElementById('correo') || 
                     document.getElementById('email') || 
                     document.getElementById('correoInstitucional') || 
                     document.querySelector('input[type="email"]');
                     
  const passwordInput = document.getElementById('password') || 
                        document.getElementById('contrasena') || 
                        document.getElementById('passwordInput') || 
                        document.querySelector('input[type="password"]');

  if (!emailInput || !passwordInput) {
    if (typeof Swal !== 'undefined') {
      Swal.fire('Error', 'No se encontraron los campos de correo o contraseña.', 'error');
    } else {
      alert('No se encontraron los campos de correo o contraseña.');
    }
    return;
  }

  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  if (!email || !password) {
    if (typeof Swal !== 'undefined') {
      Swal.fire('Atención', 'Por favor ingresa tu correo y contraseña.', 'warning');
    } else {
      alert('Por favor ingresa tu correo y contraseña.');
    }
    return;
  }

  if (!supabaseClient) {
    if (typeof Swal !== 'undefined') {
      Swal.fire('Error de Configuración', 'No se pudo conectar con Supabase.', 'error');
    } else {
      alert('Error de conexión con Supabase.');
    }
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) {
      if (typeof Swal !== 'undefined') {
        Swal.fire('Error de Acceso', error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message, 'error');
      } else {
        alert('Error: ' + error.message);
      }
    } else if (data && data.user) {
      mostrarAplicacion(data.user);
    }
  } catch (err) {
    if (typeof Swal !== 'undefined') {
      Swal.fire('Error inesperado', err.message, 'error');
    } else {
      alert('Error inesperado: ' + err.message);
    }
  }
}

async function cerrarSesion() {
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }
  mostrarLogin();
}

window.iniciarSesion = iniciarSesion;
window.cerrarSesion = cerrarSesion;

function mostrarAplicacion(user) {
  const loginOverlay = document.getElementById('loginOverlay');
  const appContent = document.getElementById('appContent');
  const userDisplay = document.getElementById('userEmailDisplay');

  if (loginOverlay) loginOverlay.style.display = 'none';
  if (appContent) appContent.style.display = 'block';
  if (userDisplay && user) userDisplay.innerText = user.email;

  obtenerSiguienteFolioVenta();
  actualizarFechaTicket();
  renderCarrito();
  cargarHistorial();
}

function mostrarLogin() {
  const loginOverlay = document.getElementById('loginOverlay');
  const appContent = document.getElementById('appContent');
  if (loginOverlay) loginOverlay.style.display = 'flex';
  if (appContent) appContent.style.display = 'none';
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
    if (elTicket) elTicket.innerText = 'FOLIO: ' + defaultFolio;
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
    if (elTicket) elTicket.innerText = 'FOLIO: ' + nuevoFolio;
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
// LÓGICA DE COBRO Y CARRITO MULTI-PACIENTE
// ==========================================
function setModo(modo) {
  modoPaciente = modo;
  const btnAlumno = document.getElementById('btnModeAlumno');
  const btnExterno = document.getElementById('btnModeExterno');
  const vistaAlumno = document.getElementById('modoAlumnoView');

  if (modo === 'alumno') {
    if (btnAlumno) {
      btnAlumno.classList.add('active', 'btn-outline-primary');
      btnAlumno.classList.remove('btn-secondary');
    }
    if (btnExterno) {
      btnExterno.classList.add('btn-outline-secondary');
      btnExterno.classList.remove('active', 'btn-primary');
    }
    if (vistaAlumno) vistaAlumno.style.display = 'block';
    
    document.getElementById('nombre').readOnly = true;
    document.getElementById('familia').readOnly = true;
  } else {
    if (btnExterno) {
      btnExterno.classList.add('active', 'btn-primary');
      btnExterno.classList.remove('btn-outline-secondary');
    }
    if (btnAlumno) {
      btnAlumno.classList.add('btn-outline-primary');
      btnAlumno.classList.remove('active');
    }
    if (vistaAlumno) vistaAlumno.style.display = 'none';

    document.getElementById('matricula').value = 'EXTERNO';
    document.getElementById('nombre').readOnly = false;
    document.getElementById('nombre').value = '';
    document.getElementById('familia').readOnly = false;
    document.getElementById('familia').value = '';
    document.getElementById('seccion').value = 'EXTERNO';
    document.getElementById('grupo').value = 'EXTERNO';
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

function agregarAlRecibo() {
  const nombre = document.getElementById('nombre').value.trim();
  const concepto = document.getElementById('concepto').value.trim();
  const cantidad = parseInt(document.getElementById('cantidad').value, 10) || 1;
  const importe = parseFloat(document.getElementById('importe').value) || 0;

  if (!nombre) {
    Swal.fire('Atención', 'Por favor seleccione o ingrese el nombre del paciente.', 'warning');
    return;
  }
  if (!concepto || importe <= 0) {
    Swal.fire('Atención', 'Por favor capture un concepto válido e importe mayor a $0.', 'warning');
    return;
  }

  const subtotal = cantidad * importe;
  carrito.push({
    matricula: document.getElementById('matricula').value || 'S/M',
    nombre: nombre,
    familia: document.getElementById('familia').value || 'S/F',
    seccion: document.getElementById('seccion').value || '---',
    grupo: document.getElementById('grupo').value || '---',
    concepto: concepto,
    cantidad: cantidad,
    importe: importe,
    subtotal: subtotal
  });

  renderCarrito();
  
  if (modoPaciente === 'alumno') {
    document.getElementById('matricula').value = '';
    document.getElementById('nombre').value = '';
    document.getElementById('familia').value = '';
    document.getElementById('seccion').value = '';
    document.getElementById('grupo').value = '';
  } else {
    document.getElementById('nombre').value = '';
  }
}

function eliminarDelCarrito(index) {
  carrito.splice(index, 1);
  renderCarrito();
}

function renderCarrito() {
  const tbody = document.getElementById('tablaCarritoBody');
  const tLista = document.getElementById('t-lista-items');
  const countItems = document.getElementById('count-items');
  const tTotal = document.getElementById('t-total');

  if (countItems) countItems.innerText = `${carrito.length} Pacientes`;

  if (!tbody || !tLista || !tTotal) return;

  if (carrito.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-muted py-3">No hay pacientes agregados al recibo aún.</td></tr>`;
    tLista.innerHTML = `<p class="text-muted text-center my-2">Agregue pacientes para ver el desglose aquí.</p>`;
    tTotal.innerText = '0.00';
    return;
  }

  let htmlTabla = '';
  let htmlTicket = '';
  let granTotal = 0;

  carrito.forEach((item, index) => {
    granTotal += item.subtotal;
    htmlTabla += `
      <tr>
        <td>${index + 1}</td>
        <td class="text-start"><strong>${item.nombre}</strong><br><small class="text-muted">${item.familia}</small></td>
        <td>${item.concepto}</td>
        <td>${item.cantidad}</td>
        <td>$${item.importe.toFixed(2)}</td>
        <td class="fw-bold">$${item.subtotal.toFixed(2)}</td>
        <td>
          <button class="btn btn-sm btn-outline-danger" onclick="eliminarDelCarrito(${index})"><i class="bi bi-trash"></i></button>
        </td>
      </tr>
    `;

    htmlTicket += `
      <div class="ticket-item border-bottom py-1">
        <div class="d-flex justify-content-between">
          <strong class="ticket-nombre">${item.nombre}</strong>
          <span class="fw-bold">$${item.subtotal.toFixed(2)}</span>
        </div>
        <div class="d-flex justify-content-between text-muted ticket-concepto">
          <span>${item.concepto} (${item.cantidad}x$${item.importe.toFixed(2)})</span>
          <span>${item.familia}</span>
        </div>
      </div>
    `;
  });

  tbody.innerHTML = htmlTabla;
  tLista.innerHTML = htmlTicket;
  tTotal.innerText = granTotal.toFixed(2);
}

function actualizarFechaTicket() {
  const ahora = new Date();
  const fechaStr = ahora.toLocaleDateString('es-MX') + ' ' + ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const elFecha = document.getElementById('t-fecha');
  if (elFecha) elFecha.innerText = fechaStr;
}

function actualizarFormaPagoTicket() {
  const fp = document.getElementById('forma_pago').value;
  const elPago = document.getElementById('t-pago');
  if (elPago) elPago.innerText = fp;
}

async function confirmarGuardarRecibo() {
  if (carrito.length === 0) {
    Swal.fire('Atención', 'El recibo está vacío. Agregue al menos una vacuna.', 'warning');
    return;
  }

  const folioVenta = await obtenerSiguienteFolioVenta();
  const formaPago = document.getElementById('forma_pago').value;
  const fechaActual = new Date().toISOString();

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
    forma_pago: formaPago,
    fecha: fechaActual,
    estado: 'Activo',
    tipo_movimiento: 'INGRESO',
    monto_reembolsado: 0.00
  }));

  if (!supabaseClient) {
    Swal.fire('Modo Demo', `Se guardaría el Folio ${folioVenta} con ${carrito.length} registros.`, 'info');
    carrito = [];
    renderCarrito();
    return;
  }

  try {
    const { error } = await supabaseClient.from('historial_cobros').insert(inserts);
    if (error) throw error;

    Swal.fire('¡Éxito!', `El recibo ${folioVenta} ha sido guardado correctamente.`, 'success');
    carrito = [];
    renderCarrito();
    await obtenerSiguienteFolioVenta();
    cargarHistorial();
  } catch (e) {
    console.error("Error al guardar recibo:", e);
    Swal.fire('Error', 'No se pudo guardar el registro en la base de datos.', 'error');
  }
}

function confirmarImprimirRecibo() {
  if (carrito.length === 0) {
    Swal.fire('Atención', 'No hay nada en la lista para imprimir.', 'warning');
    return;
  }
  const ticketClon = document.getElementById('ticketPrint').cloneNode(true);
  const printArea = document.getElementById('print-area');
  printArea.innerHTML = '';
  printArea.appendChild(ticketClon);
  window.print();
}

// ==========================================
// MÓDULO DE HISTORIAL Y AUDITORÍA DE REEMBOLSOS
// ==========================================
async function cargarHistorial() {
  const tbody = document.getElementById('historialBody');
  if (!tbody) return;

  if (!supabaseClient) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-muted py-3">Modo Demo: Sin conexión a base de datos.</td></tr>`;
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from('historial_cobros')
      .select('*')
      .order('id', { ascending: false })
      .limit(50);

    if (error) throw error;

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-muted py-3">No hay registros de cobros en el historial.</td></tr>`;
      return;
    }

    historialMemoria = data;
    let html = '';
    data.forEach((item) => {
      const fechaObj = new Date(item.fecha);
      const fechaFormateada = fechaObj.toLocaleDateString('es-MX') + ' ' + fechaObj.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      const badgeEstado = item.estado === 'Activo' 
        ? '<span class="badge bg-success">Activo</span>' 
        : '<span class="badge bg-danger">Reembolsado</span>';

      html += `
        <tr>
          <td>${item.folio || '---'}</td>
          <td>${fechaFormateada}</td>
          <td><strong>${item.nombre}</strong><br><small class="text-muted">${item.familia}</small></td>
          <td>${item.concepto}</td>
          <td>${item.cantidad}</td>
          <td>$${parseFloat(item.importe || 0).toFixed(2)}</td>
          <td><span class="badge bg-info text-dark">${item.forma_pago || 'Efectivo'}</span></td>
          <td>${badgeEstado}</td>
          <td>
            ${item.estado === 'Activo' ? `<button class="btn btn-sm btn-outline-warning" onclick="abrirModalReembolso('${item.folio}')"><i class="bi bi-arrow-counterclockwise"></i> Reembolsar</button>` : '---'}
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  } catch (e) {
    console.error("Error al cargar historial:", e);
    tbody.innerHTML = `<tr><td colspan="9" class="text-danger py-3">Error al cargar el historial.</td></tr>`;
  }
}
