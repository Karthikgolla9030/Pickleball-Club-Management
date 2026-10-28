/**
 * TypeScript declaration for Cashfree Web JS SDK loader (@cashfreepayments/cashfree-js)
 */

declare module '@cashfreepayments/cashfree-js' {
  export interface CashfreeCheckoutOptions {
    paymentSessionId: string;
    redirectTarget?: '_self' | '_modal' | '_blank';
    values?: Record<string, any>;
  }

  export interface CashfreeInstance {
    checkout(options: CashfreeCheckoutOptions): Promise<{
      error?: {
        message?: string;
        code?: string;
      };
      redirect?: boolean;
      paymentDetails?: Record<string, any>;
    }>;
  }

  export function load(options: {
    mode: 'sandbox' | 'production';
  }): Promise<CashfreeInstance | null>;
}
