declare module 'wake_on_lan' {
  export interface WakeOptions {
    address?: string;
    port?: number;
  }

  export function wake(mac: string, options: WakeOptions, callback: (error?: Error) => void): void;

  const wol: {
    wake: typeof wake;
  };

  export default wol;
}
