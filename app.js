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
    if (ticketItems) ticketItems.innerHTML = `<p class="text-muted text-center my-2">Agregue pacientes para ver el desglose aquí.</p>`;
    if (ticketTotal) ticketTotal.innerText = '0.00';
    return;
  }

  let totalGeneral = 0;
  let htmlTabla = '';
  let htmlTicket = '';

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
      <div class="ticket-item border-bottom py-1">
        <div class="d-flex justify-content-between">
          <strong class="ticket-nombre">${item.nombre}</strong>
          <span class="fw-bold">$${item.subtotal.toFixed(2)}</span>
        </div>
        <div class="d-flex justify-content-between text-muted ticket-concepto">
          <span>${item.concepto} (${item.cantidad}x $${item.importe.toFixed(2)})</span>
          <span>${item.familia}</span>
        </div>
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
    elFecha.innerText = ahora.toLocaleDateString('es-MX') + ' ' + ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  }
}

function actualizarFormaPagoTicket() {
  const selectPago = document.getElementById('forma_pago');
  const ticketPago = document.getElementById('t-pago');
  if (selectPago && ticketPago) {
    ticketPago.innerText = selectPago.value;
  }
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

  const ticketClon = document.getElementById('ticketPrint')?.cloneNode(true);

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

    if (pregImpresionDemo.isConfirmed && ticketClon) {
      const printArea = document.getElementById('print-area');
      if (printArea) {
        printArea.innerHTML = '';
        printArea.appendChild(ticketClon);
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

    if (pregImpresion.isConfirmed && ticketClon) {
      const printArea = document.getElementById('print-area');
      if (printArea) {
        printArea.innerHTML = '';
        printArea.appendChild(ticketClon);
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
// REIMPRESIÓN, IMPRESIÓN GENERAL Y EXPORTACIÓN
// ==========================================
function reimprimirFolio(folio) {
  const items = historialMemoria.filter(x => x.folio === folio && x.estado !== 'Cancelado' && x.estado !== 'CANCELADO');
  if (items.length === 0) {
    Swal.fire('Atención', 'No se encontraron registros activos para este folio.', 'info');
    return;
  }

  const primerItem = items[0];
  let total = 0;
  let htmlItems = '';

  items.forEach(item => {
    const sub = item.total ? parseFloat(item.total) : ((item.cantidad || 1) * (item.importe || 0));
    total += sub;
    htmlItems += `
      <div class="ticket-item border-bottom py-1">
        <div class="d-flex justify-content-between">
          <strong class="ticket-nombre">${item.nombre}</strong>
          <span class="fw-bold">$${sub.toFixed(2)}</span>
        </div>
        <div class="d-flex justify-content-between text-muted ticket-concepto">
          <span>${item.concepto}</span>
          <span>${item.familia}</span>
        </div>
      </div>
    `;
  });

  const fechaRaw = primerItem.fecha || primerItem.created_at;
  const fObj = new Date(fechaRaw);
  const fechaStr = isNaN(fObj.getTime()) ? '' : fObj.toLocaleDateString('es-MX') + ' ' + fObj.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  const printArea = document.getElementById('print-area');
  printArea.innerHTML = `
    <div class="ticket-paper mb-3" style="max-width:350px; margin:auto;">
      <div class="text-center mb-2">
        <h5 class="fw-bold text-dark ticket-header-title">COLEGIO CIUDAD DE MÉXICO</h5>
        <p class="text-muted ticket-header-sub">Comprobante de Vacunación</p>
        <span class="badge bg-dark text-white fw-bold px-3 py-1">FOLIO: ${folio}</span>
      </div>
      <div class="border-top border-bottom py-1 my-2 small text-secondary ticket-info-block">
        <div class="d-flex justify-content-between"><span>Fecha/Hora:</span><strong class="text-dark">${fechaStr}</strong></div>
        <div class="d-flex justify-content-between"><span>Forma de Pago:</span><strong class="text-dark">${primerItem.forma_pago || 'Efectivo'}</strong></div>
        <div class="d-flex justify-content-between"><span>Vendedor:</span><strong class="text-dark">${primerItem.vendedor || obtenerNombreCorto(primerItem.usuario_email)}</strong></div>
      </div>
      <div class="py-1 border-bottom">${htmlItems}</div>
      <div class="pt-2 d-flex justify-content-between align-items-center ticket-total-block">
        <span class="fw-bold text-dark ticket-total-title">TOTAL</span>
        <span class="fw-bold text-success ticket-total-amount">$${total.toFixed(2)}</span>
      </div>
    </div>
  `;

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
