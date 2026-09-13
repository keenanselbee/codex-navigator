// Public product boundary. Implementations and customer credentials stay private.
export interface LicenseStatus {
  state: 'notStarted' | 'trial' | 'trialExpired' | 'active' | 'offline' | 'validationRequired' | 'rejected' | 'recovery' | 'unavailable';
  allowed: boolean;
  message: string;
  endsAt?: number;
  refreshDue?: boolean;
  canActivate?: boolean;
  canStartTrial?: boolean;
  canDeactivate?: boolean;
}

export interface LicenseService {
  status(): Promise<LicenseStatus>;
  startTrial(): Promise<LicenseStatus>;
  activate(key: string): Promise<LicenseStatus>;
  refresh(force?: boolean): Promise<LicenseStatus>;
  deactivate(): Promise<LicenseStatus>;
  recover(portalConfirmed: boolean): Promise<LicenseStatus>;
}

export interface LicenseContext {
  directory: string;
  secrets: {
    get(key: string): PromiseLike<string | undefined>;
    store(key: string, value: string): PromiseLike<void>;
  };
}

export interface LicenseServices {
  manager: LicenseService;
  secretKey: string;
  product: { environment: 'production' | 'sandbox'; configured: boolean; checkoutUrl?: string; portalUrl?: string };
}

export type LicenseFactory = (context: LicenseContext) => LicenseServices;
