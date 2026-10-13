const FRIENDLY_FIELD_LABELS = {
  non_field_errors: '',
  errors: '',
  detail: '',
  error: '',
  service_type: 'Service',
  service_types: 'Services',
  location_address: 'Service location',
  scheduled_date: 'Schedule date',
  scheduled_time: 'Schedule time',
  assigned_to: 'Assigned staff',
  current_password: 'Current password',
  new_password: 'New password',
  password_confirm: 'Password confirmation',
};

const formatFieldLabel = (field) => {
  if (Object.prototype.hasOwnProperty.call(FRIENDLY_FIELD_LABELS, field)) {
    return FRIENDLY_FIELD_LABELS[field];
  }
  return String(field || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (character) => character.toUpperCase());
};

const collectApiErrorMessages = (value, field = '', messages = []) => {
  if (value == null) return messages;
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim();
    if (text) {
      const label = formatFieldLabel(field);
      messages.push(label ? `${label}: ${text}` : text);
    }
    return messages;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectApiErrorMessages(item, field, messages));
    return messages;
  }
  if (typeof value === 'object') {
    Object.entries(value).forEach(([nestedField, nestedValue]) => {
      collectApiErrorMessages(nestedValue, nestedField, messages);
    });
  }
  return messages;
};

export const getApiValidationErrors = (error) => {
  const messages = collectApiErrorMessages(error?.response?.data);
  return [...new Set(messages)];
};

export const getApiErrorMessage = (error, fallbackMessage = 'Something went wrong. Please try again.') => {
  if (!error?.response && error?.message && error.message !== 'Network Error') {
    return error.message;
  }
  if (!error?.response) return 'Unable to reach the server. Check your connection and try again.';
  if (error.response.status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (error.response.status >= 500) return `${fallbackMessage} The server encountered an error.`;

  const validationMessages = getApiValidationErrors(error);
  if (validationMessages.length) return validationMessages.join(' ');
  return fallbackMessage;
};
