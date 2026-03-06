const express = require('express');
const { db, ensureDefaultDataForUser } = require('./db');
const { authMiddleware } = require('./auth');

const router = express.Router();

router.use(authMiddleware);

function getUserId(req) {
  return req.user.id;
}

function calculateAppointmentAmounts(appointment, rateAmount, commissionPercent) {
  const isInstitution = appointment.mode === 'INSTITUTION';
  const total = rateAmount;
  const commission = isInstitution ? (rateAmount * commissionPercent) / 100 : 0;
  const netForProfessional = total - commission;
  return {
    total,
    commission,
    netForProfessional,
  };
}

router.get('/me', (req, res) => {
  res.json({ id: req.user.id, email: req.user.email });
});

router.get('/patients', (req, res) => {
  const userId = getUserId(req);
  const patients = db
    .prepare(
      `SELECT p.*, i.name as default_institution_name
       FROM patients p
       LEFT JOIN institutions i ON p.default_institution_id = i.id
       WHERE p.user_id = ?
       ORDER BY p.full_name`
    )
    .all(userId);
  res.json(patients);
});

router.post('/patients', (req, res) => {
  const userId = getUserId(req);
  const {
    full_name,
    phone,
    email,
    default_institution_id,
    clinical_history,
  } = req.body;
  if (!full_name || !phone) {
    return res
      .status(400)
      .json({ error: 'Nombre completo y teléfono son obligatorios' });
  }

  const result = db
    .prepare(
      `INSERT INTO patients (user_id, full_name, phone, email, default_institution_id, clinical_history)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      full_name,
      phone,
      email || null,
      default_institution_id || null,
      clinical_history || ''
    );

  const patient = db
    .prepare('SELECT * FROM patients WHERE id = ?')
    .get(result.lastInsertRowid);
  res.status(201).json(patient);
});

router.get('/patients/:id', (req, res) => {
  const userId = getUserId(req);
  const patient = db
    .prepare(
      `SELECT * FROM patients WHERE id = ? AND user_id = ?`
    )
    .get(req.params.id, userId);
  if (!patient) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  const appointments = db
    .prepare(
      `SELECT a.*, r.amount as rate_amount, r.name as rate_name,
              i.name as institution_name, i.commission_percent
       FROM appointments a
       JOIN rates r ON a.rate_id = r.id
       LEFT JOIN institutions i ON a.institution_id = i.id
       WHERE a.user_id = ? AND a.patient_id = ?
       ORDER BY a.date_time DESC`
    )
    .all(userId, patient.id);

  res.json({ patient, appointments });
});

router.put('/patients/:id', (req, res) => {
  const userId = getUserId(req);
  const { full_name, phone, email, default_institution_id, clinical_history } =
    req.body;

  const existing = db
    .prepare('SELECT * FROM patients WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId);
  if (!existing) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  db.prepare(
    `UPDATE patients
     SET full_name = ?, phone = ?, email = ?, default_institution_id = ?, clinical_history = ?
     WHERE id = ? AND user_id = ?`
  ).run(
    full_name || existing.full_name,
    phone || existing.phone,
    email || null,
    default_institution_id || null,
    clinical_history != null ? clinical_history : existing.clinical_history,
    req.params.id,
    userId
  );

  const updated = db
    .prepare('SELECT * FROM patients WHERE id = ?')
    .get(req.params.id);
  res.json(updated);
});

router.delete('/patients/:id', (req, res) => {
  const userId = getUserId(req);
  const info = db
    .prepare('DELETE FROM patients WHERE id = ? AND user_id = ?')
    .run(req.params.id, userId);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }
  res.json({ success: true });
});

router.get('/institutions', (req, res) => {
  const userId = getUserId(req);
  ensureDefaultDataForUser(userId);
  const institutions = db
    .prepare(
      `SELECT * FROM institutions
       WHERE user_id = ?
       ORDER BY is_default_particular DESC, name`
    )
    .all(userId);
  res.json(institutions);
});

router.post('/institutions', (req, res) => {
  const userId = getUserId(req);
  const { name, commission_percent } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'El nombre es obligatorio' });
  }

  const result = db
    .prepare(
      `INSERT INTO institutions (user_id, name, commission_percent, is_default_particular)
       VALUES (?, ?, ?, 0)`
    )
    .run(userId, name, commission_percent || 0);

  const institution = db
    .prepare('SELECT * FROM institutions WHERE id = ?')
    .get(result.lastInsertRowid);
  res.status(201).json(institution);
});

router.put('/institutions/:id', (req, res) => {
  const userId = getUserId(req);
  const { name, commission_percent } = req.body;
  const institution = db
    .prepare(
      'SELECT * FROM institutions WHERE id = ? AND user_id = ?'
    )
    .get(req.params.id, userId);
  if (!institution) {
    return res.status(404).json({ error: 'Institución no encontrada' });
  }
  if (institution.is_default_particular) {
    return res
      .status(400)
      .json({ error: 'La institución Particular (0%) no puede modificarse' });
  }

  db.prepare(
    `UPDATE institutions
     SET name = ?, commission_percent = ?
     WHERE id = ? AND user_id = ?`
  ).run(
    name || institution.name,
    commission_percent != null ? commission_percent : institution.commission_percent,
    req.params.id,
    userId
  );

  const updated = db
    .prepare('SELECT * FROM institutions WHERE id = ?')
    .get(req.params.id);
  res.json(updated);
});

router.delete('/institutions/:id', (req, res) => {
  const userId = getUserId(req);
  const institution = db
    .prepare(
      'SELECT * FROM institutions WHERE id = ? AND user_id = ?'
    )
    .get(req.params.id, userId);
  if (!institution) {
    return res.status(404).json({ error: 'Institución no encontrada' });
  }
  if (institution.is_default_particular) {
    return res
      .status(400)
      .json({ error: 'La institución Particular (0%) no puede eliminarse' });
  }

  db.prepare('DELETE FROM institutions WHERE id = ? AND user_id = ?').run(
    req.params.id,
    userId
  );
  res.json({ success: true });
});

router.get('/rates', (req, res) => {
  const userId = getUserId(req);
  ensureDefaultDataForUser(userId);
  const rates = db
    .prepare(
      'SELECT * FROM rates WHERE user_id = ? ORDER BY position ASC'
    )
    .all(userId);
  res.json(rates);
});

router.put('/rates/:id', (req, res) => {
  const userId = getUserId(req);
  const { name, amount } = req.body;
  const rate = db
    .prepare('SELECT * FROM rates WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId);
  if (!rate) {
    return res.status(404).json({ error: 'Tarifa no encontrada' });
  }

  db.prepare(
    `UPDATE rates
     SET name = ?, amount = ?
     WHERE id = ? AND user_id = ?`
  ).run(
    name || rate.name,
    amount != null ? amount : rate.amount,
    req.params.id,
    userId
  );

  const updated = db
    .prepare('SELECT * FROM rates WHERE id = ?')
    .get(req.params.id);
  res.json(updated);
});

router.get('/appointments', (req, res) => {
  const userId = getUserId(req);
  const { month } = req.query;

  let query = `
    SELECT a.*, p.full_name as patient_name,
           r.amount as rate_amount, r.name as rate_name,
           i.name as institution_name, i.commission_percent
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    JOIN rates r ON a.rate_id = r.id
    LEFT JOIN institutions i ON a.institution_id = i.id
    WHERE a.user_id = ?
  `;
  const params = [userId];

  if (month) {
    query +=
      ' AND strftime(\'%Y-%m\', a.date_time) = ?';
    params.push(month);
  }

  query += ' ORDER BY a.date_time ASC';

  const appointments = db.prepare(query).all(...params);
  res.json(appointments);
});

router.post('/appointments', (req, res) => {
  const userId = getUserId(req);
  const {
    patient_id,
    date_time,
    rate_id,
    mode,
    institution_id,
    is_paid,
    note,
  } = req.body;

  if (!patient_id || !date_time || !rate_id || !mode) {
    return res
      .status(400)
      .json({ error: 'Paciente, fecha/hora, tarifa y modalidad son obligatorios' });
  }

  const result = db
    .prepare(
      `INSERT INTO appointments
       (user_id, patient_id, institution_id, rate_id, date_time, mode, is_paid, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      patient_id,
      mode === 'INSTITUTION' ? institution_id || null : null,
      rate_id,
      date_time,
      mode,
      is_paid ? 1 : 0,
      note || null
    );

  const appointment = db
    .prepare('SELECT * FROM appointments WHERE id = ?')
    .get(result.lastInsertRowid);
  res.status(201).json(appointment);
});

router.put('/appointments/:id', (req, res) => {
  const userId = getUserId(req);
  const {
    patient_id,
    date_time,
    rate_id,
    mode,
    institution_id,
    is_paid,
    note,
  } = req.body;

  const existing = db
    .prepare('SELECT * FROM appointments WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId);
  if (!existing) {
    return res.status(404).json({ error: 'Turno no encontrado' });
  }

  db.prepare(
    `UPDATE appointments
     SET patient_id = ?, date_time = ?, rate_id = ?, mode = ?, institution_id = ?, is_paid = ?, note = ?
     WHERE id = ? AND user_id = ?`
  ).run(
    patient_id || existing.patient_id,
    date_time || existing.date_time,
    rate_id || existing.rate_id,
    mode || existing.mode,
    (mode || existing.mode) === 'INSTITUTION'
      ? institution_id || existing.institution_id
      : null,
    typeof is_paid === 'boolean' ? (is_paid ? 1 : 0) : existing.is_paid,
    note != null ? note : existing.note,
    req.params.id,
    userId
  );

  const updated = db
    .prepare('SELECT * FROM appointments WHERE id = ?')
    .get(req.params.id);
  res.json(updated);
});

router.delete('/appointments/:id', (req, res) => {
  const userId = getUserId(req);
  const info = db
    .prepare('DELETE FROM appointments WHERE id = ? AND user_id = ?')
    .run(req.params.id, userId);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'Turno no encontrado' });
  }
  res.json({ success: true });
});

router.get('/summary', (req, res) => {
  const userId = getUserId(req);
  const { month } = req.query;
  if (!month) {
    return res.status(400).json({ error: 'Se requiere el mes (YYYY-MM)' });
  }

  const appointments = db
    .prepare(
      `SELECT a.*, r.amount as rate_amount,
              i.name as institution_name, i.commission_percent
       FROM appointments a
       JOIN rates r ON a.rate_id = r.id
       LEFT JOIN institutions i ON a.institution_id = i.id
       WHERE a.user_id = ?
         AND strftime('%Y-%m', a.date_time) = ?
       ORDER BY a.date_time ASC`
    )
    .all(userId, month);

  let totalFacturado = 0;
  let totalCobrado = 0;
  let totalPendiente = 0;
  let totalPagarInstituciones = 0;
  let netoProfesional = 0;

  const porInstitucion = {};

  const hoy = new Date().toISOString().slice(0, 10);
  const turnosHoy = [];
  let proximoTurno = null;

  for (const a of appointments) {
    const {
      total,
      commission,
      netForProfessional,
    } = calculateAppointmentAmounts(
      a,
      a.rate_amount,
      a.commission_percent || 0
    );

    totalFacturado += total;
    totalPagarInstituciones += commission;
    netoProfesional += netForProfessional;

    if (a.is_paid) {
      totalCobrado += total;
    } else {
      totalPendiente += total;
    }

    if (a.mode === 'INSTITUTION' && a.institution_name) {
      if (!porInstitucion[a.institution_name]) {
        porInstitucion[a.institution_name] = 0;
      }
      porInstitucion[a.institution_name] += commission;
    }

    const dateOnly = a.date_time.slice(0, 10);
    if (dateOnly === hoy) {
      turnosHoy.push(a);
    }

    if (
      (!proximoTurno || a.date_time < proximoTurno.date_time) &&
      a.date_time >= new Date().toISOString()
    ) {
      proximoTurno = a;
    }
  }

  res.json({
    month,
    totals: {
      totalFacturado,
      totalCobrado,
      totalPendiente,
      totalPagarInstituciones,
      netoProfesional,
    },
    porInstitucion,
    turnos: appointments,
    turnosHoy,
    proximoTurno,
  });
});

module.exports = router;

