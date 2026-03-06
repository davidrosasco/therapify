const API_BASE = '/api';

let state = {
  user: null,
  tokenChecked: false,
  screen: 'loading',
  authMode: 'login',
  authError: '',
  month: new Date().toISOString().slice(0, 7),
  summary: null,
  patients: [],
  selectedPatientId: null,
  selectedPatientDetail: null,
  institutions: [],
  rates: [],
  appointments: [],
  formPatient: { full_name: '', phone: '', email: '', default_institution_id: '' },
  formAppointment: {
    id: null,
    patient_id: '',
    date: new Date().toISOString().slice(0, 10),
    time: '10:00',
    rate_id: '',
    mode: 'PARTICULAR',
    institution_id: '',
    is_paid: true,
    note: '',
  },
  formInstitution: { id: null, name: '', commission_percent: 0 },
  editingRateId: null,
};

let rateDebounceTimer = null;

async function api(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  if (res.status === 401) {
    state.user = null;
    state.screen = 'auth';
    render();
    throw new Error('No autenticado');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error || 'Error en la solicitud';
    throw new Error(msg);
  }
  return data;
}

function setState(partial) {
  state = { ...state, ...partial };
  render();
}

// Actualiza solo el estado de formularios sin redibujar la pantalla,
// para que los campos no pierdan el foco al escribir.
function updateFormOnly(partial) {
  state = { ...state, ...partial };
}

async function initAuthFromServer() {
  try {
    const user = await api('/auth/me', { method: 'GET' });
    state.user = user;
    state.screen = 'app';
    state.tokenChecked = true;
    await loadAllDataForMonth();
  } catch {
    state.user = null;
    state.screen = 'auth';
    state.tokenChecked = true;
    render();
  }
}

async function handleLoginOrRegister(e) {
  e.preventDefault();
  const email = e.target.email.value.trim();
  const password = e.target.password.value;
  if (!email || !password) return;

  setState({ authError: '' });

  try {
    const path =
      state.authMode === 'login' ? '/auth/login' : '/auth/register';
    const user = await api(path, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    state.user = user;
    state.screen = 'app';
    state.authError = '';
    render();
    await loadAllDataForMonth();
  } catch (err) {
    setState({ authError: err.message || 'Error de autenticación' });
  }
}

async function handleLogout() {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch {}
  setState({ user: null, screen: 'auth' });
}

async function loadAllDataForMonth() {
  const month = state.month;
  try {
    const [summary, patients, institutions, rates, appointments] =
      await Promise.all([
        api(`/summary?month=${month}`),
        api('/patients'),
        api('/institutions'),
        api('/rates'),
        api(`/appointments?month=${month}`),
      ]);
    state.summary = summary;
    state.patients = patients;
    state.institutions = institutions;
    state.rates = rates;
    state.appointments = appointments;
    if (!state.formAppointment.rate_id && rates.length > 0) {
      state.formAppointment.rate_id = String(rates[0].id);
    }
    render();
  } catch (err) {
    console.error(err);
  }
}

async function handleMonthChange(e) {
  state.month = e.target.value;
  render();
  await loadAllDataForMonth();
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDateTime(dateTime) {
  const d = new Date(dateTime);
  if (Number.isNaN(d.getTime())) return dateTime;
  return d.toLocaleString('es-AR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function calcAmounts(a) {
  const total = a.rate_amount;
  const commission = a.mode === 'INSTITUTION'
    ? (a.rate_amount * (a.commission_percent || 0)) / 100
    : 0;
  const netoProfesional = total - commission;
  return { total, commission, netoProfesional };
}

async function handleCreateOrUpdatePatient(e) {
  e.preventDefault();
  const isEdit = !!state.formPatient.id;
  const payload = {
    full_name: state.formPatient.full_name.trim(),
    phone: state.formPatient.phone.trim(),
    email: state.formPatient.email.trim() || null,
    default_institution_id:
      state.formPatient.default_institution_id || null,
    clinical_history: state.formPatient.clinical_history || '',
  };
  try {
    if (isEdit) {
      await api(`/patients/${state.formPatient.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } else {
      await api('/patients', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
    state.formPatient = {
      id: null,
      full_name: '',
      phone: '',
      email: '',
      default_institution_id: '',
      clinical_history: '',
    };
    render();
    await loadAllDataForMonth();
  } catch (err) {
    alert(err.message);
  }
}

async function handleSelectPatient(id) {
  state.selectedPatientId = id;
  render();
  try {
    const detail = await api(`/patients/${id}`);
    state.selectedPatientDetail = detail;
    state.formPatient = {
      id: detail.patient.id,
      full_name: detail.patient.full_name,
      phone: detail.patient.phone,
      email: detail.patient.email || '',
      default_institution_id:
        detail.patient.default_institution_id || '',
      clinical_history: detail.patient.clinical_history || '',
    };
    render();
  } catch (err) {
    console.error(err);
  }
}

async function handleDeletePatient(id) {
  if (!confirm('¿Eliminar paciente y sus turnos asociados?')) return;
  try {
    await api(`/patients/${id}`, { method: 'DELETE' });
    state.selectedPatientId = null;
    state.selectedPatientDetail = null;
    render();
    await loadAllDataForMonth();
  } catch (err) {
    alert(err.message);
  }
}

async function handleInstitutionSubmit(e) {
  e.preventDefault();
  const isEdit = !!state.formInstitution.id;
  const payload = {
    name: state.formInstitution.name.trim(),
    commission_percent: Number(state.formInstitution.commission_percent) || 0,
  };
  try {
    if (isEdit) {
      await api(`/institutions/${state.formInstitution.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } else {
      await api('/institutions', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
    state.formInstitution = { id: null, name: '', commission_percent: 0 };
    render();
    await loadAllDataForMonth();
  } catch (err) {
    alert(err.message);
  }
}

async function handleDeleteInstitution(id) {
  if (!confirm('¿Eliminar institución?')) return;
  try {
    await api(`/institutions/${id}`, { method: 'DELETE' });
    await loadAllDataForMonth();
  } catch (err) {
    alert(err.message);
  }
}

async function handleRateChange(rateId, fields) {
  try {
    await api(`/rates/${rateId}`, {
      method: 'PUT',
      body: JSON.stringify(fields),
    });
    await loadAllDataForMonth();
  } catch (err) {
    alert(err.message);
  }
}

function buildDateTime(date, time) {
  return `${date}T${time}:00`;
}

function splitDateTime(dateTime) {
  if (!dateTime) {
    return {
      date: new Date().toISOString().slice(0, 10),
      time: '10:00',
    };
  }
  const d = new Date(dateTime);
  if (Number.isNaN(d.getTime())) {
    return {
      date: dateTime.slice(0, 10),
      time: dateTime.slice(11, 16),
    };
  }
  const date = d.toISOString().slice(0, 10);
  const time = d.toTimeString().slice(0, 5);
  return { date, time };
}

async function handleAppointmentSubmit(e) {
  e.preventDefault();
  const isEdit = !!state.formAppointment.id;
  const payload = {
    patient_id: Number(state.formAppointment.patient_id),
    rate_id: Number(state.formAppointment.rate_id),
    mode: state.formAppointment.mode,
    institution_id:
      state.formAppointment.mode === 'INSTITUTION' &&
      state.formAppointment.institution_id
        ? Number(state.formAppointment.institution_id)
        : null,
    is_paid: !!state.formAppointment.is_paid,
    note: state.formAppointment.note || null,
    date_time: buildDateTime(
      state.formAppointment.date,
      state.formAppointment.time
    ),
  };

  try {
    if (isEdit) {
      await api(`/appointments/${state.formAppointment.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } else {
      await api('/appointments', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
    state.formAppointment = {
      id: null,
      patient_id: '',
      date: new Date().toISOString().slice(0, 10),
      time: '10:00',
      rate_id: state.rates[0] ? String(state.rates[0].id) : '',
      mode: 'PARTICULAR',
      institution_id: '',
      is_paid: true,
      note: '',
    };
    render();
    await loadAllDataForMonth();
  } catch (err) {
    alert(err.message);
  }
}

async function handleEditAppointment(a) {
  const { date, time } = splitDateTime(a.date_time);
  state.formAppointment = {
    id: a.id,
    patient_id: String(a.patient_id),
    date,
    time,
    rate_id: String(a.rate_id),
    mode: a.mode,
    institution_id: a.institution_id ? String(a.institution_id) : '',
    is_paid: !!a.is_paid,
    note: a.note || '',
  };
  render();
}

async function handleTogglePaid(a) {
  try {
    await api(`/appointments/${a.id}`, {
      method: 'PUT',
      body: JSON.stringify({ is_paid: !a.is_paid }),
    });
    await loadAllDataForMonth();
  } catch (err) {
    alert(err.message);
  }
}

async function handleDeleteAppointment(a) {
  if (!confirm('¿Eliminar turno?')) return;
  try {
    await api(`/appointments/${a.id}`, { method: 'DELETE' });
    await loadAllDataForMonth();
  } catch (err) {
    alert(err.message);
  }
}

function startNewAppointment(patientId) {
  const today = new Date().toISOString().slice(0, 10);
  const defaultRateId =
    state.rates[0]
      ? String(state.rates[0].id)
      : state.formAppointment.rate_id || '';

  state.formAppointment = {
    id: null,
    patient_id: patientId ? String(patientId) : '',
    date: today,
    time: '10:00',
    rate_id: defaultRateId,
    mode: 'PARTICULAR',
    institution_id: '',
    is_paid: true,
    note: '',
  };

  render();

  const formEl = document.getElementById('appointment-form');
  if (formEl) {
    formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (key === 'class') el.className = value;
    else if (key === 'onclick') el.onclick = value;
    else if (key === 'oninput') el.oninput = value;
    else if (key === 'onsubmit') el.onsubmit = value;
    else if (key === 'type') el.type = value;
    else if (key === 'value') el.value = value;
    else if (key === 'for') el.htmlFor = value;
    else if (key === 'checked') el.checked = !!value;
    else if (key === 'disabled') el.disabled = !!value;
    else if (key === 'placeholder') el.placeholder = value;
    else if (key.startsWith('data-')) el.setAttribute(key, value);
    else el.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      el.appendChild(document.createTextNode(String(child)));
    } else {
      el.appendChild(child);
    }
  }
  return el;
}

function renderAuth() {
  const app = document.getElementById('app');
  app.innerHTML = '';

  const form = h(
    'form',
    { onsubmit: handleLoginOrRegister },
    h('div', { class: 'logo-row' }, [
      h('div', { class: 'logo-mark' }, h('span', null, 'T')),
      h('div', null, [
        h('div', { class: 'logo-title' }, 'Therapify'),
        h(
          'div',
          { class: 'logo-subtitle' },
          'Agenda financiera para profesionales'
        ),
      ]),
    ]),
    h(
      'div',
      { style: 'display:flex;justify-content:space-between;align-items:center;margin:8px 0 10px' },
      [
        h('div', null, [
          h('div', { class: 'card-title' }, 'Bienvenido'),
          h(
            'div',
            { class: 'card-subtitle' },
            'Crea tu cuenta o inicia sesión para gestionar tu práctica.'
          ),
        ]),
        h(
          'div',
          { class: 'tabs' },
          h(
            'button',
            {
              type: 'button',
              class: 'tab ' + (state.authMode === 'login' ? 'is-active' : ''),
              onclick: () => setState({ authMode: 'login', authError: '' }),
            },
            'Iniciar sesión'
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'tab ' + (state.authMode === 'register' ? 'is-active' : ''),
              onclick: () => setState({ authMode: 'register', authError: '' }),
            },
            'Crear cuenta'
          )
        )
      ]
    ),
    state.authError
      ? h('div', { class: 'error-banner' }, state.authError)
      : null,
    h('div', { class: 'field-group' }, [
      h('label', { class: 'field-label', for: 'email' }, [
        h('span', null, 'Email'),
      ]),
      h('input', {
        id: 'email',
        name: 'email',
        type: 'email',
        required: true,
        class: 'field-input',
        placeholder: 'nombre@ejemplo.com',
      }),
    ]),
    h('div', { class: 'field-group' }, [
      h(
        'label',
        { class: 'field-label', for: 'password' },
        h('span', null, 'Contraseña'),
        h('span', null, 'Mínimo 6 caracteres')
      ),
      h('input', {
        id: 'password',
        name: 'password',
        type: 'password',
        minlength: 6,
        required: true,
        class: 'field-input',
        placeholder: '••••••••',
      }),
    ]),
    h(
      'button',
      { type: 'submit', class: 'primary-btn', style: 'margin-top:6px' },
      state.authMode === 'login' ? 'Entrar' : 'Crear cuenta'
    ),
    h(
      'div',
      { class: 'hint', style: 'margin-top:8px' },
      'Therapify está pensado para psicólogos y profesionales de salud mental. Sin configuraciones técnicas: solo tus pacientes, turnos y números claros.'
    )
  );

  const side = h(
    'div',
    { class: 'auth-side' },
    h('div', { class: 'tag' }, [
      h('span', { class: 'tag-dot' }),
      h('span', null, 'Diseñado para la consulta privada'),
    ]),
    h(
      'div',
      { class: 'section-title' },
      'Tu práctica, en una sola vista'
    ),
    h(
      'div',
      { class: 'text-soft' },
      'Therapify organiza tus pacientes, turnos e ingresos para que puedas concentrarte en lo clínico, no en las planillas.'
    ),
    h('div', { class: 'chip-row' }, [
      h('span', { class: 'small-chip' }, 'Turnos del día'),
      h('span', { class: 'small-chip' }, 'Pendientes de cobro'),
      h('span', { class: 'small-chip' }, 'Instituciones y porcentajes'),
      h('span', { class: 'small-chip' }, 'Historia clínica por paciente'),
    ]),
    h(
      'div',
      { class: 'hint' },
      'Más adelante podrás activar recordatorios automáticos, reportes avanzados y exportaciones en PDF sin cambiar tu flujo actual.'
    )
  );

  const shell = h('div', { class: 'auth-shell' }, form, side);
  app.appendChild(shell);
}

function renderDashboard() {
  const app = document.getElementById('app');
  app.innerHTML = '';

  const userInitial =
    state.user && state.user.email
      ? state.user.email.charAt(0).toUpperCase()
      : '?';

  const topBar = h(
    'div',
    { class: 'top-bar' },
    h('div', null, [
      h('div', { class: 'logo-row' }, [
        h('div', { class: 'logo-mark' }, h('span', null, 'T')),
        h('div', null, [
          h('div', { class: 'logo-title' }, 'Therapify'),
          h(
            'div',
            { class: 'logo-subtitle' },
            'Panel de práctica privada'
          ),
        ]),
      ]),
    ]),
    h('div', { class: 'top-user' }, [
      h('span', { class: 'pill' }, state.user.email),
      h('div', { class: 'avatar' }, userInitial),
      h(
        'button',
        { class: 'ghost-btn', onclick: handleLogout },
        'Cerrar sesión'
      ),
    ])
  );

  const summary = state.summary;

  const summaryCard = h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-header' }, [
      h('div', null, [
        h('div', { class: 'card-title' }, 'Resumen financiero'),
        h(
          'div',
          { class: 'card-subtitle' },
          'Totales del mes seleccionado'
        ),
      ]),
      h('div', { class: 'month-selector' }, [
        h('span', null, 'Mes'),
        h('input', {
          type: 'month',
          value: state.month,
          oninput: handleMonthChange,
        }),
      ]),
    ]),
    h('div', { class: 'summary-grid' }, [
      h('div', { class: 'summary-item' }, [
        h('div', { class: 'summary-label' }, 'Total facturado'),
        h(
          'div',
          { class: 'summary-value' },
          summary ? formatCurrency(summary.totals.totalFacturado) : '—'
        ),
      ]),
      h('div', { class: 'summary-item' }, [
        h('div', { class: 'summary-label' }, 'Cobrado'),
        h(
          'div',
          { class: 'summary-value' },
          summary ? formatCurrency(summary.totals.totalCobrado) : '—'
        ),
      ]),
      h('div', { class: 'summary-item' }, [
        h('div', { class: 'summary-label' }, 'Pendiente'),
        h(
          'div',
          { class: 'summary-value' },
          summary ? formatCurrency(summary.totals.totalPendiente) : '—'
        ),
      ]),
    ]),
    h('div', { class: 'summary-grid', style: 'margin-top:10px' }, [
      h('div', { class: 'summary-item' }, [
        h('div', { class: 'summary-label' }, 'A pagar a instituciones'),
        h(
          'div',
          { class: 'summary-value' },
          summary
            ? formatCurrency(summary.totals.totalPagarInstituciones)
            : '—'
        ),
      ]),
      h('div', { class: 'summary-item' }, [
        h('div', { class: 'summary-label' }, 'Neto profesional'),
        h(
          'div',
          { class: 'summary-value' },
          summary ? formatCurrency(summary.totals.netoProfesional) : '—'
        ),
      ]),
      h('div', { class: 'summary-item' }, [
        h('div', { class: 'summary-label' }, 'Turnos del mes'),
        h(
          'div',
          { class: 'summary-value' },
          summary ? summary.turnos.length : '—'
        ),
      ]),
    ]),
    summary && summary.porInstitucion && Object.keys(summary.porInstitucion).length > 0
      ? h('div', { class: 'summary-by-institution', style: 'margin-top:12px' }, [
          h('div', { class: 'card-subtitle', style: 'margin-bottom:6px' }, 'A pagar por institución'),
          h(
            'div',
            { class: 'list', style: 'max-height:160px' },
            Object.entries(summary.porInstitucion).map(([nombre, monto]) =>
              h('div', { class: 'list-item' }, [
                h('div', { class: 'list-item-title' }, nombre),
                h('div', { class: 'list-item-meta' }, formatCurrency(monto)),
              ])
            )
          ),
        ])
      : null,
    h('div', { class: 'summary-chip-row' }, [
      summary && summary.proximoTurno
        ? h(
            'div',
            { class: 'summary-chip' },
            'Próximo turno: ',
            formatDateTime(summary.proximoTurno.date_time),
            ' · ',
            summary.proximoTurno.patient_id
          )
        : h(
            'div',
            { class: 'summary-chip muted' },
            'Sin próximos turnos registrados'
          ),
    ])
  );

  const todayCard = h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-header' }, [
      h('div', null, [
        h('div', { class: 'card-title' }, 'Turnos del día'),
        h(
          'div',
          { class: 'card-subtitle' },
          'Lo que tenés agendado para hoy'
        ),
      ]),
    ]),
    h('div', null, [
      summary && summary.turnosHoy.length > 0
        ? h(
            'div',
            { class: 'list' },
            summary.turnosHoy.map((t) => {
              const amounts = calcAmounts(t);
              return h('div', { class: 'list-item' }, [
                h(
                  'div',
                  { class: 'list-item-title' },
                  formatDateTime(t.date_time)
                ),
                h(
                  'div',
                  { class: 'list-item-meta' },
                  `${t.patient_name || 'Paciente'} · ${t.rate_name} · ${formatCurrency(
                    amounts.netoProfesional
                  )}`
                ),
                h('div', { class: 'chip-row' }, [
                  h(
                    'span',
                    {
                      class:
                        'badge ' +
                        (t.is_paid ? 'badge-success' : 'badge-muted'),
                    },
                    t.is_paid ? 'Cobrado' : 'A cobrar'
                  ),
                  h(
                    'span',
                    { class: 'chip-mode' },
                    t.mode === 'PARTICULAR'
                      ? 'Particular'
                      : `Institución · ${t.institution_name || ''}`
                  ),
                ]),
              ]);
            })
          )
        : h(
            'div',
            { class: 'hint' },
            'Hoy no hay turnos agendados o no hay turnos en este mes.'
          ),
    ])
  );

  const appointmentsTable = h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-header' }, [
      h('div', null, [
        h('div', { class: 'card-title' }, 'Turnos del mes'),
        h(
          'div',
          { class: 'card-subtitle' },
          'Podés marcar, editar o eliminar turnos sin salir del panel.'
        ),
      ]),
      h('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap' }, [
        h('div', { class: 'month-selector' }, [
          h('span', null, 'Mes'),
          h('input', {
            type: 'month',
            value: state.month,
            oninput: handleMonthChange,
          }),
        ]),
        h(
          'button',
          {
            type: 'button',
            class: 'primary-btn',
            style: 'width:auto;padding:6px 12px;font-size:12px',
            onclick: () => startNewAppointment(null),
          },
          'Agendar turno'
        ),
      ]),
    ]),
    h(
      'table',
      { class: 'table' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', null, 'Fecha'),
          h('th', null, 'Paciente'),
          h('th', null, 'Modalidad'),
          h('th', null, 'Importe'),
          h('th', null, 'Estado'),
          h('th', null, ''),
          h('th', null, '')
        )
      ),
      h(
        'tbody',
        null,
        state.appointments.map((a) => {
          const amounts = calcAmounts(a);
          return h(
            'tr',
            null,
            h('td', null, formatDateTime(a.date_time)),
            h('td', null, a.patient_name || 'Paciente'),
            h(
              'td',
              null,
              h(
                'span',
                { class: 'chip-mode' },
                a.mode === 'PARTICULAR'
                  ? 'Particular'
                  : `Institución · ${a.institution_name || ''}`
              )
            ),
            h('td', null, formatCurrency(amounts.netoProfesional)),
            h(
              'td',
              null,
              h(
                'span',
                {
                  class:
                    'badge ' +
                    (a.is_paid ? 'badge-success' : 'badge-muted'),
                },
                a.is_paid ? 'Cobrado' : 'Pendiente'
              )
            ),
            h(
              'td',
              null,
              h(
                'button',
                {
                  class: 'icon-btn',
                  onclick: () => handleTogglePaid(a),
                },
                a.is_paid ? 'Marcar pendiente' : 'Marcar cobrado'
              )
            ),
            h(
              'td',
              null,
              h(
                'button',
                {
                  class: 'icon-btn',
                  onclick: () => handleEditAppointment(a),
                },
                'Editar'
              ),
              ' ',
              h(
                'button',
                {
                  class: 'icon-btn icon-btn-danger',
                  onclick: () => handleDeleteAppointment(a),
                },
                'Eliminar'
              )
            )
          );
        })
      )
    )
  );

  const appointmentForm = h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-header' }, [
      h('div', null, [
        h(
          'div',
          { class: 'card-title' },
          state.formAppointment.id ? 'Editar turno' : 'Nuevo turno'
        ),
        h(
          'div',
          { class: 'card-subtitle' },
          'En un solo paso defines paciente, modalidad y estado de pago.'
        ),
      ]),
    ]),
    h(
      'form',
      { id: 'appointment-form', onsubmit: handleAppointmentSubmit },
      h('div', { class: 'split' }, [
        h('div', null, [
          h('div', { class: 'field-group' }, [
            h(
              'label',
              { class: 'field-label', for: 'appointment-patient' },
              'Paciente'
            ),
            h(
              'select',
              {
                id: 'appointment-patient',
                class: 'field-select',
                required: true,
                value: state.formAppointment.patient_id,
                oninput: (e) =>
                  updateFormOnly({
                    formAppointment: {
                      ...state.formAppointment,
                      patient_id: e.target.value,
                    },
                  }),
              },
              h('option', { value: '' }, 'Selecciona un paciente'),
              state.patients.map((p) =>
                h('option', { value: p.id }, p.full_name)
              )
            ),
          ]),
          h('div', { class: 'field-group' }, [
            h(
              'label',
              { class: 'field-label', for: 'appointment-date' },
              'Fecha'
            ),
            h('input', {
              id: 'appointment-date',
              type: 'date',
              required: true,
              class: 'field-input',
              value: state.formAppointment.date,
              oninput: (e) =>
                updateFormOnly({
                  formAppointment: {
                    ...state.formAppointment,
                    date: e.target.value,
                  },
                }),
            }),
          ]),
          h('div', { class: 'field-group' }, [
            h(
              'label',
              { class: 'field-label', for: 'appointment-time' },
              'Hora'
            ),
            h('input', {
              id: 'appointment-time',
              type: 'time',
              required: true,
              class: 'field-input',
              value: state.formAppointment.time,
              oninput: (e) =>
                updateFormOnly({
                  formAppointment: {
                    ...state.formAppointment,
                    time: e.target.value,
                  },
                }),
            }),
          ]),
        ]),
        h('div', null, [
          h('div', { class: 'field-group' }, [
            h(
              'label',
              { class: 'field-label', for: 'appointment-rate' },
              'Tarifa'
            ),
            h(
              'select',
              {
                id: 'appointment-rate',
                class: 'field-select',
                required: true,
                value: state.formAppointment.rate_id,
                oninput: (e) =>
                  updateFormOnly({
                    formAppointment: {
                      ...state.formAppointment,
                      rate_id: e.target.value,
                    },
                  }),
              },
              state.rates.map((r) =>
                h(
                  'option',
                  { value: r.id },
                  `${r.name} · ${formatCurrency(r.amount)}`
                )
              )
            ),
          ]),
          h('div', { class: 'field-group' }, [
            h('div', { class: 'field-label' }, 'Modalidad'),
            h('div', { class: 'pill-group' }, [
              h(
                'button',
                {
                  type: 'button',
                  class:
                    'pill-option ' +
                    (state.formAppointment.mode === 'PARTICULAR'
                      ? 'is-active'
                      : ''),
                  onclick: () =>
                    setState({
                      formAppointment: {
                        ...state.formAppointment,
                        mode: 'PARTICULAR',
                      },
                    }),
                },
                'Particular (0%)'
              ),
              h(
                'button',
                {
                  type: 'button',
                  class:
                    'pill-option ' +
                    (state.formAppointment.mode === 'INSTITUTION'
                      ? 'is-active'
                      : ''),
                  onclick: () =>
                    setState({
                      formAppointment: {
                        ...state.formAppointment,
                        mode: 'INSTITUTION',
                      },
                    }),
                },
                'Por institución'
              ),
            ]),
          ]),
          state.formAppointment.mode === 'INSTITUTION'
            ? h('div', { class: 'field-group' }, [
                h(
                  'label',
                  { class: 'field-label', for: 'appointment-inst' },
                  'Institución'
                ),
                h(
                  'select',
                  {
                    id: 'appointment-inst',
                    class: 'field-select',
                    required: true,
                    value: state.formAppointment.institution_id,
                    oninput: (e) =>
                      updateFormOnly({
                        formAppointment: {
                          ...state.formAppointment,
                          institution_id: e.target.value,
                        },
                      }),
                  },
                  state.institutions.map((i) =>
                    h(
                      'option',
                      { value: i.id },
                      `${i.name} · ${i.commission_percent}%`
                    )
                  )
                ),
              ])
            : null,
          h('div', { class: 'field-group' }, [
            h('div', { class: 'field-label' }, 'Estado de pago'),
            h('div', { class: 'pill-group' }, [
              h(
                'button',
                {
                  type: 'button',
                  class:
                    'pill-option ' +
                    (state.formAppointment.is_paid ? 'is-active' : ''),
                  onclick: () =>
                    setState({
                      formAppointment: {
                        ...state.formAppointment,
                        is_paid: true,
                      },
                    }),
                },
                'Cobrado'
              ),
              h(
                'button',
                {
                  type: 'button',
                  class:
                    'pill-option ' +
                    (!state.formAppointment.is_paid ? 'is-active' : ''),
                  onclick: () =>
                    setState({
                      formAppointment: {
                        ...state.formAppointment,
                        is_paid: false,
                      },
                    }),
                },
                'Pendiente'
              ),
            ]),
          ]),
        ]),
      ]),
      h('div', { class: 'field-group' }, [
        h(
          'label',
          { class: 'field-label', for: 'appointment-note' },
          'Observación breve'
        ),
        h('textarea', {
          id: 'appointment-note',
          class: 'field-textarea',
          placeholder: 'Notas clínicas o administrativas que quieras recordar...',
          value: state.formAppointment.note,
          oninput: (e) =>
            updateFormOnly({
              formAppointment: {
                ...state.formAppointment,
                note: e.target.value,
              },
            }),
        }),
      ]),
      h('div', { class: 'actions-row' }, [
        state.formAppointment.id
          ? h(
              'button',
              {
                type: 'button',
                class: 'icon-btn',
                onclick: () => {
                  state.formAppointment = {
                    id: null,
                    patient_id: '',
                    date: new Date().toISOString().slice(0, 10),
                    time: '10:00',
                    rate_id: state.rates[0]
                      ? String(state.rates[0].id)
                      : '',
                    mode: 'PARTICULAR',
                    institution_id: '',
                    is_paid: true,
                    note: '',
                  };
                  render();
                },
              },
              'Cancelar edición'
            )
          : null,
        h(
          'button',
          { type: 'submit', class: 'primary-btn', style: 'width:auto' },
          state.formAppointment.id ? 'Guardar cambios' : 'Agregar turno'
        ),
      ])
    )
  );

  const institutionsCard = h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-header' }, [
      h('div', null, [
        h('div', { class: 'card-title' }, 'Instituciones'),
        h(
          'div',
          { class: 'card-subtitle' },
          'Configura porcentajes una sola vez. El sistema recalcula todos los totales.'
        ),
      ]),
    ]),
    h(
      'div',
      { class: 'list' },
      state.institutions.map((i) =>
        h('div', { class: 'list-item' }, [
          h('div', { class: 'list-item-title' }, i.name),
          h(
            'div',
            { class: 'list-item-meta' },
            `Comisión: ${i.commission_percent}%`
          ),
          !i.is_default_particular
            ? h('div', { class: 'actions-row' }, [
                h(
                  'button',
                  {
                    class: 'icon-btn',
                    onclick: () => {
                      state.formInstitution = {
                        id: i.id,
                        name: i.name,
                        commission_percent: i.commission_percent,
                      };
                      render();
                    },
                  },
                  'Editar'
                ),
                h(
                  'button',
                  {
                    class: 'icon-btn icon-btn-danger',
                    onclick: () => handleDeleteInstitution(i.id),
                  },
                  'Eliminar'
                ),
              ])
            : h(
                'div',
                { class: 'hint' },
                'La opción Particular (0%) siempre está disponible.'
              ),
        ])
      )
    ),
    h(
      'form',
      { onsubmit: handleInstitutionSubmit, style: 'margin-top:8px' },
      h('div', { class: 'field-group' }, [
        h('label', { class: 'field-label', for: 'inst-name' }, 'Nombre'),
        h('input', {
          id: 'inst-name',
          required: true,
          class: 'field-input',
          value: state.formInstitution.name,
          oninput: (e) =>
            updateFormOnly({
              formInstitution: {
                ...state.formInstitution,
                name: e.target.value,
              },
            }),
          placeholder: 'Obra social, prepaga, institución...',
        }),
      ]),
      h('div', { class: 'field-group' }, [
        h(
          'label',
          { class: 'field-label', for: 'inst-commission' },
          'Porcentaje de comisión'
        ),
        h('input', {
          id: 'inst-commission',
          type: 'number',
          min: 0,
          max: 100,
          step: 0.5,
          class: 'field-input',
          value: state.formInstitution.commission_percent,
          oninput: (e) =>
            updateFormOnly({
              formInstitution: {
                ...state.formInstitution,
                commission_percent: e.target.value,
              },
            }),
        }),
      ]),
      h('div', { class: 'actions-row' }, [
        state.formInstitution.id
          ? h(
              'button',
              {
                type: 'button',
                class: 'icon-btn',
                onclick: () => {
                  state.formInstitution = {
                    id: null,
                    name: '',
                    commission_percent: 0,
                  };
                  render();
                },
              },
              'Cancelar'
            )
          : null,
        h(
          'button',
          { type: 'submit', class: 'primary-btn', style: 'width:auto' },
          state.formInstitution.id ? 'Guardar institución' : 'Agregar institución'
        ),
      ])
    )
  );

  const ratesCard = h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-header' }, [
      h('div', null, [
        h('div', { class: 'card-title' }, 'Tarifas'),
        h(
          'div',
          { class: 'card-subtitle' },
          'Hasta tres tarifas. Podés cambiarlas cuando necesites.'
        ),
      ]),
    ]),
    state.rates.map((r) =>
      h('div', { class: 'field-group' }, [
        h('label', { class: 'field-label' }, r.name),
        h('input', {
          type: 'number',
          min: 0,
          step: 100,
          class: 'field-input',
          value: r.amount,
          oninput: (e) => {
            const v = Number(e.target.value) || 0;
            state.rates = state.rates.map((x) =>
              x.id === r.id ? { ...x, amount: v } : x
            );
            clearTimeout(rateDebounceTimer);
            rateDebounceTimer = setTimeout(
              () => handleRateChange(r.id, { amount: v }),
              600
            );
          },
        }),
      ])
    ),
    h(
      'div',
      { class: 'hint' },
      'Cada cambio impacta automáticamente en los cálculos del mes.'
    )
  );

  const patientsCard = h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-header' }, [
      h('div', null, [
        h('div', { class: 'card-title' }, 'Pacientes'),
        h(
          'div',
          { class: 'card-subtitle' },
          'Registro simple pensado para uso clínico diario.'
        ),
      ]),
    ]),
    h(
      'div',
      { class: 'split' },
      h(
        'div',
        null,
        h(
          'div',
          { class: 'list' },
          state.patients.map((p) =>
            h(
              'div',
              {
                class:
                  'list-item' +
                  (state.selectedPatientId === p.id
                    ? ' selected'
                    : ''),
                onclick: () => handleSelectPatient(p.id),
              },
              h('div', { class: 'list-item-title' }, p.full_name),
              h(
                'div',
                { class: 'list-item-meta' },
                `${p.phone} · ${p.email || 'sin email'}`
              ),
              h(
                'div',
                { class: 'actions-row' },
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'icon-btn',
                    onclick: (e) => {
                      e.stopPropagation();
                      handleSelectPatient(p.id);
                      startNewAppointment(p.id);
                    },
                  },
                  'Agendar turno'
                )
              )
            )
          )
        )
      ),
      h(
        'div',
        null,
        h(
          'form',
          { onsubmit: handleCreateOrUpdatePatient },
          h(
            'div',
            { class: 'section-title' },
            state.formPatient.id ? 'Editar paciente' : 'Nuevo paciente'
          ),
          h('div', { class: 'field-group' }, [
            h(
              'label',
              { class: 'field-label', for: 'patient-name' },
              'Nombre completo'
            ),
            h('input', {
              id: 'patient-name',
              required: true,
              class: 'field-input',
              value: state.formPatient.full_name,
              oninput: (e) =>
                updateFormOnly({
                  formPatient: {
                    ...state.formPatient,
                    full_name: e.target.value,
                  },
                }),
            }),
          ]),
          h('div', { class: 'field-group' }, [
            h(
              'label',
              { class: 'field-label', for: 'patient-phone' },
              'Teléfono'
            ),
            h('input', {
              id: 'patient-phone',
              required: true,
              class: 'field-input',
              value: state.formPatient.phone,
              oninput: (e) =>
                updateFormOnly({
                  formPatient: {
                    ...state.formPatient,
                    phone: e.target.value,
                  },
                }),
            }),
          ]),
          h('div', { class: 'field-group' }, [
            h(
              'label',
              { class: 'field-label', for: 'patient-email' },
              'Email (opcional)'
            ),
            h('input', {
              id: 'patient-email',
              type: 'email',
              class: 'field-input',
              value: state.formPatient.email,
              oninput: (e) =>
                updateFormOnly({
                  formPatient: {
                    ...state.formPatient,
                    email: e.target.value,
                  },
                }),
            }),
          ]),
          h('div', { class: 'field-group' }, [
            h(
              'label',
              { class: 'field-label', for: 'patient-inst' },
              'Institución habitual (opcional)'
            ),
            h(
              'select',
              {
                id: 'patient-inst',
                class: 'field-select',
                value: state.formPatient.default_institution_id || '',
                oninput: (e) =>
                  updateFormOnly({
                    formPatient: {
                      ...state.formPatient,
                      default_institution_id: e.target.value || '',
                    },
                  }),
              },
              h('option', { value: '' }, 'Ninguna'),
              state.institutions.map((i) =>
                h('option', { value: i.id }, i.name)
              )
            ),
          ]),
          h('div', { class: 'field-group' }, [
            h(
              'label',
              { class: 'field-label', for: 'patient-history' },
              'Historia clínica'
            ),
            h('textarea', {
              id: 'patient-history',
              class: 'field-textarea textarea-auto',
              placeholder:
                'Podés escribir libremente y actualizar cuando quieras. Se guarda cada vez que guardas el paciente.',
              value: state.formPatient.clinical_history || '',
              oninput: (e) =>
                updateFormOnly({
                  formPatient: {
                    ...state.formPatient,
                    clinical_history: e.target.value,
                  },
                }),
            }),
          ]),
          h('div', { class: 'actions-row' }, [
            state.formPatient.id
              ? h(
                  'button',
                  {
                    type: 'button',
                    class: 'icon-btn',
                    onclick: () => {
                      if (
                        state.selectedPatientDetail &&
                        state.selectedPatientDetail.patient
                      ) {
                        state.formPatient = {
                          id: state.selectedPatientDetail.patient.id,
                          full_name:
                            state.selectedPatientDetail.patient.full_name,
                          phone: state.selectedPatientDetail.patient.phone,
                          email: state.selectedPatientDetail.patient.email || '',
                          default_institution_id:
                            state.selectedPatientDetail.patient
                              .default_institution_id || '',
                          clinical_history:
                            state.selectedPatientDetail.patient
                              .clinical_history || '',
                        };
                      } else {
                        state.formPatient = {
                          id: null,
                          full_name: '',
                          phone: '',
                          email: '',
                          default_institution_id: '',
                          clinical_history: '',
                        };
                      }
                      render();
                    },
                  },
                  'Revertir cambios'
                )
              : null,
            state.formPatient.id
              ? h(
                  'button',
                  {
                    type: 'button',
                    class: 'icon-btn icon-btn-danger',
                    onclick: () =>
                      handleDeletePatient(state.formPatient.id),
                  },
                  'Eliminar paciente'
                )
              : null,
            h(
              'button',
              { type: 'submit', class: 'primary-btn', style: 'width:auto' },
              state.formPatient.id ? 'Guardar paciente' : 'Agregar paciente'
            ),
          ])
        )
      )
    )
  );

  const agendaSection = h(
    'div',
    { class: 'layout-main', style: 'max-width:100%' },
    todayCard,
    appointmentsTable,
    appointmentForm
  );

  const institutionsRatesRow = h(
    'div',
    { class: 'grid-two-cols', style: 'margin-top:12px' },
    institutionsCard,
    ratesCard
  );

  const shell = h('div', { class: 'app-shell' }, [
    h('div', { style: 'flex:1;display:flex;flex-direction:column;gap:12px' }, [
      topBar,
      agendaSection,
      h('div', { style: 'margin-top:12px' }, patientsCard),
      institutionsRatesRow,
      h('div', { style: 'margin-top:12px' }, summaryCard),
    ]),
  ]);

  app.appendChild(shell);
}

function render() {
  if (!state.tokenChecked && state.screen === 'loading') {
    const app = document.getElementById('app');
    app.innerHTML = '<div style="margin:auto;color:#e5e7eb">Cargando...</div>';
    return;
  }

  if (!state.user) {
    renderAuth();
  } else {
    renderDashboard();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  render();
  initAuthFromServer();
});

