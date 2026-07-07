'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const nodemailer = require('nodemailer');

const SMTP_USER = defineSecret('SMTP_USER');
const SMTP_PASS = defineSecret('SMTP_PASS');
const SMTP_FROM = defineSecret('SMTP_FROM');

exports.sendMemberEmail = onCall({ secrets: [SMTP_USER, SMTP_PASS, SMTP_FROM] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to send email.');
  }

  const { to, subject, body } = request.data || {};
  if (!to || !subject || !body) {
    throw new HttpsError('invalid-argument', 'to, subject, and body are required.');
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
      user: SMTP_USER.value(),
      pass: SMTP_PASS.value(),
    },
  });

  await transporter.sendMail({
    from: SMTP_FROM.value(),
    to,
    subject,
    text: body,
  });

  return { ok: true };
});
