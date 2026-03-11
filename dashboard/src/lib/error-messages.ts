/**
 * Maps API error codes and messages to user-friendly descriptions with actionable steps.
 */

interface FriendlyError {
  title: string;
  description: string;
  action?: string;
}

const ERROR_MAP: Record<string, FriendlyError> = {
  // Auth errors
  'Invalid credentials': {
    title: 'Login failed',
    description: 'Email or password is incorrect.',
    action: 'Double-check your credentials and try again.',
  },
  'Token expired': {
    title: 'Session expired',
    description: 'Your login session has expired.',
    action: 'Please log in again to continue.',
  },
  'Not authenticated': {
    title: 'Not logged in',
    description: 'You need to be logged in to do this.',
    action: 'Please log in first.',
  },
  'Email already registered': {
    title: 'Account exists',
    description: 'This email is already registered.',
    action: 'Try logging in instead, or use a different email.',
  },

  // Project errors
  'Project not found': {
    title: 'Project not found',
    description: 'This project may have been deleted or doesn\'t exist.',
    action: 'Go back to the dashboard and try again.',
  },
  'Incorrect password': {
    title: 'Wrong password',
    description: 'The password you entered is incorrect.',
    action: 'Enter your account password to confirm this action.',
  },

  // Questionnaire / Generation
  'Please complete the questionnaire first': {
    title: 'Questionnaire incomplete',
    description: 'You need to answer the questionnaire before generating a listing.',
    action: 'Go back and fill in the required questions.',
  },

  // Credential errors
  'Credential not found': {
    title: 'Credential missing',
    description: 'This credential hasn\'t been set up yet.',
    action: 'Go to Setup and configure the required credentials.',
  },

  // Pipeline errors
  'Pipeline already running': {
    title: 'Pipeline in progress',
    description: 'A pipeline is already running for this project.',
    action: 'Wait for the current pipeline to complete, then try again.',
  },

  // Network / Generic
  'Failed to fetch': {
    title: 'Connection error',
    description: 'Could not reach the server.',
    action: 'Check your internet connection and try again.',
  },
  'Network request failed': {
    title: 'Network error',
    description: 'The request failed due to a network issue.',
    action: 'Check your connection and retry.',
  },
  'Request failed': {
    title: 'Something went wrong',
    description: 'The request could not be completed.',
    action: 'Try again. If the problem persists, refresh the page.',
  },
};

// HTTP status code fallbacks
const STATUS_CODE_MAP: Record<number, FriendlyError> = {
  400: {
    title: 'Invalid request',
    description: 'The data you submitted is not valid.',
    action: 'Check your inputs and try again.',
  },
  401: {
    title: 'Not authorized',
    description: 'Your session may have expired.',
    action: 'Please log in again.',
  },
  403: {
    title: 'Access denied',
    description: 'You don\'t have permission for this action.',
    action: 'Contact support if you believe this is an error.',
  },
  404: {
    title: 'Not found',
    description: 'The requested resource doesn\'t exist.',
    action: 'Go back and try again.',
  },
  429: {
    title: 'Too many requests',
    description: 'You\'ve made too many requests. Slow down.',
    action: 'Wait a moment and try again.',
  },
  500: {
    title: 'Server error',
    description: 'Something went wrong on our end.',
    action: 'Try again in a few seconds. If it persists, the team has been notified.',
  },
  502: {
    title: 'Server unavailable',
    description: 'The server is temporarily unavailable.',
    action: 'Wait a moment and refresh the page.',
  },
  503: {
    title: 'Service unavailable',
    description: 'The service is temporarily down for maintenance.',
    action: 'Try again in a few minutes.',
  },
};

export function getFriendlyError(error: unknown): FriendlyError {
  if (error instanceof Error) {
    const msg = error.message;

    // Check exact match first
    if (ERROR_MAP[msg]) return ERROR_MAP[msg];

    // Check partial match
    for (const [key, value] of Object.entries(ERROR_MAP)) {
      if (msg.toLowerCase().includes(key.toLowerCase())) return value;
    }

    // Return message as-is with generic wrapper
    return {
      title: 'Error',
      description: msg,
      action: 'Try again or refresh the page.',
    };
  }

  return {
    title: 'Unexpected error',
    description: 'Something went wrong.',
    action: 'Try again or refresh the page.',
  };
}

export function getFriendlyErrorByStatus(statusCode: number): FriendlyError {
  return STATUS_CODE_MAP[statusCode] || {
    title: `Error ${statusCode}`,
    description: 'An unexpected error occurred.',
    action: 'Try again or refresh the page.',
  };
}
