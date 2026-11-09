import { demoCustomers } from '../data/inventory';

export function getPaymentReminderUrl({ customer, phone, invoice, amount, due }) {
  const savedPhone = String(phone || '').trim();
  const directoryPhone = demoCustomers.find((entry) =>
    entry.name.trim().toLowerCase() === String(customer || '').trim().toLowerCase()
  )?.phone || '';
  const digits = (savedPhone || directoryPhone).replace(/\D/g, '');
  const whatsappNumber = digits.length === 10
    ? `91${digits}`
    : digits.length >= 11 && digits.length <= 15 ? digits : '';

  if (!whatsappNumber) return null;

  const message = [
    `Hello ${customer},`,
    'This is a friendly payment reminder from NanoSpace.',
    `Invoice: ${invoice}`,
    `Amount due: ${amount}`,
    `Due date: ${due}.`,
    'Please let us know once the payment has been completed. Thank you.',
  ].join('\n');

  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}
