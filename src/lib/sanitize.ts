/**
 * Input sanitization utility for chat messages
 * Prevents XSS attacks by encoding HTML entities
 */

const MAX_MESSAGE_LENGTH = 5000;

/**
 * Sanitize chat message content to prevent XSS attacks
 * Encodes HTML entities and limits message length
 *
 * @param content - The message content to sanitize
 * @returns Sanitized message content
 */
export function sanitizeMessage(content: string): string {
  if (!content || typeof content !== 'string') {
    return '';
  }

  // Trim whitespace
  let sanitized = content.trim();

  // Encode HTML entities to prevent XSS
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');

  // Limit message length
  if (sanitized.length > MAX_MESSAGE_LENGTH) {
    sanitized = sanitized.slice(0, MAX_MESSAGE_LENGTH);
  }

  return sanitized;
}

/**
 * Validate message content
 *
 * @param content - The message content to validate
 * @returns Object with validation result and optional error message
 */
export function validateMessage(content: string): { valid: boolean; error?: string } {
  if (!content || typeof content !== 'string') {
    return { valid: false, error: 'Message content is required' };
  }

  const trimmed = content.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Message cannot be empty' };
  }

  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return {
      valid: false,
      error: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`,
    };
  }

  return { valid: true };
}
