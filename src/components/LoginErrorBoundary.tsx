import { Component, type ReactNode } from "react";

const RECOVERY_FLAG = "login-recovery-attempted";

export function clearSupabaseLocalSession() {
  if (typeof window === "undefined") return;
  try {
    const wipe = (storage: Storage) => {
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (!k) continue;
        if (k.startsWith("sb-") || k.toLowerCase().includes("supabase")) keys.push(k);
      }
      keys.forEach((k) => storage.removeItem(k));
    };
    wipe(window.localStorage);
    wipe(window.sessionStorage);
  } catch {
    // ignore
  }
}

interface State {
  hasError: boolean;
  recovered: boolean;
}

export class LoginErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, recovered: false };

  static getDerivedStateFromError(): State {
    return { hasError: true, recovered: false };
  }

  componentDidCatch() {
    if (typeof window === "undefined") return;
    const alreadyTried = window.sessionStorage.getItem(RECOVERY_FLAG) === "1";
    clearSupabaseLocalSession();
    if (!alreadyTried) {
      window.sessionStorage.setItem(RECOVERY_FLAG, "1");
      window.location.reload();
    } else {
      this.setState({ recovered: true });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="max-w-sm text-center">
            <h1 className="text-xl font-semibold text-foreground">
              {this.state.recovered ? "Não foi possível restaurar automaticamente" : "Restaurando sessão..."}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {this.state.recovered
                ? "Limpe a sessão manualmente e tente novamente."
                : "Aguarde, estamos limpando dados locais."}
            </p>
            {this.state.recovered && (
              <button
                onClick={() => {
                  clearSupabaseLocalSession();
                  if (typeof window !== "undefined") {
                    window.sessionStorage.removeItem(RECOVERY_FLAG);
                    window.location.reload();
                  }
                }}
                className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Limpar sessão e tentar novamente
              </button>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
