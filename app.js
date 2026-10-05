// ==========================================
// CONFIGURACIÓN DE SUPABASE (Segura)
// ==========================================
const _SUPABASE_URL = (typeof window.CONFIG !== 'undefined' && window.CONFIG.SUPABASE_URL) 
  ? window.CONFIG.SUPABASE_URL 
  : (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : "");

const _SUPABASE_ANON_KEY = (typeof window.CONFIG !== 'undefined' && window.CONFIG.SUPABASE_ANON_KEY) 
  ? window.CONFIG.SUPABASE_ANON_KEY 
  : (typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : "");

const supabaseClient = (typeof window.supabase !== 'undefined' && _SUPABASE_URL && _SUPABASE_ANON_KEY) 
  ? window.supabase.createClient(_SUPABASE_URL, _SUPABASE_ANON_KEY) 
  : null;

// ==========================================
// ESTADO GLOBAL
// ==========================================
let carrito = [];
let historialMemoria = [];
let modoSuperUsuario = false;
let modoPaciente = 'alumno';
let modalReembolsoBS = null;

// ==========================================
// INICIALIZACIÓN Y CONTROL DE SESIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  const modalEl = document.getElementById('modalReembolso');
  if (modalEl && typeof bootstrap !== 'undefined') {
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
    mostrarLogin();
  }
});

// ==========================================
// FUNCIÓN DE INICIO DE SESIÓN
// ==========================================
async function iniciarSesion() {
  const emailInput = document.getElementById('loginEmail') || 
                     document.getElementById('correo') || 
                     document.querySelector('input[type="email"]');
                     
  const passwordInput = document.getElementById('loginPassword') || 
                        document.getElementById('password') || 
                        document.querySelector('input[type="password"]');

  if (!emailInput || !passwordInput) {
    alert('Error: No se encontraron los campos de entrada en el HTML.');
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
      Swal.fire('Error', 'No se pudo conectar con Supabase. Revisa config.js.', 'error');
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
      const msg = error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message;
      if (typeof Swal !== 'undefined') {
        Swal.fire('Error de Acceso', msg, 'error');
      } else {
        alert('Error: ' + msg);
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

  if (typeof obtenerSiguienteFolioVenta === 'function') obtenerSiguienteFolioVenta();
  if (typeof actualizarFechaTicket === 'function') actualizarFechaTicket();
  if (typeof renderCarrito === 'function') renderCarrito();
  if (typeof cargarHistorial === 'function') cargarHistorial();
}

function mostrarLogin() {
  const loginOverlay = document.getElementById('loginOverlay');
  const appContent = document.getElementById('appContent');
  if (loginOverlay) loginOverlay.style.display = 'flex';
  if (appContent) appContent.style.display = 'none';
}
