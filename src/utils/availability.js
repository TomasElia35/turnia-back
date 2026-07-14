// Utilidades de disponibilidad por fecha del profesional.
// La disponibilidad se guarda en professionals.availability (jsonb):
//   { "YYYY-MM-DD": { "start": "HH:MM", "end": "HH:MM" } }

// Paso (en minutos) con que se generan los horarios dentro de una ventana.
export const SLOT_STEP_MIN = 30;

// Horarios por defecto cuando el profesional todavía NO configuró ninguna fecha.
// (Mismo set que map.js DEFAULT_SLOTS: mantiene el comportamiento previo.)
export const DEFAULT_SLOTS = ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isValidTime = (t) => typeof t === 'string' && HHMM.test(t);
export const isValidDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00`));

export const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
export const fromMin = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// Fecha "hoy" en formato YYYY-MM-DD. Se usa el mismo criterio (UTC) que el resto
// del backend (ver bookings.routes.js) para mantener consistencia.
export const todayStr = () => new Date().toISOString().split('T')[0];

// true si `date` (YYYY-MM-DD) es anterior a hoy → no editable.
export const isPastDate = (date) => date < todayStr();

// Genera los horarios "HH:MM" dentro de una ventana [start, end), cada SLOT_STEP_MIN.
export function generateSlots(start, end, step = SLOT_STEP_MIN) {
  if (!isValidTime(start) || !isValidTime(end)) return [];
  const s = toMin(start);
  const e = toMin(end);
  const out = [];
  for (let m = s; m < e; m += step) out.push(fromMin(m));
  return out;
}

// Normaliza/valida una ventana { start, end }. Devuelve { ok, error, window }.
export function validateWindow(start, end) {
  if (!isValidTime(start) || !isValidTime(end)) {
    return { ok: false, error: 'Horario inválido. Usá el formato HH:MM.' };
  }
  if (toMin(start) >= toMin(end)) {
    return { ok: false, error: 'La hora de inicio debe ser anterior a la de fin.' };
  }
  return { ok: true, window: { start, end } };
}

// Slots disponibles del profesional para una fecha, según su availability.
// - Si tiene alguna fecha configurada (mapa no vacío): régimen estricto.
//     · fecha con ventana → slots generados de esa ventana.
//     · fecha sin ventana → [] (no atiende ese día).
// - Si el mapa está vacío (nunca configuró): usa DEFAULT_SLOTS (compatibilidad).
export function slotsForDate(availability, date) {
  const map = availability && typeof availability === 'object' ? availability : {};
  const configured = Object.keys(map).length > 0;
  if (!configured) return [...DEFAULT_SLOTS];
  const win = map[date];
  if (!win || !isValidTime(win.start) || !isValidTime(win.end)) return [];
  return generateSlots(win.start, win.end);
}

// true si `time` (HH:MM) cae dentro de la ventana del profesional para esa fecha.
// Respeta la misma regla de compatibilidad que slotsForDate.
export function isWithinAvailability(availability, date, time) {
  const map = availability && typeof availability === 'object' ? availability : {};
  const configured = Object.keys(map).length > 0;
  if (!configured) return true; // sin configurar → no se restringe
  const win = map[date];
  if (!win || !isValidTime(win.start) || !isValidTime(win.end) || !isValidTime(time)) return false;
  const t = toMin(time);
  return t >= toMin(win.start) && t < toMin(win.end);
}
