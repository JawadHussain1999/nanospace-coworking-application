import { toast } from 'react-toastify';

/**
 * Trigger a success toast
 * @param {string} message
 * @param {object} options
 */
export const showSuccess = (message, options = {}) => {
  if (!message) return;
  return toast.success(message, {
    position: 'top-right',
    autoClose: 3500,
    ...options,
  });
};

/**
 * Trigger an error toast
 * @param {string|Error|object} error
 * @param {object} options
 */
export const showError = (error, options = {}) => {
  const message = typeof error === 'string'
    ? error
    : (error?.message || 'An unexpected error occurred.');
  if (!message) return;
  return toast.error(message, {
    position: 'top-right',
    autoClose: 4500,
    ...options,
  });
};

/**
 * Trigger an info toast
 * @param {string} message
 * @param {object} options
 */
export const showInfo = (message, options = {}) => {
  if (!message) return;
  return toast.info(message, {
    position: 'top-right',
    autoClose: 3500,
    ...options,
  });
};

/**
 * Trigger a warning toast
 * @param {string} message
 * @param {object} options
 */
export const showWarning = (message, options = {}) => {
  if (!message) return;
  return toast.warning(message, {
    position: 'top-right',
    autoClose: 3500,
    ...options,
  });
};

export { toast };
export default toast;
