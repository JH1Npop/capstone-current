/**
 * Formats a date value gracefully, handling null, undefined, and malformed strings
 * @param {string|Date|null|undefined} value - The date value to format
 * @returns {string} - Formatted date string or "—" if invalid
 */
export const formatDate = (value) => {
  if (!value) {
    return '—';
  }

  try {
    const date = new Date(value);

    // Check if the date is invalid
    if (isNaN(date.getTime())) {
      return '—';
    }

    return date.toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    return '—';
  }
};
