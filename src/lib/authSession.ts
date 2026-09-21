/**
 * In-Memory Authentication Session Adapter for SCARO ERP Frontend.
 * 
 * SECURITY MANDATE:
 * - JWT Access Tokens are stored STRICTLY IN-MEMORY to protect against XSS extraction.
 * - Refresh Tokens are handled exclusively via secure HttpOnly cookies by the browser.
 * - NEVER persist access tokens or refresh tokens in localStorage / sessionStorage.
 */

type AuthChangeListener = (token: string | null) => void;

class AuthSessionManager {
  private inMemoryAccessToken: string | null = null;
  private listeners: Set<AuthChangeListener> = new Set();

  /**
   * Retrieves the current in-memory JWT access token.
   */
  getAccessToken(): string | null {
    return this.inMemoryAccessToken;
  }

  /**
   * Updates the in-memory JWT access token and notifies subscribers.
   */
  setAccessToken(token: string | null): void {
    this.inMemoryAccessToken = token;
    this.notifyListeners(token);
  }

  /**
   * Clears the in-memory access token on logout or session expiration.
   */
  clearAccessToken(): void {
    this.inMemoryAccessToken = null;
    this.notifyListeners(null);
  }

  /**
   * Subscribes to token update / expiration events.
   * Returns an unsubscribe function.
   */
  subscribe(listener: AuthChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(token: string | null): void {
    for (const listener of this.listeners) {
      try {
        listener(token);
      } catch (err) {
        console.error('Error in auth session listener:', err);
      }
    }
  }
}

export const authSession = new AuthSessionManager();
