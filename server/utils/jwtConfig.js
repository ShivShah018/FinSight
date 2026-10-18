/**
 * JWT configuration and validation utility.
 * Ensures that JWT_SECRET_KEY is explicitly configured in the environment
 * and removes any insecure hardcoded fallback secrets.
 */

function getJwtSecret() {
  const secret = process.env.JWT_SECRET_KEY;
  if (!secret || typeof secret !== 'string' || secret.trim() === '') {
    throw new Error(
      'FATAL CONFIGURATION ERROR: JWT_SECRET_KEY environment variable is missing or empty. ' +
      'FinSight requires a secure JWT_SECRET_KEY to sign and verify authentication tokens. ' +
      'Please configure JWT_SECRET_KEY in your environment or .env file.'
    );
  }
  return secret.trim();
}

function validateJwtConfig() {
  getJwtSecret();
}

module.exports = {
  getJwtSecret,
  validateJwtConfig
};
