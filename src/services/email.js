import { env } from '../config/env.js';

// Envío de emails — preparado para integrar un proveedor real (Resend/SendGrid/SMTP).
// En modo MVP (sin EMAIL_PROVIDER configurado), se loguea por consola y se "simula".
export async function sendPasswordResetEmail(to, resetUrl) {
  const subject = 'Restablecé tu contraseña — EstéticaHub';
  const body = `Recibimos una solicitud para restablecer tu contraseña.\n\nAbrí este enlace (válido por 30 minutos):\n${resetUrl}\n\nSi no fuiste vos, ignorá este mensaje.`;

  if (!env.emailProvider || !env.emailApiKey) {
    console.log('[email:MOCK] Reset password →', to);
    console.log('[email:MOCK] URL →', resetUrl);
    return { sent: false, mocked: true };
  }

  // ── Integración real (ejemplo Resend) ────────────────────────────────────
  // const res = await fetch('https://api.resend.com/emails', {
  //   method: 'POST',
  //   headers: { Authorization: `Bearer ${env.emailApiKey}`, 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ from: env.emailFrom, to, subject, text: body }),
  // });
  // return { sent: res.ok };

  console.log('[email] (proveedor configurado pero no implementado) →', to, subject);
  return { sent: false, mocked: true };
}
