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
let itemReembolsoActual = null;

// ==========================================
// INICIALIZACIÓN Y CONTROL DE SESIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  const modalEl = document.getElementById('modalReembolso');
  if (modalEl) {
    modalReembolsoBS = new bootstrap.Modal(modalEl);
  }

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
// FUNCIÓN DE INICIO Y CIERRE DE SESIÓN
// ==========================================
async function iniciarSesion() {
  const emailInput = document.getElementById('loginEmail') || 
                     document.getElementById('correo') || 
                     document.getElementById('email') || 
                     document.querySelector('input[type="email"]');

const passwordInput = document.getElementById('loginPassword') || 
                        document.getElementById('password') || 
                        document.getElementById('contrasena') || 
                        document.querySelector('input[type="password"]');

if (!emailInput || !passwordInput) {
    Swal.fire('Error', 'No se encontraron los campos de correo o contraseña.', 'error');
    return;
  }

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
    Swal.fire('Error inesperado', err.message, 'error');
  }
}

async function cerrarSesion() {
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }
  mostrarLogin();
}

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
// BÚSQUEDA Y SELECCIÓN DE PACIENTES
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

// ==========================================
// CARRITO MULTI-PACIENTE Y RECIBO
// ==========================================
function agregarAlRecibo() {
  const nombre = document.getElementById('nombre').value.trim();
  const concepto = document.getElementById('concepto').value.trim();
  const cantidad = parseInt(document.getElementById('cantidad').value) || 1;
  const importe = parseFloat(document.getElementById('importe').value) || 0;
  const matricula = document.getElementById('matricula').value.trim() || 'EXTERNO';
  const familia = document.getElementById('familia').value.trim() || 'S/F';
  const seccion = document.getElementById('seccion').value.trim() || '---';
  const grupo = document.getElementById('grupo').value.trim() || '---';

if (!nombre) {
    Swal.fire('Atención', 'Por favor ingresa o selecciona un paciente.', 'warning');
    return;
  }
  if (!concepto) {
    Swal.fire('Atención', 'Por favor especifica la vacuna o concepto.', 'warning');
    return;
  }
  if (cantidad <= 0 || importe < 0) {
    Swal.fire('Atención', 'La cantidad y el importe deben ser valores válidos.', 'warning');
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

// Limpiar campos del paciente
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

renderCarrito();
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
  <div class="ticket-item border-bottom pb-1 mb-1">
    <div class="d-flex justify-content-between fw-bold">
      <span>${item.nombre}</span>
      <span>$${item.subtotal.toFixed(2)}</span>
    </div>
    <div class="d-flex justify-content-between text-muted extra-small">
      <span>${item.concepto} (x${item.cantidad})</span>
      <span>Fam: ${item.familia}</span>
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
    elFecha.innerText = ahora.toLocaleString('es-MX', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }
}

function actualizarFormaPagoTicket() {
  const selectPago = document.getElementById('forma_pago');
  const ticketPago = document.getElementById('t-pago');
  if (selectPago && ticketPago) {
    ticketPago.innerText = selectPago.value;
  }
}

function calcularTotalCarrito() {
  return carrito.reduce((sum, i) => sum + i.subtotal, 0);
}

// ==========================================
// GUARDAR E IMPRIMIR RECIBOS
// ==========================================
async function confirmarGuardarRecibo() {
  if (carrito.length === 0) {
    Swal.fire('Recibo vacío', 'Agrega al menos un paciente para poder registrar el cobro.', 'warning');
    return;
  }

const result = await Swal.fire({
    title: '¿Confirmar y Guardar Registro?',
    text: `Se registrarán ${carrito.length} paciente(s) con un total de $${calcularTotalCarrito().toFixed(2)}.`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Sí, Guardar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#059669'
  });

if (result.isConfirmed) {
    await guardarRecibo();
  }
}

async function guardarRecibo() {
  if (!supabaseClient) {
    Swal.fire('Modo Demo', 'Los datos no se guardan permanentemente sin conexión a Supabase.', 'info');
    carrito = [];
    renderCarrito();
    obtenerSiguienteFolioVenta();
    return;
  }

try {
    const folioVenta = await obtenerSiguienteFolioVenta();
    const formaPago = document.getElementById('forma_pago').value;
    const fechaHora = new Date().toISOString();

const registrosAInsertar = carrito.map(item => ({
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
  estado: 'COBRADO',
  created_at: fechaHora
}));

const { error } = await supabaseClient
  .from('historial_cobros')
  .insert(registrosAInsertar);

if (error) throw error;

Swal.fire({
  icon: 'success',
  title: '¡Guardado Exitosamente!',
  text: `Cobro guardado bajo el Folio: ${folioVenta}`,
  timer: 2000,
  showConfirmButton: false
});

carrito = [];
renderCarrito();
obtenerSiguienteFolioVenta();
cargarHistorial();

} catch (err) {
    console.error("Error guardando recibo:", err);
    Swal.fire('Error', 'No se pudo guardar el registro: ' + err.message, 'error');
  }
}

function confirmarImprimirRecibo() {
  if (carrito.length === 0) {
    Swal.fire('Recibo vacío', 'No hay datos para imprimir.', 'warning');
    return;
  }
  imprimirRecibo();
}

function imprimirRecibo() {
  const printArea = document.getElementById('print-area');
  const ticketContent = document.getElementById('ticketPrint').innerHTML;

if (printArea) {
    printArea.innerHTML = `<div style="max-width: 320px; margin: 0 auto; padding: 20px; font-family: sans-serif;">         ${ticketContent}       </div>`;
    window.print();
    printArea.innerHTML = '';
  }
}

// ==========================================
// HISTORIAL Y REPORTES AUDITADOS (ADMIN)
// ==========================================
async function cargarHistorial() {
  const tbody = document.getElementById('historialBody');
  if (!tbody) return;

if (!supabaseClient) {
    tbody.innerHTML = `<tr><td colspan="14" class="text-center py-4 text-muted">Sin conexión a Supabase.</td></tr>`;
    return;
  }

try {
    const { data, error } = await supabaseClient
      .from('historial_cobros')
      .select('*')
      .order('id', { ascending: false });

if (error) throw error;

historialMemoria = data || [];
renderHistorial(historialMemoria);
actualizarKPIs(historialMemoria);

} catch (err) {
    console.error("Error cargando historial:", err);
    tbody.innerHTML = `<tr><td colspan="14" class="text-center py-4 text-danger">Error al cargar historial: ${err.message}</td></tr>`;
  }
}

function renderHistorial(data) {
  const tbody = document.getElementById('historialBody');
  if (!tbody) return;

if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="14" class="text-center py-4 text-muted">No se encontraron registros.</td></tr>`;
    return;
  }

let html = '';
  data.forEach(row => {
    let claseFila = '';
    let badgeEstado = 'COBRADO';

if (row.estado === 'CANCELADO') {
  claseFila = 'fila-cancelada';
  badgeEstado = '<span class="badge bg-danger">CANCELADO</span>';
} else if (row.estado === 'REEMBOLSADO') {
  claseFila = 'fila-reembolsada-total';
  badgeEstado = '<span class="badge bg-secondary">REEMBOLSADO</span>';
} else if (row.folio && row.folio.startsWith('R-')) {
  claseFila = 'fila-reembolso-egreso';
  badgeEstado = '<span class="badge bg-warning text-dark">EGRESO (R)</span>';
}

const fechaFormateada = row.created_at ? new Date(row.created_at).toLocaleString('es-MX', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
}) : '--';

const esSuper = modoSuperUsuario;
const esCobrado = row.estado === 'COBRADO' && !row.folio.startsWith('R-');
const jsonStr = JSON.stringify(row).replace(/"/g, '&quot;');

html += `
  <tr class="${claseFila}">
    <td><small>${fechaFormateada}</small></td>
    <td><strong>${row.folio || '--'}</strong></td>
    <td><small class="text-muted">${row.folio_referencia || '--'}</small></td>
    <td>${row.matricula || '--'}</td>
    <td class="fw-semibold">${row.nombre || '--'}</td>
    <td>${row.familia || '--'}</td>
    <td><small>${row.seccion || ''} / ${row.grupo || ''}</small></td>
    <td>${row.concepto || '--'}</td>
    <td>${row.cantidad || 0}</td>
    <td>$${parseFloat(row.importe || 0).toFixed(2)}</td>
    <td class="fw-bold ${row.total < 0 ? 'text-danger' : 'text-dark'}">$${parseFloat(row.total || 0).toFixed(2)}</td>
    <td><span class="badge bg-light text-dark border">${row.forma_pago || 'Efectivo'}</span></td>
    <td class="text-center">${badgeEstado}</td>
    <td class="text-center">
      ${esCobrado ? `
        <button class="btn btn-sm btn-outline-warning text-dark me-1" onclick="abrirModalReembolso(${jsonStr})" title="Procesar Reembolso">
          <i class="bi bi-arrow-counterclockwise"></i>
        </button>
      ` : ''}
      ${(esSuper && row.estado !== 'CANCELADO') ? `
        <button class="btn btn-sm btn-outline-danger" onclick="cancelarRegistro(${row.id})" title="Cancelar Registro">
          <i class="bi bi-x-circle"></i>
        </button>
      ` : ''}
    </td>
  </tr>
`;

});

tbody.innerHTML = html;
}

function filtrarTabla() {
  const searchVal = (document.getElementById('filterInput')?.value || '').toLowerCase().trim();
  const pagoVal = document.getElementById('filterPago')?.value || '';

const filtrados = historialMemoria.filter(item => {
    const coincideTexto = !searchVal || 
      (item.folio && item.folio.toLowerCase().includes(searchVal)) ||
      (item.folio_referencia && item.folio_referencia.toLowerCase().includes(searchVal)) ||
      (item.nombre && item.nombre.toLowerCase().includes(searchVal)) ||
      (item.familia && item.familia.toLowerCase().includes(searchVal)) ||
      (item.concepto && item.concepto.toLowerCase().includes(searchVal)) ||
      (item.matricula && item.matricula.toLowerCase().includes(searchVal));

const coincidePago = !pagoVal || item.forma_pago === pagoVal;

return coincideTexto && coincidePago;

});

renderHistorial(filtrados);
}

function actualizarKPIs(data) {
  let ingresoBruto = 0;
  let totalReembolsos = 0;
  let countVacunas = 0;
  let countFoliosSet = new Set();
  let efecNeto = 0;
  let otrosNeto = 0;

data.forEach(row => {
    if (row.estado === 'CANCELADO') return;

const monto = parseFloat(row.total || 0);

if (row.folio && row.folio.startsWith('R-')) {
  totalReembolsos += Math.abs(monto);
  if (row.forma_pago === 'Efectivo') efecNeto += monto;
  else otrosNeto += monto;
} else if (row.estado === 'COBRADO') {
  ingresoBruto += monto;
  countVacunas += parseInt(row.cantidad || 0);
  if (row.folio) countFoliosSet.add(row.folio);

  if (row.forma_pago === 'Efectivo') efecNeto += monto;
  else otrosNeto += monto;
}

});

const ingresoNeto = ingresoBruto - totalReembolsos;

const elTotal = document.getElementById('kpi-total');
  const elBruto = document.getElementById('kpi-bruto-sub');
  const elReembolsos = document.getElementById('kpi-reembolsos');
  const elCount = document.getElementById('kpi-count');
  const elFolios = document.getElementById('kpi-folios');
  const elEfectivo = document.getElementById('kpi-efectivo');
  const elOtros = document.getElementById('kpi-otros');

if (elTotal) elTotal.innerText = `$${ingresoNeto.toFixed(2)}`;
  if (elBruto) elBruto.innerText = `Bruto: $${ingresoBruto.toFixed(2)}`;
  if (elReembolsos) elReembolsos.innerText = `$${totalReembolsos.toFixed(2)}`;
  if (elCount) elCount.innerText = countVacunas;
  if (elFolios) elFolios.innerText = countFoliosSet.size;
  if (elEfectivo) elEfectivo.innerText = `$${efecNeto.toFixed(2)}`;
  if (elOtros) elOtros.innerText = `$${otrosNeto.toFixed(2)}`;
}

function toggleSuperUsuario(checked) {
  modoSuperUsuario = checked;
  if (checked) {
    Swal.fire({
      title: 'Modo Superusuario Activado',
      text: 'Ahora tienes permisos para cancelar registros directamente.',
      icon: 'info',
      timer: 1500,
      showConfirmButton: false
    });
  }
  renderHistorial(historialMemoria);
}

// ==========================================
// PROCESO DE REEMBOLSOS AUDITADOS
// ==========================================
function abrirModalReembolso(item) {
  itemReembolsoActual = item;
  document.getElementById('rf-item-id').value = item.id;
  document.getElementById('rf-folio-origen').value = item.folio;
  document.getElementById('rf-monto-maximo').value = item.total;

document.getElementById('rf-txt-folio').innerText = item.folio;
  document.getElementById('rf-txt-paciente').innerText = `${item.nombre} (${item.familia})`;
  document.getElementById('rf-txt-concepto').innerText = `${item.concepto} (Cant: ${item.cantidad})`;
  document.getElementById('rf-txt-total').innerText = `$${parseFloat(item.total).toFixed(2)}`;

document.getElementById('rfTipoTotal').checked = true;
  document.getElementById('rf-monto-input').value = parseFloat(item.total).toFixed(2);
  document.getElementById('rf-monto-input').readOnly = true;
  document.getElementById('rf-motivo-input').value = '';

if (modalReembolsoBS) {
    modalReembolsoBS.show();
  }
}

function toggleTipoReembolso() {
  const esTotal = document.getElementById('rfTipoTotal').checked;
  const montoMax = parseFloat(document.getElementById('rf-monto-maximo').value) || 0;
  const inputMonto = document.getElementById('rf-monto-input');
  const helpText = document.getElementById('rf-monto-help');

if (esTotal) {
    inputMonto.value = montoMax.toFixed(2);
    inputMonto.readOnly = true;
    helpText.innerText = 'Devolución por el monto completo del concepto.';
  } else {
    inputMonto.readOnly = false;
    helpText.innerText = `Ingrese un monto parcial menor o igual a $${montoMax.toFixed(2)}.`;
  }
}

async function ejecutarReembolsoAuditado() {
  if (!itemReembolsoActual) return;

const motivo = document.getElementById('rf-motivo-input').value.trim();
  const monto = parseFloat(document.getElementById('rf-monto-input').value) || 0;
  const montoMax = parseFloat(document.getElementById('rf-monto-maximo').value) || 0;

if (!motivo) {
    Swal.fire('Atención', 'Por favor ingresa un motivo para la auditoría.', 'warning');
    return;
  }

if (monto <= 0 || monto > montoMax) {
    Swal.fire('Atención', `El monto a reembolsar debe ser mayor a 0 y no superior a $${montoMax.toFixed(2)}.`, 'warning');
    return;
  }

try {
    const folioReembolso = await obtenerSiguienteFolioReembolso();

const egreso = {
  folio: folioReembolso,
  folio_referencia: itemReembolsoActual.folio,
  matricula: itemReembolsoActual.matricula,
  nombre: itemReembolsoActual.nombre,
  familia: itemReembolsoActual.familia,
  seccion: itemReembolsoActual.seccion,
  grupo: itemReembolsoActual.grupo,
  concepto: `REEMBOLSO: ${itemReembolsoActual.concepto} - Motivo: ${motivo}`,
  cantidad: itemReembolsoActual.cantidad,
  importe: -monto,
  total: -monto,
  forma_pago: itemReembolsoActual.forma_pago,
  estado: 'REEMBOLSO',
  created_at: new Date().toISOString()
};

const { error: errorEgreso } = await supabaseClient
  .from('historial_cobros')
  .insert([egreso]);

if (errorEgreso) throw errorEgreso;

if (monto === montoMax) {
  await supabaseClient
    .from('historial_cobros')
    .update({ estado: 'REEMBOLSADO' })
    .eq('id', itemReembolsoActual.id);
}

if (modalReembolsoBS) {
  modalReembolsoBS.hide();
}

Swal.fire({
  icon: 'success',
  title: 'Reembolso Procesado',
  text: `Se generó el folio de egreso ${folioReembolso}`,
  timer: 2000,
  showConfirmButton: false
});

cargarHistorial();

} catch (err) {
    console.error("Error al procesar reembolso:", err);
    Swal.fire('Error', 'No se pudo procesar el reembolso: ' + err.message, 'error');
  }
}

async function cancelarRegistro(id) {
  const result = await Swal.fire({
    title: '¿Cancelar este registro?',
    text: 'Esta acción anulará el registro en el historial.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    confirmButtonText: 'Sí, Cancelar',
    cancelButtonText: 'No'
  });

if (result.isConfirmed) {
    try {
      const { error } = await supabaseClient
        .from('historial_cobros')
        .update({ estado: 'CANCELADO' })
        .eq('id', id);

if (error) throw error;

  Swal.fire('Cancelado', 'El registro ha sido marcado como cancelado.', 'success');
  cargarHistorial();
} catch (err) {
  Swal.fire('Error', 'No se pudo cancelar: ' + err.message, 'error');
}

}
}

// ==========================================
// CAMBIO DE CONTRASEÑA Y EXPORTAR EXCEL
// ==========================================
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

function exportarExcel() {
  if (!historialMemoria || historialMemoria.length === 0) {
    Swal.fire('Sin datos', 'No hay registros en el historial para exportar.', 'info');
    return;
  }

let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
  csvContent += "Fecha,Folio,Folio Ref,Matricula,Paciente,Familia,Seccion,Grupo,Concepto,Cantidad,Importe,Total,Forma Pago,Estado\n";

historialMemoria.forEach(row => {
    const fecha = row.created_at ? new Date(row.created_at).toLocaleString('es-MX') : '';
    const fila = [
      "${fecha}",
      "${row.folio || ''}",
      "${row.folio_referencia || ''}",
      "${row.matricula || ''}",
      "${row.nombre || ''}",
      "${row.familia || ''}",
      "${row.seccion || ''}",
      "${row.grupo || ''}",
      "${row.concepto || ''}",
      row.cantidad || 0,
      row.importe || 0,
      row.total || 0,
      "${row.forma_pago || ''}",
      "${row.estado || ''}"
    ];
    csvContent += fila.join(",") + "\n";
  });

const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Reporte_Vacunacion_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Exponer funciones explícitamente a window para navegación/eventos HTML
window.iniciarSesion = iniciarSesion;
window.cerrarSesion = cerrarSesion;
window.setModo = setModo;
window.buscarPersona = buscarPersona;
window.seleccionarPersona = seleccionarPersona;
window.agregarAlRecibo = agregarAlRecibo;
window.eliminarDelRecibo = eliminarDelRecibo;
window.actualizarFormaPagoTicket = actualizarFormaPagoTicket;
window.confirmarGuardarRecibo = confirmarGuardarRecibo;
window.confirmarImprimirRecibo = confirmarImprimirRecibo;
window.cargarHistorial = cargarHistorial;
window.toggleSuperUsuario = toggleSuperUsuario;
window.exportarExcel = exportarExcel;
window.filtrarTabla = filtrarTabla;
window.cambiarPassword = cambiarPassword;
window.abrirModalReembolso = abrirModalReembolso;
window.toggleTipoReembolso = toggleTipoReembolso;
window.ejecutarReembolsoAuditado = ejecutarReembolsoAuditado;
window.cancelarRegistro = cancelarRegistro;
