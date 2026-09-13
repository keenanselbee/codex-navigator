import { LicenseContext, LicenseServices } from './license-contracts';

// This is the sole composition boundary. Public component tests inject doubles;
// the production build must supply this module and never substitute a fallback.
export function createLicenseService(context: LicenseContext): LicenseServices {
  const implementation = require('./commercial/service') as { contractVersion: number; createLicenseService: (context: LicenseContext) => LicenseServices };
  if (implementation.contractVersion !== 1) throw new Error('The commercial implementation is incompatible. Reinstall the official Navigator release.');
  return implementation.createLicenseService(context);
}
