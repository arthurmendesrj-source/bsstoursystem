import { Component, type ReactNode } from "react";
import { clearSupabaseLocalSession } from "./LoginErrorBoundary";

const RECOVERY_FLAG = "session-recovery-attempted";

interface State {
  hasError: boolean;
  recovered: boolean;
  message?: string;
}

export class SessionErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, recovered: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, recovered: false, message: error.message };
  }

  componentDidCatch(error: Error) {
    console.error(error);
    if (typeof window === "undefined") return;
    const tried = window.sessionStorage.getItem(RECOVERY_FLAG) === "1";
    clearSupabaseLocalSession();
    if (!tried) {
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
              {this.state.recovered ? "Não foi possível restaurar a sessão" : "Restaurando sessão..."}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {this.state.recovered
                ? "Faça login novamente para continuar."
                : "Limpando dados locais e recarregando."}
            </p>
            {this.state.recovered && (
              <button
                onClick={() => {
                  clearSupabaseLocalSession();
                  if (typeof window !== "undefined") {
                    window.sessionStorage.removeItem(RECOVERY_FLAG);
                    window.location.href = "/login";
                  }
                }}
                className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Ir para login
              </button>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
