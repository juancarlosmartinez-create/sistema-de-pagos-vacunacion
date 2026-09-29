const SUPABASE_URL = "https://uvyazxprytgdwwrisnih.supabase.co";
const SUPABASE_KEY = "sb_publishable_g277uGIxebvELJ5EZju2bQ_tquT0CI7";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentFolio = 'V-0001';
let modoActual = 'alumno';
let reciboActual = [];
let cobrosGuardados = [];
let searchTimeout = null;
let esSuperUsuario = false;

document.addEventListener('DOMContentLoaded', () => {
  actualizarFechaTicket();
  actualizarFormaPagoTicket();
  obtenerSiguienteFolio();

  // Ocultar resultados de búsqueda al hacer clic fuera
  document.addEventListener('click', (e) => {
    const searchInput = document.getElementById('searchInput');
    const resultsDiv = document.getElementById('results');
    if (resultsDiv && searchInput && !searchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
      resultsDiv.innerHTML = '';
    }
  });
});

// CONTROL DE MODO SUPERUSUARIO
function toggleSuperUsuario(activo) {
  esSuperUsuario = activo;
  renderTablaHistorial(cobrosGuardados);
}

// EJECUCIÓN DE IMPRESIÓN EN VENTANA AISLADA
function ejecutarImpresionAisolada(callbackAlTerminar) {
  const ticketOriginal = document.getElementById('ticketPrint');
  const printArea = document.getElementById('print-area');

  if (!ticketOriginal || !printArea) {
    window.print();
    if (typeof callbackAlTerminar === 'function') callbackAlTerminar();
    return;
  }

  const ticketHTMLSnapshot = ticketOriginal.outerHTML;

  if (typeof Swal !== 'undefined' && Swal.isVisible()) {
    Swal.close();
  }

  document.body.classList.remove('swal2-shown', 'swal2-height-auto', 'modal-open');
  document.body.style.overflow = 'auto';
  document.body.style.pointerEvents = 'auto';
  document.querySelectorAll('.swal2-container, .modal-backdrop').forEach(el => el.remove());

  printArea.innerHTML = ticketHTMLSnapshot;

  setTimeout(() => {
    window.print();

    printArea.innerHTML = '';
    document.body.classList.remove('swal2-shown', 'swal2-height-auto', 'modal-open');
    document.body.style.overflow = 'auto';
    document.body.style.pointerEvents = 'auto';
    document.querySelectorAll('.swal2-container, .modal-backdrop').forEach(el => el.remove());

    if (typeof callbackAlTerminar === 'function') {
      callbackAlTerminar();
    }
  }, 300);
}

// REIMPRIMIR FOLIO COMPLETO DESDE HISTORIAL
function reimprimirFolio(folio) {
  if (!folio) return;

  const itemsFolio = cobrosGuardados.filter(item => item.folio === folio && item.estado !== 'Cancelado');

  if (!itemsFolio || itemsFolio.length === 0) {
    Swal.fire({
      icon: 'warning',
      title: 'Sin elementos activos',
      text: 'Todos los registros de este folio han sido cancelados o eliminados.',
      confirmButtonColor: '#1e3a8a'
    });
    return;
  }

  const printArea = document.getElementById('print-area');
  if (!printArea) return;

  const primerItem = itemsFolio[0];
  const rawFecha = primerItem.created_at || primerItem.fecha || primerItem.fecha_hora || primerItem.timestamp;
  let fechaStr = '---';

  if (rawFecha) {
    const d = new Date(rawFecha);
    if (!isNaN(d.getTime())) {
      fechaStr = d.toLocaleString('es-MX', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
      });
    }
  }

  let totalFolio = 0;
  let itemsHtml = '';

  itemsFolio.forEach(item => {
    const cant = item.cantidad || 1;
    const imp = item.importe || 0;
    const subtotal = cant * imp;
    totalFolio += subtotal;

    itemsHtml += `
      <div class="ticket-item d-flex justify-content-between text-start border-bottom py-1">
        <div>
          <strong class="text-dark ticket-nombre">${item.nombre || '---'}</strong> <small class="text-muted">(${item.familia || '---'})</small><br>
          <span class="text-secondary ticket-concepto">${item.concepto || '---'} x${cant}</span>
        </div>
        <div class="fw-bold text-dark">$${subtotal.toFixed(2)}</div>
      </div>
    `;
  });

  let densityClass = '';
  if (itemsFolio.length >= 8) {
    densityClass = 'ticket-density-compact';
  } else if (itemsFolio.length >= 5) {
    densityClass = 'ticket-density-medium';
  }

  const ticketHtml = `
    <div class="ticket-paper ${densityClass}">
      <div class="text-center mb-2">
        <h5 class="fw-bold text-dark ticket-header-title">COLEGIO CIUDAD DE MÉXICO</h5>
        <p class="text-muted ticket-header-sub">Comprobante de Vacunación</p>
        <span class="badge bg-dark text-white fw-bold px-3 py-1">FOLIO: ${folio}</span>
      </div>

      <div class="border-top border-bottom py-1 my-2 small text-secondary ticket-info-block">
        <div class="d-flex justify-content-between"><span>Fecha/Hora:</span><strong class="text-dark">${fechaStr}</strong></div>
        <div class="d-flex justify-content-between"><span>Forma de Pago:</span><strong class="text-dark">${primerItem.forma_pago || 'Efectivo'}</strong></div>
      </div>

      <div class="py-1 border-bottom">
        ${itemsHtml}
      </div>

      <div class="pt-2 d-flex justify-content-between align-items-center ticket-total-block">
        <span class="fw-bold text-dark ticket-total-title">TOTAL PAGADO</span>
        <span class="fw-bold text-success ticket-total-amount">$${totalFolio.toFixed(2)}</span>
      </div>
    </div>
  `;

  if (typeof Swal !== 'undefined' && Swal.isVisible()) Swal.close();
  document.body.classList.remove('swal2-shown', 'swal2-height-auto', 'modal-open');
  document.body.style.overflow = 'auto';

  printArea.innerHTML = ticketHtml;

  setTimeout(() => {
    window.print();
    setTimeout(() => {
      printArea.innerHTML = '';
    }, 300);
  }, 250);
}

function actualizarFechaTicket() {
  const ahora = new Date();
  const fechaStr = ahora.toLocaleDateString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  }) + ' ' + ahora.toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit', hour12: true
  });
  const el = document.getElementById('t-fecha');
  if (el) el.innerText = fechaStr;
}

function actualizarFormaPagoTicket() {
  const select = document.getElementById('forma_pago');
  const tPago = document.getElementById('t-pago');
  if (select && tPago) {
    tPago.innerText = select.value;
  }
}

async function obtenerSiguienteFolio() {
  try {
    const { data, error } = await db
      .from('historial_cobros')
      .select('folio')
      .not('folio', 'is', null)
      .order('id', { ascending: false })
      .limit(1);

    if (error) console.error("Error al consultar último folio:", error);

    if (data && data.length > 0 && data[0].folio) {
      const ultimoFolio = data[0].folio;
      const match = ultimoFolio.match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10) + 1;
        currentFolio = 'V-' + String(num).padStart(4, '0');
      } else {
        currentFolio = 'V-0001';
      }
    } else {
      currentFolio = 'V-0001';
    }
  } catch (e) {
    console.error("Excepción al obtener folio:", e);
    currentFolio = 'V-0001';
  }

  const tFolio = document.getElementById('t-folio');
  const dFolio = document.getElementById('display-folio');
  if (tFolio) tFolio.innerText = `FOLIO: ${currentFolio}`;
  if (dFolio) dFolio.innerText = currentFolio;
}

function setModo(modo) {
  modoActual = modo;
  const btnA = document.getElementById('btnModeAlumno');
  const btnE = document.getElementById('btnModeExterno');
  const searchView = document.getElementById('modoAlumnoView');

  if (modo === 'alumno') {
    btnA.classList.add('active', 'btn-outline-primary');
    btnA.classList.remove('btn-outline-secondary');
    btnE.classList.remove('active', 'btn-outline-primary');
    btnE.classList.add('btn-outline-secondary');
    searchView.style.display = 'block';
    limpiarCamposPaciente();
  } else {
    btnE.classList.add('active', 'btn-outline-secondary');
    btnE.classList.remove('btn-outline-primary');
    btnA.classList.remove('active', 'btn-outline-primary');
    btnA.classList.add('btn-outline-secondary');
    searchView.style.display = 'none';

    document.getElementById('matricula').value = 'EXTERNO';

    const nomEl = document.getElementById('nombre');
    nomEl.removeAttribute('readonly');
    nomEl.value = '';
    nomEl.placeholder = 'Escriba el nombre del paciente...';

    const famEl = document.getElementById('familia');
    famEl.removeAttribute('readonly');
    famEl.value = '';
    famEl.placeholder = 'Escriba nombre de la familia...';

    document.getElementById('seccion').value = 'FAMILIAR';
    document.getElementById('grupo').value = 'EXTERNO';
  }
}

function limpiarCamposPaciente() {
  document.getElementById('matricula').value = '';

  const nomEl = document.getElementById('nombre');
  nomEl.value = '';
  nomEl.setAttribute('readonly', 'true');
  nomEl.placeholder = 'Seleccione un alumno arriba';

  const famEl = document.getElementById('familia');
  famEl.value = '';
  famEl.setAttribute('readonly', 'true');
  famEl.placeholder = 'Familia / Apellidos';

  document.getElementById('seccion').value = '';
  document.getElementById('grupo').value = '';
  const searchInp = document.getElementById('searchInput');
  if (searchInp) searchInp.value = '';
}

// BÚSQUEDA PREDICTIVA ADAPTADA EXACTAMENTE A LA TABLA "personas"
function buscarPersona() {
  const q = document.getElementById('searchInput').value.trim();
  const resultsDiv = document.getElementById('results');

  if (searchTimeout) clearTimeout(searchTimeout);

  if (q.length < 2) {
    resultsDiv.innerHTML = '';
    return;
  }

  searchTimeout = setTimeout(async () => {
    try {
      // Uso explícito de comillas dobles para respetar mayúsculas en PostgreSQL
      const { data, error } = await db
        .from('personas')
        .select('*')
        .or(`"Nombre".ilike.%${q}%,"Familia".ilike.%${q}%,"Matricula".ilike.%${q}%`)
        .limit(8);

      if (error) {
        resultsDiv.innerHTML = `<div class="list-group-item text-danger small py-2 bg-light"><i class="bi bi-exclamation-triangle me-1"></i> Error de consulta: ${error.message}</div>`;
        return;
      }

      resultsDiv.innerHTML = '';

      if (!data || data.length === 0) {
        resultsDiv.innerHTML = `<div class="list-group-item text-muted small py-2"><i class="bi bi-exclamation-circle me-1"></i> No se encontraron registros para "${q}".</div>`;
        return;
      }

      data.forEach(p => {
        // Mapeo exacto según columnas de Supabase
        const mat = p.Matricula || 'S/N';
        const nom = p.Nombre || '';
        const fam = p.Familia || '';
        const sec = p['Sección'] || p.Seccion || '';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center py-2';
        btn.innerHTML = `
          <div>
            <div class="fw-bold text-dark" style="font-size: 0.9rem;">${nom}</div>
            <div class="text-muted small" style="font-size: 0.8rem;">
              Matrícula: <strong>${mat}</strong> 
              ${fam ? ` | Familia: <strong>${fam}</strong>` : ''}
            </div>
          </div>
          <span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill">${sec}</span>
        `;
        
        btn.onclick = () => seleccionarPersona(p);
        resultsDiv.appendChild(btn);
      });

    } catch (err) {
      console.error("Error en búsqueda predictiva:", err);
    }

  }, 300);
}

function seleccionarPersona(p) {
  document.getElementById('matricula').value = p.Matricula || '';
  document.getElementById('nombre').value = p.Nombre || '';
  document.getElementById('familia').value = p.Familia || '';
  document.getElementById('seccion').value = p['Sección'] || p.Seccion || '';
  document.getElementById('grupo').value = p.Grupo || '';

  document.getElementById('results').innerHTML = '';
  document.getElementById('searchInput').value = '';
  document.getElementById('importe').focus();
}

function agregarAlRecibo() {
  const nom = document.getElementById('nombre').value.trim();
  const mat = document.getElementById('matricula').value || 'EXTERNO';
  const fam = document.getElementById('familia').value.trim() || '---';
  const sec = document.getElementById('seccion').value || 'GENERAL';
  const gru = document.getElementById('grupo').value || 'S/G';
  const con = document.getElementById('concepto').value.trim();
  const cant = parseInt(document.getElementById('cantidad').value, 10) || 1;
  const imp = parseFloat(document.getElementById('importe').value) || 0;

  if (!nom) {
    Swal.fire({ icon: 'warning', title: 'Paciente Requerido', text: 'Por favor seleccione un alumno o escriba el nombre del paciente.', confirmButtonColor: '#1e3a8a' });
    return;
  }
  if (!con) {
    Swal.fire({ icon: 'warning', title: 'Concepto Requerido', text: 'Por favor ingrese o seleccione la vacuna o concepto.', confirmButtonColor: '#1e3a8a' });
    return;
  }
  if (cant <= 0 || imp <= 0) {
    Swal.fire({ icon: 'warning', title: 'Monto Inválido', text: 'La cantidad e importe deben ser mayores a cero.', confirmButtonColor: '#1e3a8a' });
    return;
  }

  const item = {
    idTemp: Date.now() + Math.random(),
    matricula: mat,
    nombre: nom,
    familia: fam,
    seccion: sec,
    grupo: gru,
    concepto: con,
    cantidad: cant,
    importe: imp,
    subtotal: cant * imp
  };

  reciboActual.push(item);
  actualizarFechaTicket();

  document.getElementById('concepto').value = 'Influenza';
  document.getElementById('importe').value = '';
  document.getElementById('cantidad').value = '1';

  if (modoActual === 'alumno') {
    limpiarCamposPaciente();
  } else {
    setModo('externo');
  }

  renderizarRecibo();
}

function eliminarItem(idTemp) {
  reciboActual = reciboActual.filter(i => i.idTemp !== idTemp);
  renderizarRecibo();
}

function renderizarRecibo() {
  const tbody = document.getElementById('tablaCarritoBody');
  const tLista = document.getElementById('t-lista-items');
  const ticketEl = document.getElementById('ticketPrint');

  tbody.innerHTML = '';
  tLista.innerHTML = '';

  document.getElementById('count-items').innerText = `${reciboActual.length} Pacientes`;
  actualizarFormaPagoTicket();

  ticketEl.classList.remove('ticket-density-medium', 'ticket-density-compact');
  if (reciboActual.length >= 8) {
    ticketEl.classList.add('ticket-density-compact');
  } else if (reciboActual.length >= 5) {
    ticketEl.classList.add('ticket-density-medium');
  }

  if (reciboActual.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-muted py-3">No hay pacientes agregados al recibo aún.</td></tr>';
    tLista.innerHTML = '<p class="text-muted text-center my-2">Agregue pacientes para ver el desglose aquí.</p>';
    document.getElementById('t-total').innerText = '0.00';
    return;
  }

  let granTotal = 0;

  reciboActual.forEach((item, index) => {
    granTotal += item.subtotal;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td class="text-start">
        <strong>${item.nombre}</strong><br>
        <small class="text-muted">Fam: ${item.familia} | ID: ${item.matricula}</small>
      </td>
      <td>${item.concepto}</td>
      <td>${item.cantidad}</td>
      <td>$${item.importe.toFixed(2)}</td>
      <td class="fw-bold text-success">$${item.subtotal.toFixed(2)}</td>
      <td><button class="btn btn-sm btn-outline-danger" onclick="eliminarItem(${item.idTemp})"><i class="bi bi-trash"></i></button></td>
    `;
    tbody.appendChild(tr);

    const divT = document.createElement('div');
    divT.className = 'ticket-item d-flex justify-content-between text-start border-bottom py-1';
    divT.innerHTML = `
      <div>
        <strong class="text-dark ticket-nombre">${item.nombre}</strong> <small class="text-muted">(${item.familia})</small><br>
        <span class="text-secondary ticket-concepto">${item.concepto} x${item.cantidad}</span>
      </div>
      <div class="fw-bold text-dark">$${item.subtotal.toFixed(2)}</div>
    `;
    tLista.appendChild(divT);
  });

  document.getElementById('t-total').innerText = granTotal.toFixed(2);
}

async function confirmarGuardarRecibo() {
  if (reciboActual.length === 0) {
    Swal.fire({ icon: 'warning', title: 'Recibo Vacío', text: 'Agregue al menos un paciente antes de guardar el registro.', confirmButtonColor: '#1e3a8a' });
    return;
  }

  const formaPago = document.getElementById('forma_pago').value;
  const granTotal = reciboActual.reduce((acc, i) => acc + i.subtotal, 0);

  const confirmacion = await Swal.fire({
    title: '¿Desea guardar este registro?',
    html: `Se registrarán <strong>${reciboActual.length} paciente(s)</strong> en el <strong>Folio ${currentFolio}</strong> por un total de <strong>$${granTotal.toFixed(2)}</strong> (${formaPago}).`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#059669',
    cancelButtonColor: '#6b7280',
    confirmButtonText: 'Sí, guardar registro',
    cancelButtonText: 'Cancelar',
    reverseButtons: true
  });

  if (confirmacion.isConfirmed) {
    ejecutarGuardado(formaPago);
  }
}

async function ejecutarGuardado(formaPago) {
  actualizarFechaTicket();

  const registrosAInsertar = reciboActual.map(item => ({
    folio: currentFolio,
    matricula: item.matricula,
    nombre: item.nombre,
    familia: item.familia,
    seccion: item.seccion,
    grupo: item.grupo,
    concepto: item.concepto,
    cantidad: item.cantidad,
    importe: item.importe,
    forma_pago: formaPago,
    estado: 'Activo'
  }));

  Swal.fire({
    title: 'Guardando en la base de datos...',
    text: 'Por favor espere un momento.',
    allowOutsideClick: false,
    didOpen: () => { Swal.showLoading(); }
  });

  try {
    const { error } = await db.from('historial_cobros').insert(registrosAInsertar);

    if (error) {
      Swal.fire({ icon: 'error', title: 'Error al Guardar', text: `Error de la base de datos: ${error.message}`, confirmButtonColor: '#dc2626' });
      return;
    }

    const finalizarYLimpiar = async () => {
      reciboActual = [];
      renderizarRecibo();
      await obtenerSiguienteFolio();
    };

    const askPrint = await Swal.fire({
      icon: 'success',
      title: '¡Registro Guardado Con Éxito!',
      text: `El Folio ${currentFolio} ha sido procesado correctamente. ¿Deseas imprimir el recibo ahora?`,
      showCancelButton: true,
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#6b7280',
      confirmButtonText: '<i class="bi bi-printer-fill me-1"></i> Sí, Imprimir',
      cancelButtonText: 'No, finalizar',
      reverseButtons: true
    });

    if (askPrint.isConfirmed) {
      ejecutarImpresionAisolada(finalizarYLimpiar);
    } else {
      await finalizarYLimpiar();
    }

  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Error de Conexión', text: 'Ocurrió un error inesperado al conectar con Supabase.', confirmButtonColor: '#dc2626' });
  }
}

async function confirmarImprimirRecibo() {
  if (reciboActual.length === 0) {
    Swal.fire({ icon: 'warning', title: 'Recibo Vacío', text: 'No hay elementos o pacientes en la vista previa para imprimir.', confirmButtonColor: '#1e3a8a' });
    return;
  }

  const result = await Swal.fire({
    title: '¿Deseas imprimir el recibo?',
    text: 'Se enviará a impresión el recibo mostrado en la pantalla.',
    icon: 'info',
    showCancelButton: true,
    confirmButtonColor: '#2563eb',
    cancelButtonColor: '#6b7280',
    confirmButtonText: 'Imprimir',
    cancelButtonText: 'Cancelar',
    reverseButtons: true
  });

  if (result.isConfirmed) {
    ejecutarImpresionAisolada();
  }
}

async function cargarHistorial() {
  const tbody = document.getElementById('historialBody');
  tbody.innerHTML = '<tr><td colspan="13" class="text-center py-4 text-muted">Cargando registros recientes desde la base de datos...</td></tr>';

  try {
    const { data, error } = await db
      .from('historial_cobros')
      .select('*')
      .order('id', { ascending: false })
      .limit(100);

    if (error) {
      tbody.innerHTML = `<tr><td colspan="13" class="text-danger text-center py-4"><i class="bi bi-exclamation-octagon me-2"></i>Error al consultar la base de datos: ${error.message}</td></tr>`;
      return;
    }

    cobrosGuardados = data || [];
    renderTablaHistorial(cobrosGuardados);

  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="13" class="text-danger text-center py-4">Error de conexión al cargar historial.</td></tr>';
  }
}

async function cancelarRegistro(id, nombrePaciente) {
  const confirm = await Swal.fire({
    title: '¿Deseas cancelar esta vacuna?',
    html: `El registro de <strong>${nombrePaciente}</strong> cambiará a estado <strong>Cancelado</strong>.<br><small class="text-muted">Se excluirá de tickets de reimpresión y reportes acumulados.</small>`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d97706',
    cancelButtonColor: '#6b7280',
    confirmButtonText: 'Sí, cancelar vacuna',
    cancelButtonText: 'Regresar',
    reverseButtons: true
  });

  if (confirm.isConfirmed) {
    try {
      const { error } = await db
        .from('historial_cobros')
        .update({ estado: 'Cancelado' })
        .eq('id', id);

      if (error) {
        Swal.fire({ icon: 'error', title: 'Error al cancelar', text: error.message });
        return;
      }

      Swal.fire({ icon: 'success', title: 'Registro Cancelado', timer: 1400, showConfirmButton: false });
      cargarHistorial();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'Error al comunicarse con la base de datos.' });
    }
  }
}

async function eliminarRegistro(id, nombrePaciente) {
  if (!esSuperUsuario) {
    Swal.fire({ icon: 'error', title: 'Acceso Denegado', text: 'Permiso exclusivo de superusuario.' });
    return;
  }

  const confirm = await Swal.fire({
    title: '¡ADVERTENCIA DE ELIMINACIÓN!',
    html: `¿Estás seguro de <strong>ELIMINAR DEFINITIVAMENTE</strong> la vacuna de <strong>${nombrePaciente}</strong> de la base de datos?<br><strong class="text-danger">Esta acción NO se puede deshacer.</strong>`,
    icon: 'error',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#6b7280',
    confirmButtonText: 'Eliminar de BD',
    cancelButtonText: 'Cancelar',
    reverseButtons: true
  });

  if (confirm.isConfirmed) {
    try {
      const { error } = await db
        .from('historial_cobros')
        .delete()
        .eq('id', id);

      if (error) {
        Swal.fire({ icon: 'error', title: 'Error al eliminar', text: error.message });
        return;
      }

      Swal.fire({ icon: 'success', title: 'Registro Borrado', timer: 1400, showConfirmButton: false });
      cargarHistorial();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'Error al comunicarse con la base de datos.' });
    }
  }
}

function renderTablaHistorial(lista) {
  const tbody = document.getElementById('historialBody');
  tbody.innerHTML = '';

  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="13" class="text-center py-4 text-muted">No se encontraron registros de cobros.</td></tr>';
    document.getElementById('kpi-total').innerText = '$0.00';
    document.getElementById('kpi-count').innerText = '0';
    document.getElementById('kpi-folios').innerText = '0';
    document.getElementById('kpi-efectivo').innerText = '$0.00';
    document.getElementById('kpi-otros').innerText = '$0.00';
    return;
  }

  let totalG = 0, vacunasG = 0, efectivoG = 0, otrosG = 0;
  const foliosUnicos = new Set();

  lista.forEach(item => {
    const esCancelado = item.estado === 'Cancelado';
    const cant = item.cantidad || 1;
    const imp = item.importe || 0;
    const total = cant * imp;

    if (!esCancelado) {
      totalG += total;
      vacunasG += cant;
      if (item.folio) foliosUnicos.add(item.folio);

      if (item.forma_pago === 'Efectivo') efectivoG += total;
      else otrosG += total;
    }

    const rawFecha = item.created_at || item.fecha || item.fecha_hora || item.timestamp;
    let fechaTxt = '---';
    if (rawFecha) {
      const d = new Date(rawFecha);
      if (!isNaN(d.getTime())) {
        fechaTxt = d.toLocaleString('es-MX', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: true
        });
      }
    }

    const tr = document.createElement('tr');
    if (esCancelado) tr.className = 'row-cancelado';

    tr.innerHTML = `
      <td class="small text-muted">${fechaTxt}</td>
      <td><span class="badge bg-dark text-white fw-bold">${item.folio || 'N/A'}</span></td>
      <td><strong>${item.matricula || '---'}</strong></td>
      <td>
        <span class="fw-semibold">${item.nombre || '---'}</span>
        ${!esCancelado ? `<button class="btn btn-sm btn-link text-danger p-0 ms-1" onclick="cancelarRegistro(${item.id}, '${item.nombre}')" title="Cancelar esta vacuna"><i class="bi bi-x-circle-fill"></i></button>` : ''}
      </td>
      <td>${item.familia || '---'}</td>
      <td><span class="badge bg-light text-dark border">${item.seccion || ''} ${item.grupo || ''}</span></td>
      <td>${item.concepto || '---'}</td>
      <td>${cant}</td>
      <td>$${parseFloat(imp).toFixed(2)}</td>
      <td class="fw-bold ${esCancelado ? 'text-muted' : 'text-success'}">$${total.toFixed(2)}</td>
      <td><span class="badge ${item.forma_pago === 'Efectivo' ? 'bg-warning-subtle text-warning border' : 'bg-primary-subtle text-primary border'}">${item.forma_pago || 'Efectivo'}</span></td>
      <td class="text-center">
        <span class="badge ${esCancelado ? 'bg-danger-subtle text-danger border border-danger-subtle' : 'bg-success-subtle text-success border border-success-subtle'}">
          ${item.estado || 'Activo'}
        </span>
      </td>
      <td class="text-center">
        <div class="btn-group btn-group-sm">
          ${!esCancelado ? `<button class="btn btn-outline-primary fw-semibold" onclick="reimprimirFolio('${item.folio}')" title="Reimprimir recibo del folio"><i class="bi bi-printer-fill"></i></button>` : ''}
          ${esSuperUsuario ? `<button class="btn btn-outline-danger" onclick="eliminarRegistro(${item.id}, '${item.nombre}')" title="Borrar de la BD (Superusuario)"><i class="bi bi-trash-fill"></i></button>` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('kpi-total').innerText = `$${totalG.toFixed(2)}`;
  document.getElementById('kpi-count').innerText = vacunasG;
  document.getElementById('kpi-folios').innerText = foliosUnicos.size;
  document.getElementById('kpi-efectivo').innerText = `$${efectivoG.toFixed(2)}`;
  document.getElementById('kpi-otros').innerText = `$${otrosG.toFixed(2)}`;
}

function filtrarTabla() {
  const q = document.getElementById('filterInput').value.toLowerCase().trim();
  const fp = document.getElementById('filterPago').value;

  const filtrados = cobrosGuardados.filter(item => {
    const matchQ = !q || (item.nombre || '').toLowerCase().includes(q) || 
                   (item.familia || '').toLowerCase().includes(q) || 
                   (item.matricula || '').toLowerCase().includes(q) ||
                   (item.concepto || '').toLowerCase().includes(q) ||
                   (item.folio || '').toLowerCase().includes(q);
    const matchPago = fp === '' || item.forma_pago === fp;
    return matchQ && matchPago;
  });

  renderTablaHistorial(filtrados);
}

function exportarExcel() {
  if (cobrosGuardados.length === 0) {
    Swal.fire({ icon: 'info', title: 'Sin datos', text: 'No hay registros disponibles para exportar.', confirmButtonColor: '#1e3a8a' });
    return;
  }

  let csvContent = "\uFEFFFecha_Hora,Folio,Matricula,Nombre_Paciente,Familia,Seccion,Grupo,Concepto_Vacuna,Cantidad,Importe_Unitario,Total,Forma_Pago,Estado\n";

  cobrosGuardados.forEach(c => {
    const rawFecha = c.created_at || c.fecha || c.fecha_hora || c.timestamp;
    let fecha = '';
    if (rawFecha) {
      const d = new Date(rawFecha);
      if (!isNaN(d.getTime())) {
        fecha = d.toLocaleString('es-MX');
      }
    }
    const total = (c.cantidad || 1) * (c.importe || 0);
    const nom = (c.nombre || '').replace(/"/g, '""');
    const fam = (c.familia || '').replace(/"/g, '""');
    const con = (c.concepto || '').replace(/"/g, '""');

    csvContent += `"${fecha}","${c.folio || ''}","${c.matricula || ''}","${nom}","${fam}","${c.seccion || ''}","${c.grupo || ''}","${con}",${c.cantidad || 1},${c.importe || 0},${total},"${c.forma_pago || ''}","${c.estado || 'Activo'}"\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `Reporte_Vacunacion_CCM_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
