import 'server-only';
import { Resend } from 'resend';
import { ApiError } from './api';

type Attachment = { filename: string; content: Buffer };

export async function sendEmail(opts: { to: string[]; subject: string; html: string; attachments?: Attachment[] }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) throw new ApiError(503, 'El envío de correo no está configurado (RESEND_API_KEY / EMAIL_FROM)');

  const resend = new Resend(key);
  const { data, error } = await resend.emails.send({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    attachments: opts.attachments,
  });
  if (error) throw new ApiError(502, `Error del proveedor de correo: ${error.message}`);
  return data?.id ?? null;
}
