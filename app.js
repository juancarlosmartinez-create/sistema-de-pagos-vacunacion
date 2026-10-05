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
    // Escuchar cambios en el estado de autenticación (Carga inicial, Login y Logout)
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
  const cantidad = parseInt(
